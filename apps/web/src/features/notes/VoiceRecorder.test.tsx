import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { VoiceRecorder } from './VoiceRecorder';

class FakeRecorder {
  static last: FakeRecorder | undefined;
  mimeType = 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: { getTracks: () => { stop: () => void }[] }) {
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const stream = { getTracks: () => [{ stop: vi.fn() }] };
const getUserMedia = vi.fn();

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  getUserMedia.mockResolvedValue(stream);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  getUserMedia.mockReset();
});

const props = { onSend: () => undefined, pending: false, failed: false };

describe('VoiceRecorder', () => {
  it('records, shows elapsed time, stops, and sends the blob', async () => {
    vi.useFakeTimers();
    const onSend = vi.fn();
    render(<VoiceRecorder {...props} onSend={onSend} />);
    await act(async () => fireEvent.click(screen.getByText('הקלטה')));
    expect(screen.getByRole('timer').textContent).toBe('0:00');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('timer').textContent).toBe('0:03');
    fireEvent.click(screen.getByText('עצור'));
    fireEvent.click(screen.getByText('שלח הקלטה'));
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  });

  it('discards a recording and returns to idle', async () => {
    render(<VoiceRecorder {...props} />);
    await act(async () => fireEvent.click(screen.getByText('הקלטה')));
    fireEvent.click(screen.getByText('מחק הקלטה'));
    expect(screen.getByText('הקלטה')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('shows the permission error when the microphone is denied', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    render(<VoiceRecorder {...props} />);
    await act(async () => fireEvent.click(screen.getByText('הקלטה')));
    expect(screen.getByRole('alert').textContent).toContain('הרשאת המיקרופון');
  });

  it('shows the uploading state and an upload failure', async () => {
    const { rerender } = render(<VoiceRecorder {...props} pending />);
    await act(async () => fireEvent.click(screen.getByText('הקלטה')));
    fireEvent.click(screen.getByText('עצור'));
    expect(screen.getByText('מעלה ומתמלל…').closest('button')?.disabled).toBe(true);
    rerender(<VoiceRecorder {...props} failed />);
    expect(screen.getByRole('alert').textContent).toContain('העלאת ההקלטה נכשלה');
  });
});
