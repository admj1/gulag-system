import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import PlayersPage from './pages/PlayersPage';
import PlayerProfilePage from './pages/PlayerProfilePage';
import RankingsPage from './pages/RankingsPage';
import AdminPage from './pages/AdminPage';

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
          element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>}
        />
      </Route>
    </Routes>
  );
}
