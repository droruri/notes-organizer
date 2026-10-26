import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import {
  experimental_transcribe as transcribe,
  generateObject,
  isStepCount,
  simulateReadableStream,
  streamText,
  wrapLanguageModel,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { errorSummary, log } from '../requestLog';

// THE ONLY place a model is called (ADR 0001). Everything else depends on the `Ai` port.

export type ExtractResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type ChatStream = ReturnType<typeof streamText>;

export type Ai = {
  /** One structured answer from the classify model, parsed against `schema`. Never throws. */
  extract<T>(args: {
    schema: z.ZodType<T>;
    system: string;
    prompt: string;
  }): Promise<ExtractResult<T>>;
  chat(args: {
    system: string;
    messages: ModelMessage[];
    tools: ToolSet;
    maxSteps: number;
  }): ChatStream;
  transcribe(args: { audio: Uint8Array; mime: string }): Promise<{ text: string }>;
};

/**
 * Logs every call on `ai` to the request's logger. Never logs prompts, messages, transcripts or
 * note text (the provider's error text on a failed `extract` is the one deliberate exception).
 */
export function withLogging(ai: Ai): Ai {
  const since = (started: number) => Math.round(performance.now() - started);
  return {
    async extract(args) {
      const logger = log();
      const started = performance.now();
      logger.debug('ai extract start');
      const result = await ai.extract(args);
      const ms = since(started);
      if (result.ok) logger.debug({ ms }, 'ai extract end');
      else logger.warn({ ms, error: result.error }, 'ai extract failed');
      return result;
    },
    chat(args) {
      const logger = log();
      const started = performance.now();
      const stream = ai.chat(args);
      // Reads the finished stream's promises; they reject when the stream fails.
      Promise.all([stream.finishReason, stream.steps, stream.totalUsage]).then(
        ([finishReason, steps, usage]) =>
          logger.info(
            {
              ms: since(started),
              finishReason,
              steps: steps.length,
              tools: steps.reduce((n, step) => n + step.toolCalls.length, 0),
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            },
            'chat finished',
          ),
        (err: unknown) =>
          logger.warn({ err: errorSummary(err), ms: since(started) }, 'chat stream failed'),
      );
      return stream;
    },
    async transcribe(args) {
      const logger = log();
      const started = performance.now();
      logger.debug({ mime: args.mime, bytes: args.audio.byteLength }, 'transcription start');
      try {
        const result = await ai.transcribe(args);
        logger.info({ ms: since(started), chars: result.text.length }, 'transcription end');
        return result;
      } catch (err) {
        logger.warn({ err: errorSummary(err), ms: since(started) }, 'transcription failed');
        throw err;
      }
    },
  };
}

export const AiEnv = z
  .object({
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    LLM_CLASSIFY_MODEL: z.string().min(1).default('gemini-2.5-flash-lite'),
    LLM_CHAT_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    LLM_FALLBACK_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
    AI_FAKE: z.string().optional(),
  })
  .refine((env) => isFakeEnabled(env.AI_FAKE) || Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY), {
    message: 'GOOGLE_GENERATIVE_AI_API_KEY is required unless AI_FAKE=1',
    path: ['GOOGLE_GENERATIVE_AI_API_KEY'],
  })
  .refine((env) => isFakeEnabled(env.AI_FAKE) || Boolean(env.GROQ_API_KEY), {
    message: 'GROQ_API_KEY is required unless AI_FAKE=1',
    path: ['GROQ_API_KEY'],
  });
export type AiEnv = z.infer<typeof AiEnv>;

function isFakeEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/** The fake for `AI_FAKE=1`, otherwise Gemini with a Groq fallback. */
export function createAi(env: AiEnv): Ai {
  if (isFakeEnabled(env.AI_FAKE)) return createFakeAi();
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required unless AI_FAKE=1');
  }
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is required unless AI_FAKE=1');
  return createGeminiAi({
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
    classifyModel: env.LLM_CLASSIFY_MODEL,
    chatModel: env.LLM_CHAT_MODEL,
    fallbackModel: env.LLM_FALLBACK_MODEL,
  });
}

/** How long the primary model may take to answer (or open its stream) before the fallback runs. */
const PRIMARY_TIMEOUT_MS = 20_000;

/**
 * `primary`, but when it throws or is slower than the timeout the same call (generate, or opening a stream) runs once on
 * `fallback` and one warning is logged. A failure after a stream has started is not retried.
 */
