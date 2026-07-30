import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, EmptyState } from '../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };

const formatDate = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit',
  });

export default function DashboardPage() {
  const { player } = useAuth();
  const [matchdays, setMatchdays] = useState([]);
  const [myStatus, setMyStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const open = matchdays.find((m) => m.status === 'open');
  const others = matchdays.filter((m) => m.status !== 'open');

  function loadMatchdays() {
    return api.get('/matchdays')
      .then(({ data }) => { setMatchdays(data); return data; })
      .catch((err) => {
        toast.error(err.response?.data?.error || 'Erro ao carregar peladas');
        return [];
      });
  }

  useEffect(() => {
    loadMatchdays().finally(() => setLoading(false));
  }, []);

  // Status do proprio jogador na pelada com lista aberta
  useEffect(() => {
    if (!open) return setMyStatus(null);
    api.get(`/matchdays/${open.id}/confirmations`).then(({ data }) => {
      setMyStatus(data.find((c) => c.player_id === player?.id)?.status || null);
    });
  }, [open, player?.id]);

  async function confirmPresence() {
    try {
      await api.post(`/matchdays/${open.id}/confirmations`, {});
      setMyStatus('confirmed');
      toast.success('Presença confirmada!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao confirmar presença');
    }
  }

  async function declinePresence() {
    try {
      await api.post(`/matchdays/${open.id}/decline`);
      setMyStatus('declined');
      toast.success('Avisado que você não vai');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao avisar ausência');
    }
  }

  if (loading) return <p className="text-gray-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      {open ? (
        <Card className="border-gulag-cyan/50">
          <p className="text-xs uppercase tracking-wide text-gulag-cyan mb-1">Próxima pelada</p>
          <p className="text-lg font-semibold text-gray-100 capitalize">{formatDate(open.match_date)}</p>

          {myStatus === 'confirmed' ? (
            <div className="mt-3 rounded bg-emerald-500/10 border border-emerald-600/40 p-3 text-center">
              <p className="text-emerald-400 font-medium">Sua presença está confirmada ✓</p>
              <button onClick={declinePresence} className="text-xs text-gray-400 underline mt-1">
                mudei de ideia, não vou
              </button>
            </div>
          ) : myStatus === 'declined' ? (
            <div className="mt-3 rounded bg-red-500/10 border border-red-700/50 p-3 text-center">
              <p className="text-red-400 font-medium">Você avisou que não vai ❌</p>
              <button onClick={confirmPresence} className="text-xs text-gray-400 underline mt-1">
                mudei de ideia, vou jogar
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mt-3">
              <Button onClick={confirmPresence} className="flex-1 text-base py-3">
                Confirmar presença
              </Button>
              <Button variant="danger" onClick={declinePresence} className="text-base py-3">
                Não vou
              </Button>
            </div>
          )}

          <Link to={`/peladas/${open.id}`} className="block text-center text-sm text-gulag-cyan underline mt-3">
            Ver a lista completa e convidar alguém
          </Link>
        </Card>
      ) : (
        <Card><EmptyState>Nenhuma pelada com lista aberta no momento.</EmptyState></Card>
      )}

      {others.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-2">Peladas anteriores</h2>
          <ul className="flex flex-col gap-2">
            {others.map((m) => (
              <li key={m.id}>
                <Link to={`/peladas/${m.id}`}>
                  <Card className="hover:border-gulag-cyan">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-200 capitalize">{formatDate(m.match_date)}</span>
                      <span className="text-xs text-gray-500">{STATUS_LABELS[m.status] || m.status}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
