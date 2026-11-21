/*
 * Bibleberry R06 Connected Experience Prototype — Collections, Field Notebook & Saved Scripture
 * Implements §7.1–§7.4, G07.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.ViewsCollections = (function () {
  var F = window.R06Proto.Fixtures;
  var S = window.R06Proto.State;
  var A = window.R06Proto.Art;

  /* --------------------------------------------------------------------------
   * 1. Collections Landing (§7.1)
   * -------------------------------------------------------------------------- */
  function renderCollectionsLanding(state) {
    var earned = S.getAllEarnedCardsSorted();
    var preview = earned.slice(0, 3);
    var savedCount = state.savedScriptures.length;

    var html = '<div class="stack-lg" data-view="collections-landing">';
    html +=
      '<header class="page-header">' +
        '<span class="eyebrow">Personal Collections</span>' +
        '<h1 class="page-title">Collections</h1>' +
        '<p class="page-subtitle">Your permanent archive of earned Scripture Cards alongside passages you have saved while reading.</p>' +
      '</header>';

    // Small preview of genuinely earned Scripture Cards (NEVER gray silhouettes; NEVER clears New!)
    html += '<section class="surface stack-sm" aria-labelledby="collections-preview-heading" data-testid="collections-earned-preview">';
    html +=
      '<div class="row-between">' +
        '<h2 id="collections-preview-heading" class="section-heading">Recent Earned Scripture Cards</h2>' +
        (earned.length > 0 ? '<span class="eyebrow">' + earned.length + ' earned</span>' : '') +
      '</div>';

    if (preview.length === 0) {
      html +=
        '<div class="stack-xs" data-testid="collections-empty-preview">' +
          '<p><strong>No Scripture Cards earned yet.</strong></p>' +
          '<p class="nav-row__desc">As you finish monthly Challenges and eligible foundational readings, earned Scripture Cards will appear here in your Field Notebook.</p>' +
        '</div>';
    } else {
      html += '<div class="card-grid">';
      preview.forEach(function (item) {
        html +=
          '<button type="button" class="card-tile" data-action="open-full-card" data-card-id="' + A.esc(item.card.id) + '" data-testid="collections-preview-card-' + A.esc(item.card.id) + '">' +
            '<div class="card-thumb">' + A.renderCardIllustration(item.card, { compact: true }) + '</div>' +
            (!item.record.cardViewed ? '<span class="card-new-tag">New</span>' : '') +
            '<span class="card-tile__title">' + A.esc(item.card.title) + '</span>' +
            '<span class="card-tile__meta">' + A.esc(F.formatShortDate(item.record.earnedOn)) + '</span>' +
          '</button>';
      });
      html += '</div>';
    }
    html += '</section>';

    // Two Distinct Entrances: Field Notebook & Saved Scripture (§7.1)
    html +=
      '<section class="nav-row-list" aria-label="Collection destinations">' +
        '<button type="button" class="nav-row" data-action="open-field-notebook" data-testid="open-field-notebook-btn">' +
          '<span class="nav-row__body">' +
            '<span class="row-wrap">' +
              '<span class="nav-row__title">Field Notebook</span>' +
              (state.newDiscoveriesIndicator ? '<span class="badge badge--done" data-testid="new-discoveries-badge">New Discoveries</span>' : '') +
            '</span>' +
            '<span class="nav-row__desc">Lifetime participation status and all ' + earned.length + ' earned Scripture ' + (earned.length === 1 ? 'Card' : 'Cards') + '.</span>' +
          '</span>' +
          '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
        '</button>' +
        '<button type="button" class="nav-row" data-action="open-saved-scripture" data-testid="open-saved-scripture-btn">' +
          '<span class="nav-row__body">' +
            '<span class="nav-row__title">Saved Scripture</span>' +
            '<span class="nav-row__desc">' + (savedCount === 0 ? 'Save passages from anywhere in the app — independent of earning Cards.' : savedCount + ' saved ' + (savedCount === 1 ? 'passage' : 'passages') + ' organized by date and Bible book.') + '</span>' +
          '</span>' +
          '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
        '</button>' +
      '</section>';

    html += '</div>';
    return html;
  }

  /* --------------------------------------------------------------------------
   * 2. Field Notebook Overview (§7.2, G07)
   * -------------------------------------------------------------------------- */
  function renderFieldNotebook(state) {
    var earned = S.getAllEarnedCardsSorted();
    var lifetime = S.getLifetimeStatus();
    var foundationsEarned = S.getEarnedCardsByCategory('foundationsLearning');
    var specialEarned = S.getEarnedCardsByCategory('specialExperience');
    var query = (state.notebookUi.searchQuery || '').trim();
    var qLower = query.toLowerCase();
    var selectedYear = state.notebookUi.selectedYear || 2026;
    var currentYm = S.getCurrentYearMonth();

    var html = '<div class="stack-lg" data-view="field-notebook">';
    html +=
      '<div class="back-bar">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Collections</button>' +
      '</div>' +
      '<header class="page-header">' +
        '<span class="eyebrow">Permanent Earned Archive</span>' +
        '<h1 class="page-title">Field Notebook</h1>' +
      '</header>';

    // 1. Prominent Lifetime Participation Status at top (§7.2 #1 — calm, single evolving status, no next-tier bar or streaks)
    html +=
      '<section class="lifetime-banner" aria-labelledby="lifetime-status-heading" data-testid="lifetime-status-card">' +
        '<span class="eyebrow">Lifetime Participation Status (Provisional Label)</span>' +
        '<h2 id="lifetime-status-heading" class="lifetime-banner__status">' + A.esc(lifetime.label) + '</h2>' +
        '<p class="nav-row__desc">' + lifetime.count + ' distinct ' + (lifetime.count === 1 ? 'Challenge' : 'Challenges') + ' completed • ' + earned.length + ' earned Scripture ' + (earned.length === 1 ? 'Card' : 'Cards') + '.</p>' +
        '<p class="card-tile__meta">' + A.esc(lifetime.note) + '</p>' +
      '</section>';

    // Honest Empty State if 0 earned Cards (§7.2, §10.1 — NO gray silhouettes, NO Foundations/Special entries)
    if (earned.length === 0) {
      html +=
        '<section class="surface stack-sm" data-testid="notebook-empty-state">' +
          '<h2 class="serif-heading" style="font-size:1.25rem;">Your Field Notebook is ready for your first discovery</h2>' +
          '<p class="nav-row__desc">Scripture Cards appear here only after you genuinely earn them by completing qualifying monthly readings or eligible Foundations teaching. There are no locked slots or missed-card placeholders.</p>' +
        '</section>' +
      '</div>';
      return html;
    }

    // 2. Search Your Cards (§7.2 #2 — searches ONLY genuinely earned Cards across title, book, reference, themes)
    html +=
      '<section class="stack-sm" aria-labelledby="search-cards-heading">' +
        '<h2 id="search-cards-heading" class="section-heading">Search Your Cards</h2>' +
        '<div class="search-row">' +
          '<label for="notebook-search-input" class="sr-only">Search your earned Scripture Cards</label>' +
          '<input id="notebook-search-input" class="text-input" type="search" value="' + A.esc(state.notebookUi.searchQuery || '') + '" placeholder="Search by title, Bible book, reference, or theme…" data-input-action="notebook-search" data-testid="notebook-search-input" />' +
          (query ? '<button type="button" class="btn btn--secondary btn--sm" data-action="clear-notebook-search">Clear</button>' : '') +
        '</div>';

    if (query) {
      var matches = earned.filter(function (item) {
        var c = item.card;
        return (
          c.title.toLowerCase().indexOf(qLower) !== -1 ||
          c.scriptureBook.toLowerCase().indexOf(qLower) !== -1 ||
          c.scriptureReference.toLowerCase().indexOf(qLower) !== -1 ||
          c.theologicalThemes.some(function (t) { return t.toLowerCase().indexOf(qLower) !== -1; })
        );
      });
      html += '<div class="stack-xs" aria-live="polite" data-testid="notebook-search-results">';
      html += '<span class="eyebrow">' + matches.length + ' earned ' + (matches.length === 1 ? 'Card' : 'Cards') + ' matched</span>';
      if (matches.length === 0) {
        html +=
          '<div class="surface--subtle">' +
            '<p class="nav-row__desc">No earned Scripture Cards match "' + A.esc(query) + '". Search only looks inside Cards you have already earned.</p>' +
          '</div>';
      } else {
        matches.forEach(function (item) {
          html +=
            '<button type="button" class="card-search-row" data-action="open-full-card" data-card-id="' + A.esc(item.card.id) + '" data-testid="notebook-search-row-' + A.esc(item.card.id) + '">' +
              '<span class="card-thumb card-thumb--mini">' + A.renderCardIllustration(item.card, { compact: true }) + '</span>' +
              '<span class="nav-row__body">' +
                '<span class="row-wrap">' +
                  '<span class="nav-row__title">' + A.esc(item.card.title) + '</span>' +
                  (!item.record.cardViewed ? '<span class="card-new-tag">New</span>' : '') +
                '</span>' +
                '<span class="nav-row__desc">' + A.esc(item.card.scriptureReference) + ' • Earned ' + A.esc(F.formatShortDate(item.record.earnedOn)) + '</span>' +
              '</span>' +
            '</button>';
        });
      }
      html += '</div>';
    }
    html += '</section>';

    // 3. Publication Year -> 12 Months default browse (§7.2 #3)
    html +=
      '<section class="surface stack-md" aria-labelledby="notebook-year-browse-heading" data-testid="notebook-year-browser">' +
        '<div class="row-between">' +
          '<h2 id="notebook-year-browse-heading" class="section-heading">Browse by Publication Month</h2>' +
          '<div class="filter-bar" role="group" aria-label="Select publication year">' +
            [2026, 2025].map(function (yr) {
              return '<button type="button" class="filter-chip" aria-pressed="' + (selectedYear === yr ? 'true' : 'false') + '" data-action="select-notebook-year" data-year="' + yr + '">' + yr + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<p class="card-tile__meta">Monthly Scripture Cards stay filed under their original publication month, even when earned later.</p>' +
        '<div class="month-pills-grid">';

    for (var m = 1; m <= 12; m++) {
      var ym = selectedYear + '-' + (m < 10 ? '0' + m : String(m));
      var monthCards = S.getEarnedCardsForPublicationMonth(ym);
      var isFuture = ym > currentYm;
      if (isFuture) {
        html +=
          '<div class="month-pill-btn month-pill-btn--coming-soon" aria-label="' + A.esc(F.MONTH_NAMES[m - 1] + ' ' + selectedYear + ': Coming Soon') + '">' +
            '<strong>' + A.esc(F.SHORT_MONTHS[m - 1]) + '</strong>' +
            '<span class="card-tile__meta">Coming Soon</span>' +
          '</div>';
      } else if (monthCards.length > 0) {
        html +=
          '<button type="button" class="month-pill-btn month-pill-btn--has-cards" data-action="open-notebook-month" data-year-month="' + A.esc(ym) + '" data-testid="notebook-month-' + A.esc(ym) + '">' +
            '<strong>' + A.esc(F.SHORT_MONTHS[m - 1]) + '</strong>' +
            '<span class="card-tile__meta">' + monthCards.length + ' earned</span>' +
          '</button>';
      } else {
        html +=
          '<button type="button" class="month-pill-btn" data-action="open-notebook-month" data-year-month="' + A.esc(ym) + '" data-testid="notebook-month-' + A.esc(ym) + '">' +
            '<strong>' + A.esc(F.SHORT_MONTHS[m - 1]) + '</strong>' +
            '<span class="card-tile__meta">0 earned</span>' +
          '</button>';
      }
    }
    html += '</div></section>';

    // 4. All Earned Cards + Conditional 5. Foundations & Learning + Conditional 6. Special Experiences (G07)
    html += '<section class="stack-sm" aria-labelledby="notebook-galleries-heading">';
    html += '<h2 id="notebook-galleries-heading" class="section-heading">Earned Galleries</h2>';
    html += '<div class="nav-row-list">';

    // #4 All Earned Cards (always visible when earned.length > 0)
    html +=
      '<button type="button" class="nav-row" data-action="open-all-earned-cards" data-testid="open-all-earned-btn">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">All Earned Cards</span>' +
          '<span class="nav-row__desc">All ' + earned.length + ' earned Scripture Cards across every source, ordered newest earned first.</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>';

    // #5 Conditional Foundations & Learning — ONLY when >= 1 earned (G07)
    if (foundationsEarned.length > 0) {
      html +=
        '<button type="button" class="nav-row" data-action="open-foundations-collection" data-testid="open-foundations-collection-btn">' +
          '<span class="nav-row__body">' +
            '<span class="nav-row__title">Foundations &amp; Learning</span>' +
            '<span class="nav-row__desc">' + foundationsEarned.length + ' earned Scripture ' + (foundationsEarned.length === 1 ? 'Card' : 'Cards') + ' from eligible foundational teaching.</span>' +
          '</span>' +
          '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
        '</button>';
    }

    // #6 Conditional Special Experiences — ONLY when >= 1 earned (G07 — no Special Collections parent!)
    if (specialEarned.length > 0) {
      html +=
        '<button type="button" class="nav-row" data-action="open-special-experiences" data-testid="open-special-experiences-btn">' +
          '<span class="nav-row__body">' +
            '<span class="nav-row__title">Special Experiences</span>' +
            '<span class="nav-row__desc">' + specialEarned.length + ' earned event Scripture ' + (specialEarned.length === 1 ? 'Card' : 'Cards') + ', grouped by originating experience.</span>' +
          '</span>' +
          '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
        '</button>';
    }

    html += '</div></section></div>';
    return html;
  }

  /* --------------------------------------------------------------------------
   * 3. Notebook Sub-Galleries (Monthly, All Earned, Foundations & Learning, Special Experiences)
   * -------------------------------------------------------------------------- */
  function renderCardGridTiles(items) {
    var html = '<div class="card-grid">';
    items.forEach(function (item) {
      html +=
        '<button type="button" class="card-tile" data-action="open-full-card" data-card-id="' + A.esc(item.card.id) + '" data-testid="grid-card-' + A.esc(item.card.id) + '">' +
          '<div class="card-thumb">' + A.renderCardIllustration(item.card, { compact: true }) + '</div>' +
          (!item.record.cardViewed ? '<span class="card-new-tag">New</span>' : '') +
          '<span class="card-tile__title">' + A.esc(item.card.title) + '</span>' +
          '<span class="card-tile__meta">Earned ' + A.esc(F.formatCivilDate(item.record.earnedOn)) + '</span>' +
        '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderNotebookMonthGallery(state, view) {
    var ym = view.yearMonth;
    var items = S.getEarnedCardsForPublicationMonth(ym);
    var month = F.MONTHS_BY_ID[ym];
    return (
      '<div class="stack-lg" data-view="notebook-month-gallery">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Field Notebook</button>' +
        '</div>' +
        '<header class="page-header">' +
          '<span class="eyebrow">Publication Month Gallery</span>' +
          '<h1 class="page-title">' + A.esc(F.formatYearMonth(ym)) + '</h1>' +
          (month ? '<p class="page-subtitle">' + A.esc(month.theme) + '</p>' : '') +
        '</header>' +
        (items.length === 0
          ? '<section class="surface stack-sm"><p>No Scripture Cards have been earned from ' + A.esc(F.formatYearMonth(ym)) + ' yet.</p><p class="nav-row__desc">Only genuinely earned Cards appear here — never locked placeholders.</p></section>'
          : renderCardGridTiles(items)) +
      '</div>'
    );
  }

  function renderAllEarnedCards(state) {
    var items = S.getAllEarnedCardsSorted();
    return (
      '<div class="stack-lg" data-view="all-earned-cards">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Field Notebook</button>' +
        '</div>' +
        '<header class="page-header">' +
          '<span class="eyebrow">Unified Archive • Newest Earned First</span>' +
          '<h1 class="page-title">All Earned Cards</h1>' +
          '<p class="page-subtitle">' + items.length + ' earned Scripture ' + (items.length === 1 ? 'Card' : 'Cards') + ' across Monthly teaching, Foundations &amp; Learning, and Special Experiences.</p>' +
        '</header>' +
        (items.length === 0
          ? '<section class="surface"><p>No earned Scripture Cards yet.</p></section>'
          : renderCardGridTiles(items)) +
      '</div>'
    );
  }

  function renderFoundationsCollection() {
    var items = S.getEarnedCardsByCategory('foundationsLearning');
    return (
      '<div class="stack-lg" data-view="foundations-collection">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Field Notebook</button>' +
        '</div>' +
        '<header class="page-header">' +
          '<span class="eyebrow">Earned-Only Collection (G07)</span>' +
          '<h1 class="page-title">Foundations &amp; Learning</h1>' +
          '<p class="page-subtitle">Permanent Scripture Cards earned from eligible foundational ministry teaching. Separate from the skippable App Tutorial (which never awards Cards).</p>' +
        '</header>' +
        renderCardGridTiles(items) +
      '</div>'
    );
  }

  function renderSpecialExperiencesCollection() {
    var items = S.getEarnedCardsByCategory('specialExperience');
    var groups = {};
    var order = [];
    items.forEach(function (item) {
      var key = item.card.eventId || 'event';
      if (!groups[key]) {
        groups[key] = { title: item.card.eventTitle || 'Special Experience', items: [] };
        order.push(key);
      }
      groups[key].items.push(item);
    });

    var html =
      '<div class="stack-lg" data-view="special-experiences-collection">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Field Notebook</button>' +
        '</div>' +
        '<header class="page-header">' +
          '<span class="eyebrow">Earned-Only Event Archive (G07)</span>' +
          '<h1 class="page-title">Special Experiences</h1>' +
          '<p class="page-subtitle">Grouped by originating experience. Only events where you genuinely earned a Scripture Card appear here.</p>' +
        '</header>';

    order.forEach(function (key) {
      var g = groups[key];
      html +=
        '<section class="stack-sm" data-testid="special-event-group-' + A.esc(key) + '">' +
          '<h2 class="serif-heading" style="font-size:1.25rem;">' + A.esc(g.title) + '</h2>' +
          renderCardGridTiles(g.items) +
        '</section>';
    });

    html += '</div>';
    return html;
  }

  /* --------------------------------------------------------------------------
   * 4. Full Single-Scroll Earned Scripture Card View (§7.3)
   * -------------------------------------------------------------------------- */
  function renderFullCard(state, view) {
    var card = F.CARDS_BY_ID[view.cardId];
    var rec = state.earnedAwards[view.cardId];
    if (!card || !rec) {
      return (
        '<div class="stack-md">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back</button>' +
          '<section class="surface"><p>This Scripture Card is unavailable.</p></section>' +
        '</div>'
      );
    }

    var sourceLabel = card.sourceCategory === 'foundationsLearning'
      ? 'Foundations & Learning'
      : card.sourceCategory === 'specialExperience'
        ? (card.eventTitle || 'Special Experience')
        : (card.publicationYearMonth ? F.formatYearMonth(card.publicationYearMonth) : 'Monthly Teaching');

    return (
      '<div class="stack-md" data-view="full-card" data-card-id="' + A.esc(card.id) + '">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back" data-testid="full-card-back-btn">' + A.icon('arrowLeft') + ' Back</button>' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="open-share-card" data-card-id="' + A.esc(card.id) + '" data-testid="share-card-btn">' +
            A.icon('share') + ' Share Scripture Card' +
          '</button>' +
        '</div>' +
        '<article class="full-card-article">' +
          '<div class="full-card-art">' + A.renderCardIllustration(card) + '</div>' +
          '<div class="full-card-body">' +
            '<div class="row-between">' +
              '<span class="eyebrow">' + A.esc(sourceLabel) + '</span>' +
              '<span class="badge badge--done">Earned ' + A.esc(F.formatCivilDate(rec.earnedOn)) + '</span>' +
            '</div>' +
            '<h1 class="page-title" style="font-size:1.55rem;">' + A.esc(card.title) + '</h1>' +
            '<blockquote class="scripture-quote">' +
              '<p class="scripture-quote__text">' + A.esc(card.scriptureText) + '</p>' +
              '<footer class="scripture-quote__ref">' + A.esc(card.scriptureReference) + '</footer>' +
            '</blockquote>' +
            '<p class="reader-prose">' + A.esc(card.explanation) + '</p>' +
            '<div class="row-wrap">' +
              card.theologicalThemes.map(function (t) {
                return '<span class="badge badge--accent">' + A.esc(t) + '</span>';
              }).join('') +
            '</div>' +
            '<p class="card-tile__meta">Single-scroll earned Card view. Seasonal palettes never alter source Card artwork; Share adds export-time attribution only.</p>' +
          '</div>' +
        '</article>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 5. Saved Scripture (§7.4 — Independent app-wide collection)
   * -------------------------------------------------------------------------- */
  function renderSavedScripture(state) {
    var ui = state.savedScriptureUi;
    var items = state.savedScriptures.slice();
    var query = (ui.searchQuery || '').trim();
    var qLower = query.toLowerCase();

    var books = [];
    var bookSet = {};
    items.forEach(function (it) {
      if (!bookSet[it.book]) {
        bookSet[it.book] = true;
        books.push(it.book);
      }
    });
    books.sort();

    var filtered = items.filter(function (it) {
      if (query) {
        return (
          it.book.toLowerCase().indexOf(qLower) !== -1 ||
          it.reference.toLowerCase().indexOf(qLower) !== -1 ||
          it.text.toLowerCase().indexOf(qLower) !== -1
        );
      }
      if (ui.mode === 'book' && ui.selectedBook) {
        return it.book === ui.selectedBook;
      }
      return true;
    });

    var html = '<div class="stack-lg" data-view="saved-scripture">';
    html +=
      '<div class="back-bar">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Collections</button>' +
      '</div>' +
      '<header class="page-header">' +
        '<span class="eyebrow">Independent Collection</span>' +
        '<h1 class="page-title">Saved Scripture</h1>' +
        '<p class="page-subtitle">Passages you choose to save while reading anywhere in Bibleberry. Separate from Challenge completion and earned Scripture Cards.</p>' +
      '</header>';

    if (items.length === 0) {
      html +=
        '<section class="surface stack-sm" data-testid="saved-scripture-empty">' +
          '<h2 class="serif-heading" style="font-size:1.25rem;">No saved passages yet</h2>' +
          '<p class="nav-row__desc">Tap "Save Scripture" on any passage inside a Challenge to keep it here for calm reflection later — with no memorization quotas or streaks.</p>' +
        '</section></div>';
      return html;
    }

    // Mode switch + Search (§7.4: recently saved first, browse by Bible book, search)
    html +=
      '<div class="stack-sm">' +
        '<div class="filter-bar" role="group" aria-label="Saved Scripture browse mode">' +
          '<button type="button" class="filter-chip" aria-pressed="' + (ui.mode === 'recent' ? 'true' : 'false') + '" data-action="saved-scripture-mode" data-mode="recent">Recently Saved</button>' +
          '<button type="button" class="filter-chip" aria-pressed="' + (ui.mode === 'book' ? 'true' : 'false') + '" data-action="saved-scripture-mode" data-mode="book">Browse by Bible Book</button>' +
        '</div>' +
        '<div class="search-row">' +
          '<label for="saved-scripture-search" class="sr-only">Search saved Scripture</label>' +
          '<input id="saved-scripture-search" class="text-input" type="search" value="' + A.esc(ui.searchQuery || '') + '" placeholder="Search by Bible book or reference…" data-input-action="saved-scripture-search" data-testid="saved-scripture-search" />' +
          (query ? '<button type="button" class="btn btn--secondary btn--sm" data-action="clear-saved-search">Clear</button>' : '') +
        '</div>' +
      '</div>';

    if (ui.mode === 'book' && !query) {
      html += '<div class="filter-bar" aria-label="Filter by Bible book">';
      html += '<button type="button" class="filter-chip" aria-pressed="' + (!ui.selectedBook ? 'true' : 'false') + '" data-action="select-saved-book" data-book="">All Books (' + items.length + ')</button>';
      books.forEach(function (bk) {
        html += '<button type="button" class="filter-chip" aria-pressed="' + (ui.selectedBook === bk ? 'true' : 'false') + '" data-action="select-saved-book" data-book="' + A.esc(bk) + '">' + A.esc(bk) + '</button>';
      });
      html += '</div>';
    }

    if (filtered.length === 0) {
      html +=
        '<section class="surface stack-sm">' +
          '<strong>No saved passages match that filter</strong>' +
          '<p class="nav-row__desc">Try clearing your search or choosing another Bible book.</p>' +
        '</section>';
    } else {
      html += '<div class="stack-sm">';
      filtered.forEach(function (sc) {
        html +=
          '<article class="surface stack-sm" data-testid="saved-passage-' + A.esc(sc.id) + '">' +
            '<div class="row-between">' +
              '<strong>' + A.esc(sc.reference) + '</strong>' +
              '<span class="card-tile__meta">Saved ' + A.esc(F.formatCivilDate(sc.savedOn)) + '</span>' +
            '</div>' +
            '<p class="scripture-quote__text" style="font-size:1rem;">' + A.esc(sc.text) + '</p>' +
            '<div class="row-between">' +
              '<span class="card-tile__meta">' + A.esc(sc.sourceLabel) + '</span>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-action="remove-saved-scripture" data-scripture-id="' + A.esc(sc.id) + '">Remove</button>' +
            '</div>' +
          '</article>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  return {
    renderCollectionsLanding: renderCollectionsLanding,
    renderFieldNotebook: renderFieldNotebook,
    renderNotebookMonthGallery: renderNotebookMonthGallery,
    renderAllEarnedCards: renderAllEarnedCards,
    renderFoundationsCollection: renderFoundationsCollection,
    renderSpecialExperiencesCollection: renderSpecialExperiencesCollection,
    renderFullCard: renderFullCard,
    renderSavedScripture: renderSavedScripture
  };
})();
