/*
 * Bibleberry R06 Connected Experience Prototype — More, Ministry News, Appearance & Account Views
 * Implements §8.1–§8.4, §9.3, G06, G08.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.ViewsMore = (function () {
  var F = window.R06Proto.Fixtures;
  var S = window.R06Proto.State;
  var A = window.R06Proto.Art;

  var NEWS_CATEGORIES = [
    { id: 'all', label: 'All News' },
    { id: 'ministryUpdate', label: 'Ministry Updates' },
    { id: 'announcement', label: 'Announcements' },
    { id: 'monthlyPreview', label: 'Monthly Previews' }
  ];

  function renderMoreLanding(state) {
    var newsState = state.newsUi.loadState;
    var featured = F.NEWS_ARTICLES[0];

    var html = '<div class="stack-lg" data-view="more-landing">';
    html +=
      '<header class="page-header">' +
        '<span class="eyebrow">Ministry &amp; Preferences</span>' +
        '<h1 class="page-title">More</h1>' +
      '</header>';

    // Featured Latest Authorized Editorial Update near top (§8.1)
    html += '<section class="stack-xs" aria-labelledby="more-featured-news-heading" data-testid="more-featured-news">';
    html += '<h2 id="more-featured-news-heading" class="section-heading">Latest Ministry Update</h2>';
    if (newsState === 'loading') {
      html +=
        '<div class="loading-box" role="status" aria-live="polite">' +
          '<strong>Checking for latest ministry news…</strong>' +
          '<div class="skeleton-line" style="width:78%;"></div>' +
        '</div>';
    } else if (newsState === 'error') {
      html +=
        '<div class="surface surface--error stack-sm" role="alert">' +
          '<strong>Ministry News could not be loaded right now</strong>' +
          '<p class="nav-row__desc">Your local reading progress, preferences, and replay tools remain fully available.</p>' +
          '<div><button type="button" class="btn btn--secondary btn--sm" data-action="retry-news-load" data-testid="more-news-retry-btn">Retry</button></div>' +
        '</div>';
    } else if (newsState === 'empty' || !featured) {
      html +=
        '<div class="surface stack-xs">' +
          '<strong>No published ministry updates yet</strong>' +
          '<p class="nav-row__desc">Editorial announcements and monthly previews will appear here when published.</p>' +
        '</div>';
    } else {
      html +=
        '<button type="button" class="surface surface--accent stack-sm" style="width:100%;text-align:left;" data-action="open-news-article" data-article-id="' + A.esc(featured.id) + '" data-from-tab="more" data-testid="more-featured-article-btn">' +
          '<div class="row-between">' +
            '<span class="badge badge--warm">' + A.esc(featured.categoryLabel) + '</span>' +
            '<span class="card-tile__meta">' + A.esc(F.formatCivilDate(featured.publishedOn)) + '</span>' +
          '</div>' +
          '<strong class="serif-heading" style="font-size:1.25rem;">' + A.esc(featured.title) + '</strong>' +
          '<p class="nav-row__desc">' + A.esc(featured.summary) + '</p>' +
          '<span class="eyebrow" style="color:var(--accent-primary);">Read Update →</span>' +
        '</button>';
    }
    html += '</section>';

    // Approved More Navigation List (§8.1)
    html += '<section class="nav-row-list" aria-label="More destinations">';
    html +=
      '<button type="button" class="nav-row" data-action="open-all-news" data-testid="more-view-all-news-btn">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">View All News</span>' +
          '<span class="nav-row__desc">Editorial ministry updates, announcements, and monthly previews.</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>' +
      '<button type="button" class="nav-row" data-action="open-more-sub" data-sub="podcasts">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">Podcasts &amp; Resources</span>' +
          '<span class="nav-row__desc">Optional companion audio episodes and ministry study resources.</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>' +
      '<button type="button" class="nav-row" data-action="open-more-sub" data-sub="about">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">About Bibleberry</span>' +
          '<span class="nav-row__desc">Our teaching-first mission, editorial approach, and privacy commitments.</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>' +
      '<button type="button" class="nav-row" data-action="open-more-sub" data-sub="appearance" data-testid="more-appearance-btn">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">Appearance &amp; Settings</span>' +
          '<span class="nav-row__desc">' + A.esc(S.getSeasonLabel()) + ' • ' + A.esc(state.appearance.contrastMode) + ' mode</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>' +
      '<button type="button" class="nav-row" data-action="open-more-sub" data-sub="account" data-testid="more-account-btn">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">Account &amp; Progress</span>' +
          '<span class="nav-row__desc">' + (state.account.signedIn ? 'Signed in (Simulated) as ' + A.esc(state.account.email) : 'Guest mode (stored locally on this browser)') + '</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>' +
      '<button type="button" class="nav-row" data-action="replay-app-intro" data-testid="more-review-intro-btn">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">Review Introduction</span>' +
          '<span class="nav-row__desc">Replay the 3-screen App Introduction (' + A.esc(state.onboarding.introStatus) + ').</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>' +
      '<button type="button" class="nav-row" data-action="replay-app-tutorial" data-testid="more-app-tutorial-btn">' +
        '<span class="nav-row__body">' +
          '<span class="nav-row__title">App Tutorial</span>' +
          '<span class="nav-row__desc">Replay the brief guided walkthrough across Today, Library, Collections, and More (' + A.esc(state.onboarding.tutorialStatus) + ').</span>' +
        '</span>' +
        '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
      '</button>';
    html += '</section></div>';
    return html;
  }

  /* --------------------------------------------------------------------------
   * View All News (§8.2)
   * -------------------------------------------------------------------------- */
  function renderNewsList(state) {
    var ui = state.newsUi;
    var filtered = F.NEWS_ARTICLES.filter(function (a) {
      return ui.category === 'all' || a.category === ui.category;
    }).sort(function (a, b) {
      return b.publishedOn.localeCompare(a.publishedOn);
    });

    var html = '<div class="stack-lg" data-view="news-list">';
    html +=
      '<div class="back-bar">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to More</button>' +
      '</div>' +
      '<header class="page-header">' +
        '<span class="eyebrow">Editorial Feed</span>' +
        '<h1 class="page-title">Ministry News</h1>' +
        '<p class="page-subtitle">Published editorial updates, announcements, and monthly previews. Personal Scripture Card discoveries stay separate on Today and in Field Notebook.</p>' +
      '</header>';

    // Category filter bar matching src/components/news/newsModel.ts
    html += '<div class="filter-bar" role="group" aria-label="Filter Ministry News by category">';
    NEWS_CATEGORIES.forEach(function (cat) {
      html +=
        '<button type="button" class="filter-chip" aria-pressed="' + (ui.category === cat.id ? 'true' : 'false') + '" data-action="filter-news-category" data-category="' + A.esc(cat.id) + '" data-testid="news-filter-' + A.esc(cat.id) + '">' +
          A.esc(cat.label) +
        '</button>';
    });
    html += '</div>';

    if (ui.loadState === 'loading') {
      html +=
        '<div class="loading-box" role="status" aria-live="polite" data-testid="news-loading-state">' +
          '<strong>Loading Ministry News…</strong>' +
          '<div class="skeleton-line" style="width:82%;"></div>' +
          '<div class="skeleton-line" style="width:64%;"></div>' +
        '</div>';
    } else if (ui.loadState === 'error') {
      html +=
        '<section class="surface surface--error stack-sm" role="alert" data-testid="news-error-state">' +
          '<strong>Unable to load Ministry News</strong>' +
          '<p class="nav-row__desc">We could not reach the editorial feed right now. Your reading progress and preferences are unaffected.</p>' +
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--primary btn--sm" data-action="retry-news-load" data-testid="news-retry-btn">Retry</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">Back to More</button>' +
          '</div>' +
        '</section>';
    } else if (ui.loadState === 'empty' || filtered.length === 0) {
      html +=
        '<section class="surface stack-sm" data-testid="news-empty-state">' +
          '<strong>No published articles in this category</strong>' +
          '<p class="nav-row__desc">Try selecting All News or check back when new editorial updates are published.</p>' +
          (ui.category !== 'all'
            ? '<div><button type="button" class="btn btn--secondary btn--sm" data-action="filter-news-category" data-category="all">Show All News</button></div>'
            : '') +
        '</section>';
    } else {
      html += '<div class="stack-sm">';
      filtered.forEach(function (article) {
        html +=
          '<button type="button" class="nav-row" data-action="open-news-article" data-article-id="' + A.esc(article.id) + '" data-from-view="news-list" data-testid="news-item-' + A.esc(article.id) + '">' +
            '<span class="nav-row__body">' +
              '<span class="eyebrow">' + A.esc(article.categoryLabel) + ' • ' + A.esc(F.formatCivilDate(article.publishedOn)) + '</span>' +
              '<span class="nav-row__title">' + A.esc(article.title) + '</span>' +
              '<span class="nav-row__desc">' + A.esc(article.summary) + '</span>' +
            '</span>' +
            '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
          '</button>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderNewsDetail(state, view) {
    var article = null;
    for (var i = 0; i < F.NEWS_ARTICLES.length; i++) {
      if (F.NEWS_ARTICLES[i].id === view.articleId) { article = F.NEWS_ARTICLES[i]; break; }
    }
    if (!article) {
      return '<div class="stack-md"><button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back</button><section class="surface"><p>Article unavailable.</p></section></div>';
    }

    var linkHtml = '';
    if (article.authorizedMonthLink) {
      var ym = article.authorizedMonthLink.yearMonth;
      var accessible = ym <= S.getCurrentYearMonth() || S.isAdvancePreviewMonth(ym);
      if (accessible) {
        linkHtml =
          '<div class="surface--subtle stack-xs">' +
            '<span class="eyebrow">Authorized Month Link (' + A.esc(article.authorizedMonthLink.href) + ')</span>' +
            '<div><button type="button" class="btn btn--primary btn--sm" data-action="open-month" data-year-month="' + A.esc(ym) + '">' + A.esc(article.authorizedMonthLink.label) + '</button></div>' +
          '</div>';
      } else {
        linkHtml =
          '<div class="surface--subtle stack-xs">' +
            '<span class="eyebrow">Upcoming Month Preview</span>' +
            '<p class="nav-row__desc">' + A.esc(F.formatYearMonth(ym)) + ' opens for advance preview on the 28th of the preceding month (or February 27). Use the Reviewer Workbench date switcher to test Nov 28 preview.</p>' +
          '</div>';
      }
    }

    return (
      '<div class="stack-lg" data-view="news-detail">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back" data-testid="news-detail-back-btn">' + A.icon('arrowLeft') + ' Back</button>' +
          '<span class="badge badge--warm">' + A.esc(article.categoryLabel) + '</span>' +
        '</div>' +
        '<article class="surface stack-md">' +
          '<header class="stack-xs">' +
            '<span class="eyebrow">' + A.esc(F.formatCivilDate(article.publishedOn)) + '</span>' +
            '<h1 class="page-title" style="font-size:1.55rem;">' + A.esc(article.title) + '</h1>' +
          '</header>' +
          article.body.map(function (p) { return '<p class="reader-prose">' + A.esc(p) + '</p>'; }).join('') +
          linkHtml +
        '</article>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * Appearance & Settings (§8.3)
   * -------------------------------------------------------------------------- */
  function renderAppearanceSettings(state) {
    var ap = state.appearance;
    var manualPalettes = [
      { id: 'palette-linen', name: 'Warm Linen', desc: 'Soft parchment stone and warm earth accent' },
      { id: 'palette-coastal', name: 'Quiet Slate', desc: 'Mist gray surface and calm deep-slate accent' },
      { id: 'palette-cedar', name: 'Cedar & Clay', desc: 'Warm sand paper and muted cedar-plum accent' }
    ];

    return (
      '<div class="stack-lg" data-view="more-appearance">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to More</button>' +
        '</div>' +
        '<header class="page-header">' +
          '<span class="eyebrow">Preferences</span>' +
          '<h1 class="page-title">Appearance &amp; Settings</h1>' +
          '<p class="page-subtitle">Palettes are presentation-only and never alter Challenges, release dates, participation records, or Scripture Card source art.</p>' +
        '</header>' +

        // Palette Mode (§8.3)
        '<section class="surface stack-md" aria-labelledby="palette-mode-heading">' +
          '<h2 id="palette-mode-heading" class="section-heading">Color Palette Mode</h2>' +
          '<div class="stack-sm">' +
            '<label class="radio-option">' +
              '<input type="radio" name="paletteMode" value="seasons"' + (ap.paletteMode === 'seasons' ? ' checked' : '') + ' data-change-action="set-palette-mode" data-testid="palette-mode-seasons" />' +
              '<span><strong>Follow Bibleberry Seasons (Default)</strong><br/><span class="nav-row__desc">Automatically updates with Bibleberry’s seasonal palette (currently ' + A.esc(S.getSeasonLabel()) + ').</span></span>' +
            '</label>' +
            '<label class="radio-option">' +
              '<input type="radio" name="paletteMode" value="manual"' + (ap.paletteMode === 'manual' ? ' checked' : '') + ' data-change-action="set-palette-mode" data-testid="palette-mode-manual" />' +
              '<span><strong>Choose My Colors</strong><br/><span class="nav-row__desc">Keep one palette year-round; seasonal calendar transitions will never overwrite your choice.</span></span>' +
            '</label>' +
          '</div>' +
          '<div class="stack-xs">' +
            '<span class="eyebrow">Manual Palette Choices</span>' +
            '<div class="filter-bar">' +
              manualPalettes.map(function (p) {
                var selected = ap.paletteMode === 'manual' && ap.manualPalette === p.id;
                return '<button type="button" class="filter-chip" aria-pressed="' + (selected ? 'true' : 'false') + '" data-action="select-manual-palette" data-palette-id="' + p.id + '" data-testid="manual-' + p.id + '">' + A.esc(p.name) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</section>' +

        // Separate Light / Dark / System Contrast Mode (§8.3)
        '<section class="surface stack-sm" aria-labelledby="contrast-mode-heading">' +
          '<h2 id="contrast-mode-heading" class="section-heading">Contrast Mode (Separate from Palette)</h2>' +
          '<div class="filter-bar">' +
            ['light', 'dark', 'system'].map(function (c) {
              return '<button type="button" class="filter-chip" aria-pressed="' + (ap.contrastMode === c ? 'true' : 'false') + '" data-action="set-contrast-mode" data-contrast="' + c + '" data-testid="contrast-' + c + '">' + c.charAt(0).toUpperCase() + c.slice(1) + '</button>';
            }).join('') +
          '</div>' +
        '</section>' +

        // Reading Comfort & Earned-Card Announcement Opt-Out (§3.3)
        '<section class="surface stack-md" aria-labelledby="reading-prefs-heading">' +
          '<h2 id="reading-prefs-heading" class="section-heading">Reading Comfort &amp; Announcements</h2>' +
          '<div class="stack-xs">' +
            '<span class="field-label">Text Size</span>' +
            '<div class="filter-bar">' +
              [{ id: 'default', label: 'Default (100%)' }, { id: 'large', label: 'Large (120%)' }, { id: 'xlarge', label: 'Extra Large (150%)' }].map(function (t) {
                return '<button type="button" class="filter-chip" aria-pressed="' + (ap.textScale === t.id ? 'true' : 'false') + '" data-action="set-text-scale" data-scale="' + t.id + '">' + t.label + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<label class="radio-option">' +
            '<input type="checkbox"' + (state.announcementsEnabled ? ' checked' : '') + ' data-change-action="toggle-announcements" data-testid="toggle-announcements-checkbox" />' +
            '<span><strong>Show earned Scripture Card announcements on Today</strong><br/><span class="nav-row__desc">Turning this off hides the inline Today banner only. You still earn Cards and dates normally, and re-enabling displays one combined catch-up notice.</span></span>' +
          '</label>' +
          '<label class="radio-option">' +
            '<input type="checkbox"' + (ap.reducedMotion ? ' checked' : '') + ' data-change-action="toggle-reduced-motion" />' +
            '<span><strong>Reduce interface motion</strong><br/><span class="nav-row__desc">Removes non-essential transitions and spotlight animations.</span></span>' +
          '</label>' +
        '</section>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * Account & Progress (§9.3, G08)
   * -------------------------------------------------------------------------- */
  function renderAccountProgress(state) {
    var distinctCount = S.getDistinctCompletedCount();
    var earnedCount = Object.keys(state.earnedAwards).length;
    var savedCount = state.savedScriptures.length;

    return (
      '<div class="stack-lg" data-view="more-account">' +
        '<div class="back-bar">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to More</button>' +
        '</div>' +
        '<header class="page-header">' +
          '<span class="eyebrow">Optional Continuity</span>' +
          '<h1 class="page-title">Account &amp; Progress</h1>' +
        '</header>' +

        '<section class="surface stack-md" data-testid="account-status-card">' +
          (state.account.signedIn
            ? '<div class="row-between">' +
                '<span class="badge badge--done">Signed In (Simulated Prototype State)</span>' +
                '<span class="card-tile__meta">' + A.esc(state.account.email) + '</span>' +
              '</div>' +
              '<p class="nav-row__desc">This prototype demonstrates the approved G08 guest-to-account UX flow locally. No live Supabase authentication, network requests, or real accounts are created.</p>' +
              '<div class="row-wrap">' +
                '<button type="button" class="btn btn--secondary btn--sm" data-action="sign-out-simulated" data-testid="sign-out-btn">Return to Guest Mode (Simulated)</button>' +
              '</div>'
            : '<div class="row-between">' +
                '<span class="badge badge--warm">Guest Mode • Device-Local Only</span>' +
              '</div>' +
              '<p><strong>Guest participation is real participation, with honest local limits.</strong></p>' +
              '<p class="nav-row__desc">Right now your ' + distinctCount + ' completed Challenges, ' + earnedCount + ' earned Scripture Cards, and ' + savedCount + ' saved passages are stored only in this browser. Clearing browser data or changing devices can erase local guest records.</p>' +
              (state.account.guestInviteDismissed
                ? '<p class="card-tile__meta">You dismissed the automatic Today account invitation; it will not reappear on Today, while this page remains available anytime.</p>'
                : '') +
              '<div class="row-wrap">' +
                '<button type="button" class="btn btn--primary" data-action="open-account-merge" data-testid="more-signin-merge-btn">Create Account or Sign In (Simulated)</button>' +
              '</div>') +
        '</section>' +

        '<section class="surface--subtle stack-xs">' +
          '<span class="eyebrow">Current Local Participation Summary</span>' +
          '<p class="nav-row__desc">Distinct Challenges finished: <strong>' + distinctCount + '</strong> • Earned Scripture Cards: <strong>' + earnedCount + '</strong> • Saved Scripture: <strong>' + savedCount + '</strong> • Shelf months: <strong>' + state.shelf.months.length + ' of 3</strong>.</p>' +
        '</section>' +
      '</div>'
    );
  }

  function renderPodcastsResources() {
    return (
      '<div class="stack-lg" data-view="more-podcasts">' +
        '<div class="back-bar"><button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to More</button></div>' +
        '<header class="page-header"><span class="eyebrow">Optional Companions</span><h1 class="page-title">Podcasts &amp; Resources</h1><p class="page-subtitle">Placeholder editorial resource index for R06 navigation validation.</p></header>' +
        '<section class="surface stack-sm">' +
          '<strong>Synthetic Companion Audio Placeholder</strong>' +
          '<p class="nav-row__desc">In production, optional ministry podcasts and downloadable reading guides are surfaced here without cluttering Today.</p>' +
        '</section>' +
      '</div>'
    );
  }

  function renderAboutBibleberry() {
    return (
      '<div class="stack-lg" data-view="more-about">' +
        '<div class="back-bar"><button type="button" class="btn btn--ghost btn--sm" data-action="nav-back">' + A.icon('arrowLeft') + ' Back to More</button></div>' +
        '<header class="page-header"><span class="eyebrow">Ministry Overview</span><h1 class="page-title">About Bibleberry</h1></header>' +
        '<section class="surface stack-md">' +
          '<p class="reader-prose">Bibleberry is first a continuously publishing Christian teaching ministry and personal biblical formation experience. Substantive daily teaching leads, supported calmly by non-punitive participation records and earned illustrated Scripture Cards.</p>' +
          '<p class="nav-row__desc"><strong>Prototype Boundary Notice:</strong> You are reviewing the isolated Glass Atlas R06 interactive UX prototype using synthetic data. No live CMS, gateway, or account services are connected.</p>' +
        '</section>' +
      '</div>'
    );
  }

  return {
    renderMoreLanding: renderMoreLanding,
    renderNewsList: renderNewsList,
    renderNewsDetail: renderNewsDetail,
    renderAppearanceSettings: renderAppearanceSettings,
    renderAccountProgress: renderAccountProgress,
    renderPodcastsResources: renderPodcastsResources,
    renderAboutBibleberry: renderAboutBibleberry
  };
})();
