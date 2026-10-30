import type { Teaching } from './content'

export type EntryType = 'teaching' | 'guidedDiscipline' | 'worksheet' | 'memorization'

export type DisciplineResource = {
  id: string
  name: string
  introduction: string
  biblicalFoundations: { reference: string; note: string }[]
  teaching: string[]
  practiceGuidance: string[]
  prompts?: string[]
  relatedSessionIds?: string[]
}

export type GuidedDisciplineContent = {
  disciplineId?: string
  disciplineName: string
  purpose: string
  biblicalContext: string
  scriptureReference?: string
  steps: { id: string; title: string; instruction: string }[]
  journalPrompt?: string
  closingPrompt?: string
}

export type WorksheetContent = {
  worksheetTitle: string
  summary: string
  teachingConnection: string
  pdfPath?: string
  pdfFileName?: string
  thumbnailPath?: string
  thumbnailAlt?: string
  prompts: string[]
}

export type MemorizationContent = {
  reference: string
  translation: string
  passage: string
  segments: string[]
  instructions?: string
  sourceUrl?: string
}

type FormationEntryBase = {
  id: string
  challengeId: string
  date: string
  displayDate: string
  title: string
  series: string
  status: 'Development fixture'
}

export type TeachingEntry = Teaching & { entryType: 'teaching' }

export type GuidedDisciplineEntry = FormationEntryBase & {
  entryType: 'guidedDiscipline'
  content: GuidedDisciplineContent
}

export type WorksheetEntry = FormationEntryBase & {
  entryType: 'worksheet'
  content: WorksheetContent
}

export type MemorizationEntry = FormationEntryBase & {
  entryType: 'memorization'
  content: MemorizationContent
}

export type ChallengeEntry = TeachingEntry | GuidedDisciplineEntry | WorksheetEntry | MemorizationEntry

export const WEEKLY_PILOT_CHALLENGE_ID = 'weekly-rhythm-pilot-2026'

export function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function validateMemorizationContent(content: MemorizationContent) {
  return normalizeWhitespace(content.segments.join(' ')) === normalizeWhitespace(content.passage)
}

export function entryTypeLabel(entryType: EntryType) {
  return {
    teaching: 'Biblical teaching',
    guidedDiscipline: 'Guided spiritual discipline',
    worksheet: 'Journal companion',
    memorization: 'Scripture memorization',
  }[entryType]
}
