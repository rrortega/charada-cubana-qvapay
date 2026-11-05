-- Dreams are analysed and never stored: only their signals are kept (S1, S2).
--
-- A row in `suenos` is an anonymous envelope. It is what gives the signals of
-- one submission a shared identity, so two dreams can be compared without
-- keeping the text, and so a submission can be deleted as a unit. The text the
-- user wrote never reaches a column.
--
-- `user_id` is the account that submitted it, kept only to apply the account
-- requirement and to honour a deletion request; it is dropped if the account
-- goes away. Nothing in the read path returns it.

CREATE TABLE suenos (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        bigint REFERENCES users(id) ON DELETE SET NULL,
    modelo         text,
    prompt_version smallint,
    created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE suenos IS
  'One analysed dream: an envelope for its signals. The dream text is never stored.';

-- One row per signal of one dream. `numeros` are the candidate numbers the
-- analyser associated with it, so a later question ("what came up most this
-- week") does not need the text either.
CREATE TABLE sueno_senales (
    sueno_id  uuid NOT NULL REFERENCES suenos(id) ON DELETE CASCADE,
    senal     text NOT NULL,
    numeros   smallint[] NOT NULL DEFAULT '{}',
    peso      real NOT NULL DEFAULT 1,
    PRIMARY KEY (sueno_id, senal),
    CONSTRAINT senal_normalizada CHECK (senal = lower(senal) AND char_length(senal) BETWEEN 2 AND 40)
);

COMMENT ON TABLE sueno_senales IS
  'Signals of one dream. Equal signals across dreams are what makes a coincidence.';

-- The weekly counter reads by signal and the similarity read walks one dream's
-- signals, so the signal is the leading column.
CREATE INDEX sueno_senales_senal_idx ON sueno_senales (senal, sueno_id);

-- Both readers are windowed by the last seven days.
CREATE INDEX suenos_created_idx ON suenos (created_at DESC);
