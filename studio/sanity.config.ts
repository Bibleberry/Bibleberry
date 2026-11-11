import {
  defineConfig,
  type DocumentPluginOptions,
  type SchemaPluginOptions,
  type Template,
} from 'sanity'
import {structureTool} from 'sanity/structure'
import {
  initialValueTemplates,
  MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
  MONTHLY_PUBLICATION_TEMPLATE_ID,
  SCRIPTURE_CARD_TEMPLATE_ID,
} from './initialValues/templates'
import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

const PROJECT_ID = '80016lrq'

export const filterDeterministicNewDocumentOptions: NonNullable<DocumentPluginOptions['newDocumentOptions']> = prev =>
  prev.filter(
    item =>
      item.templateId !== 'monthlyPublication' &&
      item.templateId !== MONTHLY_PUBLICATION_TEMPLATE_ID &&
      item.templateId !== MONTHLY_PREVIEW_NEWS_TEMPLATE_ID &&
      item.templateId !== 'scriptureCard' &&
      item.templateId !== SCRIPTURE_CARD_TEMPLATE_ID,
  )

// Only the two approved datasets (production and staging) are permitted.
// Workspace definitions configure Studio routes without creating datasets or writing documents.
const sharedPlugins = [structureTool({structure})]
const sharedSchema: SchemaPluginOptions = {
  types: schemaTypes,
  templates: (previous: Template[]) => [...previous, ...(initialValueTemplates as Template[])],
}
const sharedDocument: DocumentPluginOptions = {
  newDocumentOptions: filterDeterministicNewDocumentOptions,
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
    document: sharedDocument,
  },
  {
    name: 'staging',
    title: 'Bibleberry Staging',
    basePath: '/staging',
    projectId: PROJECT_ID,
    dataset: 'staging',
    plugins: sharedPlugins,
    schema: sharedSchema,
    document: sharedDocument,
  },
])
