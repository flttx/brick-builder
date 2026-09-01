CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  thumbnail_url text NULL,
  brick_count integer NOT NULL DEFAULT 0 CHECK (brick_count >= 0),
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_documents (
  project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  snapshot_version integer NOT NULL,
  snapshot_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

