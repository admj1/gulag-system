-- Restaura a pelada de 08/08/2026 (id 64), apagada acidentalmente em
-- 28/08/2026 (ver auditoria: matchday.delete por Adema — a ata que motivou
-- o registro de auditoria deste sistema). Recuperada de um backup do
-- Railway de 22-23/08/2026, anterior a exclusao — dados extraidos apos
-- restaurar o backup para um volume separado e conferir contra producao
-- (mesmos 26 jogadores com os mesmos ids, nenhum id de time colidindo,
-- colunas identicas nas duas pontas).
--
-- So INSERT de dado que ja existiu (nada e sobrescrito ou apagado). Ids de
-- matchday e teams preservados do original, porque estavam livres em
-- producao — o gap deixado pela exclusao nunca e reaproveitado pelo
-- SERIAL. Roda uma vez so; confere as contagens antes de finalizar e
-- desfaz tudo (RAISE EXCEPTION aborta o bloco inteiro) se algo nao bater.

CREATE TABLE IF NOT EXISTS one_off_fixes (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $restaura$
DECLARE
  qtd_teams INT;
  qtd_team_players INT;
  qtd_confirmations INT;
  qtd_player_stats INT;
  qtd_goalkeeper_stats INT;
  qtd_payments INT;
  soma_gols INT;
BEGIN
  IF EXISTS (SELECT 1 FROM one_off_fixes WHERE name = 'restaura_pelada_64_2026_09') THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM matchdays WHERE id = 64) THEN
    RAISE NOTICE 'matchday 64 ja existe — pulando restauracao (alguem ja recriou manualmente?)';
    INSERT INTO one_off_fixes (name) VALUES ('restaura_pelada_64_2026_09');
    RETURN;
  END IF;

  INSERT INTO matchdays (id, season_id, match_date, confirmation_deadline, status, created_at)
  VALUES (64, 1, '2026-08-08T03:00:00.000Z', '2026-08-08T07:00:00.000Z', 'played', '2026-08-07T20:18:46.907Z');

  -- times
  INSERT INTO teams (id, matchday_id, name, wins, draws, losses) VALUES (307, 64, 'Time A', 2, 1, 4);
  INSERT INTO teams (id, matchday_id, name, wins, draws, losses) VALUES (308, 64, 'Time B', 3, 1, 2);
  INSERT INTO teams (id, matchday_id, name, wins, draws, losses) VALUES (309, 64, 'Time C', 5, 2, 1);
  INSERT INTO teams (id, matchday_id, name, wins, draws, losses) VALUES (310, 64, 'Time D', 0, 0, 3);

  -- jogadores alocados em cada time
  INSERT INTO team_players (team_id, player_id) VALUES (307, 38);
  INSERT INTO team_players (team_id, player_id) VALUES (307, 36);
  INSERT INTO team_players (team_id, player_id) VALUES (307, 96);
  INSERT INTO team_players (team_id, player_id) VALUES (307, 39);
  INSERT INTO team_players (team_id, player_id) VALUES (308, 16);
  INSERT INTO team_players (team_id, player_id) VALUES (308, 37);
  INSERT INTO team_players (team_id, player_id) VALUES (308, 1);
  INSERT INTO team_players (team_id, player_id) VALUES (308, 30);
  INSERT INTO team_players (team_id, player_id) VALUES (309, 13);
  INSERT INTO team_players (team_id, player_id) VALUES (309, 47);
  INSERT INTO team_players (team_id, player_id) VALUES (309, 15);
  INSERT INTO team_players (team_id, player_id) VALUES (309, 34);
  INSERT INTO team_players (team_id, player_id) VALUES (310, 43);
  INSERT INTO team_players (team_id, player_id) VALUES (310, 14);
  INSERT INTO team_players (team_id, player_id) VALUES (310, 29);
  INSERT INTO team_players (team_id, player_id) VALUES (310, 31);
  INSERT INTO team_players (team_id, player_id) VALUES (307, 88);
  INSERT INTO team_players (team_id, player_id) VALUES (309, 28);
  INSERT INTO team_players (team_id, player_id) VALUES (310, 27);
  INSERT INTO team_players (team_id, player_id) VALUES (308, 32);

  -- confirmacoes da ata
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 19, NULL, NULL, 'pending', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 16, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 27, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 38, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 31, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 14, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 29, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 28, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 18, NULL, NULL, 'pending', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 30, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 34, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 36, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 33, NULL, NULL, 'pending', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 32, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 17, NULL, NULL, 'pending', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 39, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 47, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 35, NULL, NULL, 'pending', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 37, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 15, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 13, NULL, NULL, 'confirmed', '2026-08-07T20:18:46.907Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 1, NULL, NULL, 'confirmed', '2026-08-08T09:41:50.394Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 43, NULL, 1, 'confirmed', '2026-08-07T20:19:34.955Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 88, NULL, 2, 'confirmed', '2026-08-07T20:19:40.722Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 96, NULL, 3, 'confirmed', '2026-08-07T20:20:28.691Z');
  INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status, confirmed_at) VALUES (64, 54, NULL, NULL, 'confirmed', '2026-08-08T10:12:53.571Z');

  -- sumula dos jogadores de linha
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 16, 308, 3, 2, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 13, 309, 3, 3, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 43, 310, 0, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 32, 308, 2, 4, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 15, 309, 2, 7, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 37, 308, 2, 0, 1, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 29, 310, 2, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 14, 310, 0, 1, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 30, 308, 2, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 1, 308, 1, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 47, 309, 3, 0, 1, 1, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 28, 309, 2, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 38, 307, 0, 0, 1, 1, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 88, 307, 0, 0, 1, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 34, 309, 1, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 39, 307, 1, 1, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 96, 307, 1, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 36, 307, 0, 1, 0, 1, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 27, 310, 0, 0, 0, 0, 0, FALSE);
  INSERT INTO player_match_stats (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent) VALUES (64, 31, 310, 0, 0, 0, 0, 0, FALSE);

  -- sumula dos goleiros
  INSERT INTO goalkeeper_match_stats (matchday_id, player_id, opponent_team_id, penalties_saved, assists, goals, wins, draws, losses, yellow_cards, red_cards) VALUES (64, 19, NULL, 0, 0, 0, 4, 2, 2, 0, 0);
  INSERT INTO goalkeeper_match_stats (matchday_id, player_id, opponent_team_id, penalties_saved, assists, goals, wins, draws, losses, yellow_cards, red_cards) VALUES (64, 18, NULL, 1, 1, 0, 2, 2, 3, 0, 0);
  INSERT INTO goalkeeper_match_stats (matchday_id, player_id, opponent_team_id, penalties_saved, assists, goals, wins, draws, losses, yellow_cards, red_cards) VALUES (64, 54, NULL, 0, 0, 0, 4, 0, 3, 0, 0);

  -- diarias (ja estavam pagas no backup)
  INSERT INTO payments (player_id, season_id, type, reference_month, reference_year, matchday_id, amount, status, paid_at, created_at) VALUES (43, 1, 'diaria', NULL, NULL, 64, 15.00, 'paid', '2026-08-10T15:00:00.000Z', '2026-08-08T12:00:01.710Z');
  INSERT INTO payments (player_id, season_id, type, reference_month, reference_year, matchday_id, amount, status, paid_at, created_at) VALUES (88, 1, 'diaria', NULL, NULL, 64, 15.00, 'paid', '2026-08-08T15:00:00.000Z', '2026-08-08T12:00:01.710Z');
  INSERT INTO payments (player_id, season_id, type, reference_month, reference_year, matchday_id, amount, status, paid_at, created_at) VALUES (96, 1, 'diaria', NULL, NULL, 64, 15.00, 'paid', '2026-08-08T15:00:00.000Z', '2026-08-08T12:00:01.710Z');

  -- sequences nunca podem ficar atras do maior id existente
  PERFORM setval('matchdays_id_seq', (SELECT MAX(id) FROM matchdays));
  PERFORM setval('teams_id_seq', (SELECT MAX(id) FROM teams));

  -- confere que gravou exatamente o que veio do backup antes de finalizar
  SELECT COUNT(*) INTO qtd_teams FROM teams WHERE matchday_id = 64;
  SELECT COUNT(*) INTO qtd_team_players FROM team_players tp JOIN teams t ON t.id = tp.team_id WHERE t.matchday_id = 64;
  SELECT COUNT(*) INTO qtd_confirmations FROM confirmations WHERE matchday_id = 64;
  SELECT COUNT(*) INTO qtd_player_stats FROM player_match_stats WHERE matchday_id = 64;
  SELECT COUNT(*) INTO qtd_goalkeeper_stats FROM goalkeeper_match_stats WHERE matchday_id = 64;
  SELECT COUNT(*) INTO qtd_payments FROM payments WHERE matchday_id = 64;
  SELECT COALESCE(SUM(goals), 0) INTO soma_gols FROM player_match_stats WHERE matchday_id = 64;

  IF qtd_teams <> 4
    OR qtd_team_players <> 20
    OR qtd_confirmations <> 26
    OR qtd_player_stats <> 20
    OR qtd_goalkeeper_stats <> 3
    OR qtd_payments <> 3
    OR soma_gols <> 25
  THEN
    RAISE EXCEPTION 'Restauracao da pelada 64 nao bateu com o esperado (teams=%, team_players=%, confirmations=%, player_stats=%, goalkeeper_stats=%, payments=%, soma_gols=%) — abortando',
      qtd_teams, qtd_team_players, qtd_confirmations, qtd_player_stats, qtd_goalkeeper_stats, qtd_payments, soma_gols;
  END IF;

  -- registro de auditoria: fica claro que foi uma recuperacao de backup,
  -- nao um lancamento manual pela tela
  INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, target_label, details)
  SELECT 1, 'Adema', 'matchday.restore_from_backup', 'matchday', 64, '2026-08-08T03:00:00.000Z',
         '{"origem":"backup Railway \"Pre-Security-Patch Backup\" (22-23/08/2026), restaurado apos exclusao acidental em 28/08/2026"}'::jsonb
  WHERE EXISTS (SELECT 1 FROM players WHERE id = 1);

  RAISE NOTICE 'Pelada 64 (08/08/2026) restaurada: % times, % confirmacoes, % jogadores na sumula, % goleiros, % diarias, % gols no total',
    qtd_teams, qtd_confirmations, qtd_player_stats, qtd_goalkeeper_stats, qtd_payments, soma_gols;

  INSERT INTO one_off_fixes (name) VALUES ('restaura_pelada_64_2026_09');
END
$restaura$;
