-- Run after 0001. Repeatable, preserves existing bets; no API credentials required.
BEGIN;
ALTER TABLE public.bet_history ADD COLUMN IF NOT EXISTS capture jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.bet_history DROP CONSTRAINT IF EXISTS bet_history_status_check;
ALTER TABLE public.bet_history ADD CONSTRAINT bet_history_status_check
  CHECK (status IN ('open', 'win', 'loss', 'void', 'half_win', 'half_loss'));
COMMIT;
