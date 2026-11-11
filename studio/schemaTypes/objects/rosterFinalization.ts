import {defineArrayMember, defineField, defineType} from 'sanity'

export const rosterFinalization = defineType({
  name: 'rosterFinalization',
  title: 'Roster finalization',
  type: 'object',
  fields: [
    defineField({
      name: 'isFinalized',
      title: 'Roster finalized',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'rosterVersion',
      title: 'Roster version',
      type: 'number',
      description: 'Version 1 on initial launch finalization (requires all calendar slots scheduled). Increment only for exceptional post-finalization amendments.',
      initialValue: 1,
      validation: Rule => Rule.integer().min(1),
    }),
    defineField({
      name: 'finalizedAt',
      title: 'Finalized at',
      type: 'datetime',
    }),
    defineField({
      name: 'finalizedBy',
      title: 'Finalized by',
      type: 'string',
    }),
    defineField({
      name: 'finalizedChallengeIds',
      title: 'Finalized active Challenge IDs',
      type: 'array',
      description: 'Exact canonical base document IDs (without drafts.) of active scheduled slots in this roster version.',
      of: [defineArrayMember({type: 'string'})],
      initialValue: [],
    }),
    defineField({
      name: 'priorRosters',
      title: 'Prior finalized roster audit history',
      type: 'array',
      description: 'Required when rosterVersion >= 2 after an emergency slot amendment.',
      of: [defineArrayMember({type: 'rosterAmendmentRecord'})],
      initialValue: [],
    }),
  ],
})
