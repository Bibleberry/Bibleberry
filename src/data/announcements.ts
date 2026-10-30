export type AnnouncementLink =
  | { label: string; route: string; url?: never }
  | { label: string; url: string; route?: never }

export type Announcement = {
  id: string
  enabled: boolean
  startAt: string // ISO timestamp with an explicit UTC offset.
  endAt: string
  timezone: string // IANA name documents the intended local event timezone.
  title?: string
  body: string
  links: AnnouncementLink[]
}

// Development-only configuration. Edit this file without changing Today layout code.
// Offset-bearing timestamps determine activation; timezone records the editor's intent.
export const announcements: Announcement[] = [
  {
    id: 'sabbath-fixture-review',
    enabled: true,
    startAt: '2026-10-27T00:00:00-04:00',
    endAt: '2026-11-03T00:00:00-05:00',
    timezone: 'America/New_York',
    title: 'A note for this week',
    body: 'Revisit the November 3 Sabbath reading or listen to Realigned.',
    links: [
      { label: 'Open November 3 reading', route: '#/teaching/sabbath-2026-11-03' },
      { label: 'Open Simplecast episode page', url: 'https://realigned.simplecast.com/episodes/what-to-do-when-youre-hurt' },
    ],
  },
]
