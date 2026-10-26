import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useState } from 'react';
import { AuthGate } from './features/auth/AuthGate';
import { Screens } from './features/shell/Screens';
import { AuthProvider } from './features/auth/AuthProvider';
import { Shell } from './features/shell/Shell';
import { CACHE_MAX_AGE, persister, shouldDehydrateQuery } from './lib/queryPersist';

export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { gcTime: CACHE_MAX_AGE } } }),
  );
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      <AuthProvider>
        <Shell>
          <AuthGate>
            <Screens />
          </AuthGate>
        </Shell>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
