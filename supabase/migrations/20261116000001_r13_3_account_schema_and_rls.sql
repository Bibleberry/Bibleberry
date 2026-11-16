-- Bibleberry R13-3: Account Participation Schema, Isolation & RLS Foundation
-- Issue: #163 (Phase 05 / R13-3)
-- Contract: docs/architecture/r13-0-account-reconciliation-contract.md §3 & §5
--
-- Scope:
--   - Defines the 8 owner-scoped account participation tables under `public.*`
--     referencing `auth.users(id) ON DELETE CASCADE`.
--   - Enables Row-Level Security (RLS) on every table with least-privilege grants:
--     * `PUBLIC` / `anon`: zero access.
--     * `authenticated`: `SELECT` own rows (`account_id = auth.uid()`) only;
--       direct `INSERT`/`UPDATE`/`DELETE` is denied until the future
--       server-authoritative compare-and-commit RPC (R13-4+) is implemented.
--     * `service_role`: full privileges for future server-side transactional RPCs.
--   - Does NOT create live auth triggers, OAuth/OTP config, or compare-and-commit RPCs.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. account_participation_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_participation_profiles (
  account_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  namespace text NOT NULL DEFAULT 'cms'
    CONSTRAINT chk_profiles_namespace CHECK (namespace = 'cms'),
  schema_version integer NOT NULL DEFAULT 1
    CONSTRAINT chk_profiles_schema_version CHECK (schema_version = 1),
  revision bigint NOT NULL DEFAULT 0
    CONSTRAINT chk_profiles_revision_nonnegative CHECK (revision >= 0),
  last_opened_challenge_id text
    CONSTRAINT chk_profiles_last_opened_challenge_id CHECK (
      last_opened_challenge_id IS NULL
      OR (
        char_length(last_opened_challenge_id) BETWEEN 5 AND 160
        AND last_opened_challenge_id ~ '^cms:[A-Za-z0-9][A-Za-z0-9._:-]*$'
        AND last_opened_challenge_id !~ '^cms:drafts\.'
      )
    ),
  last_opened_on date,
  resume_dismissed_on date,
  active_focus_month text
    CONSTRAINT chk_profiles_active_focus_month CHECK (
      active_focus_month IS NULL
      OR active_focus_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    ),
  shelf_updated_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_profiles_last_opened_pair CHECK (
    (last_opened_challenge_id IS NULL AND last_opened_on IS NULL AND resume_dismissed_on IS NULL)
    OR (last_opened_challenge_id IS NOT NULL AND last_opened_on IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------------
-- 2. account_completed_challenges
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_completed_challenges (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL
    CONSTRAINT chk_completed_challenge_id CHECK (
      char_length(challenge_id) BETWEEN 5 AND 160
      AND challenge_id ~ '^cms:[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND challenge_id !~ '^cms:drafts\.'
    ),
  completed_on date NOT NULL,
  date_provenance text NOT NULL
    CONSTRAINT chk_completed_date_provenance CHECK (
      date_provenance IN ('serverVerified', 'clientReported')
    ),
  client_claimed_on date,
  first_recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, challenge_id)
);

CREATE INDEX idx_account_completed_challenges_completed_on
  ON public.account_completed_challenges (account_id, completed_on DESC);

-- ---------------------------------------------------------------------------
-- 3. account_in_progress_challenges
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_in_progress_challenges (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL
    CONSTRAINT chk_in_progress_challenge_id CHECK (
      char_length(challenge_id) BETWEEN 5 AND 160
      AND challenge_id ~ '^cms:[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND challenge_id !~ '^cms:drafts\.'
    ),
  screen_id text
    CONSTRAINT chk_in_progress_screen_id CHECK (
      screen_id IS NULL
      OR (
        char_length(screen_id) BETWEEN 1 AND 128
        AND btrim(screen_id) = screen_id
      )
    ),
  updated_on date NOT NULL,
  unresolved_conflict boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, challenge_id)
);

-- ---------------------------------------------------------------------------
-- 4. account_saved_challenges
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_saved_challenges (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL
    CONSTRAINT chk_saved_challenge_id CHECK (
      char_length(challenge_id) BETWEEN 5 AND 160
      AND challenge_id ~ '^cms:[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND challenge_id !~ '^cms:drafts\.'
    ),
  saved_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, challenge_id)
);

