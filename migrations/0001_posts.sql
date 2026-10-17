CREATE TABLE IF NOT EXISTS posts (
  slug TEXT PRIMARY KEY NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);
