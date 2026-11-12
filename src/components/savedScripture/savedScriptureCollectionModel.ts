import {
  formatLocalCalendarDate,
  normalizeSavedScriptureInput,
  normalizeScriptureReferenceForKey,
  parseLocalCalendarDate,
} from '../../participation/identity.ts'
import type {
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  LocalCalendarDate,
  ReaderParticipationData,
  SavedScriptureKey,
} from '../../participation/types.ts'

/**
 * Pure domain and presentation model for the V2 Saved Scripture collection (R09-1 / Issue #120).
 *
 * Scope & safety invariants:
 * - Zero browser (`window`, `localStorage`, `document`) or network dependencies.
 * - Projects citations and recorded translations only — never synthesizes or retains Bible
 *   passage manuscript text, memorization schedules, or personal notes.
 * - Treats `sourceChallengeId` strictly as optional provenance without synthesizing guessed
 *   Challenge slugs, unauthorized deep links, or CMS/gateway requests.
 */

export interface SavedScriptureCollectionItem {
  readonly key: SavedScriptureKey
  readonly reference: string
  readonly translation: string | null
  readonly translationLabel: string
  readonly hasExplicitTranslation: boolean
  readonly savedOn: LocalCalendarDate
  readonly savedDateLabel: string
  readonly sourceChallengeId?: CanonicalChallengeId
  readonly hasSourceChallenge: boolean
  readonly provenanceSummary: string
}

export interface ProjectSavedScriptureOptions {
  readonly allowedNamespace?: ChallengeIdentityNamespace
}

interface SanitizedScriptureCandidate {
  readonly key: SavedScriptureKey
  readonly reference: string
  readonly translation: string | null
  readonly savedOn: LocalCalendarDate
  readonly sourceChallengeId?: CanonicalChallengeId
}

