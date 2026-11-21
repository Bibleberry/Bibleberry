/*
 * Bibleberry R06 Connected Experience Prototype — Library, Shelf, Browse All Months & Foundations
 * Implements §6.1–§6.5, G03 visual distinction between Active Focus and Kept on Shelf.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.ViewsLibrary = (function () {
  var F = window.R06Proto.Fixtures;
  var S = window.R06Proto.State;
  var A = window.R06Proto.Art;

  function renderLibraryLanding(state) {
    var shelfCards = S.getOrderedShelfMonths();
    var html = '<div class="stack-lg" data-view="library-landing">';

    html +=
      '<header class="page-header">' +
        '<span class="eyebrow">Historical Study & Foundations</span>' +
        '<h1 class="page-title">Library</h1>' +
        '<p class="page-subtitle">Keep up to three past publication months close at hand on your Shelf, or browse the complete historical Library anytime.</p>' +
      '</header>';

    // Shelf Section (0–3 historical months, §6.1)
    html += '<section class="stack-md" aria-labelledby="shelf-heading" data-testid="library-shelf-section">';
    html +=
      '<div class="row-between">' +
        '<h2 id="shelf-heading" class="section-heading">Your Shelf (' + shelfCards.length + ' of 3)</h2>' +
        (state.shelf.activeFocusMonth
          ? '<button type="button" class="btn btn--ghost btn--sm" data-action="clear-active-focus" data-testid="clear-active-focus-btn">Clear Active Focus</button>'
          : '') +
      '</div>';

    if (shelfCards.length === 0) {
      // Welcoming empty Shelf state (§6.1 — calm, zero behind/missed/catch-up language)
      html +=
        '<div class="surface stack-sm" data-testid="empty-shelf-state">' +
          '<h3 class="serif-heading" style="font-size:1.25rem;">Your Shelf is open and ready</h3>' +
          '<p class="nav-row__desc">Your Shelf is an optional working space for keeping up to three past publication months handy while you study. You can also read any historical month directly from Browse All Months with full credit.</p>' +
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--primary" data-action="open-browse-all-months" data-testid="empty-shelf-browse-btn">Browse All Months</button>' +
          '</div>' +
        '</div>';
    } else {
      shelfCards.forEach(function (entry) {
        var month = F.MONTHS_BY_ID[entry.yearMonth];
        if (!month) return;
        var prog = S.getMonthProgress(entry.yearMonth);
        var pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
        var isFocus = state.shelf.activeFocusMonth === entry.yearMonth;

        html +=
          '<article class="shelf-card' + (isFocus ? ' shelf-card--active' : '') + '" data-testid="shelf-card-' + A.esc(entry.yearMonth) + '">' +
            '<div class="row-between">' +
              '<span class="eyebrow">' + A.esc(month.heading) + '</span>' +
              '<div class="row-wrap">' +
                (isFocus
                  ? '<span class="badge badge--accent" data-testid="badge-active-focus">Active Focus</span>'
                  : '') +
                (entry.protected
                  ? '<span class="badge badge--done" data-testid="badge-kept">Kept on Shelf</span>'
                  : '<span class="badge badge--warm" data-testid="badge-auto">' +
                      (isFocus ? 'Auto-admitted • Focus protected' : 'Auto-admitted') +
                    '</span>') +
              '</div>' +
            '</div>' +
            '<div class="stack-xs">' +
              '<h3 class="serif-heading" style="font-size:1.25rem;">' + A.esc(month.theme) + '</h3>' +
              '<p class="nav-row__desc">' + prog.completed + ' of ' + prog.total + ' Challenges completed</p>' +
              '<div class="progress-meter" aria-hidden="true"><span class="progress-meter__fill" style="width:' + pct + '%;"></span></div>' +
            '</div>' +
            '<div class="shelf-card__actions">' +
              '<button type="button" class="btn btn--primary btn--sm" data-action="open-month" data-year-month="' + A.esc(entry.yearMonth) + '" data-testid="shelf-open-' + A.esc(entry.yearMonth) + '">Open Month</button>' +
              (!isFocus
                ? '<button type="button" class="btn btn--secondary btn--sm" data-action="set-active-focus" data-year-month="' + A.esc(entry.yearMonth) + '" data-testid="shelf-focus-' + A.esc(entry.yearMonth) + '">Set as Active Focus</button>'
                : '<button type="button" class="btn btn--secondary btn--sm" data-action="clear-active-focus" data-testid="shelf-clear-focus-' + A.esc(entry.yearMonth) + '">Clear Focus</button>') +
              (!entry.protected
                ? '<button type="button" class="btn btn--soft btn--sm" data-action="keep-on-shelf" data-year-month="' + A.esc(entry.yearMonth) + '" data-testid="shelf-keep-' + A.esc(entry.yearMonth) + '">Keep on Shelf</button>'
                : '') +
              '<button type="button" class="btn btn--ghost btn--sm" data-action="put-away" data-year-month="' + A.esc(entry.yearMonth) + '" data-testid="shelf-putaway-' + A.esc(entry.yearMonth) + '">Put Away</button>' +
            '</div>' +
          '</article>';
      });
    }
    html += '</section>';

    // Persistent Primary Entrances: Browse All Months & Foundations (§6.1)
    html +=
      '<section class="stack-sm" aria-labelledby="library-explore-heading">' +
        '<h2 id="library-explore-heading" class="section-heading">Explore Library</h2>' +
        '<div class="nav-row-list">' +
          '<button type="button" class="nav-row" data-action="open-browse-all-months" data-testid="library-browse-all-btn">' +
            '<span class="nav-row__body">' +
              '<span class="nav-row__title">Browse All Months</span>' +
              '<span class="nav-row__desc">Complete historical catalogue organized by year, searchable by month or teaching theme.</span>' +
            '</span>' +
            '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
          '</button>' +
          '<button type="button" class="nav-row" data-action="open-foundations" data-testid="library-foundations-btn">' +
            '<span class="nav-row__body">' +
              '<span class="nav-row__title">Foundations</span>' +
              '<span class="nav-row__desc">Optional foundational readings and Scripture study companions at your own pace.</span>' +
            '</span>' +
            '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
          '</button>' +
        '</div>' +
      '</section>';

    html += '</div>';
    return html;
  }

  /**
   * Dedicated Complete Historical Catalogue (`Library → Browse All Months`, §6.4)
   */
  function renderBrowseAllMonths(state) {
    var currentYm = S.getCurrentYearMonth();
    var ui = state.libraryUi;
    var query = (ui.searchQuery || '').trim();
    var qLower = query.toLowerCase();

    var allHistorical = F.MONTHS_LIST.filter(function (m) {
      return m.yearMonth < currentYm;
    }).sort(function (a, b) {
      return b.yearMonth.localeCompare(a.yearMonth);
    });

    var html = '<div class="stack-lg" data-view="browse-all-months">';

    html +=
      '<div class="back-bar">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Library</button>' +
      '</div>' +
      '<header class="page-header">' +
        '<span class="eyebrow">Complete Historical Catalogue</span>' +
        '<h1 class="page-title">Browse All Months</h1>' +
        '<p class="page-subtitle">Every ordinary past publication month remains permanently open with full participation credit — Shelf membership is never required.</p>' +
      '</header>';

    // Month & Authored Theme Search (§6.4)
    html +=
      '<div class="field-wrap">' +
        '<label for="library-search-input" class="field-label">Search by publication month or authored theme</label>' +
        '<div class="search-row">' +
          '<input id="library-search-input" class="text-input" type="search" value="' + A.esc(ui.searchQuery || '') + '" placeholder="e.g., October, Wisdom, Psalms…" data-input-action="library-search" data-testid="library-search-input" />' +
          (query ? '<button type="button" class="btn btn--secondary btn--sm" data-action="clear-library-search">Clear</button>' : '') +
        '</div>' +
      '</div>';

    // Simulated load states (§10.1)
    if (ui.loadState === 'loading') {
      html +=
        '<div class="loading-box" role="status" aria-live="polite">' +
          '<strong>Loading historical publication months…</strong>' +
          '<div class="skeleton-line" style="width:70%;"></div>' +
          '<div class="skeleton-line" style="width:52%;"></div>' +
        '</div>';
    } else if (ui.loadState === 'error') {
      html +=
        '<section class="surface surface--error stack-sm" role="alert">' +
          '<strong>Unable to load additional historical months</strong>' +
          '<p class="nav-row__desc">Your existing Shelf and reading progress are safe. Try loading the catalogue again.</p>' +
          '<div><button type="button" class="btn btn--secondary btn--sm" data-action="retry-library-load">Retry</button></div>' +
        '</section>';
    } else if (ui.loadState === 'empty' || allHistorical.length === 0) {
      html +=
        '<section class="surface stack-sm">' +
          '<strong>No past publication months yet</strong>' +
          '<p class="nav-row__desc">Completed ordinary months will appear here automatically after each month ends.</p>' +
        '</section>';
    } else if (query) {
      // Unified flat newest-first search results across all years (§6.4)
      var matches = allHistorical.filter(function (m) {
        return m.heading.toLowerCase().indexOf(qLower) !== -1 || m.theme.toLowerCase().indexOf(qLower) !== -1;
      });
      html += '<section class="stack-sm" aria-live="polite" data-testid="library-search-results">';
      html += '<span class="section-heading">' + matches.length + ' matching ' + (matches.length === 1 ? 'month' : 'months') + ' (newest first)</span>';
      if (matches.length === 0) {
        html +=
          '<div class="surface stack-sm" data-testid="library-no-results">' +
            '<strong>No matching publication months</strong>' +
            '<p class="nav-row__desc">Try searching by a month name (such as October or 2025) or a published theme word (such as Wisdom or Psalms).</p>' +
            '<div><button type="button" class="btn btn--secondary btn--sm" data-action="clear-library-search">Clear Search</button></div>' +
          '</div>';
      } else {
        html += '<div class="year-section"><div class="catalogue-rows">';
        matches.forEach(function (m) { html += renderCatalogueRow(state, m); });
        html += '</div></div>';
      }
      html += '</section>';
    } else {
      // Expandable chronological years with Load-more pagination (§6.4)
      var visibleMonths = allHistorical.slice(0, ui.visibleCount);
      var byYear = {};
      var years = [];
      visibleMonths.forEach(function (m) {
        var yKey = String(m.year);
        if (!byYear[yKey]) {
          byYear[yKey] = [];
          years.push(yKey);
        }
        byYear[yKey].push(m);
      });

      html += '<div class="stack-sm" data-testid="library-year-groups">';
      years.forEach(function (yKey) {
        var expanded = !!ui.expandedYears[yKey];
        var list = byYear[yKey];
        html +=
          '<section class="year-section">' +
            '<button type="button" class="year-toggle" aria-expanded="' + (expanded ? 'true' : 'false') + '" data-action="toggle-library-year" data-year="' + A.esc(yKey) + '" data-testid="year-toggle-' + A.esc(yKey) + '">' +
              '<span>' + A.esc(yKey) + ' (' + list.length + ' ' + (list.length === 1 ? 'month' : 'months') + ')</span>' +
              '<span>' + (expanded ? 'Hide' : 'Show') + '</span>' +
            '</button>';
        if (expanded) {
          html += '<div class="catalogue-rows">';
          list.forEach(function (m) { html += renderCatalogueRow(state, m); });
          html += '</div>';
        }
        html += '</section>';
      });
      html += '</div>';

      if (ui.visibleCount < allHistorical.length) {
        html +=
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--secondary btn--full" data-action="library-load-more" data-testid="library-load-more-btn">' +
              'Load More Historical Months (' + (allHistorical.length - ui.visibleCount) + ' remaining)' +
            '</button>' +
          '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  function renderCatalogueRow(state, month) {
    var prog = S.getMonthProgress(month.yearMonth);
    var onShelf = !!S.findShelfEntry(month.yearMonth);
    return (
      '<div class="catalogue-row" data-testid="catalogue-row-' + A.esc(month.yearMonth) + '">' +
        '<div class="catalogue-row__main">' +
          '<span class="catalogue-row__month">' + A.esc(month.heading) + '</span>' +
          '<span class="catalogue-row__theme">' + A.esc(month.theme) + '</span>' +
          '<span class="card-tile__meta">' + prog.completed + ' of ' + prog.total + ' completed</span>' +
        '</div>' +
        '<div class="row-wrap">' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="open-month" data-year-month="' + A.esc(month.yearMonth) + '">Open</button>' +
          (onShelf
            ? '<span class="badge badge--done">On Shelf</span>'
            : '<button type="button" class="btn btn--soft btn--sm" data-action="add-to-shelf" data-year-month="' + A.esc(month.yearMonth) + '" data-testid="catalogue-add-' + A.esc(month.yearMonth) + '">Add to Shelf</button>') +
        '</div>' +
      '</div>'
    );
  }

  /**
   * Foundations Overview (§6.5 — Overview first, conditional Resume Reading vs Begin with the First Reading)
   */
  function renderFoundationsOverview(state) {
    // Locate a genuine valid resumable partially read Foundation reading
    var resumable = null;
    F.FOUNDATIONS.forEach(function (f) {
      var pos = state.foundationPositions[f.id];
      if (f.available && pos && !S.isCompleted(f.id)) {
        if (!resumable || (pos.updatedOn || '') > (resumable.updatedOn || '')) {
          resumable = { foundation: f, screenIndex: pos.screenIndex, updatedOn: pos.updatedOn || '' };
        }
      }
    });

    var firstAvailable = F.FOUNDATIONS[0];
    var html = '<div class="stack-lg" data-view="foundations-overview">';

    html +=
      '<div class="back-bar">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Library</button>' +
      '</div>' +
      '<header class="page-header">' +
        '<span class="eyebrow">Optional Foundational Study</span>' +
        '<h1 class="page-title">Foundations</h1>' +
        '<p class="page-subtitle">Calm, optional foundational readings introducing how to read Scripture attentively. Start, pause, or revisit anytime without deadlines.</p>' +
      '</header>';

    // Conditional Primary Action (§6.5)
    html += '<section class="surface surface--accent stack-sm" data-testid="foundations-primary-card">';
    if (resumable) {
      html +=
        '<span class="eyebrow">In Progress</span>' +
        '<h2 class="serif-heading" style="font-size:1.3rem;">' + A.esc(resumable.foundation.title) + '</h2>' +
        '<p class="nav-row__desc">Saved at screen ' + (resumable.screenIndex + 1) + ' of ' + resumable.foundation.screens.length + '.</p>' +
        '<div>' +
          '<button type="button" class="btn btn--primary" data-action="open-foundation" data-foundation-id="' + A.esc(resumable.foundation.id) + '" data-testid="foundations-primary-cta">Resume Reading</button>' +
        '</div>';
    } else {
      html +=
        '<span class="eyebrow">Start Here</span>' +
        '<h2 class="serif-heading" style="font-size:1.3rem;">' + A.esc(firstAvailable.title) + '</h2>' +
        '<p class="nav-row__desc">' + A.esc(firstAvailable.subtitle) + '</p>' +
        '<div>' +
          '<button type="button" class="btn btn--primary" data-action="open-foundation" data-foundation-id="' + A.esc(firstAvailable.id) + '" data-testid="foundations-primary-cta">Begin with the First Reading</button>' +
        '</div>';
    }
    html += '</section>';

    // All Foundations Readings list
    html += '<section class="stack-sm" aria-labelledby="foundations-all-heading">';
    html += '<h2 id="foundations-all-heading" class="section-heading">All Foundations Readings</h2>';
    html += '<div class="nav-row-list">';
    F.FOUNDATIONS.forEach(function (f) {
      var done = S.isCompleted(f.id);
      var pos = !done ? state.foundationPositions[f.id] : null;
      html +=
        '<button type="button" class="nav-row" data-action="open-foundation" data-foundation-id="' + A.esc(f.id) + '" data-testid="foundation-item-' + A.esc(f.id) + '">' +
          '<span class="nav-row__body">' +
            '<span class="row-wrap">' +
              '<span class="nav-row__title">' + A.esc(f.title) + '</span>' +
              (done ? '<span class="badge badge--done">' + A.icon('check') + ' Completed</span>' : '') +
              (pos ? '<span class="badge badge--progress">Screen ' + (pos.screenIndex + 1) + ' of ' + f.screens.length + '</span>' : '') +
              (!f.available ? '<span class="badge badge--locked">Unavailable</span>' : '') +
            '</span>' +
            '<span class="nav-row__desc">' + A.esc(f.subtitle) + '</span>' +
          '</span>' +
          '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
        '</button>';
    });
    html += '</div></section>';

    html += '</div>';
    return html;
  }

  return {
    renderLibraryLanding: renderLibraryLanding,
    renderBrowseAllMonths: renderBrowseAllMonths,
    renderFoundationsOverview: renderFoundationsOverview
  };
})();
