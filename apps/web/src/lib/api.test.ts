import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./supabase', () => ({ accessToken: async () => null }));

import { api } from './api';

afterEach(() => vi.unstubAllGlobals());

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
