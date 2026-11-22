import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { reportNetworkFailure, reportServerReachable, useOnline } from './useOnline';

describe('useOnline', () => {
  it('comes back online when the server is reported reachable', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => reportNetworkFailure());
    expect(result.current).toBe(false);
    act(() => reportServerReachable());
    expect(result.current).toBe(true);
  });
});
