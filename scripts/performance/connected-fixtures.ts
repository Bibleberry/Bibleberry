// Synthetic data follows the ordinary Month Screen, Library/Shelf and Hub Continue browser tests.
export const FIXTURE_TIME = '2026-11-19T17:00:00Z';
export const FIXTURE_TIME_ZONE = 'America/New_York';
export const BLOCKED_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Poppins:wght@400;500;600&display=swap';

export const FOCUS_MONTH = '2026-10';
export const HISTORICAL_MONTH = '2026-09';
export const FOCUS_TITLE = 'Synthetic October reader month';
export const HISTORICAL_TITLE = 'Synthetic September reader month';
export const CHALLENGE_TITLE = 'Synthetic long reading';
export const CHALLENGE_SLUG = 'r21-connected-october-day-01';
export const CHALLENGE_PATH = `/api/challenges/${CHALLENGE_SLUG}`;
export const DOCUMENT_ID = 'r21-connected-october-day-01-doc';
export const CHALLENGE_ID = `cms:${DOCUMENT_ID}`;
export const READING_BLOCKS = 32;
export const PARTICIPATION_KEY = 'bibleberry-reader-participation-v1';
export const SHELF_KEY = 'bibleberry-guest-shelf-v1';

const serverContext = { authorizedLocalDate: '2026-11-19', effectiveTimeZone: FIXTURE_TIME_ZONE };
const primaryScripture = {
  reference: 'Psalm 119:105',
  translation: 'WEBP',
  textStatus: 'provided',
  passage: 'Your word is a lamp to my feet, and a light for my path.',
  usageRightsConfirmed: true,
  practiceStatus: 'configured',
};
const catalogEntry = {
  _id: DOCUMENT_ID,
  title: CHALLENGE_TITLE,
  slug: CHALLENGE_SLUG,
  challengeType: 'teaching',
  calendarSlot: {
    monthId: FOCUS_MONTH,
    documentId: `month-${FOCUS_MONTH}`,
    publicationDate: `${FOCUS_MONTH}-01`,
    dayOfMonth: 1,
  },
  primaryScripture,
  editorialEligibility: { adaptationReviewed: true, reviewedAt: '2026-09-30T12:00:00Z' },
};
const statement = 'This generated paragraph exercises the reader layout with several lines of plain text. '
  + 'A longer passage gives the browser enough text to wrap across a narrow screen and leaves room to check '
  + 'whether the same section can be reached again when reading resumes.';
const challenge = {
  ...catalogEntry,
  _type: 'challenge',
  screens: [
    {
      _key: 'opening',
      _type: 'challengeScreen',
      screenLabel: 'Part 1',
      heading: `${CHALLENGE_TITLE} — Opening`,
      blocks: Array.from({ length: READING_BLOCKS }, (_, index) => ({
        _key: `reading-${index + 1}`,
        _type: 'statementBlock',
        text: `Paragraph ${index + 1}. ${statement}`,
      })),
    },
    {
      _key: 'closing',
      _type: 'challengeScreen',
      screenLabel: 'Part 2',
      heading: `${CHALLENGE_TITLE} — Closing`,
      blocks: [{ _key: 'closing-text', _type: 'statementBlock', text: 'Synthetic final screen.' }],
    },
  ],
  companionLinks: [],
};

