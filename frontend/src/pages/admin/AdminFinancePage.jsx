import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../api/client';

const inputClass = 'bg-gulag-surface-2 border border-gulag-border text-gray-100 placeholder-gray-500 rounded px-2 py-1 text-sm focus:outline-none focus:border-gulag-cyan';

export default function AdminFinancePage() {
  const [pending, setPending] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const monthlyForm = useForm();
  const dailyForm = useForm();

  function load() {
    api.get('/finance/pending').then(({ data }) => setPending(data));
    api.get('/seasons').then(({ data }) => setSeasons(data));
    api.get('/matchdays').then(({ data }) => setMatchdays(data));
  }

  useEffect(load, []);

  async function markPaid(id) {
    try {
      await api.patch(`/finance/${id}/pay`);
      toast.success('Pagamento registrado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar pagamento');
    }
  }

  async function onGenerateMonthly(values) {
    try {
      const { data } = await api.post('/finance/monthly-fees', {
        season_id: Number(values.season_id),
        month: Number(values.month),
        year: Number(values.year),
      });
      toast.success(`${data.length} mensalidades geradas`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao gerar mensalidades');
    }
  }

  async function onChargeDaily(values) {
    try {
      const { data } = await api.post(`/finance/matchdays/${values.matchday_id}/daily-fees`, {
        season_id: Number(values.season_id),
      });
      toast.success(`${data.length} diárias lançadas`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao lançar diárias');
    }
  }

  const typeLabels = { mensalidade: 'Mensalidade', diaria: 'Diária', multa: 'Multa' };

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <h2 className="font-semibold text-gulag-cyan mb-3">Gerar mensalidade do mês</h2>
        <form onSubmit={monthlyForm.handleSubmit(onGenerateMonthly)} className="grid grid-cols-4 gap-2">
          <select {...monthlyForm.register('season_id', { required: true })} className={inputClass}>
            <option value="">Temporada</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input {...monthlyForm.register('month', { required: true })} type="number" min="1" max="12" placeholder="Mês" className={inputClass} />
          <input {...monthlyForm.register('year', { required: true })} type="number" placeholder="Ano" className={inputClass} />
          <button className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm">Gerar (R$50/mensalista)</button>
        </form>
      </div>

      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <h2 className="font-semibold text-gulag-cyan mb-3">Lançar diária da rodada</h2>
        <form onSubmit={dailyForm.handleSubmit(onChargeDaily)} className="grid grid-cols-4 gap-2">
          <select {...dailyForm.register('matchday_id', { required: true })} className={inputClass}>
            <option value="">Pelada</option>
            {matchdays.map((m) => (
              <option key={m.id} value={m.id}>{new Date(m.match_date).toLocaleDateString('pt-BR')}</option>
            ))}
          </select>
          <select {...dailyForm.register('season_id', { required: true })} className={inputClass}>
            <option value="">Temporada</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm">Gerar (R$15/diarista)</button>
        </form>
      </div>

      <div>
        <h2 className="font-semibold text-gulag-cyan mb-3">Pendências</h2>
        {pending.length === 0 && <p className="text-gray-400 text-sm">Nenhuma pendência.</p>}
        <ul className="flex flex-col gap-2">
          {pending.map((p) => (
            <li key={p.id} className="border border-gulag-border rounded p-3 bg-gulag-surface flex items-center justify-between">
              <div>
                <p className="text-gray-100">{p.name} — {typeLabels[p.type]}</p>
                <p className="text-xs text-gray-400">R$ {Number(p.amount).toFixed(2)}</p>
              </div>
              <button onClick={() => markPaid(p.id)} className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm">
                Marcar como pago
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
