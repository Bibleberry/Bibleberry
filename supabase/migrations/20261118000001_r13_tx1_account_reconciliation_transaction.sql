-- Bibleberry R13-TX1: Authenticated atomic account reconciliation transaction
-- Issue: #206 (Phase 05 / R13-TX1)
-- Builds on: 20261116000001_r13_3_account_schema_and_rls.sql (R13-3, PR #164)
-- Contracts: docs/architecture/r13-0-account-reconciliation-contract.md §§4-7,
--            docs/testing/r13-1-guest-to-account-sync-orchestration.md,
--            docs/architecture/r13-tx1-account-transaction-backend.md (this milestone)
--
-- Forward-only. Does NOT recreate or drop any R13-3 table, policy, or grant.
--
-- Adds:
--   1. `account_reconciler`: a dedicated NOLOGIN, NOBYPASSRLS role that owns the
--      SECURITY DEFINER transaction. It receives only column-scoped DML on the account
--      tables AND is itself confined by RLS policies `account_id = auth.uid()`, so even
--      the elevated function body cannot read or write another reader's rows.
--   2. Two narrowly justified schema additions:
--      - `account_participation_profiles.shelf_state_recorded`: distinguishes an explicit
--        (possibly empty) account Shelf from an absent Shelf without inventing a date.
--      - `account_reconciliation_receipts.unresolved_persisted_on_server`: the receipt
--        field `CommitAckReceipt.unresolvedPersistedOnServer` must be replayed exactly.
--      - `account_reconciliation_unresolved_items`: durable, owner-scoped evidence for
--        every unresolved item so `unresolvedPersistedOnServer: true` is truthful.
--   3. `account_private` schema of pure validation helpers (not exposed to clients).
--   4. `public.get_account_participation()` (SECURITY INVOKER, RLS-scoped read).
--   5. `public.reconcile_guest_participation(jsonb)` (SECURITY DEFINER compare-and-commit).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Dedicated least-privilege owner role for the transaction
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'account_reconciler') THEN
    CREATE ROLE account_reconciler
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  -- The migration runner must be able to assign function ownership to this role
  -- (PostgreSQL 16+ requires SET ROLE capability). Superusers already can.
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
     AND NOT pg_has_role(current_user, 'account_reconciler', 'MEMBER') THEN
    EXECUTE format('GRANT account_reconciler TO %I', current_user);
  END IF;
END
$$;

-- auth.uid() is the sole identity authority; the owner role must be able to call it,
-- both in the function body and inside its own RLS policies.
GRANT USAGE ON SCHEMA auth TO account_reconciler;
GRANT EXECUTE ON FUNCTION auth.uid() TO account_reconciler;
GRANT USAGE ON SCHEMA public TO account_reconciler;

-- ---------------------------------------------------------------------------
-- 1. Narrow schema additions
-- ---------------------------------------------------------------------------
ALTER TABLE public.account_participation_profiles
  ADD COLUMN shelf_state_recorded boolean NOT NULL DEFAULT false;

ALTER TABLE public.account_reconciliation_receipts
  ADD COLUMN unresolved_persisted_on_server boolean NOT NULL DEFAULT false;

CREATE TABLE public.account_reconciliation_unresolved_items (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  item_ordinal integer NOT NULL
    CONSTRAINT chk_unresolved_items_ordinal CHECK (item_ordinal BETWEEN 1 AND 100000),
  origin text NOT NULL
    CONSTRAINT chk_unresolved_items_origin CHECK (origin IN ('serverDetected', 'clientReported')),
  kind text NOT NULL
    CONSTRAINT chk_unresolved_items_kind CHECK (kind IN (
      'undecidableReadingPosition',
      'awardDateProvenanceConflict',
      'undecidableAwardDateProvenance',
      'completionDateProvenanceConflict',
      'undecidableCompletionDateProvenance',
      'inadmissibleDateClaim'
    )),
  subject_id text NOT NULL
    CONSTRAINT chk_unresolved_items_subject CHECK (char_length(subject_id) BETWEEN 5 AND 160),
  detail jsonb NOT NULL
    CONSTRAINT chk_unresolved_items_detail CHECK (
      jsonb_typeof(detail) = 'object'
      AND pg_column_size(detail) <= 4096
      AND NOT (detail ? 'passageText')
      AND NOT (detail ? 'manuscriptText')
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, idempotency_key, item_ordinal),
  CONSTRAINT fk_unresolved_items_receipt
    FOREIGN KEY (account_id, idempotency_key)
    REFERENCES public.account_reconciliation_receipts (account_id, idempotency_key)
    ON DELETE CASCADE
);

CREATE INDEX idx_account_unresolved_items_subject
  ON public.account_reconciliation_unresolved_items (account_id, kind, subject_id);

ALTER TABLE public.account_reconciliation_unresolved_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_reconciliation_unresolved_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.account_reconciliation_unresolved_items TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE public.account_reconciliation_unresolved_items TO service_role;
  END IF;
END
$$;

CREATE POLICY "account_reconciliation_unresolved_items_select_own"
  ON public.account_reconciliation_unresolved_items
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Column-scoped privileges for the transaction owner
--    (no TRUNCATE; no DELETE except in-progress rows superseded by completion;
--     immutable identity/date columns are never UPDATE-able)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.account_participation_profiles,
  public.account_completed_challenges,
  public.account_in_progress_challenges,
  public.account_saved_challenges,
  public.account_saved_scriptures,
  public.account_earned_awards,
  public.account_shelf_months,
  public.account_reconciliation_receipts,
  public.account_reconciliation_unresolved_items
FROM account_reconciler;

GRANT SELECT, INSERT ON TABLE public.account_participation_profiles TO account_reconciler;
GRANT UPDATE (
  revision, last_opened_challenge_id, last_opened_on, resume_dismissed_on,
  active_focus_month, shelf_updated_on, shelf_state_recorded, updated_at
) ON TABLE public.account_participation_profiles TO account_reconciler;

-- Completions are permanent: insert-only for the transaction.
GRANT SELECT, INSERT ON TABLE public.account_completed_challenges TO account_reconciler;

GRANT SELECT, INSERT, DELETE ON TABLE public.account_in_progress_challenges TO account_reconciler;
GRANT UPDATE (updated_on, unresolved_conflict, updated_at)
  ON TABLE public.account_in_progress_challenges TO account_reconciler;

GRANT SELECT, INSERT ON TABLE public.account_saved_challenges TO account_reconciler;
GRANT UPDATE (saved_on) ON TABLE public.account_saved_challenges TO account_reconciler;

GRANT SELECT, INSERT ON TABLE public.account_saved_scriptures TO account_reconciler;
GRANT UPDATE (reference, translation, saved_on, source_challenge_id)
  ON TABLE public.account_saved_scriptures TO account_reconciler;

-- Awards are permanent; earned_on / provenance / identity are immutable.
GRANT SELECT, INSERT ON TABLE public.account_earned_awards TO account_reconciler;
GRANT UPDATE (hub_announcement_acked, card_viewed, card_document_id, earned_card_snapshot, updated_at)
  ON TABLE public.account_earned_awards TO account_reconciler;

-- Guest Shelf is only ever written into an account that has no Shelf state.
GRANT SELECT, INSERT ON TABLE public.account_shelf_months TO account_reconciler;

-- Receipts and unresolved evidence are immutable once written.
GRANT SELECT, INSERT ON TABLE public.account_reconciliation_receipts TO account_reconciler;
GRANT SELECT, INSERT ON TABLE public.account_reconciliation_unresolved_items TO account_reconciler;

-- RLS confinement of the elevated role itself: every row it touches must belong to auth.uid().
CREATE POLICY "account_participation_profiles_reconciler_own"
  ON public.account_participation_profiles FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_completed_challenges_reconciler_own"
  ON public.account_completed_challenges FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_in_progress_challenges_reconciler_own"
  ON public.account_in_progress_challenges FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_saved_challenges_reconciler_own"
  ON public.account_saved_challenges FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_saved_scriptures_reconciler_own"
  ON public.account_saved_scriptures FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_earned_awards_reconciler_own"
  ON public.account_earned_awards FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_shelf_months_reconciler_own"
  ON public.account_shelf_months FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_reconciliation_receipts_reconciler_own"
  ON public.account_reconciliation_receipts FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());