const BOOK_ALIASES: Readonly<Record<string, string>> = {
  // Old Testament
  gen: 'genesis',
  ge: 'genesis',
  gn: 'genesis',
  genesis: 'genesis',
  ex: 'exodus',
  exod: 'exodus',
  exo: 'exodus',
  exodus: 'exodus',
  lev: 'leviticus',
  le: 'leviticus',
  lv: 'leviticus',
  leviticus: 'leviticus',
  num: 'numbers',
  nu: 'numbers',
  nm: 'numbers',
  nb: 'numbers',
  numbers: 'numbers',
  deut: 'deuteronomy',
  deu: 'deuteronomy',
  dt: 'deuteronomy',
  deuteronomy: 'deuteronomy',
  josh: 'joshua',
  jos: 'joshua',
  jsh: 'joshua',
  joshua: 'joshua',
  judg: 'judges',
  jdg: 'judges',
  jg: 'judges',
  jdgs: 'judges',
  judges: 'judges',
  ruth: 'ruth',
  ru: 'ruth',
  rth: 'ruth',
  '1 sam': '1 samuel',
  '1 sa': '1 samuel',
  '1 sm': '1 samuel',
  '1sam': '1 samuel',
  '1 samuel': '1 samuel',
  '2 sam': '2 samuel',
  '2 sa': '2 samuel',
  '2 sm': '2 samuel',
  '2sam': '2 samuel',
  '2 samuel': '2 samuel',
  '1 kgs': '1 kings',
  '1 ki': '1 kings',
  '1 kg': '1 kings',
  '1kgs': '1 kings',
  '1 kings': '1 kings',
  '2 kgs': '2 kings',
  '2 ki': '2 kings',
  '2 kg': '2 kings',
  '2kgs': '2 kings',
  '2 kings': '2 kings',
  '1 chr': '1 chronicles',
  '1 ch': '1 chronicles',
  '1 chron': '1 chronicles',
  '1chr': '1 chronicles',
  '1 chronicles': '1 chronicles',
  '2 chr': '2 chronicles',
  '2 ch': '2 chronicles',
  '2 chron': '2 chronicles',
  '2chr': '2 chronicles',
  '2 chronicles': '2 chronicles',
  ezra: 'ezra',
  ezr: 'ezra',
  neh: 'nehemiah',
  ne: 'nehemiah',
  nehemiah: 'nehemiah',
  esth: 'esther',
  est: 'esther',
  es: 'esther',
  esther: 'esther',
  job: 'job',
  jb: 'job',
  ps: 'psalms',
  psa: 'psalms',
  psm: 'psalms',
  pss: 'psalms',
  psalm: 'psalms',
  psalms: 'psalms',
  prov: 'proverbs',
  pro: 'proverbs',
  prv: 'proverbs',
  pr: 'proverbs',
  proverbs: 'proverbs',
  eccl: 'ecclesiastes',
  eccles: 'ecclesiastes',
  ecc: 'ecclesiastes',
  ec: 'ecclesiastes',
  qoh: 'ecclesiastes',
  ecclesiastes: 'ecclesiastes',
  song: 'song of solomon',
  sos: 'song of solomon',
  cant: 'song of solomon',
  canticles: 'song of solomon',
  'song of songs': 'song of solomon',
  'song of solomon': 'song of solomon',
  isa: 'isaiah',
  is: 'isaiah',
  isaiah: 'isaiah',
  jer: 'jeremiah',
  je: 'jeremiah',
  jr: 'jeremiah',
  jeremiah: 'jeremiah',
  lam: 'lamentations',
  la: 'lamentations',
  lamentations: 'lamentations',
  ezek: 'ezekiel',
  eze: 'ezekiel',
  ezk: 'ezekiel',
  ezekiel: 'ezekiel',
  dan: 'daniel',
  da: 'daniel',
  dn: 'daniel',
  daniel: 'daniel',
  hos: 'hosea',
  ho: 'hosea',
  hosea: 'hosea',
  joel: 'joel',
  jl: 'joel',
  amos: 'amos',
  am: 'amos',
  obad: 'obadiah',
  ob: 'obadiah',
  obadiah: 'obadiah',
  jonah: 'jonah',
  jon: 'jonah',
  jnh: 'jonah',
  mic: 'micah',
  mc: 'micah',
  micah: 'micah',
  nah: 'nahum',
  na: 'nahum',
  nahum: 'nahum',
  hab: 'habakkuk',
  hb: 'habakkuk',
  habakkuk: 'habakkuk',
  zeph: 'zephaniah',
  zep: 'zephaniah',
  zp: 'zephaniah',
  zephaniah: 'zephaniah',
  hag: 'haggai',
  hg: 'haggai',
  haggai: 'haggai',
  zech: 'zechariah',
  zec: 'zechariah',
  zc: 'zechariah',
  zechariah: 'zechariah',
  mal: 'malachi',
  ml: 'malachi',
  malachi: 'malachi',
  // New Testament
  matt: 'matthew',
  mat: 'matthew',
  mt: 'matthew',
  matthew: 'matthew',
  mark: 'mark',
  mrk: 'mark',
  mk: 'mark',
  mr: 'mark',
  luke: 'luke',
  luk: 'luke',
  lk: 'luke',
  john: 'john',
  joh: 'john',
  jn: 'john',
  jhn: 'john',
  acts: 'acts',
  act: 'acts',
  ac: 'acts',
  rom: 'romans',
  ro: 'romans',
  rm: 'romans',
  romans: 'romans',
  '1 cor': '1 corinthians',
  '1 co': '1 corinthians',
  '1cor': '1 corinthians',
  '1 corinthians': '1 corinthians',
  '2 cor': '2 corinthians',
  '2 co': '2 corinthians',
  '2cor': '2 corinthians',
  '2 corinthians': '2 corinthians',
  gal: 'galatians',
  ga: 'galatians',
  galatians: 'galatians',
  eph: 'ephesians',
  ephes: 'ephesians',
  ephesians: 'ephesians',
  phil: 'philippians',
  php: 'philippians',
  pp: 'philippians',
  philippians: 'philippians',
  col: 'colossians',
  co: 'colossians',
  colossians: 'colossians',
  '1 thess': '1 thessalonians',
  '1 thes': '1 thessalonians',
  '1 th': '1 thessalonians',
  '1thess': '1 thessalonians',
  '1thes': '1 thessalonians',
  '1 thessalonians': '1 thessalonians',
  '2 thess': '2 thessalonians',
  '2 thes': '2 thessalonians',
  '2 th': '2 thessalonians',
  '2thess': '2 thessalonians',
  '2thes': '2 thessalonians',
  '2 thessalonians': '2 thessalonians',
  '1 tim': '1 timothy',
  '1 ti': '1 timothy',
  '1 tm': '1 timothy',
  '1tim': '1 timothy',
  '1 timothy': '1 timothy',
  '2 tim': '2 timothy',
  '2 ti': '2 timothy',
  '2 tm': '2 timothy',
  '2tim': '2 timothy',
  '2 timothy': '2 timothy',
  titus: 'titus',
  tit: 'titus',
  ti: 'titus',
  phlm: 'philemon',
  phm: 'philemon',
  philemon: 'philemon',
  heb: 'hebrews',
  hebrews: 'hebrews',
  jas: 'james',
  jm: 'james',
  james: 'james',
  '1 pet': '1 peter',
  '1 pe': '1 peter',
  '1 pt': '1 peter',
  '1 p': '1 peter',
  '1pet': '1 peter',
  '1 peter': '1 peter',
  '2 pet': '2 peter',
  '2 pe': '2 peter',
  '2 pt': '2 peter',
  '2 p': '2 peter',
  '2pet': '2 peter',
  '2 peter': '2 peter',
  '1 john': '1 john',
  '1 jn': '1 john',
  '1 jhn': '1 john',
  '1 j': '1 john',
  '1jn': '1 john',
  '1john': '1 john',
  '2 john': '2 john',
  '2 jn': '2 john',
  '2 jhn': '2 john',
  '2 j': '2 john',
  '2jn': '2 john',
  '2john': '2 john',
  '3 john': '3 john',
  '3 jn': '3 john',
  '3 jhn': '3 john',
  '3 j': '3 john',
  '3jn': '3 john',
  '3john': '3 john',
  jude: 'jude',
  jud: 'jude',
  jd: 'jude',
  rev: 'revelation',
  re: 'revelation',
  rv: 'revelation',
  revelation: 'revelation',
  apocalypse: 'revelation',
}