export function withFallback(
  primary: Exclude<LanguageModel, string>,
  fallback: Exclude<LanguageModel, string>,
  warn: (message: string) => void = console.warn,
  timeoutMs: number = PRIMARY_TIMEOUT_MS,
): LanguageModel {
  /** Rejects when `call` takes longer than `timeoutMs`, so a slow primary hands over to the fallback. */
  const within = <T>(call: () => PromiseLike<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    // `.then(call)` (not `Promise.resolve(call())`) so a synchronous throw becomes a rejection the race handles.
    return Promise.race([Promise.resolve().then(call), timeout]).finally(() => clearTimeout(timer));
  };
  const note = (err: unknown) =>
    warn(
      `ai: primary model failed, using fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
  // Wrapping with no middleware upgrades a V2/V3 provider model to the V4 call shape.
  const fallbackV4 = wrapLanguageModel({ model: fallback, middleware: {} });
  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await within(doGenerate);
        } catch (err) {
          note(err);
          return fallbackV4.doGenerate(params);
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await within(doStream);
        } catch (err) {
          note(err);
          return fallbackV4.doStream(params);
        }
      },
    },
  });
}

export function createGeminiAi({
  googleApiKey,
  groqApiKey,
  classifyModel,
  chatModel,
  fallbackModel,
}: {
  googleApiKey: string;
  groqApiKey: string;
  classifyModel: string;
  chatModel: string;
  fallbackModel: string;
}): Ai {
  const google = createGoogleGenerativeAI({ apiKey: googleApiKey });
  const groq = createGroq({ apiKey: groqApiKey });
  const fallback = groq(fallbackModel);
  return createAiFromModels({
    classify: withFallback(google(classifyModel), fallback),
    chat: withFallback(google(chatModel), fallback),
    transcription: groq.transcription('whisper-large-v3'),
  });
}

export function createAiFromModels({
  classify,
  chat,
  transcription,
}: {
  classify: LanguageModel;
  chat: LanguageModel;
  transcription: Parameters<typeof transcribe>[0]['model'];
}): Ai {
  return {
    async extract({ schema, system, prompt }) {
      try {
        const { object } = await generateObject({
          model: classify,
          schema,
          system,
          prompt,
        });
        const parsed = schema.safeParse(object);
        return parsed.success
          ? { ok: true, value: parsed.data }
          : { ok: false, error: z.prettifyError(parsed.error) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    chat: ({ system, messages, tools, maxSteps }) =>
      streamText({
        model: chat,
        system,
        messages,
        tools,
        stopWhen: isStepCount(maxSteps),
      }),
    async transcribe({ audio }) {
      const { text } = await transcribe({ model: transcription, audio });
      // Provider output is untrusted: a non-string throws, and the caller maps that to a failure.
      const parsed = z.string().safeParse(text);
      if (!parsed.success) throw new Error('transcription returned no text');
      return { text: parsed.data };
    },
  };
}

/** One scripted answer for `extract`: a value the schema then parses, or a failure. */
export type FakeTurn = { value: unknown } | { fail: string };
export type ExtractCall = { system: string; prompt: string };

/** Answers `extract` from a queue of turns (empty queue = failure); records every call. */
export function createFakeAi(
  turns: FakeTurn[] = [],
  transcript = 'fake transcript',
  chatReply = 'fake answer',
): Ai & { calls: ExtractCall[] } {
  const queue = [...turns];
  const calls: ExtractCall[] = [];
  return {
    calls,
    async extract({ schema, system, prompt }) {
      calls.push({ system, prompt });
      const turn = queue.shift();
      if (!turn) return { ok: false, error: 'fake: no scripted turn' };
      if ('fail' in turn) return { ok: false, error: turn.fail };
      const parsed = schema.safeParse(turn.value);
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, error: z.prettifyError(parsed.error) };
    },
    chat: ({ system, messages }) =>
      streamText({
        model: new MockLanguageModelV4({
          doStream: async () => ({
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 't' },
                { type: 'text-delta', id: 't', delta: chatReply },
                { type: 'text-end', id: 't' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: {
                    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 1, text: 1, reasoning: 0 },
                  },
                },
              ],
            }),
          }),
        }),
        system,
        messages,
      }),
    transcribe: async () => ({ text: transcript }),
  };
}
