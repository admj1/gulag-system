import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Card, EmptyState, matchDateLabel } from '../components/ui';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const TYPE_LABELS = { diaria: 'diária', multa: 'multa por falta' };

const real = (valor) => `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;

export default function MyFinancePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/finance/me')
      .then((res) => setData(res.data))
      .catch((err) => toast.error(err.response?.data?.error || 'Erro ao carregar seu financeiro'));
  }, []);

  if (!data) return <p className="text-gray-400">Carregando...</p>;

  const emDia = data.total === 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">Meu financeiro</h1>

      <Card className={emDia ? 'border-emerald-700/60' : 'border-amber-700/60'}>
        {emDia ? (
          <p className="text-emerald-400 font-medium">Você está em dia. Nada em aberto ✓</p>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-gray-400">Total em aberto</p>
            <p className="text-3xl font-bold text-amber-400">{real(data.total)}</p>
          </>
        )}
      </Card>

      {/* Goleiro e isento de tudo; diretoria, so de mensalidade */}
      {data.player_type !== 'goleiro' && (
        <Card title="Mensalidades">
          {data.exempt_monthly ? (
            <EmptyState>Você é isento de mensalidade.</EmptyState>
          ) : data.months.length === 0 ? (
            <EmptyState>Nenhuma mensalidade em aberto.</EmptyState>
          ) : (
            <>
              <ul className="flex flex-col">
                {data.months.map((m) => (
                  <li
                    key={`${m.year}-${m.month}`}
                    className="flex items-center justify-between gap-2 border-b border-gulag-border py-2 last:border-0"
                  >
                    <span className="text-sm text-gray-200">
                      {MONTHS[m.month - 1]}/{m.year}
                    </span>
                    <span className="text-sm text-amber-400">{real(data.fee)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                {data.months.length} mensalidade(s) em aberto ·{' '}
                {real(data.months.length * data.fee)}
              </p>
            </>
          )}
        </Card>
      )}

      <Card title="Diárias e multas">
        {data.charges.length === 0 ? (
          <EmptyState>Nenhuma diária ou multa em aberto.</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {data.charges.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 border-b border-gulag-border py-2 last:border-0"
              >
                <span className="text-sm text-gray-200 min-w-0 truncate">
                  {c.match_date ? matchDateLabel(c.match_date) : 'Sem data'}
                  <span className="text-gray-500"> · {TYPE_LABELS[c.type]}</span>
                </span>
                <span className="text-sm text-amber-400 shrink-0">{real(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-gray-500">
        Os pagamentos são registrados pelo organizador. Se você já acertou algo que aparece aqui
        como em aberto, fale com ele.
      </p>
    </div>
  );
}
