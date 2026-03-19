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
import ReadaiPage from './pages/settings/ReadaiPage';
import AssociationsPage from './pages/settings/AssociationsPage';
import GDrivePage from './pages/settings/GDrivePage';
import RagPage from './pages/RagPage';

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/company/:id" element={<CompanyPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/logs" element={<SyncLogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/subaccounts" element={<SubAccountsPage />} />
              <Route path="/settings/teamwork" element={<TeamworkPage />} />
              <Route path="/settings/discord" element={<DiscordPage />} />
              <Route path="/settings/readai" element={<ReadaiPage />} />
              <Route path="/settings/associations" element={<AssociationsPage />} />
              <Route path="/settings/gdrive" element={<GDrivePage />} />
              <Route path="/rag" element={<RagPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
}
