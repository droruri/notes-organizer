import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthGate } from './features/auth/AuthGate';
import { Screens } from './features/shell/Screens';
import { AuthProvider } from './features/auth/AuthProvider';
import { Shell } from './features/shell/Shell';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell>
          <AuthGate>
            <Screens />
          </AuthGate>
        </Shell>
      </AuthProvider>
    </QueryClientProvider>
  );
}
