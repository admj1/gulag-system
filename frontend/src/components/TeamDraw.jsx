import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
} from '@dnd-kit/core';
import { EmptyState } from './ui';

// Arrastar e soltar jogadores entre os times.
// No celular vale o toque longo: 200ms segurando antes de comecar a arrastar,
// senao o gesto e tratado como rolagem normal da pagina.
export default function TeamDraw({ teams, onMovePlayer }) {
  const [dragging, setDragging] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd({ active, over }) {
    setDragging(null);
    if (!over) return;

    const targetTeamId = Number(over.id);
    const fromTeamId = active.data.current?.teamId;
    if (!targetTeamId || targetTeamId === fromTeamId) return;

    onMovePlayer(active.data.current.playerId, targetTeamId);
  }

  if (teams.length === 0) {
    return <EmptyState>Times ainda não sorteados.</EmptyState>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragging(active.data.current)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={handleDragEnd}
    >
      <p className="text-xs text-gray-500 mb-2">
        Segure em um nome e arraste para outro time.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <TeamColumn key={team.id} team={team} draggingTeamId={dragging?.teamId} />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="bg-gulag-cyan text-black text-sm font-medium rounded px-3 py-2 shadow-lg">
            {dragging.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function TeamColumn({ team, draggingTeamId }) {
  const { setNodeRef, isOver } = useDroppable({ id: team.id });
  const isSource = draggingTeamId === team.id;
  const totalStars = team.players.reduce((sum, p) => sum + Number(p.stars), 0);

  return (
    <div
      ref={setNodeRef}
      className={`border rounded p-2 transition-colors ${
        isOver && !isSource
          ? 'border-gulag-cyan bg-gulag-cyan/10'
          : 'border-gulag-border'
      }`}
    >
      <p className="font-medium text-gray-100 mb-2">
        {team.name} <span className="text-xs text-gray-500">({totalStars}★)</span>
        {(team.wins || team.draws || team.losses) > 0 && (
          <span className="text-xs text-gulag-cyan ml-1">
            {team.wins}V · {team.draws}E · {team.losses}D
          </span>
        )}
      </p>

      <ul className="flex flex-col gap-1 min-h-[44px]">
        {team.players.map((player) => (
          <PlayerChip key={player.id} player={player} teamId={team.id} />
        ))}
        {team.players.length === 0 && (
          <li className="text-xs text-gray-600 py-2 text-center">solte um jogador aqui</li>
        )}
      </ul>
    </div>
  );
}

function PlayerChip({ player, teamId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player-${player.id}`,
    data: { playerId: player.id, teamId, name: player.name },
  });

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // touch-none impede o navegador de rolar a pagina enquanto arrasta
      className={`touch-none select-none cursor-grab active:cursor-grabbing bg-gulag-surface-2 border border-gulag-border rounded px-2 py-2 text-sm text-gray-200 flex items-center gap-2 ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <span className="text-gray-600 leading-none">⠿</span>
      <span className="truncate">{player.name}</span>
      <span className="ml-auto text-xs text-gray-500 shrink-0">{player.stars}★</span>
    </li>
  );
}
