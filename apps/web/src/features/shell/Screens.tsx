import { useQuery } from '@tanstack/react-query';
import { resolveWorkspace } from '@notes/shared';
import { lazy, Suspense, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../auth/authContext';
import { NotesScreen } from '../notes/NotesScreen';
import { WorkspacesDialog } from '../workspaces/WorkspacesDialog';
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
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces });
  // null = the default workspace.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const workspace = workspaces.data ? resolveWorkspace(workspaces.data, currentId) : undefined;
  const menu = slot
    ? createPortal(
        <AppMenu
          onNotes={() => void navigate(ROUTES.notes)}
          onTaxonomy={() => void navigate(ROUTES.taxonomy)}
          onImport={() => void navigate(ROUTES.import)}
          onWorkspaces={() => setPicking(true)}
          onSignOut={() => void signOut()}
          {...(isAdmin ? { onUsers: () => void navigate(ROUTES.users) } : {})}
        />,
        slot,
      )
    : null;
  return (
    <>
      {menu}
      {picking && (workspaces.data || workspaces.isError) && (
        <WorkspacesDialog
          workspaces={workspaces.data ?? []}
          loadFailed={workspaces.isError}
          currentId={workspace?.id}
          onPick={(id) => {
            setCurrentId(id);
            void navigate(ROUTES.notes);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <Routes>
        {/* NotesScreen stays mounted across its child routes and reads its mode from the URL. */}
        <Route
          path={ROUTES.notes}
          element={
            <NotesScreen
              key={tagId ?? 'all'}
              initialTagId={tagId}
              {...(workspace ? { workspace } : {})}
            />
          }
        >
          <Route path="new" element={null} />
          <Route path="review" element={null} />
          <Route path="chat" element={null} />
          <Route path="import" element={null} />
          <Route path="notes/:id" element={null} />
        </Route>
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
