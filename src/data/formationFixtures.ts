import { sabbathFixtures } from './sabbathFixtures'
import {
  WEEKLY_PILOT_CHALLENGE_ID,
  validateMemorizationContent,
  type ChallengeEntry,
  type DisciplineResource,
  type GuidedDisciplineEntry,
  type MemorizationEntry,
  type TeachingEntry,
  type WorksheetEntry,
} from './formation'

// Development-only content. None of this fixture copy is Alexis-approved publication material.
export const disciplineResources: DisciplineResource[] = [
  {
    id: 'sabbath-rest',
    name: 'Sabbath & Rest',
    introduction: 'Sabbath and rest practices help us set down constant production and receive time before God with attention and trust.',
    biblicalFoundations: [
      { reference: 'Genesis 2:3', note: 'God blessed the seventh day and made it holy, establishing a pattern of work and rest within creation.' },
      { reference: 'Exodus 16:26–30', note: 'Israel learned to depend on God’s provision rather than gathering manna on the seventh day.' },
      { reference: 'Mark 2:27', note: 'Jesus’ words about Sabbath invite reflection on God’s purpose rather than using rest as another burden.' },
    ],
    teaching: [
      'Biblical rest is not merely recovery from exhaustion or a technique for becoming more productive later. It can be a deliberate act of attention: stopping work, remembering God’s provision, and receiving the limits of a human day.',
      'Christians have understood and practiced Sabbath in different ways. This resource does not prescribe a universal rule for observing Israel’s Sabbath regulations. It offers a modest practice of rest shaped by the biblical themes explored in the weekly teaching.',
    ],
    practiceGuidance: [
      'Choose a realistic period and decide which ordinary work you will set aside.',
      'Care for legitimate responsibilities without waiting for every possible task to be finished.',
      'Include Scripture, prayer, unhurried enjoyment of creation, or quiet time with others.',
      'Notice what makes stopping difficult, and return without treating the practice as a performance.',
    ],
    prompts: ['What do I believe will happen if I stop producing for a little while?', 'What would receiving rest as a gift change about this practice?'],
    relatedSessionIds: ['weekly-pilot-2026-11-04'],
  },
  {
    id: 'prayer',
    name: 'Prayer',
    introduction: 'Prayer is an honest turning toward God: speaking, listening, asking, thanking, confessing, and remaining in his presence.',
    biblicalFoundations: [
      { reference: 'Psalm 62:8', note: 'The psalm invites God’s people to pour out their hearts before him.' },
      { reference: 'Matthew 6:9–13', note: 'Jesus teaches his disciples to pray with worship, dependence, confession, and trust.' },
      { reference: 'Philippians 4:6–7', note: 'Prayer and thanksgiving bring our concerns before God.' },
    ],
    teaching: [
      'Prayer does not require impressive language or a particular emotional state. Scripture makes room for praise, lament, questions, silence, confession, and ordinary requests.',
      'A regular practice can help us become more honest and attentive, but length and frequency are not measures of spiritual worth.',
    ],
    practiceGuidance: [
      'Begin with a simple address to God and an honest sentence about where you are.',
      'Use a psalm or the Lord’s Prayer when your own words feel difficult.',
      'Make room for thanksgiving, confession, intercession, and quiet listening.',
      'Return gently when attention wanders; do not turn distraction into self-condemnation.',
    ],
    prompts: ['What is easiest to say to God right now?', 'What concern or gratitude have I been avoiding naming?'],
  },
  {
    id: 'solitude',
    name: 'Solitude',
    introduction: 'Solitude is a chosen period away from ordinary demands and input, making room to attend to God without performing for others.',
    biblicalFoundations: [
      { reference: 'Mark 1:35', note: 'Jesus went to a solitary place early in the morning to pray.' },
      { reference: 'Luke 5:15–16', note: 'Amid growing demands, Jesus withdrew to lonely places and prayed.' },
      { reference: 'Psalm 46:10', note: 'Stillness and knowing God belong together in the psalm’s call to trust.' },
    ],
    teaching: [
      'Solitude is not isolation from responsibility or a rejection of community. It is a temporary setting-aside of voices and demands so that we can be present before God.',
      'The practice may feel peaceful, restless, or uneventful. Its value does not depend on producing a memorable experience.',
    ],
    practiceGuidance: [
      'Choose a safe, accessible place and a modest period without unnecessary input.',
      'Let another person know where you are if that is appropriate for your circumstances.',
      'Bring a short passage, a simple prayer, or no agenda beyond being present.',
      'Return to ordinary life without judging whether the time felt successful.',
    ],
    prompts: ['Which voices or expectations follow me into quiet?', 'What became noticeable when I stopped responding to input?'],
  },
]

const pilotTeaching = (date: string): TeachingEntry => {
  const source = sabbathFixtures.find(item => item.date === date)
  if (!source) throw new Error(`Missing Sabbath source fixture for ${date}`)
  return {
    ...source,
    id: `weekly-pilot-${date}`,
    challengeId: WEEKLY_PILOT_CHALLENGE_ID,
    entryType: 'teaching',
    series: 'Weekly Rhythm Pilot',
  }
}

