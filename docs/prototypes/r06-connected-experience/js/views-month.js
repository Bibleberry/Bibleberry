/*
 * Bibleberry R06 Connected Experience Prototype — Month Screen View
 * Implements §4.1–§4.3, G05, §6.2 dual Add to Shelf entry.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.ViewsMonth = (function () {
  var F = window.R06Proto.Fixtures;
  var S = window.R06Proto.State;
  var A = window.R06Proto.Art;

  function renderMonthScreen(state, view) {
    var yearMonth = view.yearMonth;
    var month = F.MONTHS_BY_ID[yearMonth];
    if (!month) {
      return (
        '<div class="stack-md">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back</button>' +
          '<section class="surface"><h1>Month unavailable</h1><p>This publication month could not be found.</p></section>' +
        '</div>'
      );
    }

    var isPreview = S.isAdvancePreviewMonth(yearMonth);
    var isCurrent = yearMonth === S.getCurrentYearMonth();
    var isHistorical = S.isHistoricalMonth(yearMonth);
    var prog = S.getMonthProgress(yearMonth);
    var shelfEntry = S.findShelfEntry(yearMonth);
    var isFocus = state.shelf.activeFocusMonth === yearMonth;
    var pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;

    var html = '<div class="stack-lg" data-view="month-screen" data-year-month="' + A.esc(yearMonth) + '">';

    // Top Back bar
    html +=
      '<div class="back-bar">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back" data-testid="month-back-btn">' + A.icon('arrowLeft') + ' Back</button>' +
        (isPreview
          ? '<span class="badge badge--warm">Advance Preview</span>'
          : isCurrent
            ? '<span class="badge badge--accent">Current Month</span>'
            : '<span class="badge badge--locked">Historical Month</span>') +
      '</div>';

    // Month Header Card (§4.1)
    html +=
      '<section class="month-header-card" aria-labelledby="month-title-heading">' +
        '<div class="stack-xs">' +
          '<span class="eyebrow">' + A.esc(month.heading) + '</span>' +
          '<h1 id="month-title-heading" class="page-title">' + A.esc(month.theme) + '</h1>' +
          '<p class="page-subtitle">' + A.esc(month.summary) + '</p>' +
        '</div>';

    if (isPreview) {
      html +=
        '<div class="surface--subtle stack-xs" data-testid="month-preview-notice">' +
          '<strong>Advance preview mode</strong>' +
          '<p class="nav-row__desc">You can browse upcoming Challenge titles and preview the introduction now. The final Welcome screen, daily manuscripts, and Monthly Discoveries open when ' + A.esc(month.heading) + ' begins.</p>' +
        '</div>';
    } else {
      html +=
        '<div class="stack-xs">' +
          '<div class="row-between">' +
            '<span class="eyebrow">Progress</span>' +
            '<strong data-testid="month-progress-ticker">' + prog.completed + ' of ' + prog.total + ' Challenges completed</strong>' +
          '</div>' +
          '<div class="progress-meter" role="progressbar" aria-valuenow="' + prog.completed + '" aria-valuemin="0" aria-valuemax="' + prog.total + '" aria-label="Completed Challenges in ' + A.esc(month.heading) + '">' +
            '<span class="progress-meter__fill" style="width:' + pct + '%;"></span>' +
          '</div>' +
        '</div>';
    }

    // Persistent Replay Monthly Introduction + Historical Shelf Control (§4.3, §6.2)
    html += '<div class="row-wrap">';
    html +=
      '<button type="button" class="btn btn--secondary btn--sm" data-action="open-month-intro-replay" data-year-month="' + A.esc(yearMonth) + '" data-is-preview="' + (isPreview ? 'true' : 'false') + '" data-testid="replay-month-intro-btn">' +
        (isPreview ? 'Preview Introduction' : 'Read Monthly Introduction') +
      '</button>';

    if (isHistorical) {
      if (shelfEntry) {
        html += '<span class="badge badge--done">' + (isFocus ? 'Active Focus • On Shelf' : (shelfEntry.protected ? 'Kept on Shelf' : 'On Your Shelf')) + '</span>';
      } else {
        html +=
          '<button type="button" class="btn btn--soft btn--sm" data-action="add-to-shelf" data-year-month="' + A.esc(yearMonth) + '" data-testid="month-add-to-shelf-btn">' +
            'Add to Shelf' +
          '</button>';
      }
    }
    html += '</div></section>';

    // Continuously Vertically Scrollable Monday–Sunday Weekly Agenda Panels (§4.1)
    html += '<section class="stack-md" aria-labelledby="weekly-agenda-heading">';
    html +=
      '<div class="row-between">' +
        '<h2 id="weekly-agenda-heading" class="section-heading">Weekly Agenda (Mon – Sun)</h2>' +
        '<span class="eyebrow">' + month.weeks.length + ' weeks • Continuous scroll</span>' +
      '</div>';

    month.weeks.forEach(function (week) {
      var containsToday = week.items.some(function (ch) { return ch.date === state.simulatedDate; });
      html +=
        '<article class="week-panel' + (containsToday ? ' week-panel--current' : '') + '"' +
          (containsToday ? ' id="current-week-anchor" data-current-week="true"' : '') + '>' +
          '<header class="week-panel__header">' +
            '<h3 class="week-panel__title">' + A.esc(week.label) + (containsToday ? ' • Current Week' : '') + '</h3>' +
            '<span class="week-panel__range">' + A.esc(week.rangeLabel) + '</span>' +
          '</header>' +
          '<div class="agenda-list">';

      week.items.forEach(function (ch) {
        var released = !isPreview && S.isChallengeReleased(ch);
        var done = released && S.isCompleted(ch.id);
        var saved = released && !done ? state.savedPositions[ch.id] : null;
        var isToday = ch.date === state.simulatedDate;

        var rowClass = 'agenda-row';
        var statusBadge = '';
        if (!released) {
          rowClass += ' agenda-row--locked';
          statusBadge = '<span class="badge badge--locked">' + A.icon('lock') + ' Coming Soon</span>';
        } else if (done) {
          rowClass += ' agenda-row--completed';
          statusBadge = '<span class="badge badge--done">' + A.icon('check') + ' Completed</span>';
        } else if (saved) {
          rowClass += ' agenda-row--in-progress';
          statusBadge = '<span class="badge badge--progress">In Progress • Screen ' + (saved.screenIndex + 1) + ' of ' + ch.screens.length + '</span>';
        } else {
          rowClass += ' agenda-row--available';
          statusBadge = '<span class="badge badge--available">Available</span>';
        }
        if (isToday) rowClass += ' agenda-row--today';

        var inner =
          '<span class="agenda-date" aria-hidden="true">' +
            '<span class="agenda-date__dow">' + A.esc(ch.weekday) + '</span>' +
            '<span class="agenda-date__num">' + ch.dayNumber + '</span>' +
          '</span>' +
          '<span class="agenda-content">' +
            '<span class="agenda-title">' + A.esc(ch.title) + '</span>' +
            '<span class="agenda-status-line">' +
              statusBadge +
              (isToday ? '<span class="badge badge--accent">Today</span>' : '') +
            '</span>' +
          '</span>' +
          (released ? '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' : '');

        if (released) {
          html +=
            '<button type="button" class="' + rowClass + '" data-action="open-challenge" data-challenge-id="' + A.esc(ch.id) + '" data-origin="month" data-testid="agenda-ch-' + A.esc(ch.date) + '" aria-label="' + A.esc(ch.weekday + ' ' + F.formatShortDate(ch.date) + ': ' + ch.title + ' — ' + (done ? 'Completed' : saved ? 'In Progress' : 'Available')) + '">' +
              inner +
            '</button>';
        } else {
          // Unreleased day: title visible, strictly non-interactive, zero manuscript leakage (§4.1, §9.1)
          html +=
            '<div class="' + rowClass + '" data-testid="agenda-locked-' + A.esc(ch.date) + '" aria-label="' + A.esc(ch.weekday + ' ' + F.formatShortDate(ch.date) + ': ' + ch.title + ' — Coming Soon, not yet released') + '">' +
              inner +
            '</div>';
        }
      });

      html += '</div></article>';
    });
    html += '</section>';

    // Monthly Discoveries below the agenda (§4.2) — WITHHELD completely during Advance Preview (§4.2, §4.3)
    if (!isPreview && (month.discoveries.length > 0 || month.fullMonthDiscovery)) {
      html +=
        '<section class="stack-sm" aria-labelledby="monthly-discoveries-heading" data-testid="monthly-discoveries-section">' +
          '<div class="stack-xs">' +
            '<h2 id="monthly-discoveries-heading" class="section-heading">Monthly Discoveries</h2>' +
            '<p class="nav-row__desc">Goals are visible as you read; each illustrated Scripture Card stays a surprise until earned through explicit Finish.</p>' +
          '</div>' +
          '<div class="discovery-list">';

      month.discoveries.forEach(function (disc) {
        var dp = S.getDiscoveryProgress(month, disc);
        var card = dp.earned ? F.CARDS_BY_ID[disc.cardId] : null;
        html +=
          '<div class="discovery-item' + (dp.earned ? ' discovery-item--earned' : '') + '" data-testid="discovery-row-' + A.esc(disc.id) + '">' +
            '<div class="row-between">' +
              '<strong>' + A.esc(disc.title) + '</strong>' +
              '<span class="eyebrow">' + dp.done + ' of ' + dp.total + (dp.earned ? ' • Earned' : '') + '</span>' +
            '</div>' +
            '<div class="discovery-segments" aria-hidden="true">';
        for (var k = 0; k < dp.total; k++) {
          html += '<span class="discovery-segment' + (k < dp.done ? ' discovery-segment--filled' : '') + '"></span>';
        }
        html += '</div>';

        // Earned ONLY: modest authentic thumbnail opening full earned Card directly (§4.2)
        // Unearned: NO art, NO silhouette, NO teaser, NO qualifying Challenge list!
        if (dp.earned && card) {
          html +=
            '<button type="button" class="discovery-earned-btn" data-action="open-full-card" data-card-id="' + A.esc(card.id) + '" data-testid="month-earned-card-' + A.esc(card.id) + '">' +
              '<span class="card-thumb card-thumb--mini">' + A.renderCardIllustration(card, { compact: true }) + '</span>' +
              '<span class="nav-row__body">' +
                '<span class="nav-row__title">' + A.esc(card.title) + '</span>' +
                '<span class="nav-row__desc">Earned ' + A.esc(F.formatCivilDate(dp.earnedRecord.earnedOn)) + ' • Open full Card</span>' +
              '</span>' +
              (!dp.earnedRecord.cardViewed ? '<span class="card-new-tag">New</span>' : '') +
            '</button>';
        }
        html += '</div>';
      });

      // Full-Month Completion Card ALWAYS listed LAST (§4.2)
      if (month.fullMonthDiscovery) {
        var fullEarned = !!state.earnedAwards[month.fullMonthDiscovery.cardId];
        var fullCard = fullEarned ? F.CARDS_BY_ID[month.fullMonthDiscovery.cardId] : null;
        var fullRec = state.earnedAwards[month.fullMonthDiscovery.cardId];
        html +=
          '<div class="discovery-item discovery-item--full' + (fullEarned ? ' discovery-item--earned' : '') + '" data-testid="discovery-full-month">' +
            '<div class="row-between">' +
              '<strong>' + A.esc(month.fullMonthDiscovery.title) + '</strong>' +
              '<span class="eyebrow">' + prog.completed + ' of ' + prog.total + ' Challenges</span>' +
            '</div>' +
            '<div class="progress-meter" aria-hidden="true">' +
              '<span class="progress-meter__fill" style="width:' + pct + '%;"></span>' +
            '</div>' +
            '<p class="nav-row__desc">' +
              (fullEarned
                ? 'Full-month Scripture Card earned.'
                : 'Finish all ' + prog.total + ' Challenges in ' + A.esc(month.heading) + ' to earn this month’s full-month Scripture Card.') +
            '</p>';
        if (fullEarned && fullCard) {
          html +=
            '<button type="button" class="discovery-earned-btn" data-action="open-full-card" data-card-id="' + A.esc(fullCard.id) + '">' +
              '<span class="card-thumb card-thumb--mini">' + A.renderCardIllustration(fullCard, { compact: true }) + '</span>' +
              '<span class="nav-row__body">' +
                '<span class="nav-row__title">' + A.esc(fullCard.title) + '</span>' +
                '<span class="nav-row__desc">Earned ' + A.esc(F.formatCivilDate(fullRec.earnedOn)) + ' • Open full Card</span>' +
              '</span>' +
              (!fullRec.cardViewed ? '<span class="card-new-tag">New</span>' : '') +
            '</button>';
        }
        html += '</div>';
      }

      html += '</div></section>';
    }

    html += '</div>';
    return html;
  }

  return {
    renderMonthScreen: renderMonthScreen
  };
})();
