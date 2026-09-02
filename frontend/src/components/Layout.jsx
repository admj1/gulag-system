import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { confirmLeave } from './unsavedGuard';
import { Avatar } from './ui';

const LINKS = [
  { to: '/', label: 'PELADAS', end: true },
  { to: '/rankings', label: 'RANKINGS' },
  { to: '/players', label: 'JOGADORES' },
  { to: '/financeiro', label: 'FINANCEIRO' },
  { to: '/perfil', label: 'MEU PERFIL' },
];

const ADMIN_LINKS = [
  { to: '/admin/players', label: 'CADASTRO DE JOGADORES' },
  { to: '/admin/matchdays', label: 'GERENCIAMENTO DE ATAS' },
  { to: '/admin/finance', label: 'CONTROLE FINANCEIRO' },
  { to: '/admin/whatsapp', label: 'WHATSAPP' },
  { to: '/admin/auditoria', label: 'AUDITORIA' },
  { to: '/admin/settings', label: 'CONFIGURAÇÕES' },
];

export default function Layout() {
  const { player, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Comeca aberto se o usuario ja esta numa tela de administracao
  const [adminOpen, setAdminOpen] = useState(() => location.pathname.startsWith('/admin'));

  // Ao navegar, fecha a gaveta (no celular ela cobre a tela)
  useEffect(() => setOpen(false), [location.pathname]);

  // Trava a rolagem do fundo enquanto a gaveta estiver aberta no celular
  useEffect(() => {
    if (!open) return undefined;
    const mobile = window.matchMedia('(max-width: 1023px)').matches;
    if (!mobile) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="min-h-screen bg-gulag-bg text-gray-100 lg:flex">
      <header className="sidebar-toggle bg-black border-b border-gulag-cyan/30 sticky top-0 z-30">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="text-gulag-cyan text-2xl leading-none w-9 h-9 flex items-center justify-center -ml-1"
          >
            ☰
          </button>
          <Link to="/" className="flex items-center gap-2 font-bold text-gulag-cyan tracking-wide">
            <img src="/logo.jpeg" alt="Gulag" className="w-8 h-8 rounded-full" />
            GULAG
          </Link>
        </div>
      </header>

      <div
        className="sidebar-overlay fixed inset-0 bg-black/60 z-40"
        data-open={open}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <nav
        className="sidebar bg-black border-r border-gulag-cyan/30 flex flex-col"
        data-open={open}
        aria-label="Menu principal"
      >
        <div className="p-4 flex items-center justify-between gap-2 border-b border-gulag-border">
          <Link to="/" className="flex items-center gap-2 font-bold text-gulag-cyan tracking-wide">
            <img src="/logo.jpeg" alt="Gulag" className="w-9 h-9 rounded-full" />
            GULAG
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="sidebar-close text-gray-400 text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <SidebarGroup links={LINKS} />

          {isAdmin && (
            <div className="mt-3 pt-2 border-t border-gulag-border">
              <button
                onClick={() => setAdminOpen((v) => !v)}
                aria-expanded={adminOpen}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm uppercase tracking-wide text-gray-400 hover:text-gulag-cyan"
              >
                <span aria-hidden="true" className="text-xs">{adminOpen ? '▾' : '▸'}</span>
                Administração
              </button>
              {adminOpen && <SidebarGroup links={ADMIN_LINKS} />}
            </div>
          )}
        </div>

        <div className="border-t border-gulag-border p-3">
          <Link to="/perfil" className="flex items-center gap-2 min-w-0 mb-2">
            <Avatar src={player?.photo_url} name={player?.name} size="sm" />
            <span className="text-sm text-gray-300 truncate">{player?.name}</span>
          </Link>
          <button onClick={logout} className="text-sm text-gulag-cyan underline px-1">
            Sair
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0 px-4 py-5 lg:px-8 max-w-4xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarGroup({ links }) {
  return (
    <ul className="flex flex-col">
      {links.map(({ to, label, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            // Avisa antes de sair de uma tela com edicoes pendentes
            onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}
            className={({ isActive }) =>
              `block px-4 py-4 text-base tracking-wide border-l-2 ${
                isActive
                  ? 'border-gulag-cyan text-gulag-cyan bg-gulag-cyan/10 font-semibold'
                  : 'border-transparent text-gray-300 hover:text-gulag-cyan'
              }`
            }
          >
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
