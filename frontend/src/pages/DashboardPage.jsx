import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Button, Card, EmptyState } from '../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };

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
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">Peladas</h1>
      {matchdays.length === 0 && (
        <Card><EmptyState>Nenhuma pelada cadastrada ainda.</EmptyState></Card>
      )}
      <ul className="flex flex-col gap-3">
        {matchdays.map((m) => (
          <li key={m.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-100">
                    {new Date(`${m.match_date}T12:00:00`).toLocaleDateString('pt-BR', {
                      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
                    })}
                  </p>
                  <p className="text-sm text-gray-400">{STATUS_LABELS[m.status] || m.status}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/peladas/${m.id}`}>
                    <Button variant="secondary">Ver ata</Button>
                  </Link>
                  {m.status === 'open' && (
                    <Button onClick={() => confirmPresence(m.id)}>Confirmar</Button>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