-- ---------------------------------------------------------------------------
-- 5. account_saved_scriptures
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_saved_scriptures (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scripture_key text NOT NULL
    CONSTRAINT chk_saved_scripture_key CHECK (
      char_length(scripture_key) BETWEEN 2 AND 256
      AND scripture_key ~ '^[^|]+\|[^|]*$'
    ),
  reference text NOT NULL
    CONSTRAINT chk_saved_scripture_reference CHECK (
      char_length(btrim(reference)) BETWEEN 1 AND 160
      AND btrim(reference) = reference
    ),
  translation text
    CONSTRAINT chk_saved_scripture_translation CHECK (
      translation IS NULL
      OR (
        char_length(btrim(translation)) BETWEEN 1 AND 64
        AND btrim(translation) = translation
      )
    ),
  saved_on date NOT NULL,
  source_challenge_id text
    CONSTRAINT chk_saved_scripture_source_challenge_id CHECK (
      source_challenge_id IS NULL
      OR (
        char_length(source_challenge_id) BETWEEN 5 AND 160
        AND source_challenge_id ~ '^cms:[A-Za-z0-9][A-Za-z0-9._:-]*$'
        AND source_challenge_id !~ '^cms:drafts\.'
      )
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, scripture_key)
);

CREATE INDEX idx_account_saved_scriptures_order
  ON public.account_saved_scriptures (account_id, saved_on ASC, scripture_key ASC);

