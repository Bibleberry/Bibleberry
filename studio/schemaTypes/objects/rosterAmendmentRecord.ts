import {defineArrayMember, defineField, defineType} from 'sanity'

export const rosterAmendmentRecord = defineType({
  name: 'rosterAmendmentRecord',
  title: 'Prior finalized roster snapshot',
  type: 'object',
  description: 'Audit record preserved when an exceptional roster amendment increments rosterVersion.',
  fields: [
    defineField({
      name: 'rosterVersion',
      title: 'Superseded roster version',
      type: 'number',
      validation: Rule => Rule.required().integer().min(1),
    }),
    defineField({
      name: 'finalizedChallengeIds',
      title: 'Superseded finalized Challenge IDs',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'supersededAt',
      title: 'Superseded at',
      type: 'datetime',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'reason',
      title: 'Amendment reason',
      type: 'text',
      rows: 2,
      validation: Rule => Rule.required(),
    }),
  ],
  preview: {
    select: {
      rosterVersion: 'rosterVersion',
      supersededAt: 'supersededAt',
      reason: 'reason',
    },
    prepare({rosterVersion, supersededAt, reason}) {
      return {
        title: `Roster v${rosterVersion ?? '?'}`,
        subtitle: `${supersededAt ? `${supersededAt} · ` : ''}${reason || ''}`,
      }
    },
  },
})
