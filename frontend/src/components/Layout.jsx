import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { player, isAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gulag-bg text-gray-100">
      <header className="bg-black border-b border-gulag-cyan/30">
        <nav className="max-w-4xl mx-auto flex items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-gulag-cyan tracking-wide">
            <img src="/logo.jpeg" alt="Gulag" className="w-8 h-8 rounded-full" />
            GULAG
          </Link>
          <Link to="/players" className="text-gray-300 hover:text-gulag-cyan">Jogadores</Link>
          <Link to="/rankings" className="text-gray-300 hover:text-gulag-cyan">Rankings</Link>
          {isAdmin && <Link to="/admin" className="text-gray-300 hover:text-gulag-cyan">Admin</Link>}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-400">{player?.name}</span>
            <button onClick={logout} className="text-sm text-gulag-cyan underline">Sair</button>
          </div>
        </nav>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
