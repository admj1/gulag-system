import { Outlet, useLocation } from 'react-router-dom';

// A navegacao entre as areas do admin fica na sidebar; aqui so o titulo da secao
const TITLES = {
  '/admin/players': 'Jogadores',
  '/admin/matchdays': 'Gerenciamento de ATAS',
  '/admin/finance': 'Financeiro',
  '/admin/whatsapp': 'Confirmação por WhatsApp',
  '/admin/settings': 'Configurações',
};

export default function AdminLayout() {
  const { pathname } = useLocation();
  const title = TITLES[pathname]
    || (pathname.startsWith('/admin/matchdays/') ? 'Gerenciamento de ATAS' : 'Administração');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">{title}</h1>
      <Outlet />
    </div>
  );
}
