import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { inputClass, Button, Card, Field, EmptyState } from '../../components/ui';

// Frase pronta por acao. {alvo} vira o nome/descricao do que foi atingido e
// {pelada} a data da pelada (quando a acao e sobre alguem dentro de uma).
// Quando existe "proprio", e a frase usada se quem fez e quem foi atingido
// sao a mesma pessoa ("confirmou presenca" em vez de "confirmou Fulano").
const ACTIONS = {
  // Presenca na ata
  'ata.confirm': { texto: 'confirmou {alvo} na pelada de {pelada}', proprio: 'confirmou presença na pelada de {pelada}' },
  'ata.decline': { texto: 'marcou que {alvo} não vai à pelada de {pelada}', proprio: 'avisou que não vai à pelada de {pelada}' },
  'ata.cancel': { texto: 'cancelou a presença de {alvo} na pelada de {pelada}', proprio: 'cancelou a própria presença na pelada de {pelada}' },
  'ata.invite': { texto: 'incluiu {alvo} na pelada de {pelada}' },
  'ata.remove': { texto: 'tirou {alvo} da lista da pelada de {pelada}' },
  'ata.admin_status': { texto: 'marcou {alvo} como {status} na pelada de {pelada}' },
  'ata.roster_add': { texto: 'colocou {alvo} na lista da pelada de {pelada} (entrou no elenco fixo com a lista já aberta)' },

  // Pelada, times e sumula
  'matchday.create': { texto: 'lançou a pelada de {alvo}' },
  'matchday.create_retroactive': { texto: 'lançou a ata retroativa de {alvo}' },
  'matchday.notify': { texto: 'enviou o aviso da pelada de {alvo}' },
  'matchday.close': { texto: 'fechou a lista da pelada de {alvo}' },
  'matchday.draw_teams': { texto: 'sorteou os times da pelada de {alvo}' },
  'matchday.rename_team': { texto: 'renomeou um time da pelada de {alvo}' },
  'matchday.move_player': { texto: 'mudou {alvo} de time na pelada de {pelada}' },
  'matchday.summary': { texto: 'salvou a súmula da pelada de {alvo}' },
  'matchday.delete': { texto: 'apagou a pelada de {alvo}' },
  'matchday.restore_from_backup': { texto: 'restaurou do backup a pelada de {alvo}' },

  // Cadastros
  'player.create': { texto: 'cadastrou {alvo}' },
  'player.update': { texto: 'editou o cadastro de {alvo}' },
  'player.self_update': { texto: 'editou o próprio cadastro' },
  'player.password_reset': { texto: 'trocou a senha de {alvo}' },
  'player.self_password_change': { texto: 'trocou a própria senha' },
  'player.change_type': { texto: 'mudou o tipo de {alvo}' },
  'player.activate': { texto: 'reativou o cadastro de {alvo}' },
  'player.deactivate': { texto: 'inativou o cadastro de {alvo}' },
  'player.block': { texto: 'suspendeu/bloqueou {alvo}' },
  'player.unblock': { texto: 'liberou {alvo}' },
  'player.unlock_login': { texto: 'liberou a senha travada de {alvo}' },
  'player.login_locked': { texto: 'travou a senha de {alvo} por tentativas erradas' },
  'player.promote_admin': { texto: 'promoveu {alvo} a administrador' },
  'player.demote_admin': { texto: 'removeu o acesso de administrador de {alvo}' },
  'player.delete': { texto: 'excluiu o cadastro de {alvo}' },
  'registration.request': { texto: 'pediu cadastro no sistema' },
  'registration.approve': { texto: 'aprovou o cadastro de {alvo}' },
  'registration.reject': { texto: 'recusou o pedido de cadastro de {alvo}' },

  // Financeiro
  'finance.mark_paid': { texto: 'deu baixa numa cobrança de {alvo}' },
  'finance.mark_pending': { texto: 'reabriu uma cobrança de {alvo}' },
  'finance.month_all': { texto: 'acertou a mensalidade de {alvo} para todo mundo' },
  'finance.pay_all_pending': { texto: 'deu baixa em todas as diárias e multas em aberto' },

  // Sistema
  'season.create': { texto: 'criou a temporada {alvo}' },
  'season.update': { texto: 'editou a temporada {alvo}' },
  'season.delete': { texto: 'apagou a temporada {alvo}' },
  'settings.update': { texto: 'mudou as configurações' },
  'settings.backup_now': { texto: 'enviou um backup manual por e-mail' },
};

const CATEGORIAS = [
  { value: '', label: 'Tudo' },
  { value: 'ata', label: 'Presença na ata' },
  { value: 'pelada', label: 'Peladas, times e súmula' },
  { value: 'cadastro', label: 'Cadastros e senhas' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'sistema', label: 'Temporadas e configurações' },
];

const STATUS = { confirmed: 'confirmado', declined: 'não vai', pending: 'sem resposta', waitlist: 'espera' };

// Nomes legiveis para as chaves dos detalhes
const CHAVES = {
  cadastro_novo: 'cadastro novo', reedicao: 'súmula alterada depois de salva', teste: 'só teste',
  automatico: 'automático (prazo venceu)', ja_confirmada: 'lançada já confirmada',
  aviso_por_email: 'aviso por e-mail', destinatarios: 'destinatários',
  mensalistasSemConfirmar: 'mensalistas sem confirmar', diaristasConfirmados: 'diaristas',
  fila: 'na espera', time_renomeado: 'time de origem renomeado para', a_partir_de: 'a partir de',
  alterados: 'alterados', quitadas: 'quitadas', referencia: 'referência', tentativas: 'tentativas',
  pago: 'pago', enviados: 'enviados', falhas: 'falhas', ate: 'até', origem: 'origem',
};

