import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { OfflineBanner } from './OfflineBanner';
import { reportNetworkFailure, reportServerReachable } from './useOnline';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

afterEach(() => {
  cleanup();
  reportServerReachable();
  vi.restoreAllMocks();
});

describe('OfflineBanner', () => {
  it('says offline when the device has no connection', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByText('offline.banner')).toBeTruthy();
  });

  it('says the server is not answering when the device is online but a request failed', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => reportNetworkFailure());
    expect(screen.getByText('offline.serverBanner')).toBeTruthy();
  });
});
