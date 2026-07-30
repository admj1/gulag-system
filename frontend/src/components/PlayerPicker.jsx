import { useMemo, useState } from 'react';
import { inputClass, Button } from './ui';

// Lista suspensa com pesquisa: mostra so os selecionados e um campo de busca,
// para nao ocupar a tela toda quando houver muitos jogadores.
export default function PlayerPicker({
  players,
  selected,
  onChange,
  label = 'Buscar jogador',
  ordered = false,
  emptyLabel = 'Nenhum selecionado',
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const byId = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, p])),
    [players]
  );

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const available = players.filter((p) => !selected.includes(p.id));
    if (!term) return available.slice(0, 8);
    return available.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 20);
  }, [players, selected, search]);

  function add(id) {
    onChange([...selected, id]);
    setSearch('');
  }

  function toggleOpen() {
    setOpen((v) => !v);
    setSearch('');
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm text-gray-400">
          {label} {selected.length > 0 && <span className="text-gulag-cyan">({selected.length})</span>}
        </span>
        <Button type="button" variant="secondary" onClick={toggleOpen}>
          {open ? 'Fechar busca' : '+ Adicionar'}
        </Button>
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-gray-500 py-1">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-wrap gap-1 mb-2">
          {selected.map((id, i) => (
            <li
              key={id}
              className="flex items-center gap-1 bg-gulag-surface-2 border border-gulag-border rounded px-2 py-1 text-sm text-gray-200"
            >
              {ordered && <span className="text-[10px] text-gulag-cyan">{i + 1}º</span>}
              <span className="truncate max-w-[140px]">{byId[id]?.name || `#${id}`}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== id))}
                aria-label={`Retirar ${byId[id]?.name || id}`}
                className="text-red-400 leading-none px-1"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="border border-gulag-border rounded bg-gulag-surface-2 p-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Digite o nome..."
            className={inputClass}
          />
          {matches.length === 0 ? (
            <p className="text-xs text-gray-500 py-2 px-1">Nenhum jogador encontrado.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto mt-2">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => add(p.id)}
                    className="w-full text-left px-2 py-2 text-sm text-gray-200 hover:text-gulag-cyan flex justify-between gap-2"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {p.mensalista_number ? `nº ${p.mensalista_number}` : p.player_type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
