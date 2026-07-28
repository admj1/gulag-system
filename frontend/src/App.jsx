import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import PlayersPage from './pages/PlayersPage';
import PlayerProfilePage from './pages/PlayerProfilePage';
import RankingsPage from './pages/RankingsPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminPlayersPage from './pages/admin/AdminPlayersPage';
import AdminMatchdaysPage from './pages/admin/AdminMatchdaysPage';
import AdminMatchdayDetailPage from './pages/admin/AdminMatchdayDetailPage';
import AdminFinancePage from './pages/admin/AdminFinancePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/players/:id" element={<PlayerProfilePage />} />
        <Route path="/rankings" element={<RankingsPage />} />

        <Route
          path="/admin"
          element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}
        >
          <Route index element={<Navigate to="players" replace />} />
          <Route path="players" element={<AdminPlayersPage />} />
          <Route path="matchdays" element={<AdminMatchdaysPage />} />
          <Route path="matchdays/:id" element={<AdminMatchdayDetailPage />} />
          <Route path="finance" element={<AdminFinancePage />} />
        </Route>
      </Route>
    </Routes>
  );
}
