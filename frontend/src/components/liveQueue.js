import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { setUnsaved } from './unsavedGuard';

// Fila de lancamentos da sumula ao vivo. Cada toque na tela e gravado no aparelho
// antes de subir, então perder o sinal no meio do jogo nao perde nada: a fila fica
// no localStorage e sobe sozinha quando a conexao voltar (ou na proxima vez que o
// admin abrir a tela). O servidor ignora client_id repetido, por isso reenviar e seguro.
const STORAGE_PREFIX = 'gulag:sumula-fila:';
const BATCH_DELAY_MS = 400; // agrupa toques seguidos numa unica requisicao
const RETRY_MS = 8000;

function storageKey(matchdayId) {
  return `${STORAGE_PREFIX}${matchdayId}`;
}

function readQueue(matchdayId) {
  try {
    const raw = localStorage.getItem(storageKey(matchdayId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(matchdayId, events) {
  try {
    if (events.length === 0) localStorage.removeItem(storageKey(matchdayId));
    else localStorage.setItem(storageKey(matchdayId), JSON.stringify(events));
  } catch {
    // Sem espaco no aparelho: a fila continua valendo em memoria
  }
}

export function newClientId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useLiveQueue(matchdayId, onSynced) {
  const [pending, setPending] = useState(() => readQueue(matchdayId));
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  const pendingRef = useRef(pending);
  const sendingRef = useRef(false);
  const batchTimer = useRef(null);
  const syncedRef = useRef(onSynced);
  syncedRef.current = onSynced;

  const setQueue = useCallback((events) => {
    pendingRef.current = events;
    writeQueue(matchdayId, events);
    setPending(events);
  }, [matchdayId]);

  const flush = useCallback(async () => {
    if (sendingRef.current) return;
    const batch = pendingRef.current;
    if (batch.length === 0) return;

    sendingRef.current = true;
    setSending(true);
    try {
      const { data } = await api.post(`/matchdays/${matchdayId}/events`, { events: batch });
      // Toques feitos durante o envio continuam na fila
      const sent = new Set(batch.map((e) => e.client_id));
      setQueue(pendingRef.current.filter((e) => !sent.has(e.client_id)));
      setFailed(false);
      syncedRef.current?.(data);
    } catch (err) {
      const status = err.response?.status;
      // Erro de validacao/permissao nao melhora com reenvio: descarta para nao
      // travar a fila atras de um lancamento que o servidor nunca vai aceitar.
      if (status >= 400 && status < 500) {
        const sent = new Set(batch.map((e) => e.client_id));
        setQueue(pendingRef.current.filter((e) => !sent.has(e.client_id)));
        toast.error(err.response?.data?.error || 'Lançamentos recusados pelo servidor');
      }
      setFailed(true);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [matchdayId, setQueue]);

  const push = useCallback((event) => {
    setQueue([...pendingRef.current, event]);
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = setTimeout(() => {
      batchTimer.current = null;
      flush();
    }, BATCH_DELAY_MS);
  }, [flush, setQueue]);

  // Ao abrir a tela, sobe o que ficou de uma sessao anterior sem sinal
  useEffect(() => {
    const stored = readQueue(matchdayId);
    pendingRef.current = stored;
    setPending(stored);
    if (stored.length > 0) flush();
    return () => {
      if (batchTimer.current) clearTimeout(batchTimer.current);
    };
  }, [matchdayId, flush]);

  // Enquanto houver fila, tenta de novo periodicamente e assim que a rede voltar
  useEffect(() => {
    if (pending.length === 0) return undefined;
    const interval = setInterval(flush, RETRY_MS);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', flush);
    };
  }, [pending.length, flush]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Avisa antes de fechar o navegador com lancamentos ainda no aparelho
  useEffect(() => {
    setUnsaved(
      pending.length > 0,
      `${pending.length} lançamento(s) ainda não subiram. Eles ficam salvos no aparelho, mas só entram na súmula quando você abrir esta tela com internet.`
    );
    return () => setUnsaved(false);
  }, [pending.length]);

  return { pending, sending, offline: !online || failed, push, flush };
}
