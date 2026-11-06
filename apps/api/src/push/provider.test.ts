import { describe, expect, it } from 'vite-plus/test';
import { createFakePush, createPush, PushEnv, withPushLogging } from './provider';

const sub = { endpoint: 'https://push.example.com/a', p256dh: 'p', auth: 'a' };

describe('push port', () => {
  it('the fake records sends and reports gone endpoints', async () => {
    const fake = createFakePush({ goneEndpoints: [sub.endpoint] });
    expect(await fake.send(sub, { kind: 'test', title: 't' })).toEqual({ ok: false, gone: true });
    const other = { ...sub, endpoint: 'https://push.example.com/b' };
    expect(await fake.send(other, { kind: 'test', title: 't' })).toEqual({ ok: true });
    expect(fake.sent).toHaveLength(1);
  });

  it('is disabled without VAPID keys and enabled with PUSH_FAKE', () => {
    expect(createPush(PushEnv.parse({})).enabled).toBe(false);
    expect(createPush(PushEnv.parse({ PUSH_FAKE: '1' })).enabled).toBe(true);
    expect(createPush(PushEnv.parse({ PUSH_FAKE: '0' })).enabled).toBe(false);
  });

  it('the logging decorator passes results through', async () => {
    const fake = createFakePush({ goneEndpoints: [sub.endpoint] });
    const logged = withPushLogging(fake);
    expect(await logged.send(sub, { kind: 'test', title: 't' })).toEqual({ ok: false, gone: true });
  });
});