CREATE POLICY "account_reconciliation_unresolved_items_reconciler_own"
  ON public.account_reconciliation_unresolved_items FOR ALL TO account_reconciler
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Private pure validation helpers (never exposed to anon/authenticated)
-- ---------------------------------------------------------------------------
CREATE SCHEMA account_private;
REVOKE ALL ON SCHEMA account_private FROM PUBLIC;
GRANT USAGE ON SCHEMA account_private TO account_reconciler;
ALTER DEFAULT PRIVILEGES IN SCHEMA account_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Raises the single typed validation error that the transaction maps to `rejected`.
CREATE FUNCTION account_private.reject(p_code text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'BBR01', MESSAGE = p_code;
END
$$;

-- Mirrors src/participation/identity.ts parseStoredChallengeId(raw, 'cms').
CREATE FUNCTION account_private.is_canonical_challenge_id(p_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_id IS NOT NULL
    AND p_id ~ '^cms:[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    AND lower(substring(p_id FROM 5)) NOT IN (
      'fixture-challenge-document', 'weekly-rhythm-pilot-2026', 'interactive-challenge-lab',
      'nov-1', 'nov-2', 'nov-3', 'nov-5'
    )
    AND NOT (
      lower(substring(p_id FROM 5)) LIKE 'drafts.%'
      OR lower(substring(p_id FROM 5)) LIKE 'fixture-%'
      OR lower(substring(p_id FROM 5)) LIKE 'pilot-%'
      OR lower(substring(p_id FROM 5)) LIKE 'weekly-pilot-%'
      OR lower(substring(p_id FROM 5)) LIKE 'sanity-live%'
      OR lower(substring(p_id FROM 5)) LIKE 'sanity-fixture%'
    );
$$;

-- Mirrors identity.ts parseDiscoverySlug.
CREATE FUNCTION account_private.is_valid_discovery_slug(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_slug IS NOT NULL
    AND char_length(p_slug) BETWEEN 1 AND 128
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND p_slug NOT IN ('interactive-challenge-lab', 'nov-1', 'nov-2', 'nov-3', 'nov-5')
    AND NOT (
      p_slug LIKE 'fixture-%' OR p_slug LIKE 'pilot-%' OR p_slug LIKE 'lab-%'
      OR p_slug LIKE 'prototype-%' OR p_slug LIKE 'weekly-pilot-%'
      OR p_slug LIKE 'sanity-lab%' OR p_slug LIKE 'sanity-live%' OR p_slug LIKE 'sanity-fixture%'
    );
$$;

-- Mirrors identity.ts parseMonthlyAwardIdParts. Returns NULL when invalid.
CREATE FUNCTION account_private.parse_award_id(p_award_id text)
RETURNS TABLE (publication_year_month text, slug text, kind text, discovery_id text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT m[1], m[2],
         CASE WHEN m[2] = 'full-month' THEN 'fullMonth' ELSE 'thematic' END,
         'discovery:' || m[1] || ':' || m[2]
    FROM (SELECT regexp_match(
            p_award_id,
            '^card:monthly:([0-9]{4}-(?:0[1-9]|1[0-2])):([a-z0-9]+(?:-[a-z0-9]+)*)$'
          ) AS m) s
   WHERE m IS NOT NULL
     AND account_private.is_valid_discovery_slug(m[2]);
$$;

-- Mirrors identity.ts parseCardDocumentId.
CREATE FUNCTION account_private.is_valid_card_document_id(p_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_id IS NOT NULL
    AND p_id ~ '^card-[a-z0-9]+(-[a-z0-9]+)*$'
    AND account_private.is_valid_discovery_slug(substring(p_id FROM 6));
$$;

-- Strict `YYYY-MM-DD` real calendar date from a JSON string; NULL when invalid.
CREATE FUNCTION account_private.parse_calendar_date(p_value jsonb)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text text;
  v_date date;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'string' THEN
    RETURN NULL;
  END IF;
  v_text := p_value #>> '{}';
  IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_date := to_date(v_text, 'YYYY-MM-DD');
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF to_char(v_date, 'YYYY-MM-DD') <> v_text THEN
    RETURN NULL;
  END IF;
  RETURN v_date;
END
$$;

-- JS String.prototype.trim analogue for the whitespace PostgreSQL recognises.
CREATE FUNCTION account_private.trim_ws(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(p_text, '^\s+|\s+$', '', 'g');
$$;

-- Mirrors identity.ts normalizeScriptureDisplayReference.
CREATE FUNCTION account_private.normalize_scripture_display_reference(p_reference text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(account_private.trim_ws(normalize(p_reference, NFC)), '\s+', ' ', 'g');
$$;

-- Mirrors identity.ts normalizeScriptureTranslation.
CREATE FUNCTION account_private.normalize_scripture_translation(p_translation text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_translation IS NULL THEN NULL
    WHEN n = '' OR lower(n) = 'not configured' THEN NULL
    ELSE n
  END
  FROM (SELECT regexp_replace(account_private.trim_ws(normalize(p_translation, NFC)), '\s+', ' ', 'g') AS n) s;
$$;

-- Mirrors identity.ts createSavedScriptureKey.
CREATE FUNCTION account_private.saved_scripture_key(p_reference text, p_translation text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN ref_key = '' THEN NULL
              ELSE ref_key || '|' || coalesce(lower(account_private.normalize_scripture_translation(p_translation)), '')
         END
    FROM (
      SELECT lower(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    account_private.normalize_scripture_display_reference(p_reference),
                    '[–—−]', '-', 'g'),
                  '\s*:\s*', ':', 'g'),
                '\s*-\s*', '-', 'g'),
              '\s*,\s*', ', ', 'g'),
            '\s*;\s*', '; ', 'g'),
          '\s+', ' ', 'g')
      ) AS ref_key
    ) s;
$$;

-- Required trimmed non-empty string from a JSON value; NULL otherwise.
CREATE FUNCTION account_private.nonempty_trimmed(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR jsonb_typeof(p_value) <> 'string' THEN NULL
    WHEN account_private.trim_ws(p_value #>> '{}') = '' THEN NULL
    ELSE account_private.trim_ws(p_value #>> '{}')
  END;
$$;

-- Optional string array: deduplicated case-insensitively (first wins), trimmed.
-- Returns 'null'::jsonb sentinel when the input is invalid, SQL NULL when absent/empty.
CREATE FUNCTION account_private.normalize_optional_string_array(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_item jsonb;
  v_text text;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 64 THEN
    RETURN 'null'::jsonb;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
    v_text := account_private.nonempty_trimmed(v_item);
    IF v_text IS NULL OR char_length(v_text) > 128 THEN
      RETURN 'null'::jsonb;
    END IF;
    IF NOT (lower(v_text) = ANY (v_seen)) THEN
      v_seen := v_seen || lower(v_text);
      v_result := v_result || to_jsonb(v_text);
    END IF;
  END LOOP;
  IF jsonb_array_length(v_result) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN v_result;
END
$$;

-- Mirrors src/participation/awards.ts validateEarnedCardSnapshot: rebuilds an allowlisted
-- snapshot (stripping every unknown / manuscript / Sanity-internal field) or returns NULL.
CREATE FUNCTION account_private.normalize_card_snapshot(p_card jsonb, p_year_month text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_doc text;
  v_title text;
  v_image text;
  v_asset text;
  v_alt text;
  v_transcription text;
  v_book text;
  v_reference text;
  v_translation text;
  v_attribution text;
  v_rights text;
  v_themes jsonb;
  v_keywords jsonb;
  v_result jsonb;
BEGIN
  IF p_card IS NULL OR jsonb_typeof(p_card) <> 'object' THEN
    RETURN NULL;
  END IF;

  v_doc := CASE WHEN jsonb_typeof(p_card -> 'cardDocumentId') = 'string'
                THEN p_card ->> 'cardDocumentId' END;
  IF NOT coalesce(account_private.is_valid_card_document_id(v_doc), false) THEN
    RETURN NULL;
  END IF;
  v_title := account_private.nonempty_trimmed(p_card -> 'title');
  IF v_title IS NULL OR jsonb_typeof(p_card -> 'publicationYearMonth') <> 'string'
     OR p_card ->> 'publicationYearMonth' <> p_year_month THEN
    RETURN NULL;
  END IF;

  v_image := account_private.nonempty_trimmed(p_card -> 'imageUrl');
  IF v_image IS NULL
     OR v_image !~ '^https://cdn\.sanity\.io/images/[a-z0-9]+/[a-z0-9_-]+/[a-zA-Z0-9._-]+$' THEN
    RETURN NULL;
  END IF;
  v_asset := account_private.nonempty_trimmed(p_card -> 'assetRevision');
  IF v_asset IS NULL OR v_asset !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$' THEN
    RETURN NULL;
  END IF;

  v_alt := account_private.nonempty_trimmed(p_card -> 'illustrationAlt');
  v_transcription := account_private.nonempty_trimmed(p_card -> 'accessibleTranscription');
  IF v_alt IS NULL OR v_transcription IS NULL OR lower(v_alt) = lower(v_transcription) THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_card -> 'scripture') IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;
  v_book := account_private.nonempty_trimmed(p_card -> 'scripture' -> 'book');
  v_reference := account_private.nonempty_trimmed(p_card -> 'scripture' -> 'reference');
  v_translation := account_private.nonempty_trimmed(p_card -> 'scripture' -> 'translation');
  IF v_book IS NULL OR v_reference IS NULL OR v_translation IS NULL THEN
    RETURN NULL;
  END IF;

  v_attribution := account_private.nonempty_trimmed(p_card -> 'attribution');
  v_rights := account_private.nonempty_trimmed(p_card -> 'rightsStatus');
  IF v_attribution IS NULL OR v_rights IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_card -> 'shareEligible') IS DISTINCT FROM 'boolean' THEN
    RETURN NULL;
  END IF;

  v_themes := account_private.normalize_optional_string_array(p_card -> 'theologicalThemes');
  v_keywords := account_private.normalize_optional_string_array(p_card -> 'keywords');
  IF v_themes = 'null'::jsonb OR v_keywords = 'null'::jsonb THEN
    RETURN NULL;
  END IF;

  v_result := jsonb_build_object(
    'cardDocumentId', v_doc,
    'title', v_title,
    'publicationYearMonth', p_year_month,
    'imageUrl', v_image,
    'assetRevision', v_asset,
    'illustrationAlt', v_alt,
    'accessibleTranscription', v_transcription,
    'scripture', jsonb_build_object('book', v_book, 'reference', v_reference, 'translation', v_translation),
    'attribution', v_attribution,
    'rightsStatus', v_rights,
    'shareEligible', p_card -> 'shareEligible'
  );
  IF v_themes IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('theologicalThemes', v_themes);
  END IF;
  IF v_keywords IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('keywords', v_keywords);
  END IF;
  RETURN v_result;
END
$$;

-- Validates an optional opaque `screenId` (JSON string or absent/null). Raises on invalid.
CREATE FUNCTION account_private.parse_screen_id(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_value) <> 'string'
     OR char_length(p_value #>> '{}') NOT BETWEEN 1 AND 128
     OR account_private.trim_ws(p_value #>> '{}') <> p_value #>> '{}' THEN
    PERFORM account_private.reject('invalidScreenId');
  END IF;
  RETURN p_value #>> '{}';
END
$$;

-- Builds a canonical `ChallengeResumeRecord` JSON value.
CREATE FUNCTION account_private.resume_record(p_screen_id text, p_updated_on date)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'screenId', p_screen_id,
    'updatedOn', to_char(p_updated_on, 'YYYY-MM-DD')
  ));
$$;

-- Validates a required date field bounded by the server ceiling (and optional floor). Raises.
CREATE FUNCTION account_private.require_date(
  p_value jsonb, p_ceiling date, p_floor date DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_date date := account_private.parse_calendar_date(p_value);
BEGIN
  IF v_date IS NULL THEN
    PERFORM account_private.reject('invalidCalendarDate');
  END IF;
  IF v_date > p_ceiling THEN
    PERFORM account_private.reject('dateAfterServerUtcPlus14Ceiling');
  END IF;
  IF p_floor IS NOT NULL AND v_date < p_floor THEN
    PERFORM account_private.reject('dateBeforeAvailabilityFloor');
  END IF;
  RETURN v_date;
END
$$;

-- Validates and rebuilds ONE client-reported UnresolvedReconciliationItem from an allowlist,
-- so arbitrary client JSON is never persisted. Raises on any malformed field.
CREATE FUNCTION account_private.normalize_client_unresolved_item(p_item jsonb, p_ceiling date)
RETURNS TABLE (kind text, subject_id text, detail jsonb)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_subject text;
  v_detail jsonb;
  v_pos jsonb;
  v_name text;
  v_dates jsonb := '[]'::jsonb;
  v_d jsonb;
  v_entity_kind text;
BEGIN
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' OR jsonb_typeof(p_item -> 'kind') <> 'string' THEN
    PERFORM account_private.reject('invalidUnresolvedItem');
  END IF;
  v_kind := p_item ->> 'kind';

  IF v_kind = 'undecidableReadingPosition' THEN
    v_subject := p_item ->> 'challengeId';
    IF NOT coalesce(account_private.is_canonical_challenge_id(v_subject), false)
       OR coalesce(p_item ->> 'reason', '') NOT IN ('missingAuthoritativeScreenOrder', 'unknownScreenIdInOrder') THEN
      PERFORM account_private.reject('invalidUnresolvedItem');
    END IF;
    v_detail := jsonb_build_object('challengeId', v_subject, 'reason', p_item ->> 'reason');
    FOREACH v_name IN ARRAY ARRAY['accountPosition', 'guestPosition', 'retainedPosition'] LOOP
      v_pos := p_item -> v_name;
      IF v_pos IS NULL OR jsonb_typeof(v_pos) <> 'object' THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
      v_detail := v_detail || jsonb_build_object(v_name, account_private.resume_record(
        account_private.parse_screen_id(v_pos -> 'screenId'),
        account_private.require_date(v_pos -> 'updatedOn', p_ceiling)
      ));
    END LOOP;

  ELSIF v_kind IN ('awardDateProvenanceConflict', 'completionDateProvenanceConflict') THEN
    IF v_kind = 'awardDateProvenanceConflict' THEN
      v_subject := p_item ->> 'awardId';
      IF NOT EXISTS (SELECT 1 FROM account_private.parse_award_id(v_subject)) THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
    ELSE
      v_subject := p_item ->> 'challengeId';
      IF NOT coalesce(account_private.is_canonical_challenge_id(v_subject), false) THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
    END IF;
    IF coalesce(p_item ->> 'reason', '') <> 'unverifiedClientDatePrecedesServerVerified' THEN
      PERFORM account_private.reject('invalidUnresolvedItem');
    END IF;
    v_detail := jsonb_build_object(
      CASE WHEN v_kind = 'awardDateProvenanceConflict' THEN 'awardId' ELSE 'challengeId' END, v_subject,
      'serverVerifiedDate', to_char(account_private.require_date(p_item -> 'serverVerifiedDate', p_ceiling), 'YYYY-MM-DD'),
      'clientClaimedDate', to_char(account_private.require_date(p_item -> 'clientClaimedDate', p_ceiling), 'YYYY-MM-DD'),
      'retainedDate', to_char(account_private.require_date(p_item -> 'retainedDate', p_ceiling), 'YYYY-MM-DD'),
      'reason', 'unverifiedClientDatePrecedesServerVerified'
    );

  ELSIF v_kind IN ('undecidableAwardDateProvenance', 'undecidableCompletionDateProvenance') THEN
    IF v_kind = 'undecidableAwardDateProvenance' THEN
      v_subject := p_item ->> 'awardId';
      IF NOT EXISTS (SELECT 1 FROM account_private.parse_award_id(v_subject)) THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
    ELSE
      v_subject := p_item ->> 'challengeId';
      IF NOT coalesce(account_private.is_canonical_challenge_id(v_subject), false) THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
    END IF;
    IF coalesce(p_item ->> 'reason', '') <> 'disagreeingUnverifiedClientDates'
       OR jsonb_typeof(p_item -> 'candidateDates') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_item -> 'candidateDates') NOT BETWEEN 1 AND 8 THEN
      PERFORM account_private.reject('invalidUnresolvedItem');
    END IF;
    FOR v_d IN SELECT value FROM jsonb_array_elements(p_item -> 'candidateDates') LOOP
      v_dates := v_dates || to_jsonb(to_char(account_private.require_date(v_d, p_ceiling), 'YYYY-MM-DD'));
    END LOOP;
    v_detail := jsonb_build_object(
      CASE WHEN v_kind = 'undecidableAwardDateProvenance' THEN 'awardId' ELSE 'challengeId' END, v_subject,
      'candidateDates', v_dates,
      'retainedDate', to_char(account_private.require_date(p_item -> 'retainedDate', p_ceiling), 'YYYY-MM-DD'),
      'reason', 'disagreeingUnverifiedClientDates'
    );

  ELSIF v_kind = 'inadmissibleDateClaim' THEN
    v_entity_kind := p_item ->> 'entityKind';
    v_subject := p_item ->> 'entityId';
    IF v_entity_kind = 'challengeCompletion' THEN
      IF NOT coalesce(account_private.is_canonical_challenge_id(v_subject), false) THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
    ELSIF v_entity_kind = 'earnedAward' THEN
      IF NOT EXISTS (SELECT 1 FROM account_private.parse_award_id(v_subject)) THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
    ELSE
      PERFORM account_private.reject('invalidUnresolvedItem');
    END IF;
    IF coalesce(p_item ->> 'source', '') NOT IN ('account', 'guest')
       OR coalesce(p_item ->> 'reason', '') NOT IN ('beforeAvailabilityFloor', 'afterServerUtcPlus14Ceiling')
       OR account_private.parse_calendar_date(p_item -> 'claimedDate') IS NULL THEN
      PERFORM account_private.reject('invalidUnresolvedItem');
    END IF;
    -- The claimed date is, by definition, inadmissible; it is recorded only as evidence.
    v_detail := jsonb_build_object(
      'entityKind', v_entity_kind,
      'entityId', v_subject,
      'source', p_item ->> 'source',
      'claimedDate', p_item ->> 'claimedDate',
      'reason', p_item ->> 'reason'
    );
    IF p_item ? 'minAllowedDate' THEN
      v_detail := v_detail || jsonb_build_object('minAllowedDate',
        to_char(account_private.require_date(p_item -> 'minAllowedDate', p_ceiling), 'YYYY-MM-DD'));
    END IF;
    IF p_item ? 'maxAllowedDate' THEN
      IF account_private.parse_calendar_date(p_item -> 'maxAllowedDate') IS NULL THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
      v_detail := v_detail || jsonb_build_object('maxAllowedDate', p_item ->> 'maxAllowedDate');
    END IF;

  ELSE
    PERFORM account_private.reject('invalidUnresolvedItem');
  END IF;

  kind := v_kind;
  subject_id := v_subject;
  detail := v_detail;
  RETURN NEXT;
END
$$;

-- Typed result builders (pure). Shapes mirror src/accountSync/transport.ts results.
CREATE FUNCTION account_private.result_unauthorized(p_reason text, p_message text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('status', 'unauthorized', 'reason', p_reason, 'message', p_message);
$$;

CREATE FUNCTION account_private.result_rejected(p_reason text, p_detail text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'status', 'rejected',
    'reason', p_reason,
    'detail', p_detail,
    'message', 'Account commit rejected by server validation: ' || p_detail,
    'guestRetentionRequired', true
  );
$$;

CREATE FUNCTION account_private.receipt_json(
  p_receipt public.account_reconciliation_receipts, p_status text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'status', p_status,
    'accountId', p_receipt.account_id::text,
    'idempotencyKey', p_receipt.idempotency_key,
    'committedGuestFingerprint', p_receipt.guest_payload_digest,
    'durableRevision', p_receipt.committed_revision,
    'unresolvedCount', p_receipt.unresolved_count,
    'unresolvedPersistedOnServer', p_receipt.unresolved_persisted_on_server
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA account_private TO account_reconciler;

-- ---------------------------------------------------------------------------
-- 4. RLS-scoped account read (SECURITY INVOKER) -> R13-1 `getAccount`
-- ---------------------------------------------------------------------------
-- Returns {status:'found', revision, envelope} | {status:'notFound'} |
--         {status:'unauthorized', reason:'unauthenticated'}.
-- Runs with the caller's privileges, so RLS guarantees owner-only rows.
CREATE FUNCTION public.get_account_participation()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.account_participation_profiles%ROWTYPE;
  v_shelf_months jsonb;
  v_data jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized', 'reason', 'unauthenticated',
                              'message', 'No authenticated account session');
  END IF;

  SELECT * INTO v_profile
    FROM public.account_participation_profiles
   WHERE account_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'notFound');
  END IF;

  v_data := jsonb_build_object(
    'completedChallenges', coalesce((
      SELECT jsonb_object_agg(c.challenge_id, jsonb_strip_nulls(jsonb_build_object(
               'completedOn', to_char(c.completed_on, 'YYYY-MM-DD'),
               'dateProvenance', c.date_provenance,
               'clientClaimedOn', to_char(c.client_claimed_on, 'YYYY-MM-DD'))))
        FROM public.account_completed_challenges c
       WHERE c.account_id = v_uid), '{}'::jsonb),
    'inProgressChallenges', coalesce((
      SELECT jsonb_object_agg(p.challenge_id, jsonb_strip_nulls(jsonb_build_object(
               'screenId', p.screen_id,
               'updatedOn', to_char(p.updated_on, 'YYYY-MM-DD'),
               'unresolvedConflict', CASE WHEN p.unresolved_conflict THEN true END)))
        FROM public.account_in_progress_challenges p
       WHERE p.account_id = v_uid), '{}'::jsonb),
    'savedChallenges', coalesce((
      SELECT jsonb_object_agg(s.challenge_id,
               jsonb_build_object('savedOn', to_char(s.saved_on, 'YYYY-MM-DD')))
        FROM public.account_saved_challenges s
       WHERE s.account_id = v_uid), '{}'::jsonb),
    'savedScriptures', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'key', ss.scripture_key,
               'reference', ss.reference,
               'translation', ss.translation,
               'savedOn', to_char(ss.saved_on, 'YYYY-MM-DD'))
             || CASE WHEN ss.source_challenge_id IS NOT NULL
                     THEN jsonb_build_object('sourceChallengeId', ss.source_challenge_id)
                     ELSE '{}'::jsonb END
             ORDER BY ss.saved_on ASC, ss.scripture_key ASC)
        FROM public.account_saved_scriptures ss
       WHERE ss.account_id = v_uid), '[]'::jsonb),
    'lastOpenedChallenge', CASE
      WHEN v_profile.last_opened_challenge_id IS NULL THEN 'null'::jsonb
      ELSE jsonb_strip_nulls(jsonb_build_object(
        'challengeId', v_profile.last_opened_challenge_id,
        'openedOn', to_char(v_profile.last_opened_on, 'YYYY-MM-DD'),
        'resumeDismissedOn', to_char(v_profile.resume_dismissed_on, 'YYYY-MM-DD')))
    END,
    'earnedAwards', coalesce((
      SELECT jsonb_object_agg(a.award_id, jsonb_strip_nulls(jsonb_build_object(
               'awardId', a.award_id,
               'kind', a.kind,
               'publicationYearMonth', a.publication_year_month,
               'discoveryId', a.discovery_id,
               'earnedOn', to_char(a.earned_on, 'YYYY-MM-DD'),
               'dateProvenance', a.date_provenance,
               'clientClaimedOn', to_char(a.client_claimed_on, 'YYYY-MM-DD'),
               'hubAnnouncementAcked', a.hub_announcement_acked,
               'cardViewed', a.card_viewed,
               'cardDocumentId', a.card_document_id,
               'earnedCard', a.earned_card_snapshot)))
        FROM public.account_earned_awards a
       WHERE a.account_id = v_uid), '{}'::jsonb)
  );

  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'yearMonth', m.year_month,
           'admissionKind', m.admission_kind,
           'isProtected', m.is_protected,
           'admittedOn', to_char(m.admitted_on, 'YYYY-MM-DD'),
           'slotOrder', m.slot_order)) ORDER BY m.slot_order), '[]'::jsonb)
    INTO v_shelf_months
    FROM public.account_shelf_months m
   WHERE m.account_id = v_uid;

  -- An explicit (even empty) Shelf is authoritative account state (R13-1 isAccountEmpty).
  IF v_profile.shelf_state_recorded
     OR jsonb_array_length(v_shelf_months) > 0
     OR v_profile.active_focus_month IS NOT NULL
     OR v_profile.shelf_updated_on IS NOT NULL THEN
    v_data := v_data || jsonb_build_object('shelf',
      jsonb_build_object('months', v_shelf_months, 'activeFocusMonth', v_profile.active_focus_month)
      || CASE WHEN v_profile.shelf_updated_on IS NOT NULL
              THEN jsonb_build_object('updatedOn', to_char(v_profile.shelf_updated_on, 'YYYY-MM-DD'))
              ELSE '{}'::jsonb END);
  END IF;

  RETURN jsonb_build_object(
    'status', 'found',
    'revision', v_profile.revision,
    'envelope', jsonb_build_object(
      'schemaVersion', v_profile.schema_version,
      'accountId', v_uid::text,
      'namespace', v_profile.namespace,
      'revision', v_profile.revision,
      'data', v_data
    )
  );