const SORTED_BOOK_ALIAS_KEYS = Object.keys(BOOK_ALIASES).sort((a, b) => b.length - a.length)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function formatSavedScriptureDate(savedOn: LocalCalendarDate): string {
  const valid = parseLocalCalendarDate(savedOn)
  if (!valid) return savedOn
  const year = Number(valid.slice(0, 4))
  const month = Number(valid.slice(5, 7))
  const day = Number(valid.slice(8, 10))
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function resolveCurrentLocalCalendarDate(date: Date = new Date()): LocalCalendarDate {
  return formatLocalCalendarDate(date)
}

function toSavedScriptureCollectionItem(
  record: SanitizedScriptureCandidate,
): SavedScriptureCollectionItem {
  const hasExplicitTranslation = record.translation !== null
  const translationLabel = record.translation ?? 'Translation unspecified'
  const hasSourceChallenge = record.sourceChallengeId !== undefined
  const provenanceSummary = hasSourceChallenge
    ? 'Saved while reading a Bibleberry Challenge'
    : 'Saved to your personal Scripture collection'

  return Object.freeze({
    key: record.key,
    reference: record.reference,
    translation: record.translation,
    translationLabel,
    hasExplicitTranslation,
    savedOn: record.savedOn,
    savedDateLabel: formatSavedScriptureDate(record.savedOn),
    ...(record.sourceChallengeId ? { sourceChallengeId: record.sourceChallengeId } : {}),
    hasSourceChallenge,
    provenanceSummary,
  })
}

function compareCollectionItems(
  left: SavedScriptureCollectionItem,
  right: SavedScriptureCollectionItem,
): number {
  if (left.savedOn !== right.savedOn) {
    return right.savedOn > left.savedOn ? 1 : -1
  }
  if (left.key === right.key) return 0
  return left.key < right.key ? -1 : 1
}

/**
 * Validates and projects an arbitrary candidate array (including malformed legacy entries or
 * repeated keys) into a deterministic, citation-only collection sorted by `savedOn` descending
 * with canonical `key` ascending tie-break.
 */
export function projectSavedScripturesFromCandidates(
  candidates: unknown,
  options: ProjectSavedScriptureOptions = {},
): readonly SavedScriptureCollectionItem[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return Object.freeze([])
  }

  const allowedNamespace: ChallengeIdentityNamespace = options.allowedNamespace ?? 'cms'
  const byKey = new Map<SavedScriptureKey, SanitizedScriptureCandidate>()

  for (const candidate of candidates) {
    if (!isPlainObject(candidate) || typeof candidate.reference !== 'string') continue
    const savedOn = parseLocalCalendarDate(candidate.savedOn)
    if (!savedOn) continue

    const rawTranslation =
      typeof candidate.translation === 'string' || candidate.translation === null
        ? candidate.translation
        : undefined
    const rawSourceChallengeId =
      typeof candidate.sourceChallengeId === 'string'
        ? (candidate.sourceChallengeId as CanonicalChallengeId)
        : undefined

    const normalized = normalizeSavedScriptureInput(
      {
        reference: candidate.reference,
        translation: rawTranslation,
        sourceChallengeId: rawSourceChallengeId,
      },
      allowedNamespace,
    )
    if (!normalized) continue

    const existing = byKey.get(normalized.key)
    if (!existing) {
      byKey.set(normalized.key, {
        key: normalized.key,
        reference: normalized.reference,
        translation: normalized.translation,
        savedOn,
        ...(normalized.sourceChallengeId ? { sourceChallengeId: normalized.sourceChallengeId } : {}),
      })
      continue
    }

    // Deterministic duplicate-key resolution: retain earliest valid save date and preserve
    // valid sourceChallengeId provenance if missing from the retained entry.
    if (savedOn < existing.savedOn) {
      const mergedSource = normalized.sourceChallengeId ?? existing.sourceChallengeId
      byKey.set(normalized.key, {
        key: normalized.key,
        reference: normalized.reference,
        translation: normalized.translation,
        savedOn,
        ...(mergedSource ? { sourceChallengeId: mergedSource } : {}),
      })
    } else if (!existing.sourceChallengeId && normalized.sourceChallengeId) {
      byKey.set(normalized.key, {
        ...existing,
        sourceChallengeId: normalized.sourceChallengeId,
      })
    }
  }

  const projected = Array.from(byKey.values(), toSavedScriptureCollectionItem)
  projected.sort(compareCollectionItems)
  return Object.freeze(projected)
}

