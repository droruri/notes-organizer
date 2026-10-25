import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiStatus } from './features/status/ApiStatus';
import { Shell } from './features/shell/Shell';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Shell>
        <ApiStatus />
      </Shell>
    </QueryClientProvider>
  );
}
