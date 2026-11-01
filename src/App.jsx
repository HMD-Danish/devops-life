import { Toaster } from "@/components/ui/toaster"
import OfflineNote from "@/components/shell/OfflineNote"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import CopyGuard from '@/components/security/CopyGuard';
import { ThemeProvider } from '@/lib/ThemeContext';
import { PlayerProvider } from '@/lib/PlayerContext';
import { FeedbackProvider } from '@/components/feedback/FeedbackProvider';
import MeshBackground from '@/components/glass/MeshBackground';
import PlayerRoute from '@/components/PlayerRoute';
import AppShell from '@/components/AppShell';
import IntroGate from '@/components/intro/IntroGate';
import Welcome from '@/pages/Welcome';
import { AdminGateProvider } from '@/components/admin/AdminGateProvider';
import MaintenanceGate from '@/components/maintenance/MaintenanceGate';
import { TutorialProvider } from '@/components/tutorial/TutorialProvider';
import { WhatsNewProvider } from '@/components/whatsnew/WhatsNewProvider';
import CareerSetup from '@/pages/CareerSetup';
import Difficulty from '@/pages/Difficulty';
import Workspace from '@/pages/Workspace';
import Admin from '@/pages/Admin';
import AdminShell from '@/components/admin/AdminShell';
import AdminOverview from '@/pages/admin/Overview';
import AdminFeedback from '@/pages/admin/Feedback';
import AdminPlayers from '@/pages/admin/Players';
import AdminProjects from '@/pages/admin/Projects';
import AdminNotes from '@/pages/admin/Notes';
import AdminSettings from '@/pages/admin/Settings';
import AdminMaintenance from '@/pages/admin/Maintenance';
import AdminReleases from '@/pages/admin/Releases';
import AdminTest from '@/pages/admin/Test';
// Add page imports here

function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <PlayerProvider>
            <Router>
              <FeedbackProvider>
              <MeshBackground />
              <ScrollToTop />
              <CopyGuard />
              <AdminGateProvider>
              <MaintenanceGate>
              <TutorialProvider>
              <WhatsNewProvider>
              <IntroGate>
                <Routes>
                {/* The name page is the home screen; nothing comes before it. */}
                <Route path="/" element={<Navigate to="/play" replace />} />
                <Route path="/play" element={<Welcome />} />

                <Route element={<PlayerRoute />}>
                  <Route path="/play/level" element={<Difficulty />} />
                  <Route path="/play/projects" element={<CareerSetup />} />
                  <Route element={<AppShell />}>
                    <Route path="/play/workspace" element={<Workspace />} />
                  </Route>
                </Route>

                {/* Private dashboard. The quiet Admin link in the header is the only way in. */}
                <Route path="/admin" element={<Admin />}>
                  <Route index element={<Navigate to="/admin/overview" replace />} />
                  <Route element={<AdminShell />}>
                    <Route path="overview" element={<AdminOverview />} />
                    <Route path="feedback" element={<AdminFeedback />} />
                    <Route path="players" element={<AdminPlayers />} />
                    <Route path="projects" element={<AdminProjects />} />
                    <Route path="notes" element={<AdminNotes />} />
                    <Route path="maintenance" element={<AdminMaintenance />} />
                    <Route path="releases" element={<AdminReleases />} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Route>

                  {/* The test copy of the player app: admin session + maintenance on. */}
                  <Route path="test" element={<AdminTest />}>
                    <Route index element={<Welcome />} />
                    <Route element={<PlayerRoute />}>
                      <Route path="level" element={<Difficulty />} />
                      <Route path="projects" element={<CareerSetup />} />
                      <Route element={<AppShell />}>
                        <Route path="workspace" element={<Workspace />} />
                      </Route>
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<PageNotFound />} />
                </Routes>
              </IntroGate>
              </WhatsNewProvider>
              </TutorialProvider>
              </MaintenanceGate>
              </AdminGateProvider>
              </FeedbackProvider>
            </Router>
            <Toaster />
            <OfflineNote />
          </PlayerProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App