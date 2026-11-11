import {defineArrayMember, defineField, defineType} from 'sanity'
import {CARD_PLACEHOLDER_PATTERN, SLUG_TOKEN_PATTERN} from '../monthlyHelpers'

export const monthlyDiscovery = defineType({
  name: 'monthlyDiscovery',
  title: 'Monthly discovery (Phase 04 prep)',
  type: 'object',
  description:
    'Thematic earning rule anchored to qualifying Challenges within the month. Qualifying Challenge references must belong to the active finalized roster (V-DISC-SUBSET). Complete Scripture Card artwork/asset linking is deferred to Phase 04.',
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
      name: 'reservedCardId',
      title: 'Reserved Scripture Card ID (Phase 04 deferral)',
      type: 'string',
      description:
        'Optional placeholder card ID (card-<slug>). Deliberately deferred until Phase 04 introduces the full scriptureCard schema and artwork fields.',
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
    },
    prepare({title, discoverySlug, qualifyingChallenges}) {
      const count = qualifyingChallenges?.length || 0
      return {
        title: title || discoverySlug || 'Untitled discovery',
        subtitle: `${count} qualifying Challenge${count === 1 ? '' : 's'}`,
      }
    },
  },
})