/**
 * Projects all legitimately saved references from V2 `ReaderParticipationData` into a stable,
 * deterministic collection sorted by save date descending with canonical-key tie-break.
 */
export function projectSavedScriptureCollection(
  data: Pick<ReaderParticipationData, 'savedScriptures'> | null | undefined,
  options: ProjectSavedScriptureOptions = {},
): readonly SavedScriptureCollectionItem[] {
  if (!data) return Object.freeze([])
  return projectSavedScripturesFromCandidates(data.savedScriptures, options)
}

export function normalizeScriptureSearchQuery(query: string): string {
  if (typeof query !== 'string') return ''
  return query.normalize('NFC').trim().replace(/\s+/g, ' ')
}

function normalizeBookLeadingPrefixes(text: string): string {
  return text
    .replace(/^(?:first|1st|i)\s+/i, '1 ')
    .replace(/^(?:second|2nd|ii)\s+/i, '2 ')
    .replace(/^(?:third|3rd|iii)\s+/i, '3 ')
    .replace(/^([123])\.\s*/, '$1 ')
}

function canonicalizeCitationString(raw: string): string {
  const base = normalizeBookLeadingPrefixes(
    normalizeScriptureReferenceForKey(raw).replace(/\./g, ''),
  )
  for (const alias of SORTED_BOOK_ALIAS_KEYS) {
    if (base === alias) {
      return BOOK_ALIASES[alias]
    }
    if (base.startsWith(`${alias} `)) {
      const rest = base.slice(alias.length + 1).trim()
      return rest ? `${BOOK_ALIASES[alias]} ${rest}` : BOOK_ALIASES[alias]
    }
  }
  return base
}

