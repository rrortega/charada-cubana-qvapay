-- 0001_init.sql
-- Charada Cubana mini-app: core schema.
--
-- Design notes:
--   * draws stores raw official results, unmodified. Idempotency is keyed on
--     (game_key, draw_date, draw_type) because the upstream API returns rows in
--     a non-deterministic order and may replay the same draw.
--   * base digits and the Fireball are stored separately: the Fireball is an
--     additional prize number, not part of the winning pick.
--   * cargadores is derived data, always reproducible from draws.

BEGIN;

-- Canonical charada table: 100 entries, indexed 1..100.
-- Versioned so the meanings can be revised without rewriting history.
CREATE TABLE charada_significados (
    entry_number smallint PRIMARY KEY,
    significados text       NOT NULL CHECK (length(trim(significados)) > 0),
    version      integer    NOT NULL DEFAULT 1,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT charada_entry_range CHECK (entry_number BETWEEN 1 AND 100)
);

COMMENT ON TABLE charada_significados IS
  'Canonical 1..100 charada meanings. Source data, not derived.';

-- Games we follow. ids are stable upstream identifiers.
CREATE TABLE games (
    id           smallint PRIMARY KEY,
    game_key     text NOT NULL UNIQUE,
    name         text NOT NULL,
    winning_digits smallint NOT NULL CHECK (winning_digits BETWEEN 1 AND 5),
    has_fireball boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE games IS
  'Upstream lottery game registry. PICK 3 = 104, PICK 4 = 108.';

-- Raw draw results, one row per (game, date, draw type).
CREATE TABLE draws (
    id           bigserial PRIMARY KEY,
    game_id      smallint NOT NULL REFERENCES games(id),
    draw_date    date     NOT NULL,
    draw_type    text     NOT NULL CHECK (draw_type IN ('MIDDAY', 'EVENING')),
    base_digits  smallint[] NOT NULL,
    fireball     smallint,
    total_winners  integer,
    total_payouts  numeric(12, 2),
    raw_payload  jsonb    NOT NULL,
    fetched_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT draws_unique UNIQUE (game_id, draw_date, draw_type),
    CONSTRAINT draws_base_len CHECK (cardinality(base_digits) BETWEEN 1 AND 5),
    CONSTRAINT draws_fireball_range CHECK (fireball IS NULL OR fireball BETWEEN 0 AND 9)
);

COMMENT ON TABLE draws IS
  'Raw official results. raw_payload preserves the upstream record verbatim.';

CREATE INDEX draws_game_date_idx ON draws (game_id, draw_date DESC);
CREATE INDEX draws_date_idx ON draws (draw_date DESC);

-- Derived cargador per draw. Recomputable from draws; cached for query speed.
CREATE TABLE cargadores (
    id           bigserial PRIMARY KEY,
    draw_id      bigint NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    date         date   NOT NULL,
    draw_type    text   NOT NULL CHECK (draw_type IN ('MIDDAY', 'EVENING')),
    m1           smallint NOT NULL,
    m2           smallint NOT NULL,
    m3           smallint NOT NULL,
    senas        smallint[] NOT NULL,
    computed_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cargadores_unique UNIQUE (draw_id)
);

COMMENT ON TABLE cargadores IS
  'Derived cargador: m1 (Pick3) - m2 (Pick4 first two) - m3 (Pick4 last two), plus senas.';

CREATE INDEX cargadores_date_idx ON cargadores (date DESC, draw_type);

-- Our own users, keyed by the stable QvaPay user uuid.
CREATE TABLE users (
    id            bigserial PRIMARY KEY,
    qvapay_uuid   uuid NOT NULL UNIQUE,
    username      text,
    display_name  text,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
    id               bigserial PRIMARY KEY,
    user_id          bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status           text NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'refunded')),
    transaction_uuid uuid UNIQUE,
    amount           numeric(12, 2),
    started_at       timestamptz,
    expires_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscriptions IS
  'Premium access. transaction_uuid is the webhook idempotency key.';

CREATE INDEX subscriptions_user_idx ON subscriptions (user_id, status);

-- One adivinanza per day. Deterministic given its source cargador.
CREATE TABLE adivinanzas (
    date          date PRIMARY KEY,
    texto         text NOT NULL,
    source_cargador_id bigint REFERENCES cargadores(id),
    senas         smallint[] NOT NULL,
    generated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE adivinanzas IS
  'One per day, premium-only. Persisted so it is stable and auditable.';

-- Telegram linkage for premium notifications.
CREATE TABLE telegram_vinculos (
    id          bigserial PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id     bigint NOT NULL,
    link_token  text NOT NULL UNIQUE,
    linked_at   timestamptz,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT telegram_one_per_chat UNIQUE (chat_id)
);

-- Delivery log, for retries and idempotency.
CREATE TABLE entregas (
    id             bigserial PRIMARY KEY,
    user_id        bigint REFERENCES users(id) ON DELETE SET NULL,
    channel        text NOT NULL CHECK (channel IN ('telegram')),
    kind           text NOT NULL,
    idempotency_key text NOT NULL,
    status         text NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    attempts       integer NOT NULL DEFAULT 0,
    last_error     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    sent_at        timestamptz,
    CONSTRAINT entregas_idem UNIQUE (channel, idempotency_key)
);

COMMIT;
