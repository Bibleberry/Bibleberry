import {defineConfig, type Template} from 'sanity'
import {structureTool} from 'sanity/structure'
import {initialValueTemplates} from './initialValues/templates'
import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

const PROJECT_ID = '80016lrq'

// Only the two approved datasets (production and staging) are permitted.
// Workspace definitions configure Studio routes without creating datasets or writing documents.
const sharedPlugins = [structureTool({structure})]
const sharedSchema = {
  types: schemaTypes,
  templates: (previous: Template[]) => [...previous, ...initialValueTemplates as Template[]],
}

export default defineConfig([
  {
    name: 'production',
    title: 'Bibleberry Production',
    basePath: '/production',
    projectId: PROJECT_ID,
    dataset: 'production',
    plugins: sharedPlugins,
    schema: sharedSchema,
  },
  {
    name: 'staging',
    title: 'Bibleberry Staging',
    basePath: '/staging',
    projectId: PROJECT_ID,
    dataset: 'staging',
    plugins: sharedPlugins,
    schema: sharedSchema,
  },
])