END
$$;

REVOKE ALL ON FUNCTION public.get_account_participation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_participation() TO authenticated, account_reconciler;

-- ---------------------------------------------------------------------------
-- 5. Authenticated atomic compare-and-commit (SECURITY DEFINER, owned by account_reconciler)
-- ---------------------------------------------------------------------------
-- Input mirrors R13-1 `AccountTransportCommitPayload` (camelCase JSON):
--   { accountId?, expectedRevision, envelope, idempotencyKey, guestPayloadFingerprint,
--     mode, unresolvedItems? }
-- `accountId` fields are NEVER authority: the account is `auth.uid()`; a differing claim
-- is rejected as `unauthorized/accountMismatch`.
-- The submitted envelope is treated only as a set of untrusted CANDIDATE records that are
-- re-validated and re-merged under server rules against the locked server state.
CREATE FUNCTION public.reconcile_guest_participation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  c_max_payload_bytes constant integer := 1048576;
  c_max_records constant integer := 5000;
  c_max_unresolved constant integer := 500;

  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  -- Server-derived UTC+14 (Pacific/Kiritimati, fixed offset) calendar ceiling.
  v_ceiling date := ((clock_timestamp() AT TIME ZONE 'UTC') + interval '14 hours')::date;
  v_ceiling_month text;

  v_key text;
  v_fp text;
  v_mode text;
  v_expected numeric;
  v_envelope jsonb;
  v_data jsonb;

  v_receipt public.account_reconciliation_receipts%ROWTYPE;
  v_profile public.account_participation_profiles%ROWTYPE;
  v_profile_exists boolean;
  v_current_rev bigint;
  v_new_rev bigint;
  v_has_shelf boolean;
  v_account_empty boolean;
  v_snapshot jsonb;

  v_unresolved jsonb := '[]'::jsonb;
  v_server_unresolved integer := 0;
  v_shelf_conflicts jsonb := '[]'::jsonb;
  v_outcome text;

  -- profile fields carried to the single final UPDATE
  v_lo_id text;
  v_lo_on date;
  v_lo_dismissed date;
  v_shelf_written boolean := false;
  v_shelf_focus text;
  v_shelf_updated date;

  -- loop scratch
  v_k text;
  v_rec jsonb;
  v_item jsonb;
  v_date date;
  v_date2 date;
  v_text text;
  v_text2 text;
  v_bool boolean;
  v_bool2 boolean;
  v_snap jsonb;
  v_ym text;
  v_kind text;
  v_disc text;
  v_ord integer;
  v_ex_date date;
  v_ex_prov text;
  v_ex_screen text;
  v_ex_updated date;
  v_ex_hub boolean;
  v_ex_viewed boolean;
  v_ex_doc text;
  v_ex_snap jsonb;
  v_ex_src text;
  v_found boolean;
  v_norm record;
