CREATE TABLE IF NOT EXISTS redirect_urls (
    id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug            VARCHAR(128) NOT NULL,
    label           TEXT NOT NULL,
    url             TEXT NOT NULL,
    delay_s         INTEGER NOT NULL DEFAULT 5,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_visited_at TIMESTAMPTZ,
    total_visits    INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_redirect_urls_slug
    ON redirect_urls(slug);

-- Partial index for active redirects only (better than the view approach)
CREATE INDEX IF NOT EXISTS idx_redirect_urls_active_slug
    ON redirect_urls(slug)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS redirect_visits (
    id           BIGSERIAL PRIMARY KEY,
    redirect_id  INTEGER REFERENCES redirect_urls(id) ON DELETE SET NULL,
    slug         VARCHAR(128) NOT NULL,
    visited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- req info
    ip_hash      VARCHAR(64),
    user_agent   TEXT,
    -- Location
    country      CHAR(2),
    city         VARCHAR(100),
    region       VARCHAR(100),
    -- UTM tracking
    utm_source   VARCHAR(100),
    utm_medium   VARCHAR(100),
    utm_campaign VARCHAR(100),
    -- Parsed info
    device_type  VARCHAR(20),
    browser      VARCHAR(50),
    os           VARCHAR(50)
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_visits_redirect_id ON redirect_visits(redirect_id);
CREATE INDEX IF NOT EXISTS idx_visits_visited_at  ON redirect_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_visits_slug        ON redirect_visits(slug);
