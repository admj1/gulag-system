import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { FUNDOS, gerarArteJogador, compartilharArte } from '../../components/shareCard';
import { inputClass, Button, Card, Field, EmptyState } from '../../components/ui';

// Bancada da arte de redes sociais. Fica so aqui, no admin, enquanto a
// funcionalidade esta em stand by: o motor de desenho (components/shareCard.js)
// ja esta pronto e testado, mas o botao ainda nao aparece para os jogadores.
// Para liberar no futuro, e so chamar gerarArteJogador de onde o jogador
// estiver (ex.: no detalhamento do Ranking Geral ou no proprio perfil).
export default function AdminArtPage() {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [players, setPlayers] = useState([]);
  const [playerId, setPlayerId] = useState('');
  const [fundo, setFundo] = useState('classico');
  const [arte, setArte] = useState(null); // { blob, url }
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get('/seasons').then(({ data }) => {
      setSeasons(data);
      if (data[0]) setSeasonId(String(data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    api.get('/stats/ranking-geral', { params: { seasonId } })
      .then(({ data }) => {
        setPlayers(data.players);
        setPlayerId((atual) => (data.players.some((p) => String(p.id) === atual)
          ? atual
          : String(data.players[0]?.id || '')));
      })
      .catch(() => toast.error('Erro ao carregar os jogadores'));
  }, [seasonId]);

  // Guarda a url que esta na tela para soltar da memoria na hora certa: so
  // quando a proxima ja esta pronta (soltar antes deixaria a previa piscando
  // em branco) e ao sair da tela.
  const urlNaTela = useRef(null);

  useEffect(() => () => {
    if (urlNaTela.current) URL.revokeObjectURL(urlNaTela.current);
  }, []);

  const player = players.find((p) => String(p.id) === playerId);
  const seasonName = seasons.find((s) => String(s.id) === seasonId)?.name;

  useEffect(() => {
    if (!player) return undefined;
    let cancelado = false;

    setGerando(true);
    gerarArteJogador({ player, seasonName, fundo })
      .then((blob) => {
        // Trocar de fundo/jogador rapido dispara varias geracoes: so a ultima vale
        if (cancelado) return;
        const url = URL.createObjectURL(blob);
        if (urlNaTela.current) URL.revokeObjectURL(urlNaTela.current);
        urlNaTela.current = url;
        setArte({ blob, url });
      })
      .catch(() => { if (!cancelado) toast.error('Erro ao gerar a arte'); })
      .finally(() => { if (!cancelado) setGerando(false); });

    return () => { cancelado = true; };
  }, [player, seasonName, fundo]);

  async function compartilhar() {
    if (!arte || !player) return;
    setEnviando(true);
    try {
      const arquivo = `gulag-${player.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      const resultado = await compartilharArte(arte.blob, arquivo);
      if (resultado === 'baixado') toast.success('Arte salva.');
    } catch (err) {
      toast.error(err.message || 'Erro ao compartilhar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-amber-700/60">
        <p className="text-sm text-amber-300">
          Em stand by. Esta tela existe só para você testar e evoluir a arte — os jogadores ainda
          não têm acesso a ela em nenhum lugar do sistema.
        </p>
      </Card>

      <Card title="Arte para redes sociais">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Temporada">
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className={inputClass}>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Jogador">
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={inputClass}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.position}º · {p.name} — {p.points} pts</option>
              ))}
            </select>
          </Field>
        </div>

        <p className="text-xs text-gray-500 mt-3 mb-1">Fundo</p>
        <div className="flex flex-wrap gap-1">
          {FUNDOS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFundo(f.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${
                fundo === f.key
                  ? 'bg-gulag-cyan text-black border-gulag-cyan'
                  : 'border-gulag-border text-gray-300 hover:border-gulag-cyan'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {players.length === 0 ? (
        <EmptyState>Nenhum mensalista nesta temporada.</EmptyState>
      ) : (
        <Card title="Prévia">
          <div className="flex justify-center">
            <div className="w-[300px] aspect-[1080/1350] rounded border border-gulag-border overflow-hidden bg-gulag-bg flex items-center justify-center">
              {arte ? (
                <img
                  src={arte.url}
                  alt={`Arte de ${player?.name}`}
                  className={`w-full h-full transition-opacity ${gerando ? 'opacity-50' : ''}`}
                />
              ) : (
                <span className="text-xs text-gray-500">Gerando...</span>
              )}
            </div>
          </div>

          <div className="flex justify-center mt-3">
            <Button onClick={compartilhar} disabled={!arte || gerando || enviando}>
              {enviando ? 'Abrindo...' : '📤 Baixar / compartilhar'}
            </Button>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            PNG 1080×1350. No celular abre o compartilhamento do aparelho (Instagram, WhatsApp...);
            no computador, baixa o arquivo. Tudo é desenhado no próprio navegador, sem servidor.
          </p>
        </Card>
      )}
    </div>
  );
}
