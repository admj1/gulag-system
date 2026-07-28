import { Card, EmptyState } from './ui';

const TOTAL_SLOTS = 20;

// Verde = confirmado. Mensalistas ficam nas vagas fixas 1-20;
// diaristas aparecem em grupo separado, na ordem em que confirmaram.
export default function AtaList({ confirmations, onToggle, canEdit = false, currentPlayerId }) {
  const mensalistas = confirmations
    .filter((c) => c.player_type === 'mensalista')
    .sort((a, b) => (a.mensalista_number ?? 99) - (b.mensalista_number ?? 99));

  const goleiros = confirmations.filter((c) => c.player_type === 'goleiro');

  const diaristas = confirmations
    .filter((c) => c.player_type === 'diarista')
    .sort((a, b) => (a.queue_position ?? 99) - (b.queue_position ?? 99));

  const confirmedMensalistas = mensalistas.filter((c) => c.status === 'confirmed').length;
  const vagasLivres = Math.max(0, TOTAL_SLOTS - confirmedMensalistas);

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Mensalistas (${confirmedMensalistas}/${TOTAL_SLOTS})`}>
        <ol className="flex flex-col">
          {mensalistas.map((c) => (
            <AtaRow
              key={c.id}
              position={c.mensalista_number}
              entry={c}
              onToggle={onToggle}
              canEdit={canEdit}
              isMe={c.player_id === currentPlayerId}
            />
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
              <AtaRow
                key={c.id}
                position={i + 1}
                entry={c}
                onToggle={onToggle}
                canEdit={canEdit}
                isMe={c.player_id === currentPlayerId}
              />
            ))}
          </ol>
        )}
      </Card>

      {goleiros.length > 0 && (
        <Card title="Goleiros">
          <ol className="flex flex-col">
            {goleiros.map((c, i) => (
              <AtaRow
                key={c.id}
                position={i + 1}
                entry={c}
                onToggle={onToggle}
                canEdit={canEdit}
                isMe={c.player_id === currentPlayerId}
              />
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function AtaRow({ position, entry, onToggle, canEdit, isMe = false }) {
  const isConfirmed = entry.status === 'confirmed';
  const isWaitlist = entry.status === 'waitlist';
  const isDeclined = entry.status === 'declined';

  const color = isConfirmed
    ? 'text-emerald-400 font-medium'
    : isDeclined
      ? 'text-gray-600 line-through'
      : isWaitlist
        ? 'text-amber-400'
        : 'text-gray-400';

  const label = isWaitlist ? 'espera' : isDeclined ? 'não confirmou' : null;

  const content = (
    <>
      <span className="text-gray-600 w-6 shrink-0 text-right">{position}</span>
      <span className={`truncate ${color}`}>{entry.name}</span>
      {isMe && <span className="text-[10px] text-gulag-cyan border border-gulag-cyan/50 rounded px-1 shrink-0">você</span>}
      {label && <span className="text-xs text-gray-500 shrink-0">{label}</span>}
      {isConfirmed && <span className="text-emerald-400 text-xs shrink-0">✓</span>}
    </>
  );

  const rowClass = `border-b border-gulag-border last:border-0 ${isMe ? 'bg-gulag-cyan/5' : ''}`;

  if (!canEdit) {
    return <li className={`flex items-center gap-2 py-1.5 text-sm ${rowClass}`}>{content}</li>;
  }

  return (
    <li className={rowClass}>
      <button
        onClick={() => onToggle(entry)}
        className="w-full flex items-center gap-2 py-2 text-sm text-left"
      >
        {content}
      </button>
    </li>
  );
}
