import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { hasUnsaved } from './unsavedGuard';

// Depois de um deploy, quem esta com a pagina aberta continua rodando o codigo
// antigo ate recarregar. Aqui comparamos a versao que o servidor esta servindo
// com a que foi carregada: sem nada em edicao a pagina se atualiza sozinha; com
// sumula ou fila pendente, espera o admin clicar para nao atrapalhar em campo.
const CHECK_MS = 5 * 60 * 1000;

export default function VersionWatcher() {
  const [outdated, setOutdated] = useState(false);
  const loadedVersion = useRef(null);
  const dismissed = useRef(false);

  useEffect(() => {
    let active = true;

    async function check() {
      if (!active || dismissed.current || document.hidden) return;
      try {
        const { data } = await api.get('/version');
        if (!active || !data?.version) return;

        if (loadedVersion.current === null) {
          loadedVersion.current = data.version;
          return;
        }
        if (data.version === loadedVersion.current) return;

        if (hasUnsaved()) setOutdated(true);
        else window.location.reload();
      } catch {
        // Sem internet ou servidor reiniciando no meio do deploy: tenta depois
      }
    }

    check();
    const interval = setInterval(check, CHECK_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!outdated) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] bg-gulag-cyan text-black px-4 py-2 flex items-center justify-between gap-3">
      <span className="text-sm font-medium min-w-0">
        Saiu uma versão nova do sistema.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-black/85 text-gulag-cyan px-3 py-1.5 text-sm font-semibold"
        >
          Atualizar
        </button>
        <button
          onClick={() => { dismissed.current = true; setOutdated(false); }}
          className="text-sm underline"
        >
          depois
        </button>
      </div>
    </div>
  );
}
