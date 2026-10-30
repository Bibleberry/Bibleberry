import {defineArrayMember, defineField, defineType} from 'sanity'
import {reviewStatusField} from '../fields'

export const visualCardsBlock = defineType({
  name: 'visualCardsBlock',
  title: 'Visual cards',
  type: 'object',
  fields: [
    defineField({
      name: 'cards',
      title: 'Cards',
      type: 'array',
      of: [defineArrayMember({type: 'visualCard'})],
      validation: Rule => Rule.required().min(1),
    }),
    reviewStatusField(),
  ],
  preview: {
    select: {cards: 'cards', reviewStatus: 'reviewStatus'},
    prepare({cards, reviewStatus}) {
      return {
        title: cards?.map((card: {title?: string}) => card.title).filter(Boolean).join(' · ') || 'Visual cards',
        subtitle: `${cards?.length || 0} cards · ${reviewStatus === 'approved' ? 'Approved' : 'Review required'}`,
      }
    },
  },
})
