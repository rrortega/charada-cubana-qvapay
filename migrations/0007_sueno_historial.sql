-- A dream now belongs to its author and can be read again (S9).
--
-- The earlier rule kept the text out of the database entirely. The user changed
-- that: the dream, its reading and its numbers are stored per account, so the
-- history is there when they come back, and nothing of it is visible to anyone
-- else. The reads in `src/sueno/store.js` filter by `user_id`, which is what
-- makes that true; the signals table is unchanged.

BEGIN;

ALTER TABLE suenos ADD COLUMN IF NOT EXISTS texto text;
ALTER TABLE suenos ADD COLUMN IF NOT EXISTS resumen text;
ALTER TABLE suenos ADD COLUMN IF NOT EXISTS numeros smallint[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN suenos.texto IS
  'The dream as its author wrote it. Only its own account can read it back.';
COMMENT ON COLUMN suenos.resumen IS
  'The reading the model wrote: what the dream evokes and its symbols.';
COMMENT ON COLUMN suenos.numeros IS
  'The coherent numbers chosen for this dream, in the order they were chosen.';

COMMENT ON TABLE suenos IS
  'One analysed dream: its text, its reading, its signals. Account-scoped.';

-- The history reads by author, newest first.
CREATE INDEX IF NOT EXISTS suenos_user_idx ON suenos (user_id, created_at DESC);

COMMIT;
