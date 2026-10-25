import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthGate } from './features/auth/AuthGate';
import { AuthProvider } from './features/auth/AuthProvider';
import { NotesScreen } from './features/notes/NotesScreen';
import { Shell } from './features/shell/Shell';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell>
          <AuthGate>
            <NotesScreen />
          </AuthGate>
        </Shell>
      </AuthProvider>
    </QueryClientProvider>
  );
}
