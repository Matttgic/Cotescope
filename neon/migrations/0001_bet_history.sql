CREATE TABLE IF NOT EXISTS public.bet_history (
  id text PRIMARY KEY,
  owner_hash text NOT NULL,
  opportunity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sport text NOT NULL,
  competition text NOT NULL DEFAULT '',
  event text NOT NULL,
  market text NOT NULL,
  selection text NOT NULL,
  bookmaker text NOT NULL,
  odds numeric(10,4) NOT NULL CHECK (odds > 1),
  stake numeric(12,2) NOT NULL DEFAULT 10 CHECK (stake >= 0),
  initial_ev_pct numeric(8,3) NOT NULL DEFAULT 0,
  opportunity_score integer NOT NULL DEFAULT 0 CHECK (opportunity_score BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','win','loss','void')),
  closing_odds numeric(10,4) NULL CHECK (closing_odds IS NULL OR closing_odds > 1),
  clv_pct numeric(8,3) NULL,
  UNIQUE(owner_hash, opportunity_id)
);

CREATE INDEX IF NOT EXISTS bet_history_owner_created_idx
  ON public.bet_history(owner_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS bet_history_owner_status_idx
  ON public.bet_history(owner_hash, status);
