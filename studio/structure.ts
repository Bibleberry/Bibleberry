import type {StructureResolver} from 'sanity/structure'
import {DeterministicCardOpener} from './components/DeterministicCardOpener'
import {DeterministicMonthOpener} from './components/DeterministicMonthOpener'
import {NOV2_DOCUMENT_ID, NOV2_TEMPLATE_ID, SERIES_DOCUMENT_ID, SERIES_TEMPLATE_ID} from './initialValues/nov2'
import {GENERAL_NEWS_TEMPLATE_ID} from './initialValues/templates'
import {
  listYearMonthKeys,
  MONTH_PLANNING_YEARS,
  resolveDeterministicCardChild,
  resolveDeterministicMonthChild,
  resolveMonthlyPublicationDocumentNode,
  resolveMonthlyReadinessNode,
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
            S.listItem()
              .id('inspect-monthly-readiness')
              .title('Inspect monthly readiness (YYYY-MM)')
              .child(resolveMonthlyReadinessNode(S)),
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
                                S.listItem()
                                  .id(`inspect-readiness-${yearMonth}`)
                                  .title(`Editorial readiness report (${yearMonth})`)
                                  .child(resolveMonthlyReadinessNode(S, yearMonth)),
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
      .id('scripture-cards-workspace')
      .title('Scripture Cards')
      .child(
        S.list()
          .id('scripture-cards-menu')
          .title('Scripture Cards')
          .items([
            S.listItem()
              .id('all-scripture-cards')
              .title('All Scripture Cards')
              .child(
                S.documentTypeList('scriptureCard')
                  .title('All Scripture Cards')
                  .initialValueTemplates([]),
              ),
            S.listItem()
              .id('open-create-scripture-card')
              .title('Open or create Scripture Card (card-<slug>)')
              .child(
                S.component(DeterministicCardOpener)
                  .id('deterministic-card-opener')
                  .title('Open or create Scripture Card (card-<slug>)')
                  .child(childId => resolveDeterministicCardChild(S, childId)),
              ),
            S.divider(),
            S.listItem()
              .id('monthly-thematic-cards')
              .title('Monthly thematic Cards')
              .child(
                S.documentList()
                  .id('monthly-thematic-cards-list')
                  .title('Monthly thematic Cards')
                  .schemaType('scriptureCard')
                  .apiVersion('2026-11-01')
                  .filter('_type == "scriptureCard" && cardCategory == "monthlyThematic"')
                  .initialValueTemplates([]),
              ),
            S.listItem()
              .id('monthly-full-cards')
              .title('Monthly full-month Cards')
              .child(
                S.documentList()
                  .id('monthly-full-cards-list')
                  .title('Monthly full-month Cards')
                  .schemaType('scriptureCard')
                  .apiVersion('2026-11-01')
                  .filter('_type == "scriptureCard" && cardCategory == "monthlyFull"')
                  .initialValueTemplates([]),
              ),
            S.listItem()
              .id('other-collection-cards')
              .title('Foundation, tutorial & event Cards')
              .child(
                S.documentList()
                  .id('other-collection-cards-list')
                  .title('Foundation, tutorial & event Cards')
                  .schemaType('scriptureCard')
                  .apiVersion('2026-11-01')
                  .filter('_type == "scriptureCard" && cardCategory in ["foundation", "tutorial", "specialExperience"]')
                  .initialValueTemplates([]),
              ),
          ]),
      ),
    S.listItem()
      .id('ministry-news')
      .title('Ministry news')
      .child(
        S.documentTypeList('newsArticle')
          .title('Ministry news')
          .initialValueTemplates([S.initialValueTemplateItem(GENERAL_NEWS_TEMPLATE_ID)]),
      ),
    S.listItem()
      .id('ministry-resources-workspace')
      .title('Resources')
      .child(
        S.list()
          .id('ministry-resources-menu')
          .title('Resources')
          .items([
            S.documentTypeListItem('resourceSection').title('Resource sections'),
            S.documentTypeListItem('ministryResource').title('Ministry resources'),
            S.divider(),
            S.listItem()
              .id('approved-resource-sections')
              .title('Approved & active sections')
              .child(
                S.documentList()
                  .id('approved-resource-sections-list')
                  .title('Approved & active sections')
                  .schemaType('resourceSection')
                  .apiVersion('2026-11-01')
                  .filter('_type == "resourceSection" && editorialStatus == "approved" && withdrawn != true')
                  .defaultOrdering([{field: 'sortOrder', direction: 'asc'}]),
              ),
            S.listItem()
              .id('approved-ministry-resources')
              .title('Approved & active resources')
              .child(
                S.documentList()
                  .id('approved-ministry-resources-list')
                  .title('Approved & active resources')
                  .schemaType('ministryResource')
                  .apiVersion('2026-11-01')
                  .filter('_type == "ministryResource" && editorialStatus == "approved" && withdrawn != true')
                  .defaultOrdering([{field: 'title', direction: 'asc'}]),
              ),
          ]),
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
