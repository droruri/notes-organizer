import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import {
  experimental_transcribe as transcribe,
  generateObject,
  isStepCount,
  streamText,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { z } from 'zod';

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

export const AiEnv = z
  .object({
    ANTHROPIC_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    LLM_CLASSIFY_MODEL: z.string().min(1).default('claude-haiku-5-5'),
    LLM_CHAT_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
    AI_FAKE: z.string().optional(),
  })
  .refine((env) => isFakeEnabled(env.AI_FAKE) || Boolean(env.ANTHROPIC_API_KEY), {
    message: 'ANTHROPIC_API_KEY is required unless AI_FAKE=1',
    path: ['ANTHROPIC_API_KEY'],
  })
  .refine((env) => isFakeEnabled(env.AI_FAKE) || Boolean(env.GROQ_API_KEY), {
    message: 'GROQ_API_KEY is required unless AI_FAKE=1',
    path: ['GROQ_API_KEY'],
  });
export type AiEnv = z.infer<typeof AiEnv>;

function isFakeEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/** The fake for `AI_FAKE=1`, otherwise the Anthropic adapter. */
export function createAi(env: AiEnv): Ai {
  if (isFakeEnabled(env.AI_FAKE)) return createFakeAi();
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required unless AI_FAKE=1');
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is required unless AI_FAKE=1');
  return createAnthropicAi({
    apiKey: env.ANTHROPIC_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
    classifyModel: env.LLM_CLASSIFY_MODEL,
    chatModel: env.LLM_CHAT_MODEL,
  });
}

export function createAnthropicAi({
  apiKey,
  groqApiKey,
  classifyModel,
  chatModel,
}: {
  apiKey: string;
  groqApiKey: string;
  classifyModel: string;
  chatModel: string;
}): Ai {
  const anthropic = createAnthropic({ apiKey });
  const groq = createGroq({ apiKey: groqApiKey });
  return {
    async extract({ schema, system, prompt }) {
      try {
        const { object } = await generateObject({
          model: anthropic(classifyModel),
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
        model: anthropic(chatModel),
        system,
        messages,
        tools,
        stopWhen: isStepCount(maxSteps),
      }),
    async transcribe({ audio }) {
      const { text } = await transcribe({ model: groq.transcription('whisper-large-v3'), audio });
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
    chat: () => {
      throw new Error('fake chat is not scripted yet');
    },
    transcribe: async () => ({ text: transcript }),
  };
}
