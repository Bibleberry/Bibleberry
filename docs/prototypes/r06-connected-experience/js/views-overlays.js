/*
 * Bibleberry R06 Connected Experience Prototype — Focused Overlays, Modals & Reviewer Workbench
 * Implements Challenge Reader (§5), Monthly Intro (G05), App Intro & Guided Tutorial (G06),
 * Shelf Modals (§6.2), Share Preview (§7.3), Account Merge Simulator (G08), and Reviewer Workbench.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.ViewsOverlays = (function () {
  var F = window.R06Proto.Fixtures;
  var S = window.R06Proto.State;
  var A = window.R06Proto.Art;

  /* --------------------------------------------------------------------------
   * 1. Focused Challenge / Foundation Reader (§5.1–§5.3 — Global Nav Hidden)
   * -------------------------------------------------------------------------- */
  function renderChallengeReader(state) {
    var sess = state.activeChallengeSession;
    if (!sess) return '';
    var item = sess.isFoundation
      ? F.FOUNDATIONS_BY_ID[sess.challengeId]
      : F.CHALLENGES_BY_ID[sess.challengeId];
    if (!item) return '';

    var idx = sess.screenIndex;
    var total = item.screens.length;
    var screen = item.screens[idx] || item.screens[0];
    var isFirst = idx === 0;
    var isLast = idx === total - 1;
    var pct = Math.round(((idx + 1) / total) * 100);
    var alreadyDone = S.isCompleted(item.id);

    var html = '<div class="reader-shell" data-view="challenge-reader" data-challenge-id="' + A.esc(item.id) + '" data-swipe-zone="challenge">';

    // Reader Top Header: explicit Exit + textual screen count + subtle progress bar (§5.1)
    html +=
      '<header class="stack-xs">' +
        '<div class="reader-topbar">' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="challenge-exit" data-testid="reader-exit-btn">Exit</button>' +
          '<span class="field-label" data-testid="reader-screen-count">Screen ' + (idx + 1) + ' of ' + total + '</span>' +
        '</div>' +
        '<div class="reader-progress-track" aria-hidden="true">' +
          '<span class="reader-progress-fill" style="width:' + pct + '%;"></span>' +
        '</div>' +
      '</header>';

    // Teaching Card
    html += '<article class="reader-card">';
    html +=
      '<div class="stack-xs">' +
        '<div class="row-between">' +
          '<span class="eyebrow">' +
            (sess.origin === 'external'
              ? 'Direct External Teaching Link • ' + A.esc(F.formatCivilDate(item.date))
              : sess.isFoundation
                ? 'Foundations Reading'
                : A.esc(F.formatYearMonth(item.yearMonth)) + ' • ' + A.esc(F.formatCivilDate(item.date))) +
          '</span>' +
          (alreadyDone ? '<span class="badge badge--done">' + A.icon('check') + ' Previously Completed</span>' : '') +
        '</div>' +
        '<h1 class="page-title" style="font-size:1.5rem;">' + A.esc(item.title) + '</h1>' +
        '<h2 class="serif-heading" style="font-size:1.125rem;color:var(--ink-secondary);">' + A.esc(screen.heading) + '</h2>' +
      '</div>';

    screen.body.forEach(function (para) {
      html += '<p class="reader-prose">' + A.esc(para) + '</p>';
    });

    if (screen.scripture) {
      var saved = S.isScriptureSaved(screen.scripture.id);
      html +=
        '<div class="scripture-quote">' +
          '<p class="scripture-quote__text">' + A.esc(screen.scripture.text) + '</p>' +
          '<div class="row-between">' +
            '<span class="scripture-quote__ref">' + A.esc(screen.scripture.reference) + '</span>' +
            '<button type="button" class="btn ' + (saved ? 'btn--soft' : 'btn--secondary') + ' btn--sm" data-action="toggle-save-scripture" data-scripture-id="' + A.esc(screen.scripture.id) + '" data-challenge-id="' + A.esc(item.id) + '" data-screen-idx="' + idx + '" data-testid="reader-save-scripture-btn">' +
              A.icon('bookmark') + (saved ? ' Saved in Saved Scripture' : ' Save Scripture') +
            '</button>' +
          '</div>' +
        '</div>';
    }

    if (screen.optionalStudy) {
      html +=
        '<details class="optional-details">' +
          '<summary>' + A.esc(screen.optionalStudy.label) + '</summary>' +
          '<p>' + A.esc(screen.optionalStudy.content) + '</p>' +
        '</details>';
    }

    html += '</article>';

    // Visible Previous / Next or Explicit Finish controls (§5.1, §5.2)
    html +=
      '<div class="reader-controls">' +
        '<button type="button" class="btn btn--secondary" data-action="challenge-prev"' + (isFirst ? ' disabled' : '') + ' data-testid="reader-prev-btn">Previous</button>' +
        (isLast
          ? '<button type="button" class="btn btn--primary" data-action="challenge-finish" data-testid="reader-finish-btn">Finish</button>'
          : '<button type="button" class="btn btn--primary" data-action="challenge-next" data-testid="reader-next-btn">Next</button>') +
      '</div>';

    // Distinct discoverable Start from Beginning action (§5.1 — resets reading position only)
    html +=
      '<div class="row-between">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="challenge-start-beginning" data-testid="reader-start-beginning-btn"' + (isFirst ? ' disabled' : '') + '>Start from Beginning</button>' +
        '<span class="card-tile__meta">' +
          (isLast ? 'Explicit Finish records completion.' : 'Reading position saves automatically.') +
        '</span>' +
      '</div>';

    html += '</div>';
    return html;
  }

  /* --------------------------------------------------------------------------
   * 2. External Unavailable Link Fallback (§5.3, §9.1)
   * -------------------------------------------------------------------------- */
  function renderExternalUnavailable() {
    return (
      '<div class="intro-stage" data-view="external-unavailable" data-testid="external-unavailable-view">' +
        '<section class="intro-card">' +
          '<span class="eyebrow">Content Unavailable</span>' +
          '<h1 class="page-title" style="font-size:1.55rem;">This teaching is not currently available</h1>' +
          '<p class="reader-prose">The link you opened cannot be displayed right now. It may not be released yet, may have been withdrawn, or the link may be incomplete.</p>' +
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--primary" data-action="close-external-unavailable" data-testid="external-return-today-btn">Return to Today</button>' +
          '</div>' +
        '</section>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 3. Monthly Introduction / Welcome Overlay (§4.3, G05)
   * -------------------------------------------------------------------------- */
  function renderMonthlyIntro(state) {
    var intro = state.activeMonthIntro;
    if (!intro) return '';
    var month = F.MONTHS_BY_ID[intro.yearMonth];
    if (!month) return '';

    // Preview withholds the final Welcome screen (§4.3)
    var screens = intro.isPreview
      ? month.introScreens.filter(function (s) { return !s.isWelcome; })
      : month.introScreens;
    var idx = Math.min(intro.screenIndex, screens.length - 1);
    var cur = screens[idx];
    var isFirst = idx === 0;
    var isLast = idx === screens.length - 1;

    return (
      '<div class="intro-stage" data-view="month-intro" data-testid="month-intro-overlay">' +
        '<section class="intro-card">' +
          '<div class="row-between">' +
            '<span class="eyebrow">' + A.esc(cur.eyebrow) + '</span>' +
            '<div class="intro-dots" aria-hidden="true">' +
              screens.map(function (_, i) {
                return '<span class="intro-dot' + (i === idx ? ' intro-dot--active' : '') + '"></span>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<h1 class="page-title" style="font-size:1.6rem;">' + A.esc(cur.title) + '</h1>' +
          '<p class="reader-prose">' + A.esc(cur.body) + '</p>' +
          (intro.isPreview
            ? '<p class="card-tile__meta">Advance Preview: the monthly welcome screen and Monthly Discoveries open when ' + A.esc(month.heading) + ' begins.</p>'
            : '') +
          '<div class="row-wrap">' +
            (!isFirst
              ? '<button type="button" class="btn btn--secondary" data-action="month-intro-prev">Back</button>'
              : '') +
            '<button type="button" class="btn btn--primary" data-action="month-intro-next" data-testid="month-intro-next-btn">' +
              (isLast ? (intro.isPreview ? 'Open Advance Preview' : 'Enter ' + A.esc(month.heading)) : 'Continue') +
            '</button>' +
            (intro.canSkipToWelcome && !isLast
              ? '<button type="button" class="btn btn--soft" data-action="month-intro-skip-welcome" data-testid="skip-to-welcome-btn">Skip to Welcome</button>'
              : '') +
            (intro.isReplay || intro.isPreview
              ? '<button type="button" class="btn btn--ghost btn--sm" data-action="month-intro-complete">Close</button>'
              : '') +
          '</div>' +
        '</section>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 4. App Introduction 3-Screen Orientation (G06 — Distinct from App Tutorial & Monthly Intro)
   * -------------------------------------------------------------------------- */
  function renderAppIntro(state) {
    var step = state.onboarding.introStep;
    var ob = state.onboarding;
    var screens = [
      {
        eyebrow: 'WELCOME • Screen 1 of 3',
        title: 'A quiet space for daily Scripture teaching',
        body: 'Bibleberry is a continuously publishing Christian teaching ministry. Read today’s teaching directly, explore past months at your own pace, and keep earned Scripture Cards in your Field Notebook.'
      },
      {
        eyebrow: 'A GENTLE DAILY RHYTHM • Screen 2 of 3',
        title: 'No streaks, no missed-day guilt, no backlog',
        body: 'Every ordinary teaching month stays available in Library permanently. Read when you can, pause mid-reading with automatic resume, and finish when you are ready.'
      },
      {
        eyebrow: 'OPTIONAL DAILY REMINDER • Screen 3 of 3',
        title: 'Choose whether you want a gentle reminder',
        body: 'Daily reminders are completely optional and never required. You can change this preference anytime.'
      }
    ];
    var cur = screens[step] || screens[0];

    var reminderControl = step === 2
      ? '<div class="surface--subtle stack-sm">' +
          '<label class="radio-option">' +
            '<input type="checkbox"' + (ob.reminderEnabled ? ' checked' : '') + ' data-change-action="toggle-intro-reminder" />' +
            '<span><strong>Enable optional daily reminder (Simulated preference)</strong></span>' +
          '</label>' +
          (ob.reminderEnabled
            ? '<div class="field-wrap"><label for="intro-reminder-time" class="field-label">Preferred reminder time</label><input id="intro-reminder-time" class="text-input" type="time" value="' + A.esc(ob.reminderTime) + '" data-change-action="set-intro-reminder-time" /></div>'
            : '') +
        '</div>'
      : '';

    return (
      '<div class="intro-stage" data-view="app-intro" data-testid="app-intro-overlay">' +
        '<section class="intro-card">' +
          '<div class="row-between">' +
            '<span class="eyebrow">' + A.esc(cur.eyebrow) + '</span>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="app-intro-skip" data-testid="app-intro-skip-btn">' +
              (ob.introReplayMode ? 'Close' : 'Skip') +
            '</button>' +
          '</div>' +
          '<div class="intro-dots" aria-hidden="true">' +
            [0, 1, 2].map(function (i) {
              return '<span class="intro-dot' + (i === step ? ' intro-dot--active' : '') + '"></span>';
            }).join('') +
          '</div>' +
          '<h1 class="page-title" style="font-size:1.6rem;">' + A.esc(cur.title) + '</h1>' +
          '<p class="reader-prose">' + A.esc(cur.body) + '</p>' +
          reminderControl +
          '<div class="row-wrap">' +
            (step > 0 ? '<button type="button" class="btn btn--secondary" data-action="app-intro-prev">Back</button>' : '') +
            '<button type="button" class="btn btn--primary" data-action="app-intro-next" data-testid="app-intro-next-btn">' +
              (step === 2 ? (ob.introReplayMode ? 'Done Reviewing' : 'Continue to App') : 'Next') +
            '</button>' +
          '</div>' +
        '</section>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 5. Guided App Tutorial Spotlight Card (G06 — Skippable, Accessible, 0 Awards)
   * -------------------------------------------------------------------------- */
  function renderTutorialOverlay(state) {
    if (!state.onboarding.tutorialActive || state.activeOverlay) return '';
    var stepIdx = state.onboarding.tutorialStep;
    var step = S.TUTORIAL_STEPS[stepIdx] || S.TUTORIAL_STEPS[0];
    var isFirst = stepIdx === 0;
    var isLast = stepIdx === S.TUTORIAL_STEPS.length - 1;

    return (
      '<aside class="tutorial-card" role="dialog" aria-modal="false" aria-labelledby="tutorial-step-heading" data-testid="app-tutorial-overlay">' +
        '<div class="row-between">' +
          '<span class="eyebrow">Guided App Tutorial • Optional</span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="tutorial-skip" data-testid="tutorial-skip-btn">Skip Tour</button>' +
        '</div>' +
        '<h2 id="tutorial-step-heading" class="serif-heading" style="font-size:1.2rem;">' + A.esc(step.title) + '</h2>' +
        '<p class="nav-row__desc">' + A.esc(step.body) + '</p>' +
        '<p class="card-tile__meta">Interface walkthrough only — never awards Scripture Cards or blocks reading. Replay anytime under More → App Tutorial.</p>' +
        '<div class="row-between">' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="tutorial-prev"' + (isFirst ? ' disabled' : '') + '>Back</button>' +
          '<button type="button" class="btn btn--primary btn--sm" data-action="tutorial-next" data-testid="tutorial-next-btn">' + (isLast ? 'Finish Tour' : 'Next') + '</button>' +
        '</div>' +
      '</aside>'
    );
  }

  /* --------------------------------------------------------------------------
   * 6. Modals (Shelf Replacement, Put Away Focus, Share Export, Account Merge, Foundation Unavailable)
   * -------------------------------------------------------------------------- */
  function renderModal(state) {
    var m = state.modal;
    if (!m) return '';
    var inner = '';

    if (m.type === 'shelf-replace') {
      var incoming = F.MONTHS_BY_ID[m.incomingYearMonth];
      var shelfCards = S.getOrderedShelfMonths();

      if (m.step === 'choose') {
        inner =
          '<span class="eyebrow">Shelf Full (3 of 3)</span>' +
          '<h2 id="modal-heading" class="serif-heading" style="font-size:1.35rem;">Choose a month to put away</h2>' +
          '<p class="nav-row__desc">To add <strong>' + A.esc(incoming.heading) + '</strong> (' + A.esc(incoming.theme) + '), select one of your current Shelf months to put away. Putting a month away never deletes reading progress or earned Cards.</p>' +
          '<div class="stack-sm">' +
            shelfCards.map(function (entry) {
              var mo = F.MONTHS_BY_ID[entry.yearMonth];
              var isFocus = state.shelf.activeFocusMonth === entry.yearMonth;
              return (
                '<button type="button" class="nav-row" data-action="shelf-replace-choose" data-year-month="' + A.esc(entry.yearMonth) + '" data-testid="replace-pick-' + A.esc(entry.yearMonth) + '">' +
                  '<span class="nav-row__body">' +
                    '<span class="row-wrap">' +
                      '<span class="nav-row__title">' + A.esc(mo.heading) + '</span>' +
                      (isFocus ? '<span class="badge badge--accent">Active Focus</span>' : '') +
                      (entry.protected ? '<span class="badge badge--done">Kept on Shelf</span>' : '<span class="badge badge--warm">Auto-admitted</span>') +
                    '</span>' +
                    '<span class="nav-row__desc">' + A.esc(mo.theme) + '</span>' +
                  '</span>' +
                  '<span class="nav-row__chevron">' + A.icon('chevronRight') + '</span>' +
                '</button>'
              );
            }).join('') +
          '</div>' +
          '<div class="row-wrap"><button type="button" class="btn btn--secondary" data-action="close-modal" data-testid="modal-cancel-btn">Cancel</button></div>';
      } else {
        var outgoing = F.MONTHS_BY_ID[m.selectedOutYearMonth];
        var replacingFocus = state.shelf.activeFocusMonth === m.selectedOutYearMonth;
        var remaining = shelfCards
          .filter(function (e) { return e.yearMonth !== m.selectedOutYearMonth; })
          .map(function (e) { return e.yearMonth; });
        remaining.unshift(m.incomingYearMonth);

        inner =
          '<span class="eyebrow">Confirm Shelf Replacement</span>' +
          '<h2 id="modal-heading" class="serif-heading" style="font-size:1.35rem;">Put away ' + A.esc(outgoing.heading) + ' and add ' + A.esc(incoming.heading) + '?</h2>' +
          '<p class="nav-row__desc">All completions, earned Cards, and saved positions for ' + A.esc(outgoing.heading) + ' remain safely in Library and Field Notebook.</p>' +
          (replacingFocus
            ? '<div class="stack-xs">' +
                '<strong style="font-size:0.875rem;">' + A.esc(outgoing.heading) + ' is currently your Active Focus. Choose what to focus on next:</strong>' +
                '<label class="radio-option"><input type="radio" name="replaceFocus" value="none"' + (m.replacementFocusChoice === 'none' ? ' checked' : '') + ' data-change-action="modal-focus-choice" /><span>No Active Focus for now</span></label>' +
                remaining.map(function (ym) {
                  return '<label class="radio-option"><input type="radio" name="replaceFocus" value="' + A.esc(ym) + '"' + (m.replacementFocusChoice === ym ? ' checked' : '') + ' data-change-action="modal-focus-choice" /><span>Set <strong>' + A.esc(F.formatYearMonth(ym)) + '</strong> as Active Focus</span></label>';
                }).join('') +
              '</div>'
            : '') +
          '<div class="row-wrap">' +
            '<button type="button" class="btn btn--primary" data-action="shelf-replace-confirm" data-testid="replace-confirm-btn">Confirm Replacement</button>' +
            '<button type="button" class="btn btn--secondary" data-action="close-modal">Cancel</button>' +
          '</div>';
      }
    } else if (m.type === 'put-away-focus') {
      var targetMo = F.MONTHS_BY_ID[m.targetYearMonth];
      var otherShelf = S.getOrderedShelfMonths().filter(function (e) { return e.yearMonth !== m.targetYearMonth; });
      inner =
        '<span class="eyebrow">Put Away Active Focus</span>' +
        '<h2 id="modal-heading" class="serif-heading" style="font-size:1.35rem;">Putting away ' + A.esc(targetMo.heading) + '</h2>' +
        '<p class="nav-row__desc">This month is your current Active Focus. Choose another Shelf month as your Active Focus or continue with no focus for now. Your completions and earned Cards stay safe.</p>' +
        '<div class="stack-xs">' +
          '<label class="radio-option"><input type="radio" name="putAwayFocus" value="none"' + (m.replacementFocusChoice === 'none' ? ' checked' : '') + ' data-change-action="modal-focus-choice" data-testid="putaway-choice-none" /><span>No Active Focus for now</span></label>' +
          otherShelf.map(function (e) {
            return '<label class="radio-option"><input type="radio" name="putAwayFocus" value="' + A.esc(e.yearMonth) + '"' + (m.replacementFocusChoice === e.yearMonth ? ' checked' : '') + ' data-change-action="modal-focus-choice" data-testid="putaway-choice-' + A.esc(e.yearMonth) + '" /><span>Switch Active Focus to <strong>' + A.esc(F.formatYearMonth(e.yearMonth)) + '</strong></span></label>';
          }).join('') +
        '</div>' +
        '<div class="row-wrap">' +
          '<button type="button" class="btn btn--primary" data-action="confirm-put-away-focus" data-testid="confirm-putaway-focus-btn">Put Away Month</button>' +
          '<button type="button" class="btn btn--secondary" data-action="close-modal">Cancel</button>' +
        '</div>';
    } else if (m.type === 'share-card') {
      var card = F.CARDS_BY_ID[m.cardId];
      inner =
        '<span class="eyebrow">Share Scripture Card (Full View Only • §7.3)</span>' +
        '<h2 id="modal-heading" class="serif-heading" style="font-size:1.3rem;">Export preview for ' + A.esc(card.title) + '</h2>' +
        '<p class="nav-row__desc">Exports your complete earned Card with a subtle Bibleberry attribution added at share time only. Your in-app original Card stays untouched.</p>' +
        '<div class="full-card-art" style="border-radius:var(--radius-md);border:1px solid var(--border-subtle);" data-testid="share-export-preview">' +
          A.renderCardIllustration(card, { withExportWatermark: true }) +
        '</div>' +
        (m.sharedConfirmed
          ? '<div class="surface--announcement" style="padding:0.75rem;border-radius:var(--radius-sm);" role="status">Simulated share export completed. No external network call was made.</div>'
          : '') +
        '<div class="row-wrap">' +
          '<button type="button" class="btn btn--primary" data-action="confirm-simulated-share" data-testid="confirm-share-btn">Simulate Share Export</button>' +
          '<button type="button" class="btn btn--secondary" data-action="close-modal">Close</button>' +
        '</div>';
    } else if (m.type === 'account-merge') {
      var st = state.account.mergeStatus;
      var mode = m.mode || state.account.mergeScenario;
      var isBusy = st === 'authenticating' || st === 'reconciling';
      inner =
        '<span class="eyebrow">Simulated Account Continuity (G08 — Not Live Auth)</span>' +
        '<h2 id="modal-heading" class="serif-heading" style="font-size:1.35rem;">Sign in or create account (Simulated)</h2>' +
        '<p class="nav-row__desc">Demonstrates approved G08 guest-to-account merge states locally. Choose a simulated outcome below to test verified success, Shelf conflict precedence, or failure/safe retry.</p>' +
        '<div class="stack-xs">' +
          '<label class="radio-option"><input type="radio" name="mergeMode" value="new-account"' + (mode === 'new-account' ? ' checked' : '') + (isBusy ? ' disabled' : '') + ' data-change-action="set-merge-mode" /><span><strong>New account transfer (Clean)</strong><br/><span class="card-tile__meta">Transfers guest records cleanly; G08 confirmation without Shelf conflict sentence.</span></span></label>' +
          '<label class="radio-option"><input type="radio" name="mergeMode" value="existing-conflict"' + (mode === 'existing-conflict' ? ' checked' : '') + (isBusy ? ' disabled' : '') + ' data-change-action="set-merge-mode" data-testid="merge-mode-conflict" /><span><strong>Existing account with real Shelf conflict (G08)</strong><br/><span class="card-tile__meta">Merges completions/Cards/Saved Scripture (earliest earned date wins); existing account Shelf takes precedence with concise G08 explanation.</span></span></label>' +
          '<label class="radio-option"><input type="radio" name="mergeMode" value="partial-failure"' + (mode === 'partial-failure' ? ' checked' : '') + (isBusy ? ' disabled' : '') + ' data-change-action="set-merge-mode" data-testid="merge-mode-failure" /><span><strong>Partial merge failure + safe retry</strong><br/><span class="card-tile__meta">Never claims success before verified persistence; keeps local guest records intact for retry without duplicates.</span></span></label>' +
        '</div>';

      if (st === 'authenticating' || st === 'reconciling') {
        inner +=
          '<div class="loading-box" role="status" aria-live="polite" data-testid="merge-pending-state">' +
            '<strong>' + (st === 'authenticating' ? 'Authenticating (Simulated)…' : 'Reconciling guest records & verifying persistence…') + '</strong>' +
            '<p class="card-tile__meta">No success confirmation is shown until durable reconciliation is verified.</p>' +
          '</div>';
      } else if (st === 'failed') {
        inner +=
          '<div class="surface surface--error stack-xs" role="alert" data-testid="merge-failed-state">' +
            '<strong>Sync could not be verified yet</strong>' +
            '<p class="nav-row__desc">Your local guest completions, earned Scripture Cards, and Saved Scripture remain untouched on this browser. Retry safely below without duplicating awards.</p>' +
          '</div>';
      }

      inner +=
        '<div class="row-wrap">' +
          (st === 'failed'
            ? '<button type="button" class="btn btn--primary" data-action="retry-merge-success" data-testid="merge-retry-btn">Retry Sync Safely (Simulated Success)</button>'
            : '<button type="button" class="btn btn--primary" data-action="run-account-merge"' + (isBusy ? ' disabled' : '') + ' data-testid="run-merge-btn">Continue (Simulated)</button>') +
          '<button type="button" class="btn btn--secondary" data-action="close-modal"' + (isBusy ? ' disabled' : '') + '>Cancel</button>' +
        '</div>';
    } else if (m.type === 'foundation-unavailable') {
      inner =
        '<span class="eyebrow">Reading Unavailable</span>' +
        '<h2 id="modal-heading" class="serif-heading" style="font-size:1.3rem;">' + A.esc(m.title) + '</h2>' +
        '<p class="nav-row__desc">This foundational reading is not currently available. All other Foundations readings and your progress remain accessible.</p>' +
        '<div><button type="button" class="btn btn--primary" data-action="close-modal">Return to Foundations</button></div>';
    }

    return (
      '<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-heading" data-testid="active-modal">' +
        '<div class="modal-panel">' + inner + '</div>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
   * 7. Reviewer Workbench (Clearly Outside Consumer UI)
   * -------------------------------------------------------------------------- */
  function renderReviewerWorkbench(state, drawerOpen) {
    var activePreset = F.SCENARIOS_BY_ID[state.scenarioId] || F.SCENARIOS[0];
    var g09Presets = F.SCENARIOS.filter(function (s) { return s.group === 'G09'; });
    var edgePresets = F.SCENARIOS.filter(function (s) { return s.group === 'Edge'; });

    var html =
      '<div class="reviewer-bar">' +
        '<div class="reviewer-brand">' +
          '<span class="reviewer-pill">Glass Atlas Prototype • Synthetic</span>' +
          '<span class="reviewer-meta">Date: <strong>' + A.esc(state.simulatedDate) + '</strong> • Scenario: <strong>' + A.esc(activePreset.shortLabel) + '</strong></span>' +
        '</div>' +
        '<div class="reviewer-bar-actions">' +
          '<label for="workbench-scenario-select" class="sr-only">Select G09 test scenario</label>' +
          '<select id="workbench-scenario-select" class="reviewer-select" style="width:auto;max-width:14rem;" data-change-action="load-scenario" data-testid="workbench-scenario-select">' +
            '<optgroup label="G09 Acceptance Journeys">' +
              g09Presets.map(function (sc) {
                return '<option value="' + A.esc(sc.id) + '"' + (state.scenarioId === sc.id ? ' selected' : '') + '>' + A.esc(sc.shortLabel) + '</option>';
              }).join('') +
            '</optgroup>' +
            '<optgroup label="Edge & Negative States">' +
              edgePresets.map(function (sc) {
                return '<option value="' + A.esc(sc.id) + '"' + (state.scenarioId === sc.id ? ' selected' : '') + '>' + A.esc(sc.shortLabel) + '</option>';
              }).join('') +
            '</optgroup>' +
          '</select>' +
          '<button type="button" class="reviewer-btn" data-action="reset-scenario" data-testid="workbench-reset-btn">Reset</button>' +
          '<button type="button" class="reviewer-btn" aria-expanded="' + (drawerOpen ? 'true' : 'false') + '" data-action="toggle-workbench" data-testid="workbench-toggle-btn">' +
            A.icon('sliders') + ' Controls' +
          '</button>' +
        '</div>' +
      '</div>';

    html += '<div class="reviewer-drawer"' + (drawerOpen ? '' : ' hidden') + ' data-testid="workbench-drawer">';
    html += '<div class="reviewer-drawer-inner">';
    html +=
      '<div class="reviewer-notice">' +
        '<strong>Reviewer Workbench (not part of consumer UI):</strong> ' + A.esc(activePreset.description) +
        ' • Onboarding flags: Intro=<code>' + A.esc(state.onboarding.introStatus) + '</code>, Tutorial=<code>' + A.esc(state.onboarding.tutorialStatus) + '</code>.' +
      '</div>';

    html += '<div class="reviewer-grid">';

    // Group 1: Date, Preview & Rollover Triggers
    html +=
      '<div class="reviewer-group">' +
        '<h3>Date, Preview &amp; Rollover</h3>' +
        '<div class="reviewer-chips">' +
          '<button type="button" class="reviewer-btn' + (state.simulatedDate === '2026-11-18' ? ' reviewer-btn--active' : '') + '" data-action="set-sim-date" data-date="2026-11-18">Nov 18 (Normal)</button>' +
          '<button type="button" class="reviewer-btn' + (state.simulatedDate === '2026-11-28' ? ' reviewer-btn--active' : '') + '" data-action="set-sim-date" data-date="2026-11-28">Nov 28 (Dec Preview)</button>' +
          '<button type="button" class="reviewer-btn' + (state.simulatedDate === '2026-02-27' ? ' reviewer-btn--active' : '') + '" data-action="set-sim-date" data-date="2026-02-27">Feb 27 (Mar Preview)</button>' +
          '<button type="button" class="reviewer-btn" data-action="sim-rollover-dec1" data-testid="workbench-rollover-btn">Simulate Dec 1 Rollover (G02/G03)</button>' +
          '<button type="button" class="reviewer-btn" aria-pressed="' + (state.todayChallengeUnavailable ? 'true' : 'false') + '" data-action="toggle-today-unavailable">Today Unavailable</button>' +
        '</div>' +
      '</div>';

    // Group 2: External Deep-Link Simulator (G04-A & G04-B)
    html +=
      '<div class="reviewer-group">' +
        '<h3>External Deep-Link Ingress (G04)</h3>' +
        '<div class="reviewer-chips">' +
          Object.keys(F.EXTERNAL_LINKS).map(function (id) {
            var lk = F.EXTERNAL_LINKS[id];
            return '<button type="button" class="reviewer-btn" data-action="launch-external-link" data-link-id="' + A.esc(id) + '" data-testid="workbench-ext-' + A.esc(id) + '">' + A.esc(lk.label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';

    // Group 3: Feed Loading / Empty / Error States
    html +=
      '<div class="reviewer-group">' +
        '<h3>News &amp; Library State Simulation</h3>' +
        '<div class="reviewer-chips">' +
          ['ready', 'loading', 'empty', 'error'].map(function (st) {
            return '<button type="button" class="reviewer-btn' + (state.newsUi.loadState === st ? ' reviewer-btn--active' : '') + '" data-action="set-news-load" data-load-state="' + st + '" data-testid="workbench-news-' + st + '">News: ' + st + '</button>';
          }).join('') +
        '</div>' +
        '<div class="reviewer-chips">' +
          ['ready', 'loading', 'empty', 'error'].map(function (st) {
            return '<button type="button" class="reviewer-btn' + (state.libraryUi.loadState === st ? ' reviewer-btn--active' : '') + '" data-action="set-library-load" data-load-state="' + st + '">Library: ' + st + '</button>';
          }).join('') +
        '</div>' +
      '</div>';

    // Group 4: Accessibility & Merge Quick Triggers
    html +=
      '<div class="reviewer-group">' +
        '<h3>Accessibility &amp; Account Quick Triggers</h3>' +
        '<div class="reviewer-chips">' +
          '<button type="button" class="reviewer-btn' + (state.appearance.textScale === 'default' ? ' reviewer-btn--active' : '') + '" data-action="set-text-scale" data-scale="default">Text 100%</button>' +
          '<button type="button" class="reviewer-btn' + (state.appearance.textScale === 'large' ? ' reviewer-btn--active' : '') + '" data-action="set-text-scale" data-scale="large">Text 120%</button>' +
          '<button type="button" class="reviewer-btn' + (state.appearance.textScale === 'xlarge' ? ' reviewer-btn--active' : '') + '" data-action="set-text-scale" data-scale="xlarge">Text 150%</button>' +
          '<button type="button" class="reviewer-btn" aria-pressed="' + (state.appearance.reducedMotion ? 'true' : 'false') + '" data-action="toggle-reduced-motion-btn">Reduced Motion</button>' +
          '<button type="button" class="reviewer-btn" data-action="open-account-merge" data-testid="workbench-merge-btn">Simulate Account Merge (G08)</button>' +
        '</div>' +
      '</div>';

    html += '</div></div></div>';
    return html;
  }

  return {
    renderChallengeReader: renderChallengeReader,
    renderExternalUnavailable: renderExternalUnavailable,
    renderMonthlyIntro: renderMonthlyIntro,
    renderAppIntro: renderAppIntro,
    renderTutorialOverlay: renderTutorialOverlay,
    renderModal: renderModal,
    renderReviewerWorkbench: renderReviewerWorkbench
  };
})();
