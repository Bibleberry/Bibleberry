/*
 * Bibleberry R06 Connected Experience Prototype — Today (Hub) Views
 * Implements §3.1–§3.4, G01, G02, G08 confirmation placement.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.ViewsToday = (function () {
  var F = window.R06Proto.Fixtures;
  var S = window.R06Proto.State;
  var A = window.R06Proto.Art;

  function renderTodayLanding(state) {
    var currentYm = S.getCurrentYearMonth();
    var currentMonth = F.MONTHS_BY_ID[currentYm];
    var todayCh = S.getTodayChallenge();
    var todayReleased = todayCh && S.isChallengeReleased(todayCh);
    var todayDone = todayReleased && S.isCompleted(todayCh.id);
    var todaySavedPos = todayReleased && !todayDone ? state.savedPositions[todayCh.id] : null;
    var monthProg = S.getMonthProgress(currentYm);
    var previewYm = S.getAdvancePreviewYearMonth();
    var previewMonth = previewYm ? F.MONTHS_BY_ID[previewYm] : null;

    var continuation = S.getTodayContinuation();
    var unannouncedIds = state.announcementsEnabled ? S.getUnannouncedEarnedCardIds() : [];
    var showGuestInvite = S.isGuestInviteEligible();
    var mergeSummary = state.account.lastMergeSummary && !state.account.lastMergeSummary.dismissed
      ? state.account.lastMergeSummary
      : null;

    var latestNews = F.NEWS_ARTICLES[0];

    var html = '<div class="stack-lg" data-view="today-landing">';

    // Header
    html +=
      '<header class="page-header">' +
        '<span class="eyebrow">' + A.esc(F.formatCivilDate(state.simulatedDate)) + '</span>' +
        '<h1 class="page-title">Today</h1>' +
      '</header>';

    // G08 Post-Verified Account Merge Confirmation (shown once only after verified success)
    if (mergeSummary) {
      html +=
        '<section class="surface surface--announcement stack-sm" role="status" aria-live="polite" data-testid="g08-merge-confirmation">' +
          '<div class="row-between">' +
            '<span class="eyebrow">Account Synced (Simulated Verified)</span>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="dismiss-merge-confirmation">Dismiss</button>' +
          '</div>' +
          '<p>Your local reading records (' + A.esc(mergeSummary.preservedCategories.join(', ')) + ') have been safely combined with <strong>' + A.esc(state.account.email) + '</strong>.</p>' +
          (mergeSummary.hadShelfConflict
            ? '<p class="page-subtitle" style="font-size:0.875rem;">Your existing account’s Shelf stayed in place; your earlier guest reading history and earned Scripture Cards remain intact in Library and Collections.</p>'
            : '') +
        '</section>';
    }

    // 1. Primary Current-Teaching Hero (§3.1)
    html += '<section class="hero-teaching" aria-labelledby="today-teaching-heading" data-testid="today-primary-teaching">';
    if (todayReleased) {
      html +=
        '<div class="row-between">' +
          '<span class="eyebrow">Today’s Teaching • ' + A.esc(currentMonth ? currentMonth.heading : '') + '</span>' +
          (todayDone
            ? '<span class="badge badge--done">' + A.icon('check') + ' Completed</span>'
            : todaySavedPos
              ? '<span class="badge badge--progress">In Progress • Screen ' + (todaySavedPos.screenIndex + 1) + ' of ' + todayCh.screens.length + '</span>'
              : '<span class="badge badge--available">Available Today</span>') +
        '</div>' +
        '<div class="stack-xs">' +
          '<h2 id="today-teaching-heading" class="hero-teaching__title">' + A.esc(todayCh.title) + '</h2>' +
          '<p class="hero-teaching__meta">' + A.esc(currentMonth ? currentMonth.theme : '') + ' • ' + A.esc(todayCh.estimatedRead) + '</p>' +
        '</div>' +
        '<div class="row-wrap">' +
          (todayDone
            ? '<button type="button" class="btn btn--primary" data-action="open-challenge" data-challenge-id="' + A.esc(todayCh.id) + '" data-origin="today" data-reread="true" data-testid="today-primary-cta">Read Again</button>'
            : '<button type="button" class="btn btn--primary" data-action="open-challenge" data-challenge-id="' + A.esc(todayCh.id) + '" data-origin="today" data-testid="today-primary-cta">' +
                (todaySavedPos ? 'Resume Today’s Reading' : 'Open Today’s Reading') +
              '</button>') +
        '</div>';
    } else {
      // Neutral unavailable fallback -> Explore This Month (§3.1)
      html +=
        '<span class="eyebrow">Current Teaching</span>' +
        '<div class="stack-xs">' +
          '<h2 id="today-teaching-heading" class="hero-teaching__title">Today’s teaching is not yet available</h2>' +
          '<p class="hero-teaching__meta">No reading is currently released for today. You can explore this month’s available teachings whenever you are ready.</p>' +
        '</div>' +
        '<div class="row-wrap">' +
          '<button type="button" class="btn btn--primary" data-action="open-month" data-year-month="' + A.esc(currentYm) + '" data-testid="today-primary-cta">Explore This Month</button>' +
        '</div>';
    }
    html += '</section>';

    // 2. Single Secondary Historical Continuation immediately beneath primary teaching (§3.2, G01, G02)
    if (continuation) {
      html +=
        '<section class="continue-strip" aria-labelledby="continue-study-heading" data-testid="today-continue-study">' +
          '<div class="row-between">' +
            '<span class="eyebrow">' +
              (continuation.kind === 'rollover-once' ? 'Continue Your Study • Prior Month' : 'Continue Your Study • Active Focus') +
            '</span>' +
            '<span class="badge badge--warm">' + A.esc(continuation.monthHeading) + '</span>' +
          '</div>' +
          '<div class="stack-xs">' +
            '<h3 id="continue-study-heading" class="serif-heading" style="font-size:1.15rem;">' + A.esc(continuation.monthTheme || continuation.challengeTitle) + '</h3>' +
            '<p class="nav-row__desc">' + A.esc(continuation.detail) + '</p>' +
          '</div>' +
          '<div class="row-wrap">';

      if (continuation.kind === 'active-focus-resume') {
        html +=
          '<button type="button" class="btn btn--secondary btn--sm" data-action="open-challenge" data-challenge-id="' + A.esc(continuation.challengeId) + '" data-origin="today" data-testid="continue-study-cta">' +
            A.esc(continuation.ctaLabel) +
          '</button>';
      } else if (continuation.kind === 'rollover-once') {
        html +=
          '<button type="button" class="btn btn--secondary btn--sm" data-action="open-challenge" data-challenge-id="' + A.esc(continuation.challengeId) + '" data-origin="today" data-rollover="true" data-testid="continue-study-cta">' +
            A.esc(continuation.ctaLabel) +
          '</button>';
      } else {
        // active-focus-month or active-focus-completed (G01: Review This Month)
        html +=
          '<button type="button" class="btn btn--secondary btn--sm" data-action="open-month" data-year-month="' + A.esc(continuation.yearMonth) + '" data-testid="continue-study-cta">' +
            A.esc(continuation.ctaLabel) +
          '</button>';
      }
      html += '</div></section>';
    }

    // 3. Separate Compact Current Month Link (§3.1 — never embeds calendar grid on Today)
    if (currentMonth) {
      html +=
        '<section aria-label="Current publication month">' +
          '<button type="button" class="compact-month-link" data-action="open-month" data-year-month="' + A.esc(currentYm) + '" data-testid="today-current-month-link">' +
            '<span class="nav-row__body">' +
              '<span class="eyebrow">Current Month</span>' +
              '<span class="nav-row__title">' + A.esc(currentMonth.heading) + ' — ' + A.esc(currentMonth.theme) + '</span>' +
              '<span class="nav-row__desc">' + monthProg.completed + ' of ' + monthProg.total + ' Challenges completed</span>' +
            '</span>' +
            '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
          '</button>' +
        '</section>';
    }

    // Advance Preview entry when on 28th / Feb 27 (§4.3)
    if (previewMonth) {
      html +=
        '<section class="surface surface--info stack-sm" aria-labelledby="advance-preview-heading" data-testid="today-advance-preview">' +
          '<span class="eyebrow">Advance Preview Available</span>' +
          '<div class="stack-xs">' +
            '<h3 id="advance-preview-heading" class="serif-heading" style="font-size:1.15rem;">' + A.esc(previewMonth.heading) + ': ' + A.esc(previewMonth.theme) + '</h3>' +
            '<p class="nav-row__desc">Preview next month’s theme, introduction, and upcoming Challenge titles. Manuscripts and Monthly Discoveries open when the month begins.</p>' +
          '</div>' +
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--secondary btn--sm" data-action="open-month" data-year-month="' + A.esc(previewYm) + '" data-testid="open-advance-preview-btn">Preview ' + A.esc(previewMonth.heading) + '</button>' +
          '</div>' +
        '</section>';
    }

    // 4. Hub-only Combined Dismissible Inline Earned-Card Announcement (§3.3)
    if (unannouncedIds.length > 0) {
      var countLabel = unannouncedIds.length === 1
        ? '1 newly earned Scripture Card'
        : unannouncedIds.length + ' newly earned Scripture Cards';
      html +=
        '<section class="surface surface--announcement stack-sm" aria-labelledby="hub-announcement-heading" data-testid="hub-card-announcement">' +
          '<div class="row-between">' +
            '<span class="eyebrow">Field Notebook Discovery</span>' +
            '<span class="badge badge--done">New</span>' +
          '</div>' +
          '<div class="stack-xs">' +
            '<h3 id="hub-announcement-heading" class="serif-heading" style="font-size:1.15rem;">You have ' + A.esc(countLabel) + '</h3>' +
            '<p class="nav-row__desc">Your earned Scripture Cards are recorded permanently in your Field Notebook.</p>' +
          '</div>' +
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--primary btn--sm" data-action="open-view-discoveries" data-testid="view-discoveries-btn">View Discoveries</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="dismiss-hub-announcement" data-testid="dismiss-announcement-btn">Dismiss</button>' +
          '</div>' +
        '</section>';
    }

    // 5. Optional Dismissible Guest Account Invitation (Eligible after 3 distinct completions; NEVER alongside Card announcement, §3.4)
    if (showGuestInvite) {
      html +=
        '<section class="surface stack-sm" aria-labelledby="guest-invite-heading" data-testid="today-guest-invite">' +
          '<span class="eyebrow">Optional Account</span>' +
          '<div class="stack-xs">' +
            '<h3 id="guest-invite-heading" class="serif-heading" style="font-size:1.15rem;">Keep your progress across devices?</h3>' +
            '<p class="nav-row__desc">You have finished ' + S.getDistinctCompletedCount() + ' Challenges as a guest. Right now your progress is stored only in this browser. Creating an optional account is never required.</p>' +
          '</div>' +
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--secondary btn--sm" data-action="open-account-merge" data-testid="guest-invite-signin-btn">Create or Sign In (Simulated)</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="dismiss-guest-invite" data-testid="guest-invite-dismiss-btn">Continue as Guest</button>' +
          '</div>' +
        '</section>';
    }

    // 6. Restrained Editorial Ministry News Affordance (§3.4 — same feed as More, no fabricated unread count)
    if (latestNews && state.newsUi.loadState !== 'empty') {
      html +=
        '<section class="stack-xs" aria-labelledby="today-news-heading">' +
          '<h2 id="today-news-heading" class="section-heading">Ministry News</h2>' +
          '<button type="button" class="nav-row" data-action="open-news-article" data-article-id="' + A.esc(latestNews.id) + '" data-from-tab="today">' +
            '<span class="nav-row__body">' +
              '<span class="eyebrow">' + A.esc(latestNews.categoryLabel) + ' • ' + A.esc(F.formatCivilDate(latestNews.publishedOn)) + '</span>' +
              '<span class="nav-row__title">' + A.esc(latestNews.title) + '</span>' +
              '<span class="nav-row__desc">' + A.esc(latestNews.summary) + '</span>' +
            '</span>' +
            '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
          '</button>' +
        '</section>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Focused `View Discoveries` illustrated gallery containing ONLY the specific newly earned Cards
   * referenced by the Today announcement, plus `Browse Full Field Notebook` (§3.3).
   */
  function renderViewDiscoveries(state, view) {
    var cardIds = view.cardIds || [];
    var html = '<div class="stack-lg" data-view="view-discoveries">';

    html +=
      '<div class="back-bar">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to Today</button>' +
      '</div>' +
      '<header class="page-header">' +
        '<span class="eyebrow">Newly Earned Scripture Cards</span>' +
        '<h1 class="page-title">Your New Discoveries</h1>' +
        '<p class="page-subtitle">Tap any Card below to open its full single-scroll view and clear its New marker.</p>' +
      '</header>';

    if (cardIds.length === 0) {
      html +=
        '<section class="surface stack-sm">' +
          '<p>All recent discoveries have been viewed. You can browse your full earned archive in Field Notebook anytime.</p>' +
        '</section>';
    } else {
      html += '<div class="card-grid">';
      cardIds.forEach(function (cardId) {
        var card = F.CARDS_BY_ID[cardId];
        var rec = state.earnedAwards[cardId];
        if (!card || !rec) return;
        html +=
          '<button type="button" class="card-tile" data-action="open-full-card" data-card-id="' + A.esc(card.id) + '" data-testid="discovery-card-' + A.esc(card.id) + '">' +
            '<div class="card-thumb">' + A.renderCardIllustration(card, { compact: true }) + '</div>' +
            (!rec.cardViewed ? '<span class="card-new-tag">New</span>' : '') +
            '<span class="card-tile__title">' + A.esc(card.title) + '</span>' +
            '<span class="card-tile__meta">Earned ' + A.esc(F.formatShortDate(rec.earnedOn)) + '</span>' +
          '</button>';
      });
      html += '</div>';
    }

    html +=
      '<div class="row-wrap">' +
        '<button type="button" class="btn btn--primary" data-action="open-field-notebook-from-anywhere" data-testid="browse-full-notebook-btn">Browse Full Field Notebook</button>' +
      '</div>' +
    '</div>';
    return html;
  }

  return {
    renderTodayLanding: renderTodayLanding,
    renderViewDiscoveries: renderViewDiscoveries
  };
})();
