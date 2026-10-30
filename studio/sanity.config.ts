import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {initialValueTemplates} from './initialValues/templates'
import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

export default defineConfig({
  name: 'bibleberry-production',
  title: 'Bibleberry Studio',
  projectId: '80016lrq',
  dataset: 'production',
  plugins: [structureTool({structure})],
  schema: {
    types: schemaTypes,
    templates: previous => [...previous, ...initialValueTemplates],
  },
})
