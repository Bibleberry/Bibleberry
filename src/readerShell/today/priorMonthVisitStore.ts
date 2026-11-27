import { parsePublicationYearMonth } from '../../participation/identity.ts'
import type { KeyValueStorageDriver } from '../../participation/persistence.ts'
import type { PublicationYearMonth } from '../../participation/types.ts'

export const PRIOR_MONTH_VISIT_KEY = 'bibleberry-r06-prior-month-visit'

type Disposition = 'presented' | 'closed'
type RunExclusive = (operation: () => Promise<boolean>) => Promise<boolean>

function readVisit(raw: string | null) {
  if (raw === null) return null
  const record = JSON.parse(raw)
  const yearMonth = parsePublicationYearMonth(record?.yearMonth)
  if (record?.version !== 1 || !yearMonth ||
    (record.disposition !== 'presented' && record.disposition !== 'closed')) {
    throw new Error('Invalid prior-month visit marker')
  }
  return yearMonth
}

export function createPriorMonthVisitStore(driver: KeyValueStorageDriver, lock?: RunExclusive) {
  let pending = Promise.resolve(false)

  async function isOpen(yearMonth: PublicationYearMonth): Promise<boolean> {
    const saved = readVisit(await driver.getItem(PRIOR_MONTH_VISIT_KEY))
    return saved === null || saved < yearMonth
  }

  return {
    isOpen,
    settle(yearMonth: PublicationYearMonth, disposition: Disposition, stillOnVisit: () => boolean) {
      const commit = async () => {
        const raw = driver.getItem(PRIOR_MONTH_VISIT_KEY)
        const saved = readVisit(typeof raw === 'object' && raw !== null ? await raw : raw)
        if ((saved && saved >= yearMonth) || !stillOnVisit()) return false
        const write = driver.setItem(PRIOR_MONTH_VISIT_KEY, JSON.stringify({ version: 1, yearMonth, disposition }))
        if (!write) return true
        await write
        if (stillOnVisit()) return true
        // Native writes are asynchronous. Restore the marker if Today left before it could show the offer.
        const previous = await raw
        if (previous === null) await driver.removeItem(PRIOR_MONTH_VISIT_KEY)
        else await driver.setItem(PRIOR_MONTH_VISIT_KEY, previous)
        return false
      }
      const result = pending.then(() => lock ? lock(commit) : commit())
      pending = result.catch(() => false)
      return result
    },
  }
}