function monthDetail(yearMonth: string, title: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const slots = Array.from({ length: daysInMonth }, (_, index) => {
    const dayOfMonth = index + 1;
    const date = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`;
    return date === catalogEntry.calendarSlot.publicationDate
      ? {
          dayOfMonth, date, availability: 'available', title: CHALLENGE_TITLE,
          slug: CHALLENGE_SLUG, challengeId: CHALLENGE_ID, challengeType: 'teaching',
        }
      : { dayOfMonth, date, availability: 'unavailable' };
  });
  return {
    monthId: yearMonth,
    documentId: `month-${yearMonth}`,
    year, month, title, daysInMonth,
    phase: 'historical',
    rosterVersion: 1,
    totalChallenges: slots.filter(slot => slot.availability === 'available').length,
    introduction: {
      version: `r21-${yearMonth}`,
      previewScreens: [{
        id: 'overview', stepLabel: 'Overview', title: `Entering ${title}`,
        blocks: [{ _key: 'intro', _type: 'statementBlock', text: 'Synthetic overview.' }],
      }],
      welcomeScreen: {
        id: 'welcome', stepLabel: 'Welcome', title: `Welcome to ${title}`, ctaLabel: 'Begin the Month',
        blocks: [{ _key: 'welcome', _type: 'statementBlock', text: 'Synthetic welcome.' }],
      },
    },
    slots,
    discoveries: [],
  };
}

const months = [
  monthDetail(FOCUS_MONTH, FOCUS_TITLE),
  monthDetail(HISTORICAL_MONTH, HISTORICAL_TITLE),
];

const respond = (payload: object) => () => payload;
const gatewayFixtures = new Map<string, (body: unknown) => object>([
  ['GET /api/challenges', respond({ ok: true, serverContext, challenges: [catalogEntry] })],
  [`GET ${CHALLENGE_PATH}`, respond({ ok: true, serverContext, challenge })],
  ['GET /api/news?category=monthlyPreview', respond({ ok: true, serverContext, articles: [] })],
  ['GET /api/library/months?limit=12', respond({
    ok: true,
    serverContext,
    items: months.map(({ monthId, year, month, title }) => ({ yearMonth: monthId, year, month, title })),
    page: { limit: 12, hasMore: false, nextCursor: null },
  })],
]);

for (const month of months) {
  gatewayFixtures.set(`GET /api/months/${month.monthId}`, respond({ ok: true, serverContext, month }));
  gatewayFixtures.set(`POST /api/months/${month.monthId}/progress`, body => {
    const ids = (body as { completedChallengeIds?: unknown } | null)?.completedChallengeIds;
    if (!Array.isArray(ids) || ids.length !== 0) {
      throw new Error('Expected an empty completed Challenge roster in this scenario');
    }
    return {
      ok: true, serverContext, monthId: month.monthId, rosterVersion: month.rosterVersion,
      completedInMonthCount: 0, totalChallenges: month.totalChallenges,
      thematicEarnedCount: 0, thematicTotalCount: 0, discoveries: [],
    };
  });
}

export const connectedSeed = {
  'bibleberry-prototype-v1': {
    onboarded: true, appearance: 'light', textSize: 'large', reminderEnabled: false,
    reminderTime: '08:00', explored: [], journey: [], lastOpened: null, resumeDismissedDate: '',
  },
  [PARTICIPATION_KEY]: {
    schemaVersion: 1,
    data: {
      completedChallenges: {}, inProgressChallenges: {}, savedChallenges: {}, savedScriptures: [],
      lastOpenedChallenge: null, earnedAwards: {},
    },
  },
  [SHELF_KEY]: {
    schemaVersion: 1,
    state: {
      activeFocusMonth: FOCUS_MONTH,
      months: [{ yearMonth: FOCUS_MONTH, admissionKind: 'readerSelected', isProtected: true }],
    },
  },
};

export function connectedRequest(
  origin: string,
  assets: ReadonlySet<string>,
  request: { url: string; method: string; resourceType: string; body: string | null },
) {
  const url = new URL(request.url);
  if (url.hostname === 'sanity.io' || url.hostname.endsWith('.sanity.io')) {
    throw new Error(`Unauthorized Sanity request to ${url.hostname}`);
  }
  if (url.origin !== origin) {
    if (url.href === BLOCKED_STYLESHEET && request.method === 'GET' && request.resourceType === 'stylesheet') {
      return { kind: 'blockedStylesheet' } as const;
    }
    throw new Error(`Unexpected external request to ${url.origin}`);
  }

  const key = `${request.method} ${url.pathname}${url.search}`;
  if (request.method === 'GET' && !url.search && (url.pathname === '/' || assets.has(url.pathname))) {
    return { kind: 'static' } as const;
  }
  const fixture = gatewayFixtures.get(key);
  if (!fixture) throw new Error(`Missing connected fixture for ${key}`);
  return {
    kind: 'fixture', key, payload: fixture(request.body === null ? null : JSON.parse(request.body)),
  } as const;
}
