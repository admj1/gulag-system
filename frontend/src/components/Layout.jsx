import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const linkClass = ({ isActive }) =>
  `px-2 py-1 rounded whitespace-nowrap ${isActive ? 'text-gulag-cyan font-semibold' : 'text-gray-300 hover:text-gulag-cyan'}`;

export default function Layout() {
  const { player, isAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gulag-bg text-gray-100">
      <header className="bg-black border-b border-gulag-cyan/30 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-gulag-cyan tracking-wide">
            <img src="/logo.jpeg" alt="Gulag" className="w-8 h-8 rounded-full" />
            <span className="hidden sm:inline">GULAG</span>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/perfil" className="text-sm text-gray-400 truncate hover:text-gulag-cyan">
              {player?.name}
            </Link>
            <button onClick={logout} className="text-sm text-gulag-cyan underline shrink-0">Sair</button>
          </div>
        </div>
        <nav className="max-w-4xl mx-auto px-4 pb-2 flex gap-1 text-sm overflow-x-auto">
          <NavLink to="/" end className={linkClass}>Peladas</NavLink>
          <NavLink to="/players" className={linkClass}>Jogadores</NavLink>
          <NavLink to="/rankings" className={linkClass}>Rankings</NavLink>
          <NavLink to="/perfil" className={linkClass}>Meu perfil</NavLink>
          {isAdmin && <NavLink to="/admin" className={linkClass}>Admin</NavLink>}
        </nav>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
