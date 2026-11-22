import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./supabase', () => ({ accessToken: async () => null }));

import {
  api,
  ApiNetworkError,
  ApiRequestError,
  PROBE_MS,
  SLOW_SAVE_MS,
  withServerWatch,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createVoiceNote', () => {
  it('sends the title field only when there is one', async () => {
    const bodies: FormData[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.body instanceof FormData) bodies.push(init.body);
        return new Response('{}', { status: 500 });
      }),
    );
    const meta = { clientId: crypto.randomUUID(), today: '2026-10-26', locale: 'en' as const };
    await api.createVoiceNote(new Blob(['a']), { ...meta, title: 'Dentist' }).catch(() => null);
    await api.createVoiceNote(new Blob(['a']), meta).catch(() => null);
    expect(bodies.map((b) => b.get('title'))).toEqual(['Dentist', null]);
  });
});

describe('withServerWatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  /** A send that settles when `settle` is called, and rejects on abort. */
  function pending<T>() {
    let signal: AbortSignal | undefined;
    let resolve: (v: T) => void = () => undefined;
    const send = (s: AbortSignal) =>
      new Promise<T>((res, rej) => {
        signal = s;
        resolve = res;
        s.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      });
    return { send, resolve: (v: T) => resolve(v), signal: () => signal };
  }

  it('resolves an early answer without probing', async () => {
    const health = vi.spyOn(api, 'health');
    const p = withServerWatch(async () => 'ok');
    await expect(p).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(SLOW_SAVE_MS * 2);
    expect(health).not.toHaveBeenCalled();
  });

  it('keeps waiting when health answers', async () => {
    const health = vi.spyOn(api, 'health').mockResolvedValue({ ok: true } as never);
    const s = pending<string>();
    const p = withServerWatch(s.send);
    await vi.advanceTimersByTimeAsync(SLOW_SAVE_MS + 1);
    expect(health).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(s.signal()?.aborted).toBe(false);
    s.resolve('late');
    await expect(p).resolves.toBe('late');
  });

  it('aborts and rejects with ApiNetworkError when health fails', async () => {
    vi.spyOn(api, 'health').mockRejectedValue(new ApiNetworkError('down'));
    const s = pending<string>();
    const p = withServerWatch(s.send);
    const assertion = expect(p).rejects.toBeInstanceOf(ApiNetworkError);
    await vi.advanceTimersByTimeAsync(SLOW_SAVE_MS + 1);
    await assertion;
    expect(s.signal()?.aborted).toBe(true);
  });

  it('gives health PROBE_MS, then aborts when it hangs', async () => {
    vi.spyOn(api, 'health').mockImplementation(
      (signal) =>
        new Promise((_, rej) =>
          signal?.addEventListener('abort', () => rej(new DOMException('t', 'TimeoutError'))),
        ),
    );
    const s = pending<string>();
    const p = withServerWatch(s.send);
    const assertion = expect(p).rejects.toBeInstanceOf(ApiNetworkError);
    await vi.advanceTimersByTimeAsync(SLOW_SAVE_MS + PROBE_MS + 1);
    await assertion;
    expect(s.signal()?.aborted).toBe(true);
  });

  it('passes a real ApiRequestError through unchanged', async () => {
    const err = new ApiRequestError(500, undefined, 'boom');
    await expect(withServerWatch(() => Promise.reject(err))).rejects.toBe(err);
  });
});
