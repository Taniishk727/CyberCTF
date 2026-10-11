import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './context/SessionContext';
import { useBan } from './context/BanContext';

// Layouts
import PlayerLayout from './layouts/PlayerLayout';
import AdminLayout from './layouts/AdminLayout';

const JoinPage = lazy(() => import('./pages/JoinPage'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const BannedPage = lazy(() => import('./pages/BannedPage'));

const HomePage = lazy(() => import('./pages/player/HomePage'));
const ChallengesPage = lazy(() => import('./pages/player/ChallengesPage'));
const ChallengePage = lazy(() => import('./pages/player/ChallengePage'));
const LeaderboardPage = lazy(() => import('./pages/player/LeaderboardPage'));
const ProfilePage = lazy(() => import('./pages/player/ProfilePage'));

const CreateChallengePage = lazy(() => import('./pages/admin/CreateChallengePage'));

const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const AdminChallengesPage = lazy(() => import('./pages/admin/ChallengesPage'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/CategoriesPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const ParticipantsPage = lazy(() => import('./pages/admin/ParticipantsPage'));
const StreamerModePage = lazy(() => import('./pages/admin/StreamerModePage'));

// Loading spinner
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground font-mono">Loading...</p>
      </div>
    </div>
  );
}

// Protected route wrapper for players
function PlayerRoute({ children }) {
  const { user, loading, isPlayer } = useSession();
  
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/" replace />;
  if (!isPlayer) return <Navigate to="/admin" replace />;
  
  return children;
}

// Protected route wrapper for admins
function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useSession();
  
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!isAdmin) return <Navigate to="/home" replace />;
  
  return children;
}

// Public route - redirect if logged in
function PublicRoute({ children }) {
  const { user, loading, isAdmin, isPlayer } = useSession();
  
  if (loading) return <LoadingScreen />;
  if (isPlayer) return <Navigate to="/home" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  
  return children;
}

export default function App() {
  const { isBanned, banReason, clearBanState } = useBan();

  if (isBanned) {
    return (
      <BannedPage
        reason={banReason || 'Violation of rules'}
        onDismiss={() => {
          clearBanState();
          window.location.href = '/';
        }}
      />
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public routes */}
        <Route
          path="/"
          element={
            <PublicRoute>
              <JoinPage />
            </PublicRoute>
          }
        />
        <Route
          path="/admin/login"
          element={
            <PublicRoute>
              <AdminLoginPage />
            </PublicRoute>
          }
        />

        <Route path="/banned" element={<Navigate to="/" replace />} />

        {/* Player routes */}
        <Route
          path="/home"
          element={
            <PlayerRoute>
              <PlayerLayout>
                <HomePage />
              </PlayerLayout>
            </PlayerRoute>
          }
        />
        <Route
          path="/challenges"
          element={
            <PlayerRoute>
              <PlayerLayout>
                <ChallengesPage />
              </PlayerLayout>
            </PlayerRoute>
          }
        />
        <Route
          path="/challenges/:id"
          element={
            <PlayerRoute>
              <PlayerLayout>
                <ChallengePage />
              </PlayerLayout>
            </PlayerRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <PlayerRoute>
              <PlayerLayout>
                <LeaderboardPage />
              </PlayerLayout>
            </PlayerRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PlayerRoute>
              <PlayerLayout>
                <ProfilePage />
              </PlayerLayout>
            </PlayerRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout>
                <DashboardPage />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/challenges"
          element={
            <AdminRoute>
              <AdminLayout>
                <AdminChallengesPage />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <AdminRoute>
              <AdminLayout>
                <AdminCategoriesPage />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/challenges/new"
          element={
            <AdminRoute>
              <AdminLayout>
                <CreateChallengePage />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <AdminLayout>
                <UsersPage />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/participants"
          element={
            <AdminRoute>
              <AdminLayout>
                <ParticipantsPage />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/stream"
          element={
            <AdminRoute>
              <StreamerModePage />
            </AdminRoute>
          }
        />

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
