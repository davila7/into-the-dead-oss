-- Neon Postgres schema for accounts and the leaderboard. Idempotent: safe to re-run.

-- One row per Clerk user. Name and avatar come from Clerk on the server, never from the client.
CREATE TABLE IF NOT EXISTS players (
  id              text PRIMARY KEY,            -- Clerk user id (user_...)
  display_name    text NOT NULL,
  image_url       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  total_runs      integer NOT NULL DEFAULT 0,
  total_kills     integer NOT NULL DEFAULT 0,
  total_headshots integer NOT NULL DEFAULT 0,
  total_distance  double precision NOT NULL DEFAULT 0,
  -- Best run, ranked by distance then kills.
  best_distance   double precision NOT NULL DEFAULT 0,
  best_kills      integer NOT NULL DEFAULT 0,
  best_headshots  integer NOT NULL DEFAULT 0,
  best_at         timestamptz
);

CREATE INDEX IF NOT EXISTS players_leaderboard_idx
  ON players (best_distance DESC, best_kills DESC)
  WHERE best_distance > 0;

-- Every signed-in run. `started_at` is stamped by the server so a run can't claim more time than it had.
CREATE TABLE IF NOT EXISTS runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   text NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  distance    double precision,
  kills       integer,
  headshots   integer
);

CREATE INDEX IF NOT EXISTS runs_player_idx ON runs (player_id, started_at DESC);
