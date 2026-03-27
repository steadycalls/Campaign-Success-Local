import { HashRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import TodayPage from './pages/TodayPage';
import PortfolioPage from './pages/PortfolioPage';
import CompanyPage from './pages/CompanyPage';
import ClientsPage from './pages/ClientsPage';
import SyncLogsPage from './pages/SyncLogsPage';
import SettingsPage from './pages/SettingsPage';
import SubAccountsPage from './pages/settings/SubAccountsPage';
import TeamworkPage from './pages/settings/TeamworkPage';
import DiscordPage from './pages/settings/DiscordPage';
import MeetingsPage from './pages/MeetingsPage';
import AssociationsPage from './pages/settings/AssociationsPage';
import GDrivePage from './pages/settings/GDrivePage';
import CalendarPage from './pages/settings/CalendarPage';
import KinstaPage from './pages/KinstaPage';
import RagPage from './pages/RagPage';
import ReportsPage from './pages/ReportsPage';
import ReportDrillPage from './pages/ReportDrillPage';
import NotificationsPage from './pages/settings/NotificationsPage';
import A2PPage from './pages/A2PPage';
import NotificationToastContainer from './components/shared/NotificationToast';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { theme, toggle } = useTheme();

  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar theme={theme} onToggleTheme={toggle} />
          <main className="flex-1 overflow-y-auto dark:bg-slate-950">
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/company/:id" element={<CompanyPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/a2p" element={<A2PPage />} />
              <Route path="/logs" element={<SyncLogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/subaccounts" element={<SubAccountsPage />} />
              <Route path="/settings/teamwork" element={<TeamworkPage />} />
              <Route path="/discord" element={<DiscordPage />} />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/settings/associations" element={<AssociationsPage />} />
              <Route path="/settings/calendar" element={<CalendarPage />} />
              <Route path="/settings/gdrive" element={<GDrivePage />} />
              <Route path="/kinsta" element={<KinstaPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/drill/:reportId/:metric" element={<ReportDrillPage />} />
              <Route path="/settings/notifications" element={<NotificationsPage />} />
              <Route path="/rag" element={<RagPage />} />
            </Routes>
          </main>
        </div>
        <NotificationToastContainer />
      </div>
    </HashRouter>
  );
}