export const wednesdayGuidedEntry: GuidedDisciplineEntry = {
  id: 'weekly-pilot-2026-11-04',
  challengeId: WEEKLY_PILOT_CHALLENGE_ID,
  date: '2026-11-04',
  displayDate: 'November 4, 2026',
  title: 'Making Room to Stop',
  series: 'Weekly Rhythm Pilot',
  status: 'Development fixture',
  entryType: 'guidedDiscipline',
  content: {
    disciplineId: 'sabbath-rest',
    disciplineName: 'Sabbath & Rest',
    purpose: 'Practice a small, intentional period of non-production and receive rest as a gift rather than a reward.',
    biblicalContext: 'Genesis presents the seventh day as blessed and set apart. This practice does not attempt to reproduce every Sabbath regulation; it gives you a modest way to reflect on God’s pattern of work, provision, and rest.',
    scriptureReference: 'Genesis 2:3',
    steps: [
      { id: 'prepare', title: 'Prepare a little room', instruction: 'Choose a modest period that fits your real circumstances. Care for anything urgent, then decide which ordinary task you will deliberately set down. You do not need an ideal schedule or a large block of free time.' },
      { id: 'set-down', title: 'Set down the work', instruction: 'Place your task list, devices, or work materials out of reach where possible. Name one thing that remains unfinished, and acknowledge that its presence does not require your immediate attention.' },
      { id: 'receive', title: 'Read and receive', instruction: 'Read Genesis 2:3 slowly. Notice that God blessed the seventh day and made it holy. Let the passage direct your attention toward God rather than toward how well you are resting.' },
      { id: 'rest', title: 'Rest without optimizing', instruction: 'Sit quietly, take an unhurried walk, enjoy something in creation, or remain with a simple prayer. Avoid turning this period into planning, self-improvement, or another task to perform well.' },
      { id: 'return', title: 'Notice and return', instruction: 'When you are ready to return, notice what felt easy or difficult about stopping. Thank God for one thing you received, then rejoin your responsibilities without judging the experience.' },
    ],
    journalPrompt: 'In a physical journal, if you wish: What did you believe might happen if you stopped, and what did you actually notice?',
    closingPrompt: 'A possible closing prayer: “Lord, help me receive my limits and trust your care as I set down my work. Amen.”',
  },
}

export const saturdayWorksheetEntry: WorksheetEntry = {
  id: 'weekly-pilot-2026-11-07',
  challengeId: WEEKLY_PILOT_CHALLENGE_ID,
  date: '2026-11-07',
  displayDate: 'November 7, 2026',
  title: 'A Week of Rest: Journal Companion',
  series: 'Weekly Rhythm Pilot',
  status: 'Development fixture',
  entryType: 'worksheet',
  content: {
    worksheetTitle: 'Noticing Rest, Resistance, and Trust',
    summary: 'A printable page of optional prompts for processing this week’s teaching in your own journal or on the worksheet itself.',
    teachingConnection: 'These questions gather the week’s themes of creation, provision, stopping, and trust. Return to any teaching that stayed with you; there is no need to respond to every prompt.',
    pdfPath: '/worksheets/weekly-rhythm-pilot-journal.pdf',
    pdfFileName: 'Bibleberry-Weekly-Rhythm-Pilot-Journal.pdf',
    thumbnailPath: '/worksheets/weekly-rhythm-pilot-journal.png',
    thumbnailAlt: 'Full-page preview of the Saturday journal worksheet, showing the title and five reflection prompts with writing space.',
    prompts: [
      'Which teaching or passage from this week stayed with you most? Write a few sentences about why.',
      'Where did you notice a tension between constant productivity and the biblical pattern of rest?',
      'What responsibilities, concerns, or expectations made rest difficult this week?',
      'What might faithful rest look like in your present circumstances—not an ideal schedule, but your real life?',
      'Write one simple response you want to carry into next week, and one prayer you want to bring to God.',
    ],
  },
}

export const sundayMemorizationEntry: MemorizationEntry = {
  id: 'weekly-pilot-2026-11-08',
  challengeId: WEEKLY_PILOT_CHALLENGE_ID,
  date: '2026-11-08',
  displayDate: 'November 8, 2026',
  title: 'Remembering the Work of the Word',
  series: 'Weekly Rhythm Pilot',
  status: 'Development fixture',
  entryType: 'memorization',
  content: {
    reference: 'John 1:3',
    translation: 'World English Bible, Protestant Edition (WEBP)',
    passage: 'All things were made through him. Without him, nothing was made that has been made.',
    segments: [
      'All things were made through him.',
      'Without him, nothing was made',
      'that has been made.',
    ],
    instructions: 'Begin with the phrases concealed. Reveal one phrase at a time and read aloud if helpful. Try recalling what comes next before each reveal, or simply use the passage for attentive repetition. Nothing is scored or tracked.',
    sourceUrl: 'https://ebible.org/engwebp/JHN01.htm',
  },
}

export const onePhraseMemorizationEntry: MemorizationEntry = {
  ...sundayMemorizationEntry,
  id: 'weekly-pilot-one-phrase-edge-test',
  title: 'Remembering the Work of the Word',
  content: {
    ...sundayMemorizationEntry.content,
    reference: 'John 1:3a',
    passage: 'All things were made through him.',
    segments: ['All things were made through him.'],
    instructions: 'Begin with the phrase concealed. Reveal it when you are ready, read aloud if helpful, and return to it for attentive repetition. Nothing is scored or tracked.',
  },
}

export const weeklyPilotEntries: ChallengeEntry[] = [
  pilotTeaching('2026-11-02'),
  pilotTeaching('2026-11-03'),
  wednesdayGuidedEntry,
  pilotTeaching('2026-11-05'),
  pilotTeaching('2026-11-06'),
  saturdayWorksheetEntry,
  sundayMemorizationEntry,
]

export const allFormationEntries: ChallengeEntry[] = [...weeklyPilotEntries, onePhraseMemorizationEntry]

for (const entry of [sundayMemorizationEntry, onePhraseMemorizationEntry]) {
  if (!validateMemorizationContent(entry.content)) {
    throw new Error(`Memorization segments do not reproduce the passage for ${entry.id}`)
  }
}
