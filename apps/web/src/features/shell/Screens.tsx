import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/authContext';
import { NotesScreen } from '../notes/NotesScreen';
import { UsersScreen } from '../users/UsersScreen';
import { AppMenu } from './AppMenu';
import { HeaderSlot } from './headerSlot';

/** The signed-in app: notes, the admin-only Users screen, and the app menu on every screen. */
export function Screens() {
  const { isAdmin, signOut } = useAuth();
  const slot = useContext(HeaderSlot);
  const [view, setView] = useState<'notes' | 'users'>('notes');
  const [importing, setImporting] = useState(false);
  const menu = slot
    ? createPortal(
        <AppMenu
          onNotes={() => setView('notes')}
          onImport={() => {
            setView('notes');
            setImporting(true);
          }}
          onSignOut={() => void signOut()}
          {...(isAdmin ? { onUsers: () => setView('users') } : {})}
        />,
        slot,
      )
    : null;
  return (
    <>
      {menu}
      {view === 'users' && isAdmin ? (
        <UsersScreen onBack={() => setView('notes')} />
      ) : (
        <NotesScreen importing={importing} onImportClose={() => setImporting(false)} />
      )}
    </>
  );
}
