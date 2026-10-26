import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/authContext';
import { NotesScreen } from '../notes/NotesScreen';
import { TaxonomyScreen } from '../taxonomy/TaxonomyScreen';
import { UsersScreen } from '../users/UsersScreen';
import { AppMenu } from './AppMenu';
import { HeaderSlot } from './headerSlot';

/** The signed-in app: notes, the admin-only Users screen, and the app menu on every screen. */
export function Screens() {
  const { isAdmin, signOut } = useAuth();
  const slot = useContext(HeaderSlot);
  const [view, setView] = useState<'notes' | 'users' | 'taxonomy'>('notes');
  // Set when a tag is tapped on the taxonomy screen; the key remounts the list with that filter.
  const [tagId, setTagId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const menu = slot
    ? createPortal(
        <AppMenu
          onNotes={() => {
            setTagId(null);
            setView('notes');
          }}
          onTaxonomy={() => {
            setTagId(null);
            setView('taxonomy');
          }}
          onImport={() => {
            setTagId(null);
            setView('notes');
            setImporting(true);
          }}
          onSignOut={() => void signOut()}
          {...(isAdmin
            ? {
                onUsers: () => {
                  setTagId(null);
                  setView('users');
                },
              }
            : {})}
        />,
        slot,
      )
    : null;
  return (
    <>
      {menu}
      {view === 'users' && isAdmin ? (
        <UsersScreen onBack={() => setView('notes')} />
      ) : view === 'taxonomy' ? (
        <TaxonomyScreen
          onBack={() => setView('notes')}
          onTag={(id) => {
            setTagId(id);
            setView('notes');
          }}
        />
      ) : (
        <NotesScreen
          key={tagId ?? 'all'}
          initialTagId={tagId}
          importing={importing}
          onImportClose={() => setImporting(false)}
        />
      )}
    </>
  );
}
