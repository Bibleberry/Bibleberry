import { READER_TABS, type ReaderTab } from '../navigation/index.ts'

const readerTabLabels: Record<ReaderTab, string> = {
  today: 'Today',
  library: 'Library',
  collections: 'Collections',
  more: 'More',
}

export function ReaderNavigation({
  activeTab,
  onSelectTab,
}: {
  activeTab: ReaderTab
  onSelectTab: (tab: ReaderTab) => void
}) {
  return (
    <nav className="r06-primary-nav" aria-label="Primary navigation">
      {READER_TABS.map(tab => (
        <button
          key={tab}
          type="button"
          data-tutorial-target={`tab-${tab}`}
          aria-current={tab === activeTab ? 'page' : undefined}
          onClick={() => onSelectTab(tab)}
        >
          {readerTabLabels[tab]}
        </button>
      ))}
    </nav>
  )
}
