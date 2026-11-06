import { useQuery } from '@tanstack/react-query';
import { resolveWorkspace } from '@notes/shared';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../auth/authContext';
import { NotesScreen } from '../notes/NotesScreen';
import { NoteFormSettings } from '../notes/NoteFormSettings';
import { WorkspacesDialog } from '../workspaces/WorkspacesDialog';
import { Loading } from '../../ui/Loading';
import { Sheet } from '../../ui/Sheet';
import { AppMenu } from './AppMenu';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { ROUTES, type NavId, tagPath, todayPath, useGoBack } from './routes';

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
  const navigate = useNavigate();
  const goBack = useGoBack();
  const [params] = useSearchParams();
  // The key remounts the list with the tag filter from `?tag=`.
  const tagId = params.get('tag');
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces });
  // null = the default workspace.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const workspace = workspaces.data ? resolveWorkspace(workspaces.data, currentId) : undefined;
  // A pick made inside an open sheet replaces the sheet's history entry, so Back from the
  // new screen returns to the page under the sheet (see useBackClose).
  const pick = (id: NavId) => {
    const options = { replace: moreOpen };
    if (id === 'notes') void navigate(ROUTES.notes, options);
    else if (id === 'today') void navigate(todayPath, options);
    else if (id === 'chat') void navigate(ROUTES.chat, options);
    else if (id === 'workspaces') setPicking(true);
    else if (id === 'more') setMoreOpen(true);
    else if (id === 'settings') setSettingsOpen(true);
    else void navigate(ROUTES[id], options);
  };
  const switchTo = (id: string) => {
    setCurrentId(id);
    void navigate(ROUTES.notes, { replace: picking });
  };
  return (
    <>
      <TabBar onPick={pick} />
      <Sidebar
        workspaces={workspaces.data ?? []}
        currentId={workspace?.id}
        onSwitch={switchTo}
        onManage={() => setPicking(true)}
        onPick={pick}
        onSignOut={() => void signOut()}
        isAdmin={isAdmin}
      />
      {moreOpen && (
        <Sheet title={t('app.menu')} onClose={() => setMoreOpen(false)}>
          {(close) => (
            <AppMenu
              autoFocus
              isAdmin={isAdmin}
              onPick={pick}
              onSignOut={() => void signOut()}
              onDone={() => close(true)}
            />
          )}
        </Sheet>
      )}
      {settingsOpen && <NoteFormSettings onClose={() => setSettingsOpen(false)} />}
      {picking && (workspaces.data || workspaces.isError) && (
        <WorkspacesDialog
          workspaces={workspaces.data ?? []}
          loadFailed={workspaces.isError}
          currentId={workspace?.id}
          onPick={switchTo}
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
              onWorkspaces={() => setPicking(true)}
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
