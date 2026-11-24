import { useEffect, useState } from 'react'
import { ReplayableOnboarding } from '../../components/onboardingReplay/ReplayableOnboarding.tsx'
import { createPlatformReaderProfileStore } from '../../readerProfile/platformStore.ts'

export function MoreIntroductionReplay({ onBack }: { readonly onBack: () => void }) {
  const [store] = useState(createPlatformReaderProfileStore)
  const [reminderTime, setReminderTime] = useState<string>()

  useEffect(() => {
    let active = true
    void store.load().then(({ profile }) => {
      if (active) setReminderTime(profile.reminder.time)
    })
    return () => { active = false }
  }, [store])

  if (!reminderTime) return <main><p role="status">Opening the introduction…</p></main>

  return (
    <ReplayableOnboarding
      mode="replay"
      origin={{ label: 'More' }}
      initialReminderTime={reminderTime}
      onReturnToOrigin={onBack}
      onSaveReplayReminder={async time => (await store.setReminder({ enabled: true, time })).ok}
    />
  )
}