function relaxCitationPunctuation(text: string): string {
  return text
    .replace(/[:\-–—−,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface SearchableEntryFields {
  readonly rawRef: string
  readonly canonicalRef: string
  readonly relaxedRawRef: string
  readonly relaxedCanonicalRef: string
  readonly translation: string | null
  readonly combinedForms: readonly string[]
}

function buildSearchableFields(item: SavedScriptureCollectionItem): SearchableEntryFields {
  const rawRef = normalizeScriptureReferenceForKey(item.reference)
  const canonicalRef = canonicalizeCitationString(item.reference)
  const relaxedRawRef = relaxCitationPunctuation(rawRef)
  const relaxedCanonicalRef = relaxCitationPunctuation(canonicalRef)
  const translation = item.translation
    ? item.translation.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
    : null

  const combinedForms = [
    rawRef,
    canonicalRef,
    relaxedRawRef,
    relaxedCanonicalRef,
    ...(translation
      ? [
          translation,
          `${rawRef} ${translation}`,
          `${canonicalRef} ${translation}`,
          `${relaxedCanonicalRef} ${translation}`,
        ]
      : []),
  ]

  return {
    rawRef,
    canonicalRef,
    relaxedRawRef,
    relaxedCanonicalRef,
    translation,
    combinedForms,
  }
}

function matchesCitationCandidate(
  fields: SearchableEntryFields,
  queryCandidate: string,
): boolean {
  if (!queryCandidate) return true
  const normQuery = normalizeScriptureReferenceForKey(queryCandidate)
  const canonicalQuery = canonicalizeCitationString(queryCandidate)
  const relaxedQuery = relaxCitationPunctuation(canonicalQuery)

  for (const form of fields.combinedForms) {
    if (
      form.includes(normQuery)
      || form.includes(canonicalQuery)
      || (relaxedQuery.length > 0 && form.includes(relaxedQuery))
    ) {
      return true
    }
  }
  return false
}

/**
 * Filters projected Saved Scripture items by Scripture reference, Bible book/citation spelling
 * (including abbreviations, Psalm/Psalms, Roman/ordinal prefixes, and Unicode NFC/NFD
 * normalization), and recorded translation.
 */
export function filterSavedScriptures(
  items: readonly SavedScriptureCollectionItem[],
  query: string,
): readonly SavedScriptureCollectionItem[] {
  const normalizedQuery = normalizeScriptureSearchQuery(query)
  if (!normalizedQuery) return items

  const lowerQuery = normalizedQuery.toLowerCase()
  const tokens = lowerQuery.split(' ').filter(Boolean)

  return items.filter(item => {
    const fields = buildSearchableFields(item)

    if (matchesCitationCandidate(fields, lowerQuery)) {
      return true
    }

    // Support combined reference + translation queries in either order (e.g. "WEBP Psalm 23" or "John 3:16 WEBP").
    if (fields.translation && tokens.length >= 2) {
      const firstToken = tokens[0]
      const lastToken = tokens[tokens.length - 1]
      if (fields.translation.includes(lastToken)) {
        const refPart = tokens.slice(0, -1).join(' ')
        if (matchesCitationCandidate(fields, refPart)) return true
      }
      if (fields.translation.includes(firstToken)) {
        const refPart = tokens.slice(1).join(' ')
        if (matchesCitationCandidate(fields, refPart)) return true
      }
    }

    return false
  })
}

export function buildSavedScriptureCountLabel(
  totalCount: number,
  filteredCount: number,
  hasActiveQuery: boolean,
): string {
  if (totalCount === 0) {
    return '0 saved references'
  }
  if (!hasActiveQuery) {
    return `${totalCount} saved ${totalCount === 1 ? 'reference' : 'references'}`
  }
  return `Showing ${filteredCount} of ${totalCount} saved ${totalCount === 1 ? 'reference' : 'references'}`
}
