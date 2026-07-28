import { NavLink, Outlet } from 'react-router-dom';

const tabClass = ({ isActive }) =>
  `px-3 py-1.5 rounded ${isActive ? 'bg-gulag-cyan text-black font-semibold' : 'text-gray-300 hover:text-gulag-cyan'}`;

export default function AdminLayout() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-gray-100">Painel do administrador</h1>
      <nav className="flex gap-2 mb-6">
        <NavLink to="/admin/players" className={tabClass}>Jogadores</NavLink>
        <NavLink to="/admin/matchdays" className={tabClass}>Peladas</NavLink>
        <NavLink to="/admin/finance" className={tabClass}>Financeiro</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
