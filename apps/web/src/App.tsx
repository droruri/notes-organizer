import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthGate } from './features/auth/AuthGate';
import { AuthProvider } from './features/auth/AuthProvider';
import { ApiStatus } from './features/status/ApiStatus';
import { Shell } from './features/shell/Shell';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell>
          <AuthGate>
            <ApiStatus />
          </AuthGate>
        </Shell>
      </AuthProvider>
    </QueryClientProvider>
  );
}
