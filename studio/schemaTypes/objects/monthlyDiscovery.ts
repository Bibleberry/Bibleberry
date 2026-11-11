import {defineArrayMember, defineField, defineType} from 'sanity'
import {CARD_PLACEHOLDER_PATTERN, SLUG_TOKEN_PATTERN} from '../monthlyHelpers'

export const monthlyDiscovery = defineType({
  name: 'monthlyDiscovery',
  title: 'Monthly discovery',
  type: 'object',
  description:
    'Thematic earning rule anchored to qualifying Challenges within the month. Qualifying Challenge references must belong to the active finalized roster (V-DISC-SUBSET). Link a scriptureCard document via card (or keep reservedCardId for legacy synthetic fixtures).',
  fields: [
    defineField({
      name: 'discoverySlug',
      title: 'Discovery slug',
      type: 'string',
      description: 'Immutable lowercase slug token within the month (for example, vineyard-imagery).',
      validation: Rule =>
        Rule.required().regex(SLUG_TOKEN_PATTERN, {
          name: 'lowercase hyphenated discovery slug',
        }),
    }),
    defineField({
      name: 'title',
      title: 'Reader-visible goal title',
      type: 'string',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'qualifyingChallenges',
      title: 'Qualifying Challenges (kept secret on Month Screen)',
      type: 'array',
      description:
        'Must contain at least one Challenge from the active finalized roster. Never exposed to readers before earning.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'challenge'}],
          weak: true,
        }),
      ],
      validation: Rule => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'card',
      title: 'Linked Scripture Card',
      type: 'reference',
      to: [{type: 'scriptureCard'}],
      weak: true,
      description:
        'Optional reference to a monthlyThematic scriptureCard document (card-<slug>). Linking a Card defines the earning target only; it never records reader awards or exposes unearned artwork.',
    }),
    defineField({
      name: 'reservedCardId',
      title: 'Legacy reserved Scripture Card ID',
      type: 'string',
      description:
        'Optional legacy placeholder card ID (card-<slug>) retained for R08A synthetic fixtures. Prefer linking a scriptureCard document in the card field.',
      validation: Rule =>
        Rule.custom(value => {
          if (value === undefined || value === null || value === '') return true
          if (typeof value === 'string' && CARD_PLACEHOLDER_PATTERN.test(value)) return true
          return 'Reserved Card ID must follow the deterministic pattern card-<slug>.'
        }),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      discoverySlug: 'discoverySlug',
      qualifyingChallenges: 'qualifyingChallenges',
      cardRef: 'card._ref',
      reservedCardId: 'reservedCardId',
    },
    prepare({title, discoverySlug, qualifyingChallenges, cardRef, reservedCardId}) {
      const count = qualifyingChallenges?.length || 0
      const cardStatus = cardRef
        ? ` · ${cardRef}`
        : reservedCardId
          ? ` · legacy ${reservedCardId}`
          : ''
      return {
        title: title || discoverySlug || 'Untitled discovery',
        subtitle: `${count} qualifying Challenge${count === 1 ? '' : 's'}${cardStatus}`,
      }
    },
  },
})
