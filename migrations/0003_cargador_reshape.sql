-- 0003_cargador_reshape.sql
-- The cargador is the full three-digit Pick 3 number, looked up in the charada
-- by its LAST TWO digits. It is not a set of per-digit senas.
--
--   fijo        the full number, 0..999, as spoken ("el 570")
--   prefijo     its hundreds digit; 0 when the draw is under 100
--   dos_ultimos the charada lookup number, 0..99
--
-- The previous `senas smallint[]` column modelled the wrong thing (a sorted set
-- of per-digit guesses) and destroyed digit order, so it is replaced.

BEGIN;

ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS fijo smallint;
ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS prefijo smallint;
ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS dos_ultimos smallint;

-- Backfill from the source draw, in winning order.
UPDATE cargadores c
SET fijo = d.base_digits[1] * 100 + d.base_digits[2] * 10 + d.base_digits[3],
    prefijo = d.base_digits[1],
    dos_ultimos = (d.base_digits[2] * 10 + d.base_digits[3])
FROM draws d
WHERE d.id = c.draw_id;

-- m1/m2/m3 were derived from a Pick 4 pairing that no longer describes a
-- cargador. Drop them so nothing reads stale semantics.
ALTER TABLE cargadores DROP COLUMN IF EXISTS m1;
ALTER TABLE cargadores DROP COLUMN IF EXISTS m2;
ALTER TABLE cargadores DROP COLUMN IF EXISTS m3;
ALTER TABLE cargadores DROP COLUMN IF EXISTS senas;

ALTER TABLE cargadores
  ALTER COLUMN fijo SET NOT NULL,
  ALTER COLUMN prefijo SET NOT NULL,
  ALTER COLUMN dos_ultimos SET NOT NULL;

ALTER TABLE cargadores
  ADD CONSTRAINT cargadores_fijo_range CHECK (fijo BETWEEN 0 AND 999),
  ADD CONSTRAINT cargadores_prefijo_range CHECK (prefijo BETWEEN 0 AND 9),
  ADD CONSTRAINT cargadores_dos_ultimos_range CHECK (dos_ultimos BETWEEN 0 AND 99);

COMMENT ON COLUMN cargadores.fijo IS
  'Full three-digit Pick 3 result, 0..999. Spoken as "el 570".';
COMMENT ON COLUMN cargadores.prefijo IS
  'Hundreds digit; 0 when the draw is under 100.';
COMMENT ON COLUMN cargadores.dos_ultimos IS
  'Charada lookup number (0..99); 0 has no table row.';

CREATE INDEX IF NOT EXISTS cargadores_fijo_idx ON cargadores (fijo);
CREATE INDEX IF NOT EXISTS cargadores_dos_ultimos_idx ON cargadores (dos_ultimos);

-- One cargador per Pick 3 draw.
ALTER TABLE cargadores DROP CONSTRAINT IF EXISTS cargadores_unique;
ALTER TABLE cargadores ADD CONSTRAINT cargadores_unique UNIQUE (draw_id);

-- Adivinanzas shipped with a `senas` column under the old model.
ALTER TABLE adivinanzas DROP COLUMN IF EXISTS senas;
ALTER TABLE adivinanzas ADD COLUMN IF NOT EXISTS fijo smallint;

COMMIT;
