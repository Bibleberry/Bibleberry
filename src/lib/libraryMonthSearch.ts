// The approved Month title is the published teaching theme. Keep this allowlist
// common to the release gateway and the reader's response validator.
export const MAX_LIBRARY_QUERY_LENGTH = 80

const monthName = new Intl.DateTimeFormat('en', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
})

export function matchesLibraryMonth(
  item: { year: number; month: number; title: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  const heading = monthName.format(new Date(Date.UTC(item.year, item.month - 1, 15)))
  return heading.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle)
}
