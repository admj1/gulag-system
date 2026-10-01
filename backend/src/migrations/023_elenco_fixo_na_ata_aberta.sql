-- O elenco fixo (mensalistas e goleiros fixos) entrava na ata so no momento
-- em que ela era lancada. Quem passava a fazer parte dele depois ficava de
-- fora da ata ja aberta: o Andre Lucas voltou a ser mensalista 14 minutos
-- depois de a ata de 03/10/2026 ser lancada e nao aparecia na lista.
--
-- O codigo ja corrige isso daqui para frente (services/roster.js). Aqui
-- coloca na ata aberta, como 'pending', quem e do elenco fixo e nao esta
-- nela — com o mesmo registro na auditoria que o codigo faria. Roda uma vez
-- so: se o admin tirar alguem da lista de proposito depois, um deploy
-- futuro nao pode recolocar.

CREATE TABLE IF NOT EXISTS one_off_fixes (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $elenco$
DECLARE
  item RECORD;
  qtd INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM one_off_fixes WHERE name = 'elenco_fixo_na_ata_aberta_2026_09') THEN
    RETURN;
  END IF;

  FOR item IN
    INSERT INTO confirmations (matchday_id, player_id, status)
    SELECT m.id, p.id, 'pending'
    FROM matchdays m
    CROSS JOIN players p
    WHERE m.status = 'open'
      AND p.active AND NOT p.blocked
      AND (p.player_type = 'mensalista' OR (p.player_type = 'goleiro' AND p.auto_roster))
    ON CONFLICT (matchday_id, player_id) DO NOTHING
    RETURNING matchday_id, player_id
  LOOP
    INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, target_label, details)
    SELECT NULL, 'sistema', 'ata.roster_add', 'player', p.id,
           TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)),
           jsonb_build_object('pelada', to_char(m.match_date, 'YYYY-MM-DD'))
    FROM players p, matchdays m
    WHERE p.id = item.player_id AND m.id = item.matchday_id;
    qtd := qtd + 1;
    RAISE NOTICE 'Jogador % incluido na ata aberta da pelada %', item.player_id, item.matchday_id;
  END LOOP;

  INSERT INTO one_off_fixes (name) VALUES ('elenco_fixo_na_ata_aberta_2026_09');
  RAISE NOTICE 'Elenco fixo nas atas abertas: % inclusao(oes).', qtd;
END
$elenco$;
