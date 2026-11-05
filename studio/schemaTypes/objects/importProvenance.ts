import {defineField, defineType, type StringRule} from 'sanity'

type ImportProvenanceValue = {
  lastImportAction?: 'create' | 'update'
  previousSourceSha256?: string
}

const sha256Pattern = /^[0-9a-f]{64}$/
const sha256Validation = (Rule: StringRule) => Rule.regex(sha256Pattern, {
  name: 'lowercase 64-character SHA-256 digest',
})

export const importProvenance = defineType({
  name: 'importProvenance',
  title: 'BerryMark import provenance',
  type: 'object',
  description: 'Non-sensitive technical import lineage only. This is not editorial approval, publication authorization, or a private storage location.',
  fields: [
    defineField({
      name: 'sourceSystem',
      title: 'Source system',
      type: 'string',
      description: 'Controlled source identifier. BerryMark provenance does not imply editorial review.',
      options: {list: [{title: 'BerryMark', value: 'berrymark'}]},
      validation: Rule => Rule.required().custom(value => value === undefined || value === 'berrymark' || 'Source system must be berrymark.'),
    }),
    defineField({
      name: 'compilerContract',
      title: 'Compiler contract',
      type: 'string',
      description: 'Reviewed BerryMark compiler contract/version used for the source-verified candidate.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'compilerMode',
      title: 'Compiler mode',
      type: 'string',
      description: 'Exact compiler mode used to generate the validated candidate.',
      validation: Rule => Rule.required().custom(value => value === undefined || value === 'experimental-pure-sanity-compilation' || 'Unsupported BerryMark compiler mode.'),
    }),
    defineField({
      name: 'canonicalId',
      title: 'Canonical Challenge ID',
      type: 'string',
      description: 'Deterministic canonical identity proposed by the import planner; not a draft or release ID.',
      validation: Rule => Rule.required().regex(/^berrymark-challenge-[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        name: 'deterministic BerryMark Challenge ID',
      }),
    }),
    defineField({
      name: 'sourceFilename',
      title: 'Source filename',
      type: 'string',
      description: 'Non-sensitive logical filename or relative logical path only; never an absolute local path.',
      validation: Rule => Rule.required().custom(value => {
        if (typeof value !== 'string') return true
        if (/^(?:[A-Za-z]:[\\/]|[\\/]|file:)/i.test(value)) {
          return 'Use a non-sensitive logical filename or relative path, not an absolute local path.'
        }
        return true
      }),
    }),
    defineField({
      name: 'sourceSha256',
      title: 'Source SHA-256',
      type: 'string',
      description: 'Digest of the exact source manuscript independently verified by the importer.',
      validation: Rule => sha256Validation(Rule.required()),
    }),
    defineField({
      name: 'sourceRevision',
      title: 'Authored source revision',
      type: 'string',
      description: 'Optional authored revision claim; it is not a Sanity revision or editorial approval.',
    }),
    defineField({
      name: 'candidateSha256',
      title: 'Candidate SHA-256',
      type: 'string',
      description: 'Digest of the validated compiled candidate under the recorded compiler contract. This is distinct from imported-content state.',
      validation: Rule => sha256Validation(Rule.required()),
    }),
    defineField({
      name: 'lastImportedContentSha256',
      title: 'Last imported-content SHA-256',
      type: 'string',
      description: 'Digest of the formally defined importer-owned field set after the last successful import; used to detect later human edits.',
      validation: Rule => sha256Validation(Rule.required()),
    }),
    defineField({
      name: 'lastImportAction',
      title: 'Last import action',
      type: 'string',
      description: 'Last successful draft-write action. A no-op does not create a new import lineage event.',
      options: {list: [
        {title: 'Create', value: 'create'},
        {title: 'Exceptional update', value: 'update'},
      ]},
      validation: Rule => Rule.required().custom(value => value === undefined || value === 'create' || value === 'update' || 'Import action must be create or update.'),
    }),
    defineField({
      name: 'importedBy',
      title: 'Imported by',
      type: 'string',
      description: 'Non-sensitive importer/operator identifier only; not an editorial approver, email address, or credential.',
      validation: Rule => Rule.required().custom(value => {
        if (typeof value === 'string' && /\S+@\S+/.test(value)) {
          return 'Use a non-sensitive system/operator identifier, not an email address.'
        }
        return true
      }),
    }),
    defineField({
      name: 'importedAt',
      title: 'Imported at',
      type: 'datetime',
      description: 'Server-recorded timestamp of the successful import; never a compiler-generated or authored approval time.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'previousSourceSha256',
      title: 'Previous source SHA-256',
      type: 'string',
      description: 'Exact previous manuscript digest required for an exceptional update; omit for initial creation.',
      validation: Rule => sha256Validation(Rule),
    }),
  ],
  validation: Rule => Rule.custom(value => {
    const provenance = value as ImportProvenanceValue | undefined
    if (provenance?.lastImportAction === 'update' && !provenance.previousSourceSha256) {
      return {
        message: 'An exceptional update requires the exact previous source SHA-256.',
        path: ['previousSourceSha256'],
      }
    }
    if (provenance?.lastImportAction === 'create' && provenance.previousSourceSha256) {
      return {
        message: 'Initial creation cannot claim previous-source provenance.',
        path: ['previousSourceSha256'],
      }
    }
    return true
  }),
})
