import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { NotesScreen } from '../notes/NotesScreen';
import { UsersScreen } from '../users/UsersScreen';

/** The signed-in app: notes, plus the admin-only Users screen. */
export function Screens() {
  const { isAdmin } = useAuth();
  const [view, setView] = useState<'notes' | 'users'>('notes');
  if (view === 'users' && isAdmin) return <UsersScreen onBack={() => setView('notes')} />;
  return <NotesScreen {...(isAdmin ? { onUsers: () => setView('users') } : {})} />;
}
