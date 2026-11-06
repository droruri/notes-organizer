import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_NOTE_FORM } from '@notes/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { RemindersSettings } from './RemindersSettings';
import * as push from './pushSubscription';

vi.mock('./pushSubscription');

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(api, 'settings').mockResolvedValue({
    noteSort: 'urgency',
    noteForm: DEFAULT_NOTE_FORM,
    quickActions: ['record'],
    timezone: null,
    reminderHour: null,
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RemindersSettings />
    </QueryClientProvider>,
  );

describe('RemindersSettings', () => {
  it('explains when PushManager is missing (iOS before install)', () => {
    vi.mocked(push.isPushSupported).mockReturnValue(false);
    view();
    expect(screen.getByText(/add the app to the Home Screen first/)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('explains a denied permission and stays off', async () => {
    vi.mocked(push.isPushSupported).mockReturnValue(true);
    vi.mocked(push.currentSubscription).mockResolvedValue(null);
    vi.mocked(push.subscribe).mockResolvedValue('denied');
    view();
    const toggle = await screen.findByRole<HTMLInputElement>('switch');
    fireEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('blocked'),
    );
    expect(toggle.checked).toBe(false);
  });

  it('turning on saves the timezone and shows the test button', async () => {
    vi.mocked(push.isPushSupported).mockReturnValue(true);
    vi.mocked(push.currentSubscription).mockResolvedValue(null);
    vi.mocked(push.subscribe).mockResolvedValue('subscribed');
    const save = vi.spyOn(api, 'saveSettings').mockResolvedValue({
      noteSort: 'urgency',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
      timezone: 'Asia/Jerusalem',
      reminderHour: null,
    });
    const test = vi.spyOn(api, 'sendPushTest').mockResolvedValue({ sent: 1, gone: 0 });
    view();
    fireEvent.click(await screen.findByRole('switch'));
    const send = await screen.findByRole('button', { name: 'Send test' });
    expect(save).toHaveBeenCalledWith({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    fireEvent.click(send);
    await waitFor(() => expect(test).toHaveBeenCalled());
    expect(await screen.findByText('Test notification sent.')).toBeTruthy();
  });
});
