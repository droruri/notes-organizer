import { lazy, Suspense, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { NotesScreen } from '../notes/NotesScreen';
import { Loading } from '../../ui/Loading';
import { AppMenu } from './AppMenu';
import { HeaderSlot } from './headerSlot';
import { ROUTES, tagPath, useGoBack } from './routes';

// Taxonomy and the admin-only Users screen are rarely opened, so they load in their own chunks.
const TaxonomyScreen = lazy(() =>
  import('../taxonomy/TaxonomyScreen').then((m) => ({ default: m.TaxonomyScreen })),
);
const UsersScreen = lazy(() =>
  import('../users/UsersScreen').then((m) => ({ default: m.UsersScreen })),
);

/** The signed-in app: one route per screen, and the app menu on every screen. */
export function Screens() {
  const { t } = useTranslation();
  const { isAdmin, signOut } = useAuth();
  const slot = useContext(HeaderSlot);
  const navigate = useNavigate();
  const goBack = useGoBack();
  const [params] = useSearchParams();
  // The key remounts the list with the tag filter from `?tag=`.
  const tagId = params.get('tag');
  const [importing, setImporting] = useState(false);
  const menu = slot
    ? createPortal(
        <AppMenu
          onNotes={() => void navigate(ROUTES.notes)}
          onTaxonomy={() => void navigate(ROUTES.taxonomy)}
          onImport={() => {
            void navigate(ROUTES.notes);
            setImporting(true);
          }}
          onSignOut={() => void signOut()}
          {...(isAdmin ? { onUsers: () => void navigate(ROUTES.users) } : {})}
        />,
        slot,
      )
    : null;
  return (
    <>
      {menu}
      <Routes>
        <Route
          path={ROUTES.notes}
          element={
            <NotesScreen
              key={tagId ?? 'all'}
              initialTagId={tagId}
              importing={importing}
              onImportClose={() => setImporting(false)}
            />
          }
        />
        <Route
          path={ROUTES.taxonomy}
          element={
            <Suspense fallback={<Loading label={t('taxonomy.loading')} />}>
              <TaxonomyScreen onBack={goBack} onTag={(id) => void navigate(tagPath(id))} />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.users}
          element={
            isAdmin ? (
              <Suspense fallback={<Loading label={t('users.loading')} />}>
                <UsersScreen onBack={goBack} />
              </Suspense>
            ) : (
              <Navigate to={ROUTES.notes} replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.notes} replace />} />
      </Routes>
    </>
  );
}
