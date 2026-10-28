import { lazy, Suspense, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/authContext';
import { NotesScreen } from '../notes/NotesScreen';
import { Loading } from '../../ui/Loading';
import { AppMenu } from './AppMenu';
import { HeaderSlot } from './headerSlot';

// Taxonomy and the admin-only Users screen are rarely opened, so they load in their own chunks.
const TaxonomyScreen = lazy(() =>
  import('../taxonomy/TaxonomyScreen').then((m) => ({ default: m.TaxonomyScreen })),
);
const UsersScreen = lazy(() =>
  import('../users/UsersScreen').then((m) => ({ default: m.UsersScreen })),
);

/** The signed-in app: notes, the admin-only Users screen, and the app menu on every screen. */
export function Screens() {
  const { t } = useTranslation();
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
        <Suspense fallback={<Loading label={t('users.loading')} />}>
          <UsersScreen onBack={() => setView('notes')} />
        </Suspense>
      ) : view === 'taxonomy' ? (
        <Suspense fallback={<Loading label={t('taxonomy.loading')} />}>
          <TaxonomyScreen
            onBack={() => setView('notes')}
            onTag={(id) => {
              setTagId(id);
              setView('notes');
            }}
          />
        </Suspense>
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
