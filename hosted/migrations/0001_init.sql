-- Installation and API-key state for the hosted tier (D1). Records live in R2, not here.

-- One row per installation of the GitHub App, written by the installation.created webhook and
-- deleted, with its keys and records, by installation.deleted. `account` is the login the App is
-- installed on. `retention_days` is how long that installation's records are kept: 90 by default,
-- 0 to store nothing. `deleting` marks an uninstall whose record deletion has not finished; the
-- scheduled sweep finishes it.
CREATE TABLE installations (
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 0 AND 90),
  created_at TEXT NOT NULL,
  deleting INTEGER NOT NULL DEFAULT 0 CHECK (deleting IN (0, 1))
);

-- API keys, stored as the SHA-256 of the key; the key itself is shown once, by
-- hosted/scripts/issue-key.ts, and never stored.
CREATE TABLE api_keys (
  key_hash TEXT PRIMARY KEY CHECK (length(key_hash) = 64),
  installation_id INTEGER NOT NULL REFERENCES installations (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX api_keys_installation ON api_keys (installation_id);
