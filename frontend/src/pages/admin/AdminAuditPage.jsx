import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { Button, Card, EmptyState } from '../../components/ui';

// Frase pronta por acao. {alvo} vira o nome/descricao do que foi atingido.
const ACTION_LABELS = {
  'matchday.delete': 'apagou a pelada de {alvo}',
  'player.delete': 'excluiu o cadastro de {alvo}',
  'player.block': 'bloqueou {alvo}',
  'player.unblock': 'desbloqueou {alvo}',
  'player.password_reset': 'trocou a senha de {alvo}',
  'player.promote_admin': 'promoveu {alvo} a administrador',
  'player.demote_admin': 'removeu o acesso de administrador de {alvo}',
  'season.delete': 'apagou a temporada {alvo}',
};

// Quem clica ainda existe (ou some por meio de outra linha do proprio log);
// so faz sentido linkar quando o alvo nao foi excluido nesta mesma acao
const LINKABLE = new Set(['player.block', 'player.unblock', 'player.password_reset',
  'player.promote_admin', 'player.demote_admin']);

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  function load(offset = 0) {
    setLoading(true);
    api.get('/audit-log', { params: { limit: 50, offset } })
      .then(({ data }) => {
        setEntries((prev) => (offset === 0 ? data.entries : [...prev, ...data.entries]));
        setTotal(data.total);
      })
      .catch((err) => toast.error(err.response?.data?.error || 'Erro ao carregar auditoria'))
      .finally(() => setLoading(false));
  }

  useEffect(() => load(0), []);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Ações registradas">
        <p className="text-xs text-gray-500 mb-3">
          Quem fez o quê nas ações destrutivas ou sensíveis do sistema: apagar pelada, excluir
          jogador, bloquear, trocar senha de outra pessoa e promover/remover administrador.
        </p>

        {entries.length === 0 && !loading ? (
          <EmptyState>Nenhuma ação registrada ainda.</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {entries.map((e) => (
              <li key={e.id} className="border-b border-gulag-border py-2 last:border-0">
                <p className="text-sm text-gray-200">
                  <span className="font-medium text-gulag-cyan">{e.actor_name}</span>{' '}
                  {renderAction(e)}
                </p>
                <p className="text-xs text-gray-500">{formatDateTime(e.created_at)}</p>
              </li>
            ))}
          </ul>
        )}

        {entries.length < total && (
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" onClick={() => load(entries.length)} disabled={loading}>
              {loading ? 'Carregando...' : `Carregar mais (${total - entries.length} restante(s))`}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function renderAction(entry) {
  const template = ACTION_LABELS[entry.action] || entry.action;
  const alvo = entry.target_label || `#${entry.target_id}`;
  const [before, after] = template.split('{alvo}');

  const linkAlvo = LINKABLE.has(entry.action) && entry.target_type === 'player' && entry.target_id
    ? <Link to={`/players/${entry.target_id}`} className="underline">{alvo}</Link>
    : <strong className="text-gray-100">{alvo}</strong>;

  return <>{before}{linkAlvo}{after}</>;
}