// Acoes que ja apagam o proprio alvo: nao da para linkar para ele
const SEM_LINK = new Set(['player.delete', 'matchday.delete', 'registration.reject', 'registration.request']);

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// "2026-09-19" (ou um timestamp antigo "2026-09-19T03:00...") vira "19/09/2026"
function formatDia(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

function formatValor(chave, valor) {
  if (valor === true) return 'sim';
  if (valor === false) return 'não';
  if (valor === null || valor === undefined || valor === '') return '—';
  if (chave === 'ate') return formatDia(valor);
  if (chave === 'valor') return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
  return String(valor);
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  // Descarta resposta velha: digitar rapido dispara varias buscas
  const pedido = useRef(0);

  function load(offset = 0) {
    const meu = ++pedido.current;
    setLoading(true);
    api.get('/audit-log', { params: { limit: 50, offset, categoria: categoria || undefined, busca: busca || undefined } })
      .then(({ data }) => {
        if (meu !== pedido.current) return;
        setEntries((prev) => (offset === 0 ? data.entries : [...prev, ...data.entries]));
        setTotal(data.total);
      })
      .catch((err) => toast.error(err.response?.data?.error || 'Erro ao carregar auditoria'))
      .finally(() => { if (meu === pedido.current) setLoading(false); });
  }

  // Busca espera a pessoa parar de digitar; trocar a categoria recarrega na hora
  useEffect(() => {
    const t = setTimeout(() => load(0), busca ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, busca]);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Ações registradas">
        <p className="text-xs text-gray-500 mb-3">
          Tudo o que acontece no sistema: quem confirmou ou saiu da lista, quem incluiu alguém,
          times e súmula, cadastros, senhas e fotos, baixas no financeiro e configurações.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          <Field label="Tipo">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputClass}>
              {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Buscar nome">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Quem fez ou quem foi atingido..."
              className={inputClass}
            />
          </Field>
        </div>

        {entries.length === 0 && !loading ? (
          <EmptyState>Nenhuma ação encontrada.</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {entries.map((e) => (
              <li key={e.id} className="border-b border-gulag-border py-2 last:border-0">
                <p className="text-sm text-gray-200">
                  <span className="font-medium text-gulag-cyan">{e.actor_name}</span>{' '}
                  {renderAction(e)}
                </p>
                {renderDetails(e.details) && (
                  <p className="text-xs text-gray-500">{renderDetails(e.details)}</p>
                )}
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

// Detalhes guardados como json solto. Os que ja entraram na frase (pelada,
// status) nao se repetem; mudancas de campo viram "campo: antes → depois".
function renderDetails(details) {
  if (!details) return null;
  // Formato antigo do "editou o proprio cadastro"
  if (details.nome_antes && details.nome_depois) {
    return `nome: "${details.nome_antes}" → "${details.nome_depois}"${details.foto === true ? ' · trocou a foto' : ''}`;
  }
  const partes = [];
  for (const [chave, valor] of Object.entries(details)) {
    if (chave === 'pelada' || chave === 'status') continue;
    const rotulo = CHAVES[chave] || chave;
    if (valor && typeof valor === 'object' && ('de' in valor || 'para' in valor)) {
      partes.push(`${rotulo}: ${formatValor(chave, valor.de)} → ${formatValor(chave, valor.para)}`);
    } else if (chave === 'foto') {
      partes.push(valor === true ? 'trocou a foto' : `${valor} a foto`);
    } else if (valor === true) {
      partes.push(rotulo);
    } else {
      partes.push(`${rotulo}: ${formatValor(chave, valor)}`);
    }
  }
  return partes.length ? partes.join(' · ') : null;
}

function renderAction(entry) {
  const def = ACTIONS[entry.action];
  if (!def) return entry.action;

  const proprio = def.proprio && entry.actor_id && entry.actor_id === entry.target_id;
  let texto = proprio ? def.proprio : def.texto;
  // Sumula mexida depois de salva merece frase propria
  if (entry.action === 'matchday.summary' && entry.details?.reedicao) {
    texto = 'alterou a súmula (já salva) da pelada de {alvo}';
  }
  texto = texto
    .replace('{pelada}', formatDia(entry.details?.pelada) || '?')
    .replace('{status}', STATUS[entry.details?.status] || entry.details?.status || '?');
  if (!texto.includes('{alvo}')) return texto;

  const alvoTexto = entry.target_type === 'matchday'
    ? formatDia(entry.target_label)
    : entry.target_label || (entry.target_id ? `#${entry.target_id}` : '?');
  const [antes, depois] = texto.split('{alvo}');

  let alvo = <strong className="text-gray-100">{alvoTexto}</strong>;
  if (!SEM_LINK.has(entry.action) && entry.target_id) {
    if (entry.target_type === 'player') {
      alvo = <Link to={`/players/${entry.target_id}`} className="underline">{alvoTexto}</Link>;
    } else if (entry.target_type === 'matchday') {
      alvo = <Link to={`/admin/matchdays/${entry.target_id}`} className="underline">{alvoTexto}</Link>;
    }
  }

  return <>{antes}{alvo}{depois}</>;
}
