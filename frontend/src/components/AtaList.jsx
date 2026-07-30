import { Card, EmptyState } from './ui';

// Verde = confirmado. Mensalistas aparecem na sua numeracao fixa;
// diaristas ficam em grupo separado, na ordem em que confirmaram.
export default function AtaList({
  confirmations,
  onToggle,
  onRemove,
  canEdit = false,
  currentPlayerId,
  isAdmin = false,
}) {
  const mensalistas = confirmations
    .filter((c) => c.player_type === 'mensalista')
    .sort((a, b) => (a.mensalista_number ?? 999) - (b.mensalista_number ?? 999));

  const goleiros = confirmations.filter((c) => c.player_type === 'goleiro');

  const diaristas = confirmations
    .filter((c) => c.player_type === 'diarista')
    .sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999));

  const confirmedMensalistas = mensalistas.filter((c) => c.status === 'confirmed').length;
  // Nao ha numero fixo de vagas: cada mensalista que nao confirmar libera a dele
  const vagasLivres = Math.max(0, mensalistas.length - confirmedMensalistas);

  // Quem incluiu alguem pode retirar essa pessoa se ela desistir
  const canRemove = (entry) =>
    !!onRemove &&
    entry.player_type !== 'mensalista' &&
    (isAdmin || (currentPlayerId && entry.invited_by_player_id === currentPlayerId));

  const rowProps = { onToggle, onRemove, canEdit, currentPlayerId, canRemove };

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Mensalistas (${confirmedMensalistas}/${mensalistas.length})`}>
        <ol className="flex flex-col">
          {mensalistas.map((c) => (
            <AtaRow key={c.id} position={c.mensalista_number} entry={c} {...rowProps} />
          ))}
        </ol>
        {mensalistas.length === 0 && <EmptyState>Nenhum mensalista relacionado.</EmptyState>}
      </Card>

      <Card title={`Diaristas (${diaristas.filter((c) => c.status === 'confirmed').length})`}>
        <p className="text-xs text-gray-500 mb-2">
          Por ordem de confirmação · {vagasLivres} vaga(s) livre(s) de mensalista
        </p>
        {diaristas.length === 0 ? (
          <EmptyState>Nenhum diarista inscrito.</EmptyState>
        ) : (
          <ol className="flex flex-col">
            {diaristas.map((c, i) => (
              <AtaRow key={c.id} position={i + 1} entry={c} {...rowProps} />
            ))}
          </ol>
        )}
      </Card>

      {goleiros.length > 0 && (
        <Card title="Goleiros">
          <ol className="flex flex-col">
            {goleiros.map((c, i) => (
              <AtaRow key={c.id} position={i + 1} entry={c} {...rowProps} />
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function AtaRow({ position, entry, onToggle, onRemove, canEdit, currentPlayerId, canRemove }) {
  const isMe = entry.player_id === currentPlayerId;
  const isConfirmed = entry.status === 'confirmed';
  const isWaitlist = entry.status === 'waitlist';
  const isDeclined = entry.status === 'declined';

  // Vermelho = avisou que nao vai; cinza = apenas nao respondeu
  const color = isConfirmed
    ? 'text-emerald-400 font-medium'
    : isDeclined
      ? 'text-red-400 font-medium'
      : isWaitlist
        ? 'text-amber-400'
        : 'text-gray-400';

  const label = isWaitlist ? 'espera' : null;
  const removable = canRemove(entry);

  const content = (
    <>
      <span className="text-gray-600 w-6 shrink-0 text-right">{position}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${color}`}>{entry.name}</span>
        {entry.invited_by_name && (
          <span className="block text-[11px] text-gray-500 truncate">
            convidado por {entry.invited_by_name}
          </span>
        )}
      </span>
      {isMe && <span className="text-[10px] text-gulag-cyan border border-gulag-cyan/50 rounded px-1 shrink-0">você</span>}
      {label && <span className="text-xs text-gray-500 shrink-0">{label}</span>}
      {isConfirmed && <span className="text-emerald-400 text-xs shrink-0">✓</span>}
      {isDeclined && <span className="text-xs shrink-0" title="Não vai">❌</span>}
    </>
  );

  const rowClass = `border-b border-gulag-border last:border-0 ${isMe ? 'bg-gulag-cyan/5' : ''}`;

  return (
    <li className={`${rowClass} flex items-center gap-1`}>
      {canEdit ? (
        <button
          onClick={() => onToggle(entry)}
          className="flex-1 min-w-0 flex items-center gap-2 py-2 text-sm text-left"
        >
          {content}
        </button>
      ) : (
        <span className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-sm">{content}</span>
      )}

      {removable && (
        <button
          onClick={() => onRemove(entry)}
          title={`Retirar ${entry.name} da lista`}
          aria-label={`Retirar ${entry.name} da lista`}
          className="shrink-0 text-red-400 hover:text-red-300 px-2 py-1 text-lg leading-none"
        >
          ×
        </button>
      )}
    </li>
  );
}
