// Regras puras do torneio (sem banco): ordem do draft em cobrinha, divisao
// em grupos, tabela de jogos e classificacao. Ficam separadas para serem
// testadas sozinhas e lidas sem o barulho das rotas.

// Embaralha (Fisher-Yates) — usado no sorteio da ordem do draft
function embaralha(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Em cobrinha: rodada par vai 1..N, rodada impar volta N..1
function timeDaVez(ordem, escolhaNaFase) {
  const n = ordem.length;
  const rodada = Math.floor(escolhaNaFase / n);
  const posicao = escolhaNaFase % n;
  return rodada % 2 === 0 ? ordem[posicao] : ordem[n - 1 - posicao];
}

/**
 * Situacao do draft. Primeiro os jogadores de linha (o capitao ja esta no
 * time, entao sao line_per_team - 1 rodadas), depois o draft a parte so dos
 * goleiros (gk_per_team rodadas). Cada fase recomeca a cobrinha do 1o.
 * Uma fase acaba antes se nao sobrar ninguem para escolher.
 */
function estadoDoDraft({ tournament, teams, roster, registrations }) {
  const ordem = teams
    .filter((t) => t.draft_position != null)
    .sort((a, b) => a.draft_position - b.draft_position)
    .map((t) => t.id);
  const n = ordem.length;
  const noTime = new Set(roster.map((r) => r.player_id));
  const livresLinha = registrations.filter((r) => r.player_type !== 'goleiro' && !noTime.has(r.player_id));
  const livresGoleiro = registrations.filter((r) => r.player_type === 'goleiro' && !noTime.has(r.player_id));

  const escolhasLinha = roster.filter((r) => r.pick_number != null && !r.is_goalkeeper).length;
  const escolhasGoleiro = roster.filter((r) => r.pick_number != null && r.is_goalkeeper).length;
  const totalLinha = (tournament.line_per_team - 1) * n;
  const totalGoleiro = tournament.gk_per_team * n;

  let fase = 'fim';
  let teamId = null;
  if (n > 0 && escolhasLinha < totalLinha && livresLinha.length > 0 && escolhasGoleiro === 0) {
    fase = 'linha';
    teamId = timeDaVez(ordem, escolhasLinha);
  } else if (n > 0 && escolhasGoleiro < totalGoleiro && livresGoleiro.length > 0) {
    fase = 'goleiro';
    teamId = timeDaVez(ordem, escolhasGoleiro);
  }

  return {
    fase,
    teamId,
    ordem,
    proximaEscolha: escolhasLinha + escolhasGoleiro + 1,
    rodada: fase === 'linha' ? Math.floor(escolhasLinha / n) + 1
      : fase === 'goleiro' ? Math.floor(escolhasGoleiro / n) + 1 : null,
    totalRodadas: fase === 'linha' ? tournament.line_per_team - 1
      : fase === 'goleiro' ? tournament.gk_per_team : null,
    livresLinha: livresLinha.length,
    livresGoleiro: livresGoleiro.length,
  };
}

// Divide pela ordem do draft alternando, para equilibrar: com 2 grupos,
// 1->A, 2->B, 3->B, 4->A, 5->A, 6->B ... (cobrinha tambem)
function divideEmGrupos(teamIdsEmOrdem, numGrupos) {
  const rotulos = ['A', 'B'].slice(0, numGrupos);
  return teamIdsEmOrdem.map((id, i) => ({ id, grupo: timeDaVez(rotulos, i) }));
}

// Todos contra todos (metodo do circulo). Retorna rodadas de pares.
function rodizio(teamIds) {
  const times = [...teamIds];
  if (times.length % 2 === 1) times.push(null); // folga
  const n = times.length;
  const rodadas = [];
  for (let r = 0; r < n - 1; r += 1) {
    const jogos = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = times[i];
      const b = times[n - 1 - i];
      if (a !== null && b !== null) jogos.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rodadas.push(jogos);
    // gira todos menos o primeiro
    times.splice(1, 0, times.pop());
  }
  return rodadas;
}

// Jogos da fase de grupos intercalando os grupos (A, B, A, B...) para nenhum
// time jogar duas vezes seguidas quando da para evitar
function tabelaDeGrupos(grupos) {
  const porGrupo = {};
  for (const { id, grupo } of grupos) (porGrupo[grupo] ||= []).push(id);
  const sequencias = Object.keys(porGrupo).sort().map((g) => ({
    grupo: g,
    jogos: rodizio(porGrupo[g]).flat(),
  }));
  const jogos = [];
  const maior = Math.max(...sequencias.map((s) => s.jogos.length));
  for (let i = 0; i < maior; i += 1) {
    for (const s of sequencias) {
      if (s.jogos[i]) jogos.push({ grupo: s.grupo, home: s.jogos[i][0], away: s.jogos[i][1] });
    }
  }
  return jogos;
}

/**
 * Classificacao de um grupo. Pontos 3/1/0; desempate: saldo de gols, menos
 * cartoes amarelos, gols marcados e, por fim, nome.
 * jogos: [{ home_team_id, away_team_id, home_goals, away_goals }] (so encerrados)
 * amarelos: { [teamId]: total de amarelos do time nos jogos do grupo }
 */
function classificacao(teams, jogos, amarelos = {}) {
  const linha = Object.fromEntries(teams.map((t) => [t.id, {
    team_id: t.id, name: t.name, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0,
    amarelos: amarelos[t.id] || 0,
  }]));
  for (const m of jogos) {
    const casa = linha[m.home_team_id];
    const fora = linha[m.away_team_id];
    if (!casa || !fora) continue;
    casa.j += 1; fora.j += 1;
    casa.gp += m.home_goals; casa.gc += m.away_goals;
    fora.gp += m.away_goals; fora.gc += m.home_goals;
    if (m.home_goals > m.away_goals) { casa.v += 1; casa.pts += 3; fora.d += 1; }
    else if (m.home_goals < m.away_goals) { fora.v += 1; fora.pts += 3; casa.d += 1; }
    else { casa.e += 1; fora.e += 1; casa.pts += 1; fora.pts += 1; }
  }
  return Object.values(linha)
    .map((l) => ({ ...l, sg: l.gp - l.gc }))
    .sort((a, b) => b.pts - a.pts
      || b.sg - a.sg
      || a.amarelos - b.amarelos
      || b.gp - a.gp
      || a.name.localeCompare(b.name));
}

// Quem venceu um jogo de mata-mata (gols; se empatar, penaltis)
function vencedor(m) {
  if (m.home_goals !== m.away_goals) return m.home_goals > m.away_goals ? m.home_team_id : m.away_team_id;
  if (m.home_penalties == null || m.away_penalties == null || m.home_penalties === m.away_penalties) return null;
  return m.home_penalties > m.away_penalties ? m.home_team_id : m.away_team_id;
}

module.exports = {
  embaralha, timeDaVez, estadoDoDraft, divideEmGrupos, rodizio, tabelaDeGrupos, classificacao, vencedor,
};