BEGIN
  -- 1. Identity is established ONLY by the verified session.
  IF v_uid IS NULL THEN
    RETURN account_private.result_unauthorized('unauthenticated', 'No authenticated account session');
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN account_private.result_rejected('invalidPayload', 'unsupportedTransactionIsolation');
  END IF;

  -- 2. Header validation (no writes, no locks).
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN account_private.result_rejected('invalidPayload', 'invalidPayloadShape');
  END IF;
  IF octet_length(p_payload::text) > c_max_payload_bytes THEN
    RETURN account_private.result_rejected('invalidPayload', 'payloadTooLarge');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) k
     WHERE k NOT IN ('accountId', 'expectedRevision', 'envelope', 'idempotencyKey',
                     'guestPayloadFingerprint', 'mode', 'unresolvedItems')
  ) THEN
    RETURN account_private.result_rejected('invalidPayload', 'unknownPayloadField');
  END IF;

  v_envelope := p_payload -> 'envelope';
  IF v_envelope IS NULL OR jsonb_typeof(v_envelope) <> 'object' THEN
    RETURN account_private.result_rejected('invalidPayload', 'invalidEnvelope');
  END IF;

  -- Forged / cross-account claims are rejected; they are never used as authority.
  IF (p_payload ? 'accountId'
      AND (jsonb_typeof(p_payload -> 'accountId') <> 'string'
           OR lower(p_payload ->> 'accountId') <> v_uid::text))
     OR (v_envelope ? 'accountId'
      AND (jsonb_typeof(v_envelope -> 'accountId') <> 'string'
           OR lower(v_envelope ->> 'accountId') <> v_uid::text)) THEN
    RETURN account_private.result_unauthorized('accountMismatch',
      'Payload account identity does not match the authenticated session');
  END IF;

  IF jsonb_typeof(p_payload -> 'idempotencyKey') IS DISTINCT FROM 'string'
     OR p_payload ->> 'idempotencyKey' !~ '^[A-Za-z0-9._:-]{1,128}$' THEN
    RETURN account_private.result_rejected('invalidPayload', 'invalidIdempotencyKey');
  END IF;
  v_key := p_payload ->> 'idempotencyKey';

  IF jsonb_typeof(p_payload -> 'guestPayloadFingerprint') IS DISTINCT FROM 'string'
     OR p_payload ->> 'guestPayloadFingerprint' !~ '^[0-9a-f]{64}$' THEN
    RETURN account_private.result_rejected('invalidPayload', 'invalidGuestPayloadFingerprint');
  END IF;
  v_fp := p_payload ->> 'guestPayloadFingerprint';

  IF jsonb_typeof(p_payload -> 'mode') IS DISTINCT FROM 'string'
     OR p_payload ->> 'mode' NOT IN ('newAccountTransfer', 'existingAccountMerge') THEN
    RETURN account_private.result_rejected('invalidPayload', 'invalidMode');
  END IF;
  v_mode := p_payload ->> 'mode';

  IF jsonb_typeof(p_payload -> 'expectedRevision') IS DISTINCT FROM 'number' THEN
    RETURN account_private.result_rejected('invalidPayload', 'missingExpectedRevision');
  END IF;
  v_expected := (p_payload ->> 'expectedRevision')::numeric;
  IF v_expected <> trunc(v_expected) OR v_expected < 0 OR v_expected > 9007199254740991 THEN
    RETURN account_private.result_rejected('invalidPayload', 'invalidExpectedRevision');
  END IF;

  -- 3. Serialize every reconciliation for this account (covers first-profile creation,
  --    where no row exists yet to lock). Transaction-scoped; released on commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtextextended('bibleberry:account_reconcile:' || v_uid::text, 0));

  -- 4. Idempotent replay is decided BEFORE the revision check, so a lost-ACK retry
  --    (which re-fetches and therefore carries a newer expectedRevision) still replays.
  SELECT * INTO v_receipt
    FROM public.account_reconciliation_receipts
   WHERE account_id = v_uid AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_receipt.guest_payload_digest = v_fp THEN
      v_snapshot := public.get_account_participation();
      RETURN jsonb_build_object(
        'status', 'alreadyCommittedDuplicate',
        'receipt', account_private.receipt_json(v_receipt, 'alreadyCommittedDuplicate'),
        'outcomeStatus', v_receipt.outcome_status,
        'committedEnvelope', v_snapshot -> 'envelope',
        'committedEnvelopeRevision', v_snapshot -> 'revision'
      );
    END IF;
    RETURN jsonb_build_object(
      'status', 'conflict',
      'reason', 'idempotencyPayloadMismatch',
      'message', 'Idempotency key was previously committed with a different guest payload fingerprint'
    );
  END IF;

  -- 5. Optimistic concurrency against the locked profile.
  SELECT * INTO v_profile
    FROM public.account_participation_profiles
   WHERE account_id = v_uid
     FOR UPDATE;
  v_profile_exists := FOUND;
  v_current_rev := CASE WHEN v_profile_exists THEN v_profile.revision ELSE 0 END;

  IF v_expected <> v_current_rev THEN
    v_snapshot := public.get_account_participation();
    RETURN jsonb_build_object(
      'status', 'conflict',
      'reason', 'revisionMismatch',
      'currentRevision', v_current_rev,
      'currentEnvelope', v_snapshot -> 'envelope',
      'message', 'Optimistic concurrency conflict: expected revision does not match the account'
    );
  END IF;

  -- 6. Envelope-level contract.
  IF jsonb_typeof(v_envelope -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR (v_envelope ->> 'schemaVersion')::numeric <> 1 THEN
    RETURN account_private.result_rejected('schemaVersionMismatch', 'unsupportedAccountSchemaVersion');
  END IF;
  IF jsonb_typeof(v_envelope -> 'namespace') IS DISTINCT FROM 'string'
     OR v_envelope ->> 'namespace' <> 'cms' THEN
    RETURN account_private.result_rejected('unsupportedNamespace', 'crossNamespaceConflict');
  END IF;
  v_data := v_envelope -> 'data';
  IF v_data IS NULL OR jsonb_typeof(v_data) <> 'object' THEN
    RETURN account_private.result_rejected('invalidPayload', 'invalidEnvelopeData');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_data) k
     WHERE k NOT IN ('completedChallenges', 'inProgressChallenges', 'savedChallenges',
                     'savedScriptures', 'lastOpenedChallenge', 'earnedAwards', 'shelf')
  ) THEN
    RETURN account_private.result_rejected('invalidPayload', 'unknownEnvelopeDataField');
  END IF;

  v_has_shelf := (v_profile_exists AND (
                   v_profile.shelf_state_recorded
                   OR v_profile.active_focus_month IS NOT NULL
                   OR v_profile.shelf_updated_on IS NOT NULL))
                 OR EXISTS (SELECT 1 FROM public.account_shelf_months WHERE account_id = v_uid);
  v_account_empty := NOT v_has_shelf
    AND NOT (v_profile_exists AND v_profile.last_opened_challenge_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.account_completed_challenges WHERE account_id = v_uid)
    AND NOT EXISTS (SELECT 1 FROM public.account_in_progress_challenges WHERE account_id = v_uid)
    AND NOT EXISTS (SELECT 1 FROM public.account_saved_challenges WHERE account_id = v_uid)
    AND NOT EXISTS (SELECT 1 FROM public.account_saved_scriptures WHERE account_id = v_uid)
    AND NOT EXISTS (SELECT 1 FROM public.account_earned_awards WHERE account_id = v_uid);
  IF v_mode = 'newAccountTransfer' AND NOT v_account_empty THEN
    RETURN account_private.result_rejected('invalidPayload', 'nonEmptyAccountForNewTransfer');
  END IF;

  v_ceiling_month := to_char(v_ceiling, 'YYYY-MM');

  -- 7. Atomic apply. Any validation failure or constraint violation rolls back EVERY write
  --    made below (sub-transaction), so no half-committed state can exist.
  BEGIN
    IF NOT v_profile_exists THEN
      INSERT INTO public.account_participation_profiles (account_id, revision, created_at, updated_at)
      VALUES (v_uid, 0, v_now, v_now);
      SELECT * INTO v_profile FROM public.account_participation_profiles WHERE account_id = v_uid;
    END IF;
    v_lo_id := v_profile.last_opened_challenge_id;
    v_lo_on := v_profile.last_opened_on;
    v_lo_dismissed := v_profile.resume_dismissed_on;

    -- 7a. Completions: union; existing dates are immutable; never minted serverVerified.
    IF v_data ? 'completedChallenges' THEN
      IF jsonb_typeof(v_data -> 'completedChallenges') <> 'object' THEN
        PERFORM account_private.reject('invalidRecordShape');
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(v_data -> 'completedChallenges')) > c_max_records THEN
        PERFORM account_private.reject('recordLimitExceeded');
      END IF;
      FOR v_k, v_rec IN SELECT key, value FROM jsonb_each(v_data -> 'completedChallenges') LOOP
        IF NOT account_private.is_canonical_challenge_id(v_k) THEN
          PERFORM account_private.reject('invalidChallengeId');
        END IF;
        IF jsonb_typeof(v_rec) <> 'object' THEN
          PERFORM account_private.reject('invalidRecordShape');
        END IF;
        v_date := account_private.require_date(v_rec -> 'completedOn', v_ceiling);
        IF v_rec ? 'dateProvenance' AND coalesce(v_rec ->> 'dateProvenance', '')
             NOT IN ('serverVerified', 'clientReported') THEN
          PERFORM account_private.reject('invalidDateProvenance');
        END IF;
        IF v_rec ? 'clientClaimedOn' AND jsonb_typeof(v_rec -> 'clientClaimedOn') <> 'null' THEN
          PERFORM account_private.require_date(v_rec -> 'clientClaimedOn', v_ceiling);
        END IF;

        SELECT completed_on, date_provenance INTO v_ex_date, v_ex_prov
          FROM public.account_completed_challenges
         WHERE account_id = v_uid AND challenge_id = v_k;
        IF FOUND THEN
          IF v_date <> v_ex_date THEN
            IF v_ex_prov = 'serverVerified' THEN
              IF v_date < v_ex_date THEN
                v_unresolved := v_unresolved || jsonb_build_object(
                  'origin', 'serverDetected', 'kind', 'completionDateProvenanceConflict', 'subjectId', v_k,
                  'detail', jsonb_build_object('challengeId', v_k,
                    'serverVerifiedDate', to_char(v_ex_date, 'YYYY-MM-DD'),
                    'clientClaimedDate', to_char(v_date, 'YYYY-MM-DD'),
                    'retainedDate', to_char(v_ex_date, 'YYYY-MM-DD'),
                    'reason', 'unverifiedClientDatePrecedesServerVerified'));
              END IF;
            ELSE
              v_unresolved := v_unresolved || jsonb_build_object(
                'origin', 'serverDetected', 'kind', 'undecidableCompletionDateProvenance', 'subjectId', v_k,
                'detail', jsonb_build_object('challengeId', v_k,
                  'candidateDates', jsonb_build_array(to_char(LEAST(v_ex_date, v_date), 'YYYY-MM-DD'),
                                                      to_char(GREATEST(v_ex_date, v_date), 'YYYY-MM-DD')),
                  'retainedDate', to_char(v_ex_date, 'YYYY-MM-DD'),
                  'reason', 'disagreeingUnverifiedClientDates'));
            END IF;
          END IF;
        ELSE
          INSERT INTO public.account_completed_challenges (
            account_id, challenge_id, completed_on, date_provenance, client_claimed_on,
            first_recorded_at, updated_at
          ) VALUES (v_uid, v_k, v_date, 'clientReported', v_date, v_now, v_now);
        END IF;
      END LOOP;
    END IF;

    -- Completion always wins over a resume position (including previously completed).
    DELETE FROM public.account_in_progress_challenges ip
     WHERE ip.account_id = v_uid
       AND EXISTS (SELECT 1 FROM public.account_completed_challenges c
                    WHERE c.account_id = ip.account_id AND c.challenge_id = ip.challenge_id);

    -- 7b. In-progress positions: no trusted screen order exists server-side, so two distinct
    --     screens are NEVER resolved; the account position is kept and the conflict persisted.
    IF v_data ? 'inProgressChallenges' THEN
      IF jsonb_typeof(v_data -> 'inProgressChallenges') <> 'object' THEN
        PERFORM account_private.reject('invalidRecordShape');
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(v_data -> 'inProgressChallenges')) > c_max_records THEN
        PERFORM account_private.reject('recordLimitExceeded');
      END IF;
      FOR v_k, v_rec IN SELECT key, value FROM jsonb_each(v_data -> 'inProgressChallenges') LOOP
        IF NOT account_private.is_canonical_challenge_id(v_k) THEN
          PERFORM account_private.reject('invalidChallengeId');
        END IF;
        IF jsonb_typeof(v_rec) <> 'object' THEN
          PERFORM account_private.reject('invalidRecordShape');
        END IF;
        v_text := account_private.parse_screen_id(v_rec -> 'screenId');
        v_date := account_private.require_date(v_rec -> 'updatedOn', v_ceiling);

        CONTINUE WHEN EXISTS (SELECT 1 FROM public.account_completed_challenges
                               WHERE account_id = v_uid AND challenge_id = v_k);

        SELECT screen_id, updated_on INTO v_ex_screen, v_ex_updated
          FROM public.account_in_progress_challenges
         WHERE account_id = v_uid AND challenge_id = v_k;
        IF FOUND THEN
          IF v_ex_screen IS NOT DISTINCT FROM v_text THEN
            IF v_date > v_ex_updated THEN
              UPDATE public.account_in_progress_challenges
                 SET updated_on = v_date, updated_at = v_now
               WHERE account_id = v_uid AND challenge_id = v_k;
            END IF;
          ELSE
            UPDATE public.account_in_progress_challenges
               SET unresolved_conflict = true, updated_at = v_now
             WHERE account_id = v_uid AND challenge_id = v_k;
            v_unresolved := v_unresolved || jsonb_build_object(
              'origin', 'serverDetected', 'kind', 'undecidableReadingPosition', 'subjectId', v_k,
              'detail', jsonb_build_object('challengeId', v_k,
                'accountPosition', account_private.resume_record(v_ex_screen, v_ex_updated),
                'guestPosition', account_private.resume_record(v_text, v_date),
                'retainedPosition', account_private.resume_record(v_ex_screen, v_ex_updated),
                'reason', 'missingAuthoritativeScreenOrder'));
          END IF;
        ELSE
          INSERT INTO public.account_in_progress_challenges (
            account_id, challenge_id, screen_id, updated_on, unresolved_conflict, updated_at
          ) VALUES (v_uid, v_k, v_text, v_date, false, v_now);
        END IF;
      END LOOP;
    END IF;

    -- 7c. Saved Challenges: union, earliest savedOn (R13-0 §4.3; no unsave via merge).
    IF v_data ? 'savedChallenges' THEN
      IF jsonb_typeof(v_data -> 'savedChallenges') <> 'object' THEN
        PERFORM account_private.reject('invalidRecordShape');
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(v_data -> 'savedChallenges')) > c_max_records THEN
        PERFORM account_private.reject('recordLimitExceeded');
      END IF;
      FOR v_k, v_rec IN SELECT key, value FROM jsonb_each(v_data -> 'savedChallenges') LOOP
        IF NOT account_private.is_canonical_challenge_id(v_k) THEN
          PERFORM account_private.reject('invalidChallengeId');
        END IF;
        IF jsonb_typeof(v_rec) <> 'object' THEN
          PERFORM account_private.reject('invalidRecordShape');
        END IF;
        v_date := account_private.require_date(v_rec -> 'savedOn', v_ceiling);
        INSERT INTO public.account_saved_challenges AS s (account_id, challenge_id, saved_on, created_at)
        VALUES (v_uid, v_k, v_date, v_now)
        ON CONFLICT (account_id, challenge_id) DO UPDATE
          SET saved_on = EXCLUDED.saved_on
          WHERE EXCLUDED.saved_on < s.saved_on;
      END LOOP;
    END IF;

    -- 7d. Saved Scripture: canonical keys recomputed server-side; no passage text stored.
    IF v_data ? 'savedScriptures' THEN
      IF jsonb_typeof(v_data -> 'savedScriptures') <> 'array' THEN
        PERFORM account_private.reject('invalidRecordShape');
      END IF;
      IF jsonb_array_length(v_data -> 'savedScriptures') > c_max_records THEN
        PERFORM account_private.reject('recordLimitExceeded');
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_data -> 'savedScriptures') e
                  WHERE jsonb_typeof(e.value) <> 'object') THEN
        PERFORM account_private.reject('invalidScriptureRecord');
      END IF;
      IF (SELECT count(*) <> count(DISTINCT e.value ->> 'key')
            FROM jsonb_array_elements(v_data -> 'savedScriptures') e) THEN
        PERFORM account_private.reject('duplicateScriptureKey');
      END IF;
      FOR v_rec IN SELECT value FROM jsonb_array_elements(v_data -> 'savedScriptures') LOOP
        IF jsonb_typeof(v_rec -> 'key') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_rec -> 'reference') IS DISTINCT FROM 'string'
           OR (v_rec ? 'translation' AND jsonb_typeof(v_rec -> 'translation') NOT IN ('string', 'null')) THEN
          PERFORM account_private.reject('invalidScriptureRecord');
        END IF;
        v_text := v_rec ->> 'reference';
        v_text2 := CASE WHEN jsonb_typeof(v_rec -> 'translation') = 'string' THEN v_rec ->> 'translation' END;
        IF account_private.normalize_scripture_display_reference(v_text) IS DISTINCT FROM v_text
           OR v_text = ''
           OR account_private.normalize_scripture_translation(v_text2) IS DISTINCT FROM v_text2 THEN
          PERFORM account_private.reject('nonCanonicalScriptureRecord');
        END IF;
        IF account_private.saved_scripture_key(v_text, v_text2) IS DISTINCT FROM v_rec ->> 'key' THEN
          PERFORM account_private.reject('nonCanonicalScriptureKey');
        END IF;
        v_date := account_private.require_date(v_rec -> 'savedOn', v_ceiling);
        v_k := NULL;
        IF v_rec ? 'sourceChallengeId' AND jsonb_typeof(v_rec -> 'sourceChallengeId') <> 'null' THEN
          v_k := v_rec ->> 'sourceChallengeId';
          IF jsonb_typeof(v_rec -> 'sourceChallengeId') <> 'string'
             OR NOT account_private.is_canonical_challenge_id(v_k) THEN
            PERFORM account_private.reject('invalidChallengeId');
          END IF;
        END IF;

        SELECT saved_on, source_challenge_id INTO v_ex_date, v_ex_src
          FROM public.account_saved_scriptures
         WHERE account_id = v_uid AND scripture_key = v_rec ->> 'key';
        IF FOUND THEN
          IF v_date < v_ex_date THEN
            UPDATE public.account_saved_scriptures
               SET saved_on = v_date, reference = v_text, translation = v_text2,
                   source_challenge_id = coalesce(v_k, v_ex_src)
             WHERE account_id = v_uid AND scripture_key = v_rec ->> 'key';
          ELSIF v_ex_src IS NULL AND v_k IS NOT NULL THEN
            UPDATE public.account_saved_scriptures
               SET source_challenge_id = v_k
             WHERE account_id = v_uid AND scripture_key = v_rec ->> 'key';
          END IF;
        ELSE
          INSERT INTO public.account_saved_scriptures (
            account_id, scripture_key, reference, translation, saved_on, source_challenge_id, created_at
          ) VALUES (v_uid, v_rec ->> 'key', v_text, v_text2, v_date, v_k, v_now);
        END IF;
      END LOOP;
    END IF;

    -- 7e. Earned awards: permanent union; monotonic independent flags; immutable earned_on.
    IF v_data ? 'earnedAwards' THEN
      IF jsonb_typeof(v_data -> 'earnedAwards') <> 'object' THEN
        PERFORM account_private.reject('invalidRecordShape');
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(v_data -> 'earnedAwards')) > c_max_records THEN
        PERFORM account_private.reject('recordLimitExceeded');
      END IF;
      FOR v_k, v_rec IN SELECT key, value FROM jsonb_each(v_data -> 'earnedAwards') LOOP
        SELECT pa.publication_year_month, pa.kind, pa.discovery_id INTO v_ym, v_kind, v_disc
          FROM account_private.parse_award_id(v_k) pa;
        IF NOT FOUND THEN
          PERFORM account_private.reject('invalidAwardIdentity');
        END IF;
        IF jsonb_typeof(v_rec) <> 'object'
           OR (v_rec ? 'awardId' AND v_rec -> 'awardId' IS DISTINCT FROM to_jsonb(v_k))
           OR (v_rec ? 'kind' AND v_rec -> 'kind' IS DISTINCT FROM to_jsonb(v_kind))
           OR (v_rec ? 'publicationYearMonth' AND v_rec -> 'publicationYearMonth' IS DISTINCT FROM to_jsonb(v_ym))
           OR (v_rec ? 'discoveryId' AND v_rec -> 'discoveryId' IS DISTINCT FROM to_jsonb(v_disc)) THEN
          PERFORM account_private.reject('invalidAwardIdentity');
        END IF;
        v_date := account_private.require_date(v_rec -> 'earnedOn', v_ceiling, (v_ym || '-01')::date);
        IF v_rec ? 'dateProvenance' AND coalesce(v_rec ->> 'dateProvenance', '')
             NOT IN ('serverVerified', 'clientReported') THEN
          PERFORM account_private.reject('invalidDateProvenance');
        END IF;
        IF v_rec ? 'clientClaimedOn' AND jsonb_typeof(v_rec -> 'clientClaimedOn') <> 'null' THEN
          PERFORM account_private.require_date(v_rec -> 'clientClaimedOn', v_ceiling);
        END IF;
        IF (v_rec ? 'hubAnnouncementAcked' AND jsonb_typeof(v_rec -> 'hubAnnouncementAcked') NOT IN ('boolean', 'null'))
           OR (v_rec ? 'cardViewed' AND jsonb_typeof(v_rec -> 'cardViewed') NOT IN ('boolean', 'null')) THEN
          PERFORM account_private.reject('invalidPresentationFlag');
        END IF;
        v_bool := coalesce((v_rec -> 'hubAnnouncementAcked')::text = 'true', false);
        v_bool2 := coalesce((v_rec -> 'cardViewed')::text = 'true', false);

        v_text := NULL;
        IF v_rec ? 'cardDocumentId' AND jsonb_typeof(v_rec -> 'cardDocumentId') <> 'null' THEN
          v_text := v_rec ->> 'cardDocumentId';
          IF jsonb_typeof(v_rec -> 'cardDocumentId') <> 'string'
             OR NOT account_private.is_valid_card_document_id(v_text) THEN
            PERFORM account_private.reject('invalidCardDocumentId');
          END IF;
        END IF;
        v_snap := NULL;
        IF v_rec ? 'earnedCard' AND jsonb_typeof(v_rec -> 'earnedCard') <> 'null' THEN
          v_snap := account_private.normalize_card_snapshot(v_rec -> 'earnedCard', v_ym);
          IF v_snap IS NULL THEN
            PERFORM account_private.reject('invalidCardSnapshot');
          END IF;
          IF v_text IS NOT NULL AND v_text <> v_snap ->> 'cardDocumentId' THEN
            PERFORM account_private.reject('invalidCardSnapshot');
          END IF;
          v_text := coalesce(v_text, v_snap ->> 'cardDocumentId');
        END IF;

        SELECT earned_on, date_provenance, hub_announcement_acked, card_viewed,
               card_document_id, earned_card_snapshot
          INTO v_ex_date, v_ex_prov, v_ex_hub, v_ex_viewed, v_ex_doc, v_ex_snap
          FROM public.account_earned_awards
         WHERE account_id = v_uid AND award_id = v_k;
        IF FOUND THEN
          IF v_date <> v_ex_date THEN
            IF v_ex_prov = 'serverVerified' THEN
              IF v_date < v_ex_date THEN
                v_unresolved := v_unresolved || jsonb_build_object(
                  'origin', 'serverDetected', 'kind', 'awardDateProvenanceConflict', 'subjectId', v_k,
                  'detail', jsonb_build_object('awardId', v_k,
                    'serverVerifiedDate', to_char(v_ex_date, 'YYYY-MM-DD'),
                    'clientClaimedDate', to_char(v_date, 'YYYY-MM-DD'),
                    'retainedDate', to_char(v_ex_date, 'YYYY-MM-DD'),
                    'reason', 'unverifiedClientDatePrecedesServerVerified'));
              END IF;
            ELSE
              v_unresolved := v_unresolved || jsonb_build_object(
                'origin', 'serverDetected', 'kind', 'undecidableAwardDateProvenance', 'subjectId', v_k,
                'detail', jsonb_build_object('awardId', v_k,
                  'candidateDates', jsonb_build_array(to_char(LEAST(v_ex_date, v_date), 'YYYY-MM-DD'),
                                                      to_char(GREATEST(v_ex_date, v_date), 'YYYY-MM-DD')),
                  'retainedDate', to_char(v_ex_date, 'YYYY-MM-DD'),
                  'reason', 'disagreeingUnverifiedClientDates'));
            END IF;
          END IF;
          -- Backfill a snapshot only when the account has none and the identities agree.
          IF v_ex_snap IS NOT NULL
             OR (v_snap IS NOT NULL AND v_ex_doc IS NOT NULL AND v_snap ->> 'cardDocumentId' <> v_ex_doc) THEN
            v_snap := v_ex_snap;
          END IF;
          IF (v_bool AND NOT v_ex_hub) OR (v_bool2 AND NOT v_ex_viewed)
             OR (v_ex_doc IS NULL AND v_text IS NOT NULL)
             OR v_snap IS DISTINCT FROM v_ex_snap THEN
            UPDATE public.account_earned_awards
               SET hub_announcement_acked = v_ex_hub OR v_bool,
                   card_viewed = v_ex_viewed OR v_bool2,
                   card_document_id = coalesce(v_ex_doc, v_text),
                   earned_card_snapshot = v_snap,
                   updated_at = v_now
             WHERE account_id = v_uid AND award_id = v_k;
          END IF;
        ELSE
          INSERT INTO public.account_earned_awards (
            account_id, award_id, kind, publication_year_month, discovery_id, earned_on,
            date_provenance, client_claimed_on, hub_announcement_acked, card_viewed,
            card_document_id, earned_card_snapshot, first_recorded_at, updated_at
          ) VALUES (
            v_uid, v_k, v_kind, v_ym, v_disc, v_date,
            'clientReported', v_date, v_bool, v_bool2,
            v_text, v_snap, v_now, v_now
          );
        END IF;
      END LOOP;
    END IF;

    -- 7f. Last-opened pointer (R13-0 §4.6). Not an accomplishment.
    IF v_data ? 'lastOpenedChallenge' AND jsonb_typeof(v_data -> 'lastOpenedChallenge') <> 'null' THEN
      v_rec := v_data -> 'lastOpenedChallenge';
      IF jsonb_typeof(v_rec) <> 'object' OR jsonb_typeof(v_rec -> 'challengeId') IS DISTINCT FROM 'string'
         OR NOT account_private.is_canonical_challenge_id(v_rec ->> 'challengeId') THEN
        PERFORM account_private.reject('invalidChallengeId');
      END IF;
      v_date := account_private.require_date(v_rec -> 'openedOn', v_ceiling);
      v_date2 := NULL;
      IF v_rec ? 'resumeDismissedOn' AND jsonb_typeof(v_rec -> 'resumeDismissedOn') <> 'null' THEN
        v_date2 := account_private.require_date(v_rec -> 'resumeDismissedOn', v_ceiling);
      END IF;
      IF v_lo_id IS NULL OR v_date > v_lo_on THEN
        v_lo_id := v_rec ->> 'challengeId';
        v_lo_on := v_date;
        v_lo_dismissed := v_date2;
      ELSIF v_date = v_lo_on AND v_lo_id = v_rec ->> 'challengeId' THEN
        v_lo_dismissed := GREATEST(v_lo_dismissed, v_date2);
      END IF;
    END IF;

    -- 7g. Shelf: account-first precedence. Displaced guest months are reported, and their
    --     completions / cards / saves above are untouched.
    IF v_data ? 'shelf' AND jsonb_typeof(v_data -> 'shelf') <> 'null' THEN
      v_rec := v_data -> 'shelf';
      IF jsonb_typeof(v_rec) <> 'object' OR jsonb_typeof(v_rec -> 'months') IS DISTINCT FROM 'array' THEN
        PERFORM account_private.reject('invalidShelf');
      END IF;
      IF jsonb_array_length(v_rec -> 'months') > 3 THEN
        PERFORM account_private.reject('shelfCapacityExceeded');
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_rec -> 'months') e
                  WHERE jsonb_typeof(e.value) <> 'object'
                     OR jsonb_typeof(e.value -> 'yearMonth') IS DISTINCT FROM 'string'
                     OR e.value ->> 'yearMonth' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
                     OR coalesce(e.value ->> 'admissionKind', '') NOT IN ('readerSelected', 'autoAdmitted')
                     OR (e.value ? 'isProtected' AND jsonb_typeof(e.value -> 'isProtected') <> 'boolean')) THEN
        PERFORM account_private.reject('invalidShelfEntry');
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_rec -> 'months') e
                  WHERE e.value ->> 'yearMonth' >= v_ceiling_month) THEN
        PERFORM account_private.reject('shelfMonthNotHistorical');
      END IF;
      IF (SELECT count(*) <> count(DISTINCT e.value ->> 'yearMonth')
            FROM jsonb_array_elements(v_rec -> 'months') e) THEN
        PERFORM account_private.reject('duplicateShelfMonth');
      END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_rec -> 'months') LOOP
        IF v_item ? 'admittedOn' AND jsonb_typeof(v_item -> 'admittedOn') <> 'null' THEN
          PERFORM account_private.require_date(v_item -> 'admittedOn', v_ceiling);
        END IF;
      END LOOP;
      v_shelf_focus := NULL;
      IF v_rec ? 'activeFocusMonth' AND jsonb_typeof(v_rec -> 'activeFocusMonth') <> 'null' THEN
        v_shelf_focus := v_rec ->> 'activeFocusMonth';
        IF jsonb_typeof(v_rec -> 'activeFocusMonth') <> 'string'
           OR v_shelf_focus !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
           OR v_shelf_focus > v_ceiling_month THEN
          PERFORM account_private.reject('invalidActiveFocusMonth');
        END IF;
      END IF;
      v_shelf_updated := NULL;
      IF v_rec ? 'updatedOn' AND jsonb_typeof(v_rec -> 'updatedOn') <> 'null' THEN
        v_shelf_updated := account_private.require_date(v_rec -> 'updatedOn', v_ceiling);
      END IF;

      IF v_has_shelf THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'yearMonth', e.value ->> 'yearMonth',
                 'guestAdmissionKind', e.value ->> 'admissionKind',
                 'disposition', 'preservedInLibraryNotOnShelf') ORDER BY e.ordinality), '[]'::jsonb)
          INTO v_shelf_conflicts
          FROM jsonb_array_elements(v_rec -> 'months') WITH ORDINALITY e
         WHERE NOT EXISTS (SELECT 1 FROM public.account_shelf_months m
                            WHERE m.account_id = v_uid AND m.year_month = e.value ->> 'yearMonth');
      ELSE
        INSERT INTO public.account_shelf_months (
          account_id, year_month, admission_kind, is_protected, admitted_on, slot_order,
          created_at, updated_at
        )
        SELECT v_uid,
               e.value ->> 'yearMonth',
               e.value ->> 'admissionKind',
               CASE WHEN jsonb_typeof(e.value -> 'isProtected') = 'boolean'
                    THEN (e.value -> 'isProtected')::text = 'true'
                    ELSE (e.value ->> 'admissionKind') = 'readerSelected' END,
               account_private.parse_calendar_date(e.value -> 'admittedOn'),
               e.ordinality::smallint,
               v_now, v_now
          FROM jsonb_array_elements(v_rec -> 'months') WITH ORDINALITY e;
        v_shelf_written := true;
      END IF;
    END IF;

    -- 7h. Client-reported unresolved items: validated, rebuilt from an allowlist, stored as
    --     quarantined evidence only (never applied as authority).
    v_server_unresolved := jsonb_array_length(v_unresolved);
    IF p_payload ? 'unresolvedItems' AND jsonb_typeof(p_payload -> 'unresolvedItems') <> 'null' THEN
      IF jsonb_typeof(p_payload -> 'unresolvedItems') <> 'array' THEN
        PERFORM account_private.reject('invalidUnresolvedItem');
      END IF;
      IF jsonb_array_length(p_payload -> 'unresolvedItems') > c_max_unresolved THEN
        PERFORM account_private.reject('recordLimitExceeded');
      END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload -> 'unresolvedItems') LOOP
        SELECT * INTO v_norm FROM account_private.normalize_client_unresolved_item(v_item, v_ceiling);
        v_unresolved := v_unresolved || jsonb_build_object(
          'origin', 'clientReported', 'kind', v_norm.kind, 'subjectId', v_norm.subject_id,
          'detail', v_norm.detail);
        IF v_norm.kind = 'undecidableReadingPosition' THEN
          UPDATE public.account_in_progress_challenges
             SET unresolved_conflict = true, updated_at = v_now
           WHERE account_id = v_uid AND challenge_id = v_norm.subject_id AND NOT unresolved_conflict;
        END IF;
      END LOOP;
    END IF;

    -- 7i. Revision, receipt and unresolved evidence in the same transaction.
    v_new_rev := v_current_rev + 1;
    v_outcome := CASE WHEN jsonb_array_length(v_unresolved) > 0 THEN 'reconciledWithUnresolved' ELSE 'committed' END;

    UPDATE public.account_participation_profiles
       SET revision = v_new_rev,
           last_opened_challenge_id = v_lo_id,
           last_opened_on = v_lo_on,
           resume_dismissed_on = v_lo_dismissed,
           active_focus_month = CASE WHEN v_shelf_written THEN v_shelf_focus ELSE active_focus_month END,
           shelf_updated_on = CASE WHEN v_shelf_written THEN v_shelf_updated ELSE shelf_updated_on END,
           shelf_state_recorded = shelf_state_recorded OR v_shelf_written,
           updated_at = v_now
     WHERE account_id = v_uid AND revision = v_current_rev;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'BBC01', MESSAGE = 'concurrentRevisionChange';
    END IF;

    INSERT INTO public.account_reconciliation_receipts (
      account_id, idempotency_key, mode, guest_payload_digest, committed_revision,
      outcome_status, unresolved_count, unresolved_persisted_on_server, created_at
    ) VALUES (
      v_uid, v_key, v_mode, v_fp, v_new_rev,
      v_outcome, jsonb_array_length(v_unresolved), true, v_now
    )
    RETURNING * INTO v_receipt;

    INSERT INTO public.account_reconciliation_unresolved_items (
      account_id, idempotency_key, item_ordinal, origin, kind, subject_id, detail, created_at
    )
    SELECT v_uid, v_key, u.ordinality::integer, u.value ->> 'origin', u.value ->> 'kind',
           u.value ->> 'subjectId', u.value -> 'detail', v_now
      FROM jsonb_array_elements(v_unresolved) WITH ORDINALITY u;

  EXCEPTION
    WHEN SQLSTATE 'BBR01' THEN
      RETURN account_private.result_rejected('invalidPayload', SQLERRM);
    WHEN SQLSTATE 'BBC01' OR unique_violation THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'revisionMismatch',
        'message', 'Optimistic concurrency conflict detected during commit');
    WHEN foreign_key_violation THEN
      RETURN account_private.result_unauthorized('forbidden', 'Authenticated account is not provisioned');
    WHEN check_violation OR not_null_violation OR string_data_right_truncation
      OR invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow
      OR invalid_datetime_format OR character_not_in_repertoire OR untranslatable_character THEN
      RETURN account_private.result_rejected('invalidPayload', 'constraintViolation');
  END;

  v_snapshot := public.get_account_participation();
  RETURN jsonb_build_object(
    'status', 'committed',
    'receipt', account_private.receipt_json(v_receipt, 'committed'),
    'outcomeStatus', v_outcome,
    'serverDetectedUnresolvedCount', v_server_unresolved,
    'shelfConflicts', v_shelf_conflicts,
    'committedEnvelope', v_snapshot -> 'envelope',
    'committedEnvelopeRevision', v_snapshot -> 'revision'
  );
END
$$;

ALTER FUNCTION public.reconcile_guest_participation(jsonb) OWNER TO account_reconciler;
REVOKE ALL ON FUNCTION public.reconcile_guest_participation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_guest_participation(jsonb) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- service_role carries no end-user identity; it must not drive the reader transaction.
    REVOKE ALL ON FUNCTION public.reconcile_guest_participation(jsonb) FROM service_role;
    REVOKE ALL ON FUNCTION public.get_account_participation() FROM service_role;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_private FROM service_role;
  END IF;
END
$$;

COMMENT ON FUNCTION public.reconcile_guest_participation(jsonb) IS
  'R13-TX1 authenticated atomic compare-and-commit. Account = auth.uid(); see docs/architecture/r13-tx1-account-transaction-backend.md';
COMMENT ON FUNCTION public.get_account_participation() IS
  'R13-TX1 RLS-scoped account snapshot (SECURITY INVOKER) for the R13-1 getAccount boundary.';

COMMIT;
