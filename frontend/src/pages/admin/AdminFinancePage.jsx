import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { inputClass, Button, Card, Field, EmptyState } from '../../components/ui';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const TYPE_LABELS = { diaria: 'diária', multa: 'multa' };

export default function AdminFinancePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [monthly, setMonthly] = useState([]);
  const [pending, setPending] = useState([]);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));

  const loadMonthly = useCallback(() => {
    api.get('/finance/monthly', { params: { month, year } }).then(({ data }) => setMonthly(data));
  }, [month, year]);

  const loadPending = useCallback(() => {
    api.get('/finance/pending').then(({ data }) => setPending(data));
  }, []);

  useEffect(loadMonthly, [loadMonthly]);
  useEffect(loadPending, [loadPending]);

  // A baixa usa a data informada, porque o admin pode registrar dias depois
  async function toggleMonthly(row) {
    try {
      const paid = row.status !== 'paid';
      await api.post('/finance/monthly', {
        player_id: row.player_id,
        month, year, paid,
        paid_at: paid ? new Date(`${paidAt}T12:00:00`).toISOString() : null,
      });
      loadMonthly();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar mensalidade');
    }
  }

  async function togglePending(item) {
    try {
      if (item.status === 'paid') {
        await api.patch(`/finance/${item.id}/unpay`);
      } else {
        await api.patch(`/finance/${item.id}/pay`, {
          paid_at: new Date(`${paidAt}T12:00:00`).toISOString(),
        });
      }
      loadPending();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar cobrança');
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Data do pagamento">
        <Field label="As baixas abaixo serão registradas com esta data">
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className={inputClass}
          />
        </Field>
        <p className="text-xs text-gray-500 mt-2">
          Ajuste antes de marcar como pago se o pagamento foi feito em outro dia.
        </p>
      </Card>

      <Card title="Mensalidades">
        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          <Field label="Mês">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputClass}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Ano">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        </div>

        {monthly.length === 0 ? (
          <EmptyState>Nenhum mensalista cadastrado.</EmptyState>
        ) : (
          <ol className="flex flex-col gap-1">
            {monthly.map((row, i) => (
              <li
                key={row.player_id}
                className="flex items-center justify-between gap-2 border-b border-gulag-border py-2 last:border-0"
              >
                <span className="text-gray-200 text-sm min-w-0 truncate">
                  {i + 1}. {row.name}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {row.status === 'paid' ? (
                    <span className="text-xs text-emerald-400">
                      pago em {new Date(row.paid_at).toLocaleDateString('pt-BR')}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400">em aberto</span>
                  )}
                  <Button
                    variant={row.status === 'paid' ? 'secondary' : 'primary'}
                    onClick={() => toggleMonthly(row)}
                  >
                    {row.status === 'paid' ? 'Desfazer' : 'Pagar'}
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Diárias e multas">
        {pending.length === 0 ? (
          <EmptyState>Nenhuma cobrança lançada.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((group) => (
              <div key={group.date}>
                <h3 className="text-sm font-semibold text-gulag-cyan mb-1">
                  {group.match_date
                    ? new Date(`${group.match_date}T12:00:00`).toLocaleDateString('pt-BR')
                    : 'Sem data'}
                </h3>
                <ol className="flex flex-col gap-1">
                  {group.items.map((item, i) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 border-b border-gulag-border py-2 last:border-0"
                    >
                      <span className="text-gray-200 text-sm min-w-0 truncate">
                        {i + 1} - {item.name} <span className="text-gray-500">({TYPE_LABELS[item.type]})</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs text-right ${item.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          R$ {Number(item.amount).toFixed(2)}
                          {item.status === 'paid' && item.paid_at && (
                            <span className="block text-[10px]">
                              pago em {new Date(item.paid_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </span>
                        <Button
                          variant={item.status === 'paid' ? 'secondary' : 'primary'}
                          onClick={() => togglePending(item)}
                        >
                          {item.status === 'paid' ? 'Desfazer' : 'Pagar'}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