-- ---------------------------------------------------------------------------
-- 6. account_earned_awards
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_earned_awards (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  award_id text NOT NULL
    CONSTRAINT chk_earned_awards_id_format CHECK (
      char_length(award_id) BETWEEN 18 AND 160
      AND award_id ~ '^card:monthly:[0-9]{4}-(0[1-9]|1[0-2]):[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  kind text NOT NULL
    CONSTRAINT chk_earned_awards_kind CHECK (kind IN ('thematic', 'fullMonth')),
  publication_year_month text NOT NULL
    CONSTRAINT chk_earned_awards_year_month CHECK (
      publication_year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    ),
  discovery_id text NOT NULL
    CONSTRAINT chk_earned_awards_discovery_id CHECK (
      char_length(discovery_id) BETWEEN 19 AND 160
      AND discovery_id ~ '^discovery:[0-9]{4}-(0[1-9]|1[0-2]):[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  earned_on date NOT NULL,
  date_provenance text NOT NULL
    CONSTRAINT chk_earned_awards_date_provenance CHECK (
      date_provenance IN ('serverVerified', 'clientReported')
    ),
  client_claimed_on date,
  hub_announcement_acked boolean NOT NULL DEFAULT false,
  card_viewed boolean NOT NULL DEFAULT false,
  card_document_id text
    CONSTRAINT chk_earned_awards_card_document_id CHECK (
      card_document_id IS NULL
      OR (
        char_length(btrim(card_document_id)) BETWEEN 1 AND 128
        AND btrim(card_document_id) = card_document_id
      )
    ),
  earned_card_snapshot jsonb
    CONSTRAINT chk_earned_awards_snapshot_object CHECK (
      earned_card_snapshot IS NULL
      OR (
        jsonb_typeof(earned_card_snapshot) = 'object'
        AND NOT (earned_card_snapshot ? 'passageText')
        AND NOT (earned_card_snapshot ? 'manuscriptText')
      )
    ),
  first_recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, award_id),
  CONSTRAINT chk_earned_awards_kind_matches_id CHECK (
    (kind = 'fullMonth' AND award_id = ('card:monthly:' || publication_year_month || ':full-month'))
    OR (
      kind = 'thematic'
      AND award_id LIKE ('card:monthly:' || publication_year_month || ':%')
      AND award_id <> ('card:monthly:' || publication_year_month || ':full-month')
    )
  ),
  CONSTRAINT chk_earned_awards_discovery_matches_id CHECK (
    discovery_id = ('discovery:' || substring(award_id FROM 14))
  )
);

CREATE INDEX idx_account_earned_awards_month
  ON public.account_earned_awards (account_id, publication_year_month ASC);

-- ---------------------------------------------------------------------------
-- 7. account_shelf_months (0-3 historical months per account)
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_shelf_months (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month text NOT NULL
    CONSTRAINT chk_shelf_year_month CHECK (
      year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    ),
  admission_kind text NOT NULL
    CONSTRAINT chk_shelf_admission_kind CHECK (
      admission_kind IN ('readerSelected', 'autoAdmitted')
    ),
  admitted_on date,
  slot_order smallint NOT NULL
    CONSTRAINT chk_shelf_slot_order CHECK (slot_order BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, year_month),
  CONSTRAINT uq_account_shelf_months_slot UNIQUE (account_id, slot_order)
);

-- ---------------------------------------------------------------------------
-- 8. account_reconciliation_receipts
-- ---------------------------------------------------------------------------
CREATE TABLE public.account_reconciliation_receipts (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL
    CONSTRAINT chk_receipts_idempotency_key CHECK (
      char_length(btrim(idempotency_key)) BETWEEN 1 AND 128
      AND btrim(idempotency_key) = idempotency_key
    ),
  mode text NOT NULL
    CONSTRAINT chk_receipts_mode CHECK (
      mode IN ('newAccountTransfer', 'existingAccountMerge')
    ),
  guest_payload_digest text NOT NULL
    CONSTRAINT chk_receipts_guest_payload_digest CHECK (
      char_length(btrim(guest_payload_digest)) BETWEEN 1 AND 128
      AND btrim(guest_payload_digest) = guest_payload_digest
    ),
  committed_revision bigint NOT NULL
    CONSTRAINT chk_receipts_committed_revision CHECK (committed_revision >= 1),
  outcome_status text NOT NULL
    CONSTRAINT chk_receipts_outcome_status CHECK (
      outcome_status IN ('committed', 'reconciledWithUnresolved')
    ),
  unresolved_count integer NOT NULL DEFAULT 0
    CONSTRAINT chk_receipts_unresolved_count CHECK (unresolved_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, idempotency_key)
);

CREATE INDEX idx_account_reconciliation_receipts_created_at
  ON public.account_reconciliation_receipts (account_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row-Level Security (RLS) & Least-Privilege Role Grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_participation_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_completed_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_in_progress_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_saved_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_saved_scriptures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_earned_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_shelf_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_reconciliation_receipts ENABLE ROW LEVEL SECURITY;

-- Revoke all default/public/client write privileges first.
REVOKE ALL ON TABLE
  public.account_participation_profiles,
  public.account_completed_challenges,
  public.account_in_progress_challenges,
  public.account_saved_challenges,
  public.account_saved_scriptures,
  public.account_earned_awards,
  public.account_shelf_months,
  public.account_reconciliation_receipts
FROM PUBLIC, anon, authenticated;

-- Authenticated clients may SELECT only their own rows (via RLS).
-- Direct INSERT/UPDATE/DELETE from `authenticated` or `anon` is intentionally
-- denied; future server-side compare-and-commit RPCs will execute under
-- privileged server authority (`service_role` / `SECURITY DEFINER`).
GRANT SELECT ON TABLE
  public.account_participation_profiles,
  public.account_completed_challenges,
  public.account_in_progress_challenges,
  public.account_saved_challenges,
  public.account_saved_scriptures,
  public.account_earned_awards,
  public.account_shelf_months,
  public.account_reconciliation_receipts
TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE
      public.account_participation_profiles,
      public.account_completed_challenges,
      public.account_in_progress_challenges,
      public.account_saved_challenges,
      public.account_saved_scriptures,
      public.account_earned_awards,
      public.account_shelf_months,
      public.account_reconciliation_receipts
    TO service_role;
  END IF;
END
$$;

-- Owner-scoped SELECT policies (server authority via auth.uid()).
CREATE POLICY "account_participation_profiles_select_own"
  ON public.account_participation_profiles
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "account_completed_challenges_select_own"
  ON public.account_completed_challenges
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "account_in_progress_challenges_select_own"
  ON public.account_in_progress_challenges
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "account_saved_challenges_select_own"
  ON public.account_saved_challenges
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "account_saved_scriptures_select_own"
  ON public.account_saved_scriptures
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "account_earned_awards_select_own"
  ON public.account_earned_awards
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "account_shelf_months_select_own"
  ON public.account_shelf_months
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "account_reconciliation_receipts_select_own"
  ON public.account_reconciliation_receipts
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

COMMIT;
