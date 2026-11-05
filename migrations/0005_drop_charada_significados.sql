-- 0005_drop_charada_significados.sql
-- The charada meanings are read from public/significados/charada-cubana.json,
-- which ships with the code and carries the artwork. Keeping a seeded copy in
-- Postgres meant two tables that could disagree — 99 was "Serrucho, Gallo,
-- Carbonero" there and "Temporal" here — so the cargador and the Significados
-- section could tell different stories about the same number.
--
-- Dropping is safe: the JSON is versioned in git and is the only source read now.

BEGIN;

DROP TABLE IF EXISTS charada_significados;

COMMIT;
