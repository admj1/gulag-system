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

  if (loading) return <p className="text-gray-400">Carregando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-gray-100">Próximas peladas</h1>
      {matchdays.length === 0 && <p className="text-gray-400">Nenhuma pelada cadastrada ainda.</p>}
      <ul className="flex flex-col gap-3">
        {matchdays.map((m) => (
          <li key={m.id} className="border border-gulag-border rounded p-4 flex items-center justify-between bg-gulag-surface">
            <div>
              <p className="font-medium text-gray-100">{new Date(m.match_date).toLocaleDateString('pt-BR')}</p>
              <p className="text-sm text-gray-400">Status: {m.status}</p>
            </div>
            {m.status === 'open' && (
              <button
                onClick={() => confirmPresence(m.id)}
                className="bg-gulag-cyan text-black font-semibold rounded px-4 py-2 hover:bg-gulag-cyan-dark"
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
