import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MatchdayPage from './pages/MatchdayPage';
import PlayersPage from './pages/PlayersPage';
import ComparePlayersPage from './pages/ComparePlayersPage';
import PlayerProfilePage from './pages/PlayerProfilePage';
import MyProfilePage from './pages/MyProfilePage';
import RankingsPage from './pages/RankingsPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminPlayersPage from './pages/admin/AdminPlayersPage';
import AdminMatchdaysPage from './pages/admin/AdminMatchdaysPage';
import AdminMatchdayDetailPage from './pages/admin/AdminMatchdayDetailPage';
import AdminLiveSummaryPage from './pages/admin/AdminLiveSummaryPage';
import AdminFinancePage from './pages/admin/AdminFinancePage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminWhatsappPage from './pages/admin/AdminWhatsappPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/peladas/:id" element={<MatchdayPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/players/comparar" element={<ComparePlayersPage />} />
        <Route path="/players/:id" element={<PlayerProfilePage />} />
        <Route path="/perfil" element={<MyProfilePage />} />
        <Route path="/rankings" element={<RankingsPage />} />

        <Route
          path="/admin"
          element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}
        >
          <Route index element={<Navigate to="players" replace />} />
          <Route path="players" element={<AdminPlayersPage />} />
          <Route path="matchdays" element={<AdminMatchdaysPage />} />
          <Route path="matchdays/:id" element={<AdminMatchdayDetailPage />} />
          <Route path="matchdays/:id/ao-vivo" element={<AdminLiveSummaryPage />} />
          <Route path="finance" element={<AdminFinancePage />} />
          <Route path="whatsapp" element={<AdminWhatsappPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
