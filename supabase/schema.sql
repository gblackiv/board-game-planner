CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  UNIQUE (couple_id, date)
);

CREATE INDEX idx_availability_date ON availability(date);
CREATE INDEX idx_availability_couple_id ON availability(couple_id);
CREATE INDEX idx_couples_slug ON couples(slug);
