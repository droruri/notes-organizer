import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import { describe, expect, it, vi } from 'vite-plus/test';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import { createAiFromModels } from './provider';
import { withFallback } from './provider';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const finish = { unified: 'stop', raw: 'stop' } as const;

function generating(text: string | Error) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      if (text instanceof Error) throw text;
      return { content: [{ type: 'text', text }], finishReason: finish, usage, warnings: [] };
    },
  });
}

function streaming(text: string | Error) {
  return new MockLanguageModelV4({
    doStream: async () => {
      if (text instanceof Error) throw text;
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: text },
            { type: 'text-end', id: 't' },
            { type: 'finish', finishReason: finish, usage },
          ],
        }),
      };
    },
  });
}

const schema = z.object({ a: z.string() });
// Real model object, never called here: no network, no cast.
const transcription = createGroq({ apiKey: 'unused' }).transcription('whisper-large-v3');
const build = (classify: MockLanguageModelV4, chat: MockLanguageModelV4, warn = vi.fn()) =>
  createAiFromModels({
    classify: withFallback(classify, generating('{"a":"fallback"}'), warn),
    chat: withFallback(chat, streaming('fallback answer'), warn),
    transcription,
  });

describe('model fallback', () => {
  it('uses the primary and logs nothing when it works', async () => {
    const warn = vi.fn();
    const ai = build(generating('{"a":"primary"}'), streaming('primary answer'), warn);
    expect(await ai.extract({ schema, system: 's', prompt: 'p' })).toEqual({
      ok: true,
      value: { a: 'primary' },
    });
    expect(
      await ai.chat({
        system: 's',
        messages: [{ role: 'user', content: 'hi' }],
        tools: {},
        maxSteps: 1,
      }).text,
    ).toBe('primary answer');
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers generate on the fallback and warns once when the primary throws', async () => {
    const warn = vi.fn();
    const ai = build(generating(new Error('429')), streaming('x'), warn);
    expect(await ai.extract({ schema, system: 's', prompt: 'p' })).toEqual({
      ok: true,
      value: { a: 'fallback' },
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('answers a stream on the fallback and warns once when the primary throws', async () => {
    const warn = vi.fn();
    const ai = build(generating('{}'), streaming(new Error('503')), warn);
    const result = ai.chat({
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      maxSteps: 1,
    });
    expect(await result.text).toBe('fallback answer');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('fails softly when both throw', async () => {
    const ai = createAiFromModels({
      classify: withFallback(generating(new Error('a')), generating(new Error('b')), vi.fn()),
      chat: withFallback(streaming(new Error('a')), streaming(new Error('b')), vi.fn()),
      transcription,
    });
    expect(await ai.extract({ schema, system: 's', prompt: 'p' })).toMatchObject({ ok: false });
    const result = ai.chat({
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      maxSteps: 1,
    });
    await expect(result.text).rejects.toThrow();
  });
});

describe('slow primary', () => {
  it('hands over to the fallback when the primary is slower than the timeout', async () => {
    const warn = vi.fn();
    const slow = new MockLanguageModelV4({ doGenerate: () => new Promise(() => {}) });
    const ai = createAiFromModels({
      classify: withFallback(slow, generating('{"a":"fallback"}'), warn, 20),
      chat: withFallback(slow, streaming('fallback answer'), warn, 20),
      transcription,
    });
    expect(await ai.extract({ schema, system: 's', prompt: 'p' })).toEqual({
      ok: true,
      value: { a: 'fallback' },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });
});
