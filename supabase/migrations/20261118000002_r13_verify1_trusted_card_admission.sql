-- Bibleberry R13-VERIFY1: Trusted CMS-backed Scripture Card award verification and admission
-- Issue: #208 (Phase 05 / R13-VERIFY1)
-- Builds on: 20261118000001_r13_tx1_account_reconciliation_transaction.sql (R13-TX1, PR #207)
-- Handoff: docs/architecture/r13-verify1-trusted-card-admission.md
--
-- Forward-only. Does NOT modify any R13-3 / R13-TX1 object, grant, policy or function.
--
-- Trust model (summary; see handoff §2):
--   * A provisional claim (written only by the TX1 reconciler under auth.uid()) merely
--     NOMINATES an (account, award) pair for verification. Its client flags/date are evidence;
--     its client snapshot is never used.
--   * Eligibility is evaluated OUTSIDE PostgreSQL by the server-only verifier
--     (src/accountVerification/**) over a privately fetched, published monthlyPublication using
--     the accepted Gateway rules, against this account's DATABASE-OWNED completions.
--   * Admission happens only through `account_issuance.*`, owned by the dedicated NOLOGIN
--     `account_award_issuer` role and executable ONLY by the NOLOGIN `account_award_verifier`
--     group (future server-side verifier login). Not anon, not authenticated, not service_role,
--     not the TX1 reconciler; the `account_issuance` schema is not a PostgREST-exposed schema.
--   * At the commit boundary the database independently re-checks everything it CAN own:
--     a pending claim exists for exactly that pair; the attested basis is a subset of the
--     account's stored completions with the attested size; dates are inside server bounds;
--     the Card snapshot passes the same allowlist; the source is a published month document.
--     CMS facts (which Challenges qualify, which Card is approved) cannot be authenticated
--     inside PostgreSQL (Sanity documents are not signed); they are trusted only via the private
--     verifier port. This residual trust is documented, not hidden.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Roles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'account_award_issuer') THEN
    CREATE ROLE account_award_issuer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  -- Group role for the FUTURE server-side verifier service login. No member is created here.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'account_award_verifier') THEN
    CREATE ROLE account_award_verifier
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
     AND NOT pg_has_role(current_user, 'account_award_issuer', 'MEMBER') THEN
    EXECUTE format('GRANT account_award_issuer TO %I', current_user);
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO account_award_issuer;
GRANT USAGE ON SCHEMA account_private TO account_award_issuer;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA account_private TO account_award_issuer;

-- ---------------------------------------------------------------------------
-- 1. Private audit tables (no client access at all)
-- ---------------------------------------------------------------------------

-- One trusted admission record per earned award that this path created. Stores a DIGEST of the
-- qualifying basis (never the hidden qualifying list) plus bounded version information.
CREATE TABLE public.account_award_admission_attestations (
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  award_id text NOT NULL,
  verification_key text NOT NULL
    CONSTRAINT chk_attestations_key CHECK (verification_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
  verifier_version text NOT NULL
    CONSTRAINT chk_attestations_verifier_version CHECK (verifier_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  source_dataset text NOT NULL
    CONSTRAINT chk_attestations_dataset CHECK (source_dataset IN ('production', 'staging')),
  source_document_id text NOT NULL,
  source_revision text NOT NULL
    CONSTRAINT chk_attestations_revision CHECK (source_revision ~ '^[A-Za-z0-9_-]{1,64}$'),
  roster_version integer NOT NULL CONSTRAINT chk_attestations_roster CHECK (roster_version >= 1),
  target_count integer NOT NULL CONSTRAINT chk_attestations_target CHECK (target_count BETWEEN 1 AND 31),
  basis_digest text NOT NULL CONSTRAINT chk_attestations_digest CHECK (basis_digest ~ '^[0-9a-f]{64}$'),
  latest_basis_release_date date NOT NULL,
  verified_through_date date NOT NULL,
  card_document_id text NOT NULL,
  card_asset_revision text NOT NULL,
  claimed_earned_on date NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, award_id),
  CONSTRAINT fk_attestations_earned_award
    FOREIGN KEY (account_id, award_id)
    REFERENCES public.account_earned_awards (account_id, award_id)
    ON DELETE CASCADE
);

-- Last verification outcome for a STILL-PENDING claim (why it was deferred). Deleted with the
-- claim when the claim is admitted. Private: a deferral reason must not hint at hidden rules.
CREATE TABLE public.account_award_verification_attempts (
  account_id uuid NOT NULL,
  award_id text NOT NULL,
  last_reason text NOT NULL
    CONSTRAINT chk_attempts_reason CHECK (last_reason IN (
      'trustedSourceUnavailable',
      'monthNotFound',
      'monthNotPublishable',
      'monthNotYetReleased',
      'discoveryNotFound',
      'notEligibleUnderCurrentRoster',
      'historicalRosterEligibilityUnprovable',
      'cardNotLinked',
      'cardLegacyReservedOnly',
      'cardNotApproved',
      'basisNotInAccountCompletions',
      'admissionRejected'
    )),
  roster_version integer CONSTRAINT chk_attempts_roster CHECK (roster_version IS NULL OR roster_version >= 1),
  attempt_count integer NOT NULL DEFAULT 1 CONSTRAINT chk_attempts_count CHECK (attempt_count >= 1),
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, award_id),
  CONSTRAINT fk_attempts_claim
    FOREIGN KEY (account_id, award_id)
    REFERENCES public.account_provisional_award_claims (account_id, award_id)
    ON DELETE CASCADE
);

ALTER TABLE public.account_award_admission_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_award_verification_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.account_award_admission_attestations,
  public.account_award_verification_attempts
FROM PUBLIC, anon, authenticated, account_reconciler;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE
      public.account_award_admission_attestations,
      public.account_award_verification_attempts
    FROM service_role;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Issuer privileges: column-scoped, and RLS-confined to the ONE account the running
--    admission function is processing (session setting scoped by the function's SET clause).
-- ---------------------------------------------------------------------------
CREATE SCHEMA account_issuance;
REVOKE ALL ON SCHEMA account_issuance FROM PUBLIC;
GRANT USAGE ON SCHEMA account_issuance TO account_award_issuer, account_award_verifier;
ALTER DEFAULT PRIVILEGES IN SCHEMA account_issuance REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION account_issuance.current_account()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT nullif(current_setting('bibleberry.award_issuance_account', true), '')::uuid;
$$;

GRANT SELECT, DELETE ON TABLE public.account_provisional_award_claims TO account_award_issuer;
GRANT SELECT (account_id, challenge_id) ON TABLE public.account_completed_challenges TO account_award_issuer;
GRANT SELECT, INSERT ON TABLE public.account_earned_awards TO account_award_issuer;
GRANT UPDATE (hub_announcement_acked, card_viewed, updated_at)
  ON TABLE public.account_earned_awards TO account_award_issuer;
GRANT SELECT ON TABLE public.account_participation_profiles TO account_award_issuer;
GRANT UPDATE (revision, updated_at) ON TABLE public.account_participation_profiles TO account_award_issuer;
GRANT SELECT, INSERT ON TABLE public.account_award_admission_attestations TO account_award_issuer;
GRANT SELECT, INSERT ON TABLE public.account_award_verification_attempts TO account_award_issuer;
GRANT UPDATE (last_reason, roster_version, attempt_count, last_attempt_at)
  ON TABLE public.account_award_verification_attempts TO account_award_issuer;

-- Listing pending claims is the only cross-account read (IDs + dates only; no client snapshot
-- is ever returned by the listing function).
CREATE POLICY "account_provisional_award_claims_issuer_list"
  ON public.account_provisional_award_claims FOR SELECT TO account_award_issuer
  USING (true);
CREATE POLICY "account_provisional_award_claims_issuer_resolve"
  ON public.account_provisional_award_claims FOR DELETE TO account_award_issuer
  USING (account_id = account_issuance.current_account());
CREATE POLICY "account_completed_challenges_issuer_own"
  ON public.account_completed_challenges FOR SELECT TO account_award_issuer
  USING (account_id = account_issuance.current_account());
CREATE POLICY "account_earned_awards_issuer_own"
  ON public.account_earned_awards FOR ALL TO account_award_issuer
  USING (account_id = account_issuance.current_account())
  WITH CHECK (account_id = account_issuance.current_account());
CREATE POLICY "account_participation_profiles_issuer_own"
  ON public.account_participation_profiles FOR ALL TO account_award_issuer
  USING (account_id = account_issuance.current_account())
  WITH CHECK (account_id = account_issuance.current_account());
CREATE POLICY "account_award_admission_attestations_issuer_own"
  ON public.account_award_admission_attestations FOR ALL TO account_award_issuer
  USING (account_id = account_issuance.current_account())
  WITH CHECK (account_id = account_issuance.current_account());
CREATE POLICY "account_award_verification_attempts_issuer_list"
  ON public.account_award_verification_attempts FOR SELECT TO account_award_issuer
  USING (true);
CREATE POLICY "account_award_verification_attempts_issuer_write"
  ON public.account_award_verification_attempts FOR INSERT TO account_award_issuer
  WITH CHECK (account_id = account_issuance.current_account());
CREATE POLICY "account_award_verification_attempts_issuer_update"
  ON public.account_award_verification_attempts FOR UPDATE TO account_award_issuer
  USING (account_id = account_issuance.current_account())
  WITH CHECK (account_id = account_issuance.current_account());

-- ---------------------------------------------------------------------------
-- 3. Server-only issuance port (SECURITY DEFINER, owned by account_award_issuer)
-- ---------------------------------------------------------------------------

-- 3a. Pending claims to verify, oldest-attempted first. IDs and dates only.
CREATE FUNCTION account_issuance.list_pending_award_claims(p_limit integer DEFAULT 100)
RETURNS TABLE (
  account_id uuid,
  award_id text,
  publication_year_month text,
  claimed_earned_on date,
  last_claimed_at timestamptz,
  attempt_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pc.account_id, pc.award_id, pc.publication_year_month, pc.claimed_earned_on,
         pc.last_claimed_at, coalesce(at.attempt_count, 0)
    FROM public.account_provisional_award_claims pc
    LEFT JOIN public.account_award_verification_attempts at
      ON at.account_id = pc.account_id AND at.award_id = pc.award_id
   ORDER BY at.last_attempt_at ASC NULLS FIRST, pc.last_claimed_at ASC, pc.account_id, pc.award_id
   LIMIT least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- 3b. Verification context for ONE pending claim: that account's stored completion IDs only.
--     Returns nothing about any account without a pending claim for that exact award.
CREATE FUNCTION account_issuance.get_claim_verification_context(p_account_id uuid, p_award_id text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET bibleberry.award_issuance_account TO ''
AS $$
DECLARE
  v_claim public.account_provisional_award_claims%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_award_id IS NULL THEN
    RETURN jsonb_build_object('status', 'noPendingClaim');
  END IF;
  SELECT * INTO v_claim FROM public.account_provisional_award_claims
   WHERE account_id = p_account_id AND award_id = p_award_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'noPendingClaim');
  END IF;
  PERFORM set_config('bibleberry.award_issuance_account', p_account_id::text, true);
  RETURN jsonb_build_object(
    'status', 'pending',
    'accountId', v_claim.account_id::text,
    'awardId', v_claim.award_id,
    'publicationYearMonth', v_claim.publication_year_month,
    'claimedEarnedOn', to_char(v_claim.claimed_earned_on, 'YYYY-MM-DD'),
    'completedChallengeIds', coalesce((
      SELECT jsonb_agg(c.challenge_id ORDER BY c.challenge_id)
        FROM public.account_completed_challenges c
       WHERE c.account_id = p_account_id), '[]'::jsonb)
  );
END
$$;

-- 3c. Record why a still-pending claim was deferred. Never touches the claim or any award.
--     Serialized with admission (and TX1 reconciliation) on the SAME per-account advisory lock
--     BEFORE the claim-existence check, so a deferral can never race an admission that deletes
--     the claim (review of PR #209). A claim resolved meanwhile yields `noPendingClaim`.
CREATE FUNCTION account_issuance.record_verification_deferral(
  p_account_id uuid, p_award_id text, p_reason text, p_roster_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET bibleberry.award_issuance_account TO ''
AS $$
BEGIN
  IF p_account_id IS NULL OR p_award_id IS NULL THEN
    RETURN jsonb_build_object('status', 'noPendingClaim');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bibleberry:account_reconcile:' || p_account_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.account_provisional_award_claims
                  WHERE account_id = p_account_id AND award_id = p_award_id) THEN
    RETURN jsonb_build_object('status', 'noPendingClaim');
  END IF;
  PERFORM set_config('bibleberry.award_issuance_account', p_account_id::text, true);
  BEGIN
    INSERT INTO public.account_award_verification_attempts AS a (
      account_id, award_id, last_reason, roster_version, attempt_count, first_attempt_at, last_attempt_at
    ) VALUES (p_account_id, p_award_id, p_reason, p_roster_version, 1, clock_timestamp(), clock_timestamp())
    ON CONFLICT (account_id, award_id) DO UPDATE
      SET last_reason = EXCLUDED.last_reason,
          roster_version = EXCLUDED.roster_version,
          attempt_count = a.attempt_count + 1,
          last_attempt_at = EXCLUDED.last_attempt_at;
  EXCEPTION
    WHEN check_violation THEN
      RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidDeferralReason');
    -- Backstop (e.g. a caller outside READ COMMITTED): the claim vanished under us.
    WHEN foreign_key_violation THEN
      RETURN jsonb_build_object('status', 'noPendingClaim');
  END;
  RETURN jsonb_build_object('status', 'deferred', 'reason', p_reason);
END
$$;

-- 3d. Atomic admission of ONE verified award.
CREATE FUNCTION account_issuance.admit_verified_award(p_attestation jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET bibleberry.award_issuance_account TO ''
AS $$
DECLARE
  v_ceiling date := ((clock_timestamp() AT TIME ZONE 'UTC') + interval '14 hours')::date;
  v_now timestamptz := clock_timestamp();
  v_account uuid;
  v_award text;
  v_ym text;
  v_kind text;
  v_disc text;
  v_month_start date;
  v_month_end date;
  v_roster integer;
  v_target integer;
  v_basis text[];
  v_latest date;
  v_through date;
  v_snapshot jsonb;
  v_card_doc text;
  v_key text;
  v_verifier text;
  v_dataset text;
  v_revision text;
  v_claim public.account_provisional_award_claims%ROWTYPE;
  v_existing public.account_earned_awards%ROWTYPE;
  v_owned integer;
  v_earned_on date;
  v_changed boolean := false;
  v_new_rev bigint;
  v_status text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'unsupportedTransactionIsolation');
  END IF;

  -- ---- Strict allowlisted attestation shape (no writes, no locks) ----
  IF p_attestation IS NULL OR jsonb_typeof(p_attestation) <> 'object'
     OR octet_length(p_attestation::text) > 65536
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_attestation) k
                 WHERE k NOT IN ('verificationKey', 'verifierVersion', 'accountId', 'awardId',
                                 'discoveryId', 'kind', 'publicationYearMonth', 'rosterVersion',
                                 'targetCount', 'basisChallengeIds', 'latestBasisReleaseDate',
                                 'verifiedThroughDate', 'card', 'source')) THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidAttestationShape');
  END IF;

  v_key := p_attestation ->> 'verificationKey';
  v_verifier := p_attestation ->> 'verifierVersion';
  IF jsonb_typeof(p_attestation -> 'verificationKey') IS DISTINCT FROM 'string'
     OR v_key !~ '^[A-Za-z0-9._:-]{1,128}$'
     OR jsonb_typeof(p_attestation -> 'verifierVersion') IS DISTINCT FROM 'string'
     OR v_verifier !~ '^[A-Za-z0-9._-]{1,32}$' THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidVerificationKey');
  END IF;

  IF jsonb_typeof(p_attestation -> 'accountId') IS DISTINCT FROM 'string'
     OR p_attestation ->> 'accountId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidAccountId');
  END IF;
  v_account := (p_attestation ->> 'accountId')::uuid;

  v_award := p_attestation ->> 'awardId';
  SELECT pa.publication_year_month, pa.kind, pa.discovery_id INTO v_ym, v_kind, v_disc
    FROM account_private.parse_award_id(v_award) pa;
  IF NOT FOUND
     OR p_attestation -> 'kind' IS DISTINCT FROM to_jsonb(v_kind)
     OR p_attestation -> 'discoveryId' IS DISTINCT FROM to_jsonb(v_disc)
     OR p_attestation -> 'publicationYearMonth' IS DISTINCT FROM to_jsonb(v_ym) THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidAwardIdentity');
  END IF;
  v_month_start := (v_ym || '-01')::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  IF jsonb_typeof(p_attestation -> 'rosterVersion') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_attestation -> 'targetCount') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_attestation -> 'basisChallengeIds') IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidBasis');
  END IF;
  v_roster := (p_attestation ->> 'rosterVersion')::numeric;
  v_target := (p_attestation ->> 'targetCount')::numeric;
  IF (p_attestation ->> 'rosterVersion')::numeric <> v_roster OR v_roster < 1
     OR (p_attestation ->> 'targetCount')::numeric <> v_target OR v_target < 1 OR v_target > 31
     OR jsonb_array_length(p_attestation -> 'basisChallengeIds') <> v_target
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_attestation -> 'basisChallengeIds') e
                 WHERE jsonb_typeof(e.value) <> 'string'
                    OR NOT account_private.is_canonical_challenge_id(e.value #>> '{}')) THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidBasis');
  END IF;
  SELECT array_agg(DISTINCT e.value #>> '{}' ORDER BY e.value #>> '{}') INTO v_basis
    FROM jsonb_array_elements(p_attestation -> 'basisChallengeIds') e;
  IF cardinality(v_basis) <> v_target THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidBasis');
  END IF;

  v_latest := account_private.parse_calendar_date(p_attestation -> 'latestBasisReleaseDate');
  v_through := account_private.parse_calendar_date(p_attestation -> 'verifiedThroughDate');
  IF v_latest IS NULL OR v_through IS NULL
     OR v_latest < v_month_start OR v_latest > v_month_end
     OR v_through < v_latest OR v_through > v_ceiling THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidVerificationDates');
  END IF;

  v_snapshot := account_private.normalize_card_snapshot(p_attestation -> 'card', v_ym);
  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidTrustedCard');
  END IF;
  v_card_doc := v_snapshot ->> 'cardDocumentId';

  IF jsonb_typeof(p_attestation -> 'source') IS DISTINCT FROM 'object'
     OR p_attestation -> 'source' ->> 'documentId' IS DISTINCT FROM ('month-' || v_ym)
     OR p_attestation -> 'source' ->> 'perspective' IS DISTINCT FROM 'published'
     OR coalesce(p_attestation -> 'source' ->> 'dataset', '') NOT IN ('production', 'staging')
     OR coalesce(p_attestation -> 'source' ->> 'revision', '') !~ '^[A-Za-z0-9_-]{1,64}$' THEN
    RETURN jsonb_build_object('status', 'rejected', 'detail', 'invalidSource');
  END IF;
  v_dataset := p_attestation -> 'source' ->> 'dataset';
  v_revision := p_attestation -> 'source' ->> 'revision';

  -- ---- Confine this call to exactly one account, then serialize with TX1 reconciliation ----
  PERFORM set_config('bibleberry.award_issuance_account', v_account::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended('bibleberry:account_reconcile:' || v_account::text, 0));

  BEGIN
    -- No row lock needed (and none granted): the per-account advisory lock above already
    -- serializes this call with every TX1 reconciliation and every other admission.
    SELECT * INTO v_claim FROM public.account_provisional_award_claims
     WHERE account_id = v_account AND award_id = v_award;
    SELECT * INTO v_existing FROM public.account_earned_awards
     WHERE account_id = v_account AND award_id = v_award
       FOR UPDATE;

    IF v_existing.award_id IS NOT NULL THEN
      -- Already earned (this path, a replay, another device, or a prior trusted admission):
      -- never change identity/date/snapshot; only OR the reader-owned flags of a re-appeared claim.
      IF v_claim.award_id IS NOT NULL THEN
        IF (v_claim.hub_announcement_acked AND NOT v_existing.hub_announcement_acked)
           OR (v_claim.card_viewed AND NOT v_existing.card_viewed) THEN
          UPDATE public.account_earned_awards
             SET hub_announcement_acked = v_existing.hub_announcement_acked OR v_claim.hub_announcement_acked,
                 card_viewed = v_existing.card_viewed OR v_claim.card_viewed,
                 updated_at = v_now
           WHERE account_id = v_account AND award_id = v_award;
        END IF;
        DELETE FROM public.account_provisional_award_claims
         WHERE account_id = v_account AND award_id = v_award;
        v_changed := true;
      END IF;
      v_status := 'alreadyEarned';
    ELSIF v_claim.award_id IS NULL THEN
      -- Nothing nominated this pair: the issuer can never mint an unclaimed award.
      RETURN jsonb_build_object('status', 'noPendingClaim');
    ELSE
      -- The attested basis must be this account's OWN stored completions.
      SELECT count(*) INTO v_owned FROM public.account_completed_challenges
       WHERE account_id = v_account AND challenge_id = ANY (v_basis);
      IF v_owned <> v_target THEN
        RAISE EXCEPTION USING ERRCODE = 'BBR01', MESSAGE = 'basisNotInAccountCompletions';
      END IF;

      -- Earned date: the guest claim is evidence, bounded below by the earliest credible date
      -- (month start / latest qualifying release) and above by the server UTC+14 ceiling.
      -- It is NOT independently attested, so provenance stays clientReported.
      v_earned_on := least(greatest(v_claim.claimed_earned_on, v_month_start, v_latest), v_ceiling);

      INSERT INTO public.account_earned_awards (
        account_id, award_id, kind, publication_year_month, discovery_id, earned_on,
        date_provenance, client_claimed_on, hub_announcement_acked, card_viewed,
        card_document_id, earned_card_snapshot, first_recorded_at, updated_at
      ) VALUES (
        v_account, v_award, v_kind, v_ym, v_disc, v_earned_on,
        'clientReported', v_claim.claimed_earned_on, v_claim.hub_announcement_acked, v_claim.card_viewed,
        v_card_doc, v_snapshot, v_now, v_now
      );

      INSERT INTO public.account_award_admission_attestations (
        account_id, award_id, verification_key, verifier_version, source_dataset,
        source_document_id, source_revision, roster_version, target_count, basis_digest,
        latest_basis_release_date, verified_through_date, card_document_id, card_asset_revision,
        claimed_earned_on, verified_at
      ) VALUES (
        v_account, v_award, v_key, v_verifier, v_dataset,
        'month-' || v_ym, v_revision, v_roster, v_target,
        encode(sha256(convert_to(array_to_string(v_basis, E'\n'), 'UTF8')), 'hex'),
        v_latest, v_through, v_card_doc, v_snapshot ->> 'assetRevision',
        v_claim.claimed_earned_on, v_now
      );

      -- Move semantics: the quarantine row (and its private attempts row) is resolved.
      DELETE FROM public.account_provisional_award_claims
       WHERE account_id = v_account AND award_id = v_award;
      v_changed := true;
      v_status := 'admitted';
    END IF;

    IF v_changed THEN
      UPDATE public.account_participation_profiles
         SET revision = revision + 1, updated_at = v_now
       WHERE account_id = v_account
       RETURNING revision INTO v_new_rev;
      IF v_new_rev IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'BBR01', MESSAGE = 'accountProfileMissing';
      END IF;
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'BBR01' THEN
      RETURN jsonb_build_object('status', 'rejected', 'detail', SQLERRM);
    WHEN check_violation OR not_null_violation OR foreign_key_violation THEN
      RETURN jsonb_build_object('status', 'rejected', 'detail', 'constraintViolation');
    WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'retry', 'detail', 'concurrentAdmission');
  END;

  RETURN jsonb_build_object(
    'status', v_status,
    'awardId', v_award,
    'revision', v_new_rev
  ) || CASE WHEN v_status = 'admitted'
            THEN jsonb_build_object('earnedOn', to_char(v_earned_on, 'YYYY-MM-DD'))
            ELSE '{}'::jsonb END;
END
$$;

ALTER FUNCTION account_issuance.current_account() OWNER TO account_award_issuer;
ALTER FUNCTION account_issuance.list_pending_award_claims(integer) OWNER TO account_award_issuer;
ALTER FUNCTION account_issuance.get_claim_verification_context(uuid, text) OWNER TO account_award_issuer;
ALTER FUNCTION account_issuance.record_verification_deferral(uuid, text, text, integer) OWNER TO account_award_issuer;
ALTER FUNCTION account_issuance.admit_verified_award(jsonb) OWNER TO account_award_issuer;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_issuance FROM PUBLIC, anon, authenticated, account_reconciler;
GRANT EXECUTE ON FUNCTION account_issuance.current_account() TO account_award_issuer;
GRANT EXECUTE ON FUNCTION
  account_issuance.list_pending_award_claims(integer),
  account_issuance.get_claim_verification_context(uuid, text),
  account_issuance.record_verification_deferral(uuid, text, text, integer),
  account_issuance.admit_verified_award(jsonb)
TO account_award_verifier;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_issuance FROM service_role;
  END IF;
END
$$;

COMMENT ON FUNCTION account_issuance.admit_verified_award(jsonb) IS
  'R13-VERIFY1 server-only trusted award admission. Executable only by account_award_verifier. See docs/architecture/r13-verify1-trusted-card-admission.md';

COMMIT;
