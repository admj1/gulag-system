import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { Card, Avatar } from '../components/ui';

export default function PlayerProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    api.get(`/players/${id}`).then(({ data }) => setPlayer(data));
    api.get(`/stats/players/${id}`).then(({ data }) => setProfile(data));
  }, [id]);

  if (!player || !profile) return <p className="text-gray-400">Carregando...</p>;

  const { totals, goalkeeperTotals, collective } = profile;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link to="/players" className="text-sm text-gulag-cyan underline">← voltar</Link>
        <Link to={`/players/comparar?a=${player.id}`} className="text-sm text-gulag-cyan underline">
          ⚖ comparar com outro
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <Avatar src={player.photo_url} name={player.name} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-100 truncate">{player.name}</h1>
          <p className="text-gray-400 text-sm">
            {player.first_name} {player.last_name}
          </p>
          <p className="text-gray-400 text-sm">
            {[player.position, player.player_type, `${player.stars}★`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* Para goleiro, as estatisticas de goleiro vem sempre primeiro */}
      {player.player_type === 'goleiro' && (
        <Card title="Estatísticas de goleiro">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Peladas jogadas" value={goalkeeperTotals.peladas_jogadas} />
            <Stat label="Vitórias" value={goalkeeperTotals.wins} />
            <Stat label="Empates" value={goalkeeperTotals.draws} />
            <Stat label="Derrotas" value={goalkeeperTotals.losses} />
            <Stat label="Pênaltis defendidos" value={goalkeeperTotals.penalties_saved} />
            <Stat label="Assistências" value={goalkeeperTotals.assists} />
            <Stat label="Gols" value={goalkeeperTotals.goals} />
            <Stat label="Amarelos" value={goalkeeperTotals.yellow_cards} />
            <Stat label="Vermelhos" value={goalkeeperTotals.red_cards} />
          </div>
        </Card>
      )}

      <Card title="Estatísticas na linha">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Peladas jogadas" value={totals.peladas_jogadas} />
          <Stat label="Gols" value={totals.goals} />
          <Stat label="Assistências" value={totals.assists} />
          <Stat label="Artilheiro do dia" value={totals.top_scorer_days} hint="vezes" />
          <Stat label="Garçom do dia" value={totals.top_assist_days} hint="vezes" />
          <Stat label="Amarelos" value={totals.yellow_cards} />
          <Stat
            label="Azuis + Vermelhos"
            value={Number(totals.blue_cards || 0) + Number(totals.red_cards || 0)}
          />
          <Stat label="Faltas" value={totals.absences} />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Artilheiro e garçom do dia contam as peladas em que ninguém fez mais gols / mais
          assistências — em caso de empate, o dia conta para todos os empatados.
        </p>
      </Card>

      <Card title="Estatísticas coletivas">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Times da pelada"
            value={collective.bestTeamCount}
            hint="melhor time ou goleiro do dia"
          />
          <Stat label="Vitórias" value={collective.wins} />
          <Stat label="Empates" value={collective.draws} />
          <Stat label="Derrotas" value={collective.losses} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <MateStat
            label="Com quem mais ganhou"
            mate={collective.bestMate}
            value={(m) => `${m.wins} vitórias · ${m.winPct}%`}
            tone="text-emerald-400"
          />
          <MateStat
            label="Com quem mais perdeu"
            mate={collective.worstMate}
            value={(m) => `${m.losses} derrotas · ${m.lossPct}%`}
            tone="text-red-400"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          A porcentagem considera só as partidas em que os dois jogaram no mesmo time.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="border border-gulag-border rounded p-3 bg-gulag-surface-2 text-center">
      <p className="text-2xl font-bold text-gulag-cyan">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
      {hint && <p className="text-[10px] text-gray-600">{hint}</p>}
    </div>
  );
}

function MateStat({ label, mate, value, tone }) {
  return (
    <div className="border border-gulag-border rounded p-3 bg-gulag-surface-2">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {mate ? (
        <>
          <Link to={`/players/${mate.id}`} className={`font-medium underline ${tone}`}>
            {mate.name}
          </Link>
          <p className="text-xs text-gray-500">{value(mate)}</p>
        </>
      ) : (
        <p className="text-sm text-gray-600">Sem dados ainda</p>
      )}
    </div>
  );
}
