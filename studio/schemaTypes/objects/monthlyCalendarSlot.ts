import {defineField, defineType} from 'sanity'
import {isValidCivilDate} from '../monthlyHelpers'

type MonthlyCalendarSlotValue = {
  dayOfMonth?: unknown
  date?: unknown
  slotStatus?: unknown
  withdrawalReason?: unknown
}

export const monthlyCalendarSlot = defineType({
  name: 'monthlyCalendarSlot',
  title: 'Monthly calendar slot',
  type: 'object',
  fields: [
    defineField({
      name: 'dayOfMonth',
      title: 'Day of month',
      type: 'number',
      validation: Rule => Rule.required().integer().min(1).max(31),
    }),
    defineField({
      name: 'date',
      title: 'Civil publication date (YYYY-MM-DD)',
      type: 'date',
      validation: Rule =>
        Rule.required().custom(value => {
          if (typeof value !== 'string') return 'A valid ISO calendar date (YYYY-MM-DD) is required.'
          if (!isValidCivilDate(value)) {
            return `Invalid civil calendar date "${value}".`
          }
          return true
        }),
    }),
    defineField({
      name: 'slotStatus',
      title: 'Slot status',
      type: 'string',
      options: {
        list: [
          {title: 'Scheduled', value: 'scheduled'},
          {title: 'Withdrawn (emergency revision)', value: 'withdrawn'},
        ],
        layout: 'radio',
      },
      initialValue: 'scheduled',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'challenge',
      title: 'Assigned Challenge',
      type: 'reference',
      to: [{type: 'challenge'}],
      weak: true,
      description:
        'Weak reference allows organizing draft Challenges within a draft month without circular publication locks.',
    }),
    defineField({
      name: 'withdrawalReason',
      title: 'Withdrawal reason',
      type: 'text',
      rows: 2,
      description: 'Required when slotStatus is withdrawn during an exceptional roster amendment.',
    }),
  ],
  validation: Rule =>
    Rule.custom(value => {
      const slot = value as MonthlyCalendarSlotValue | undefined
      if (!slot) return true
      if (typeof slot.date === 'string' && isValidCivilDate(slot.date) && typeof slot.dayOfMonth === 'number') {
        const dateDay = Number(slot.date.slice(8, 10))
        if (dateDay !== slot.dayOfMonth) {
          return {
            message: `Date "${slot.date}" day (${dateDay}) does not match dayOfMonth (${slot.dayOfMonth}).`,
            path: ['date'],
          }
        }
      }
      if (slot.slotStatus === 'withdrawn' && (typeof slot.withdrawalReason !== 'string' || !slot.withdrawalReason.trim())) {
        return {
          message: 'A withdrawal reason is required when a calendar slot is marked withdrawn.',
          path: ['withdrawalReason'],
        }
      }
      return true
    }),
  preview: {
    select: {
      dayOfMonth: 'dayOfMonth',
      date: 'date',
      slotStatus: 'slotStatus',
      challengeTitle: 'challenge.title',
    },
    prepare({dayOfMonth, date, slotStatus, challengeTitle}) {
      const dayLabel = typeof dayOfMonth === 'number' ? `Day ${String(dayOfMonth).padStart(2, '0')}` : 'Day ?'
      const statusText =
        slotStatus === 'withdrawn'
          ? 'WITHDRAWN'
          : challengeTitle || 'Unassigned slot'
      return {
        title: `${dayLabel}${date ? ` · ${date}` : ''}`,
        subtitle: statusText,
      }
    },
  },
})
