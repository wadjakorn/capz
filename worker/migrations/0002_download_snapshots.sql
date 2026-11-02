-- Cumulative GitHub release download counts, one row per (UTC day, release, asset).
-- Written by the daily cron; /stats derives per-day downloads from consecutive rows.
CREATE TABLE download_snapshots (
  day TEXT NOT NULL,
  tag TEXT NOT NULL,
  asset TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, tag, asset)
);
