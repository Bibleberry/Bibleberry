import type {StructureResolver} from 'sanity/structure'
import {DeterministicMonthOpener} from './components/DeterministicMonthOpener'
import {NOV2_DOCUMENT_ID, NOV2_TEMPLATE_ID, SERIES_DOCUMENT_ID, SERIES_TEMPLATE_ID} from './initialValues/nov2'
import {GENERAL_NEWS_TEMPLATE_ID} from './initialValues/templates'
import {
  listYearMonthKeys,
  MONTH_PLANNING_YEARS,
  resolveDeterministicMonthChild,
  resolveMonthlyPublicationDocumentNode,
  resolvePreviewNewsDocumentNode,
} from './structureHelpers'

export const structure: StructureResolver = S => S.list()
  .id('bibleberry')
  .title('Bibleberry')
  .items([
    S.listItem()
      .id('monthly-publications-workspace')
      .title('Monthly publications')
      .child(
        S.list()
          .id('monthly-publications-menu')
          .title('Monthly publications')
          .items([
            S.listItem()
              .id('existing-monthly-publications')
              .title('Existing monthly publications')
              .child(
                S.documentTypeList('monthlyPublication')
                  .title('Existing monthly publications')
                  .initialValueTemplates([]),
              ),
            S.listItem()
              .id('open-create-custom-month')
              .title('Open or create any month (YYYY-MM)')
              .child(
                S.component(DeterministicMonthOpener)
                  .id('deterministic-month-opener')
                  .title('Open or create any month (YYYY-MM)')
                  .child(childId => resolveDeterministicMonthChild(S, childId)),
              ),
            S.divider(),
            ...MONTH_PLANNING_YEARS.map(year =>
              S.listItem()
                .id(`months-year-${year}`)
                .title(`${year} calendar months`)
                .child(
                  S.list()
                    .id(`months-list-${year}`)
                    .title(`${year} calendar months`)
                    .items(
                      listYearMonthKeys(year).map(yearMonth =>
                        S.listItem()
                          .id(`month-entry-${yearMonth}`)
                          .title(yearMonth)
                          .child(
                            S.list()
                              .id(`month-actions-${yearMonth}`)
                              .title(`Month ${yearMonth}`)
                              .items([
                                S.listItem()
                                  .id(`open-month-${yearMonth}`)
                                  .title(`Monthly publication (month-${yearMonth})`)
                                  .child(resolveMonthlyPublicationDocumentNode(S, yearMonth)),
                                S.listItem()
                                  .id(`open-preview-news-${yearMonth}`)
                                  .title(`Advance preview News (news-preview-${yearMonth})`)
                                  .child(resolvePreviewNewsDocumentNode(S, yearMonth)),
                              ]),
                          ),
                      ),
                    ),
                ),
            ),
          ]),
      ),
    S.documentTypeListItem('challenge').title('Challenges'),
    S.documentTypeListItem('challengeSeries').title('Series'),
    S.listItem()
      .id('ministry-news')
      .title('Ministry news')
      .child(
        S.documentTypeList('newsArticle')
          .title('Ministry news')
          .initialValueTemplates([S.initialValueTemplateItem(GENERAL_NEWS_TEMPLATE_ID)]),
      ),
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
