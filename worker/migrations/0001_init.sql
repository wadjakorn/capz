-- One row per (UTC day, machine). id_hash = sha256(install uuid + ID_SALT).
CREATE TABLE pings (
  day TEXT NOT NULL,
  id_hash TEXT NOT NULL,
  version TEXT,
  target TEXT,
  arch TEXT,
  PRIMARY KEY (day, id_hash)
);

-- Update checks that carried no install id: counted, never identified.
CREATE TABLE anon_pings (
  day TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  arch TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, version, target, arch)
);

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'feature')),
  message TEXT NOT NULL,
  version TEXT,
  target TEXT,
  arch TEXT,
  ip_hash TEXT NOT NULL,
  issue_number INTEGER,
  issue_error TEXT
);

CREATE INDEX feedback_pending ON feedback (created_at) WHERE issue_number IS NULL;
CREATE INDEX feedback_ip_day ON feedback (ip_hash, created_at);
