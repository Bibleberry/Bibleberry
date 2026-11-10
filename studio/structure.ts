import type {StructureResolver} from 'sanity/structure'
import {NOV2_DOCUMENT_ID, NOV2_TEMPLATE_ID, SERIES_DOCUMENT_ID, SERIES_TEMPLATE_ID} from './initialValues/nov2'

export const structure: StructureResolver = S => S.list()
  .id('bibleberry')
  .title('Bibleberry')
  .items([
    S.documentTypeListItem('monthlyPublication').title('Monthly publications'),
    S.documentTypeListItem('challenge').title('Challenges'),
    S.documentTypeListItem('challengeSeries').title('Series'),
    S.documentTypeListItem('newsArticle').title('Ministry news'),
    S.divider(),
    S.listItem()
      .id('november-2-pilot')
      .title('November 2 pilot setup')
      .child(
        S.list()
          .id('pilot-setup')
          .title('November 2 pilot setup')
          .items([
            S.listItem()
              .id(SERIES_DOCUMENT_ID)
              .title('1 · Gratitude Challenge series')
              .child(
                S.document()
                  .schemaType('challengeSeries')
                  .documentId(SERIES_DOCUMENT_ID)
                  .initialValueTemplate(SERIES_TEMPLATE_ID),
              ),
            S.listItem()
              .id(NOV2_DOCUMENT_ID)
              .title('2 · Rejoice Always draft')
              .child(
                S.document()
                  .schemaType('challenge')
                  .documentId(NOV2_DOCUMENT_ID)
                  .initialValueTemplate(NOV2_TEMPLATE_ID),
              ),
          ]),
      ),
  ])
