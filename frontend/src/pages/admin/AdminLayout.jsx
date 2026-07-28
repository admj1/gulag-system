import { NavLink, Outlet } from 'react-router-dom';

const tabClass = ({ isActive }) =>
  `px-3 py-1.5 rounded text-sm whitespace-nowrap ${isActive ? 'bg-gulag-cyan text-black font-semibold' : 'text-gray-300 border border-gulag-border hover:text-gulag-cyan'}`;

export default function AdminLayout() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">Administração</h1>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        <NavLink to="/admin/players" className={tabClass}>Jogadores</NavLink>
        <NavLink to="/admin/matchdays" className={tabClass}>Peladas</NavLink>
        <NavLink to="/admin/finance" className={tabClass}>Financeiro</NavLink>
        <NavLink to="/admin/settings" className={tabClass}>Configurações</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
