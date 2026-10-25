import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiStatus } from './features/status/ApiStatus';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <h1>פרויקט חדש</h1>
        <ApiStatus />
      </main>
    </QueryClientProvider>
  );
}
