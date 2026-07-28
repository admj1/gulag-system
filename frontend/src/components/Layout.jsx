import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { player, isAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-emerald-700 text-white">
        <nav className="max-w-4xl mx-auto flex items-center gap-4 px-4 py-3">
          <Link to="/" className="font-bold text-lg">Gulag System</Link>
          <Link to="/players">Jogadores</Link>
          <Link to="/rankings">Rankings</Link>
          {isAdmin && <Link to="/admin">Admin</Link>}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm">{player?.name}</span>
            <button onClick={logout} className="text-sm underline">Sair</button>
          </div>
        </nav>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
