import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { inputClass, Button, Card, Field, EmptyState, matchDateLabel } from '../../components/ui';

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
  const [debts, setDebts] = useState(null);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [paying, setPaying] = useState(null);

  const loadMonthly = useCallback(() => {
    api.get('/finance/monthly', { params: { month, year } }).then(({ data }) => setMonthly(data));
  }, [month, year]);

  const loadPending = useCallback(() => {
    api.get('/finance/pending').then(({ data }) => setPending(data));
  }, []);

  const loadDebts = useCallback(() => {
    api.get('/finance/monthly/open').then(({ data }) => setDebts(data));
  }, []);

  useEffect(loadMonthly, [loadMonthly]);
  useEffect(loadPending, [loadPending]);
  useEffect(loadDebts, [loadDebts]);

  // Ao clicar em pagar, abre a caixa para informar a data em que o pagamento foi feito
  function askPaymentDate(target) {
    setPaidAt(new Date().toISOString().slice(0, 10));
    setPaying(target);
  }

  async function confirmPayment() {
    const paid_at = new Date(`${paidAt}T12:00:00`).toISOString();
    try {
      if (paying.kind === 'monthly-all') {
        const { data } = await api.post('/finance/monthly/all', {
          month, year, paid: true, paid_at,
        });
        loadMonthly();
        loadDebts();
        setPaying(null);
        toast.success(`${data.changed} mensalidade(s) quitada(s)`);
        return;
      }

      if (paying.kind === 'monthly') {
        await api.post('/finance/monthly', {
          player_id: paying.row.player_id,
          month, year, paid: true, paid_at,
        });
        loadMonthly();
        loadDebts();
      } else {
        await api.patch(`/finance/${paying.item.id}/pay`, { paid_at });
        loadPending();
      }
      setPaying(null);
      toast.success('Pagamento registrado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar pagamento');
    }
  }

  // Mês inteiro de volta para "em aberto": util quando ninguem pagou ainda
  async function reopenMonth() {
    if (!window.confirm(
      `Marcar TODAS as mensalidades de ${MONTHS[month - 1]}/${year} como em aberto?`
    )) return;
    try {
      const { data } = await api.post('/finance/monthly/all', { month, year, paid: false });
      toast.success(`${data.changed} mensalidade(s) reaberta(s)`);
      loadMonthly();
      loadDebts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reabrir o mês');
    }
  }

  async function undoMonthly(row) {
    try {
      await api.post('/finance/monthly', { player_id: row.player_id, month, year, paid: false });
      loadMonthly();
      loadDebts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao desfazer');
    }
  }

  // Acerto com um controle feito por fora: quita tudo e depois o admin reabre
  // com "Desfazer" só quem ainda deve
  async function payAllPending() {
    const abertas = pending.reduce(
      (total, group) => total + group.items.filter((i) => i.status === 'pending').length,
      0
    );
    if (abertas === 0) return toast('Não há diárias ou multas em aberto.');
    if (!window.confirm(
      `Dar baixa em ${abertas} diária(s)/multa(s) em aberto?\n\n`
      + 'Depois é só usar "Desfazer" nas que continuam devendo. '
      + 'Mensalidades não são afetadas.'
    )) return;

    try {
      const { data } = await api.post('/finance/pending/pay-all');
      toast.success(`${data.paid} cobrança(s) quitada(s)`);
      loadPending();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao dar baixa');
    }
  }

  async function undoPending(item) {
    try {
      await api.patch(`/finance/${item.id}/unpay`);
      loadPending();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao desfazer');
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="flex flex-col gap-4">
      {paying && (
        <Modal title="Data do pagamento" onClose={() => setPaying(null)}>
          <p className="text-sm text-gray-300 mb-3">
            {paying.kind === 'monthly-all'
              ? `Todas as mensalidades de ${MONTHS[month - 1]}/${year}`
              : paying.kind === 'monthly'
                ? `Mensalidade de ${paying.row.name}`
                : `${paying.item.name} — ${TYPE_LABELS[paying.item.type]}`}
          </p>
          <Field label="Quando o pagamento foi feito">
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="secondary" onClick={() => setPaying(null)}>Cancelar</Button>
            <Button onClick={confirmPayment}>Confirmar pagamento</Button>
          </div>
        </Modal>
      )}

      {debts && (
        <Card
          title="Mensalidades em aberto"
          action={
            <span className="text-sm font-semibold text-amber-400">
              R$ {debts.total.toFixed(2)}
            </span>
          }
        >
          {debts.players.length === 0 ? (
            <EmptyState>Nenhuma mensalidade em aberto. Tudo em dia.</EmptyState>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2">
                {debts.months} mensalidade(s) de {debts.players.length} jogador(es), de todos os
                meses. Toque em um mês para abrir o detalhe dele logo abaixo.
              </p>
              <ol className="flex flex-col gap-2">
                {debts.players.map((p) => (
                  <li key={p.player_id} className="border-b border-gulag-border pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-100 min-w-0 truncate">
                        {p.name}
                        {!p.current_mensalista && (
                          <span className="text-[10px] text-amber-400 border border-amber-700/60 rounded px-1 ml-1">
                            ex-mensalista
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-amber-400 shrink-0">
                        R$ {p.total.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.months.map((m) => (
                        <button
                          key={`${m.year}-${m.month}`}
                          onClick={() => { setMonth(m.month); setYear(m.year); }}
                          title={`Ver ${MONTHS[m.month - 1]}/${m.year}`}
                          className="rounded border border-gulag-border bg-gulag-surface-2 px-2 py-0.5 text-[11px] text-gray-300 hover:border-gulag-cyan"
                        >
                          {MONTHS[m.month - 1].slice(0, 3).toLowerCase()}/{String(m.year).slice(2)}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>
      )}

      <Card
        title="Mensalidades por mês"
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="secondary" onClick={() => askPaymentDate({ kind: 'monthly-all' })}>
              Quitar o mês
            </Button>
            <Button variant="secondary" onClick={reopenMonth}>
              Reabrir o mês
            </Button>
          </div>
        }
      >
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
                  {/* Quem nao e mais mensalista mas devia algo naquele mes */}
                  {!row.current_mensalista && (
                    <span className="text-[10px] text-amber-400 border border-amber-700/60 rounded px-1 ml-1">
                      ex-mensalista
                    </span>
                  )}
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
                    onClick={() => (row.status === 'paid'
                      ? undoMonthly(row)
                      : askPaymentDate({ kind: 'monthly', row }))}
                  >
                    {row.status === 'paid' ? 'Desfazer' : 'Pagar'}
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card
        title="Diárias e multas"
        action={
          <Button variant="secondary" onClick={payAllPending}>
            Dar baixa em tudo
          </Button>
        }
      >
        {pending.length === 0 ? (
          <EmptyState>Nenhuma cobrança lançada.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((group) => (
              <div key={group.date}>
                <h3 className="text-sm font-semibold text-gulag-cyan mb-1">
                  {group.match_date ? matchDateLabel(group.match_date) : 'Sem data'}
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
                          onClick={() => (item.status === 'paid'
                            ? undoPending(item)
                            : askPaymentDate({ kind: 'pending', item }))}
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
