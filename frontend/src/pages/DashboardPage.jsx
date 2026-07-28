import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function DashboardPage() {
  const [matchdays, setMatchdays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/matchdays')
      .then(({ data }) => setMatchdays(data))
      .catch((err) => toast.error(err.response?.data?.error || 'Erro ao carregar peladas'))
      .finally(() => setLoading(false));
  }, []);

  async function confirmPresence(matchdayId) {
    try {
      await api.post(`/matchdays/${matchdayId}/confirmations`, {});
      toast.success('Presença confirmada!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao confirmar presença');
    }
  }

  if (loading) return <p>Carregando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Próximas peladas</h1>
      {matchdays.length === 0 && <p>Nenhuma pelada cadastrada ainda.</p>}
      <ul className="flex flex-col gap-3">
        {matchdays.map((m) => (
          <li key={m.id} className="border rounded p-4 flex items-center justify-between bg-white">
            <div>
              <p className="font-medium">{new Date(m.match_date).toLocaleDateString('pt-BR')}</p>
              <p className="text-sm text-slate-500">Status: {m.status}</p>
            </div>
            {m.status === 'open' && (
              <button
                onClick={() => confirmPresence(m.id)}
                className="bg-emerald-700 text-white rounded px-4 py-2"
              >
                Confirmar presença
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
