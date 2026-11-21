/*
 * Bibleberry R06 Connected Experience Prototype — State Store & Business Rules Engine
 *
 * Implements the consolidated R06 / G01–G09 specification deterministically in local memory
 * with optional isolated prototype localStorage persistence (bibleberry-r06-prototype-v1).
 * Never mutates production storage keys or backend services.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.State = (function () {
  var STORAGE_KEY = 'bibleberry-r06-prototype-v1';
  var F = window.R06Proto.Fixtures;

  var state = null;
  var listeners = [];

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  function notify(announceText) {
    if (announceText) {
      state.statusMessage = announceText;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore private browsing / file:// storage restrictions gracefully
    }
    listeners.forEach(function (fn) { fn(state); });
  }

  function init() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && parsed.simulatedDate && parsed.tabViews && parsed.onboarding) {
          state = parsed;
          return state;
        }
      }
    } catch (e) {
      // Fall back to default scenario
    }
    loadScenario('g09-6-earned-collections', { silent: true });
    return state;
  }

  function getState() {
    return state;
  }

  function loadScenario(scenarioId, opts) {
    var preset = F.SCENARIOS_BY_ID[scenarioId] || F.SCENARIOS[0];
    state = preset.build();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore storage restrictions
    }
    if (!opts || !opts.silent) {
      notify('Loaded scenario: ' + preset.shortLabel);
    }
  }

  function resetCurrentScenario() {
    loadScenario(state.scenarioId || 'g09-6-earned-collections');
  }

  /* --------------------------------------------------------------------------
   * Calendar, Season & Preview Helpers
   * -------------------------------------------------------------------------- */
  function getCurrentYearMonth() {
    return state.simulatedDate.slice(0, 7);
  }

  function getNextYearMonth(ym) {
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7));
    if (m === 12) return (y + 1) + '-01';
    return y + '-' + (m + 1 < 10 ? '0' + (m + 1) : String(m + 1));
  }

  function getPreviousYearMonth(ym) {
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7));
    if (m === 1) return (y - 1) + '-12';
    return y + '-' + (m - 1 < 10 ? '0' + (m - 1) : String(m - 1));
  }

  /**
   * Preceding-month 28th or February 27 advance preview window (§4.3).
   */
  function getAdvancePreviewYearMonth() {
    var m = Number(state.simulatedDate.slice(5, 7));
    var d = Number(state.simulatedDate.slice(8, 10));
    var threshold = m === 2 ? 27 : 28;
    if (d >= threshold) {
      var nextYm = getNextYearMonth(getCurrentYearMonth());
      if (F.MONTHS_BY_ID[nextYm]) {
        return nextYm;
      }
    }
    return null;
  }

  function isAdvancePreviewMonth(yearMonth) {
    return getAdvancePreviewYearMonth() === yearMonth;
  }

  function isHistoricalMonth(yearMonth) {
    return yearMonth < getCurrentYearMonth();
  }

  function isChallengeReleased(challenge) {
    if (!challenge) return false;
    if (challenge.date > state.simulatedDate) return false;
    if (challenge.date === state.simulatedDate && state.todayChallengeUnavailable) return false;
    return true;
  }

  function getTodayChallenge() {
    var currentMonth = F.MONTHS_BY_ID[getCurrentYearMonth()];
    if (!currentMonth) return null;
    for (var i = 0; i < currentMonth.challenges.length; i++) {
      if (currentMonth.challenges[i].date === state.simulatedDate) {
        return currentMonth.challenges[i];
      }
    }
    return null;
  }

  function getResolvedPalette() {
    if (state.appearance.paletteMode === 'manual') {
      return state.appearance.manualPalette;
    }
    var m = Number(state.simulatedDate.slice(5, 7));
    if (m === 12 || m === 1) return 'season-winter';
    if (m === 2 || m === 3 || m === 4 || m === 5) return 'season-spring';
    return 'season-autumn';
  }

  function getResolvedContrast() {
    if (state.appearance.contrastMode === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }
    return state.appearance.contrastMode;
  }

  function getSeasonLabel() {
    var p = getResolvedPalette();
    if (p === 'season-winter') return 'Winter Stillness (Seasonal)';
    if (p === 'season-spring') return 'Spring Renewal (Seasonal)';
    if (p === 'season-autumn') return 'Autumn Sage (Seasonal)';
    if (p === 'palette-linen') return 'Warm Linen (Manual)';
    if (p === 'palette-coastal') return 'Quiet Slate (Manual)';
    if (p === 'palette-cedar') return 'Cedar & Clay (Manual)';
    return 'Autumn Sage';
  }

  /* --------------------------------------------------------------------------
   * Participation & Discovery Selectors
   * -------------------------------------------------------------------------- */
  function isCompleted(challengeId) {
    return state.completedChallengeIds.indexOf(challengeId) !== -1;
  }

  function getDistinctCompletedCount() {
    var seen = {};
    var count = 0;
    state.completedChallengeIds.forEach(function (id) {
      if (!seen[id]) {
        seen[id] = true;
        count += 1;
      }
    });
    return count;
  }

  function getLifetimeStatus() {
    var count = getDistinctCompletedCount();
    if (count === 0) {
      return {
        label: 'Beginning the Journey',
        count: 0,
        note: 'Complete any released Challenge to begin building your personal participation record.'
      };
    }
    if (count < 5) {
      return {
        label: 'Steady Reader',
        count: count,
        note: 'Derived calmly from distinct finished Challenges — no streaks or rankings.'
      };
    }
    if (count < 15) {
      return {
        label: 'Rooted in Scripture',
        count: count,
        note: 'Derived calmly from distinct finished Challenges — no streaks or rankings.'
      };
    }
    if (count < 30) {
      return {
        label: 'Seasoned Companion',
        count: count,
        note: 'Derived calmly from distinct finished Challenges — no streaks or rankings.'
      };
    }
    return {
      label: 'Faithful Pilgrim',
      count: count,
      note: 'Derived calmly from distinct finished Challenges — no streaks or rankings.'
    };
  }

  function getMonthProgress(yearMonth) {
    var month = F.MONTHS_BY_ID[yearMonth];
    if (!month) return { completed: 0, total: 0, allCompleted: false };
    var completed = 0;
    month.challenges.forEach(function (ch) {
      if (isCompleted(ch.id)) completed += 1;
    });
    return {
      completed: completed,
      total: month.challenges.length,
      allCompleted: month.challenges.length > 0 && completed === month.challenges.length
    };
  }

  function getDiscoveryProgress(month, discovery) {
    var done = 0;
    var total = discovery.qualifyingChallengeIds.length;
    discovery.qualifyingChallengeIds.forEach(function (id) {
      if (isCompleted(id)) done += 1;
    });
    var earnedRecord = state.earnedAwards[discovery.cardId] || null;
    return {
      done: done,
      total: total,
      earned: !!earnedRecord,
      earnedRecord: earnedRecord
    };
  }

  function getUnannouncedEarnedCardIds() {
    var ids = [];
    Object.keys(state.earnedAwards).forEach(function (cardId) {
      var rec = state.earnedAwards[cardId];
      if (rec && !rec.hubAnnouncementAcked && F.CARDS_BY_ID[cardId]) {
        ids.push(cardId);
      }
    });
    ids.sort(function (a, b) {
      var da = state.earnedAwards[a].earnedOn || '';
      var db = state.earnedAwards[b].earnedOn || '';
      if (db !== da) return db.localeCompare(da);
      return a.localeCompare(b);
    });
    return ids;
  }

  function getAllEarnedCardsSorted() {
    var list = [];
    Object.keys(state.earnedAwards).forEach(function (cardId) {
      var rec = state.earnedAwards[cardId];
      var card = F.CARDS_BY_ID[cardId];
      if (rec && card) {
        list.push({ card: card, record: rec });
      }
    });
    list.sort(function (a, b) {
      if (b.record.earnedOn !== a.record.earnedOn) {
        return b.record.earnedOn.localeCompare(a.record.earnedOn);
      }
      return a.card.title.localeCompare(b.card.title);
    });
    return list;
  }

  function getEarnedCardsByCategory(category) {
    return getAllEarnedCardsSorted().filter(function (item) {
      return item.card.sourceCategory === category;
    });
  }

  function getEarnedCardsForPublicationMonth(yearMonth) {
    return getAllEarnedCardsSorted().filter(function (item) {
      return item.card.publicationYearMonth === yearMonth;
    });
  }

  function isGuestInviteEligible() {
    if (state.account.signedIn) return false;
    if (state.account.guestInviteDismissed) return false;
    if (getDistinctCompletedCount() < 3) return false;
    // Never displayed simultaneously with or ahead of pending earned-Card announcements (§3.4)
    if (state.announcementsEnabled && getUnannouncedEarnedCardIds().length > 0) return false;
    return true;
  }

  /* --------------------------------------------------------------------------
   * Today Secondary Historical Continuation Selector (§3.2, G01, G02)
   * -------------------------------------------------------------------------- */
  function getTodayContinuation() {
    var activeYm = state.shelf.activeFocusMonth;
    if (activeYm && F.MONTHS_BY_ID[activeYm]) {
      var month = F.MONTHS_BY_ID[activeYm];
      var prog = getMonthProgress(activeYm);
      if (prog.allCompleted) {
        // G01: Keep completed Active Focus intact, read "Review This Month"
        return {
          kind: 'active-focus-completed',
          yearMonth: activeYm,
          monthHeading: month.heading,
          monthTheme: month.theme,
          ctaLabel: 'Review This Month',
          detail: 'All ' + prog.total + ' Challenges completed in your active focus month.'
        };
      }
      // Look for most recently updated valid unfinished saved Challenge inside activeYm
      var best = null;
      month.challenges.forEach(function (ch) {
        var pos = state.savedPositions[ch.id];
        if (pos && !isCompleted(ch.id) && isChallengeReleased(ch)) {
          if (!best || (pos.updatedOn || '') > (best.updatedOn || '')) {
            best = { challenge: ch, screenIndex: pos.screenIndex, updatedOn: pos.updatedOn || '' };
          }
        }
      });
      if (best) {
        return {
          kind: 'active-focus-resume',
          yearMonth: activeYm,
          monthHeading: month.heading,
          monthTheme: month.theme,
          challengeId: best.challenge.id,
          challengeTitle: best.challenge.title,
          screenIndex: best.screenIndex,
          ctaLabel: 'Continue Reading',
          detail: 'Resume "' + best.challenge.title + '" at screen ' + (best.screenIndex + 1) + ' of ' + best.challenge.screens.length + '.'
        };
      }
      // G01: No valid unfinished saved Challenge → open Active Focus Month Screen (never guess a Challenge)
      return {
        kind: 'active-focus-month',
        yearMonth: activeYm,
        monthHeading: month.heading,
        monthTheme: month.theme,
        ctaLabel: 'Explore ' + month.heading,
        detail: prog.completed + ' of ' + prog.total + ' Challenges completed in your active focus month.'
      };
    }

    // Precedence 2: G02 One-time post-rollover interrupted prior-month continuation
    var ri = state.rolloverInterruption;
    if (ri && ri.eligible && !ri.consumed && ri.challengeId) {
      var ch = F.CHALLENGES_BY_ID[ri.challengeId];
      var pos = state.savedPositions[ri.challengeId];
      if (ch && pos && !isCompleted(ch.id) && isChallengeReleased(ch)) {
        return {
          kind: 'rollover-once',
          yearMonth: ch.yearMonth,
          monthHeading: F.formatYearMonth(ch.yearMonth),
          challengeId: ch.id,
          challengeTitle: ch.title,
          screenIndex: pos.screenIndex,
          ctaLabel: 'Continue Prior Reading',
          detail: 'One-time continuation for your unfinished ' + F.formatYearMonth(ch.yearMonth) + ' reading ("' + ch.title + '").'
        };
      }
    }

    return null;
  }

  /* --------------------------------------------------------------------------
   * Ordered Shelf Selector (§6.1: Active Focus first, remaining newest to oldest)
   * -------------------------------------------------------------------------- */
  function getOrderedShelfMonths() {
    var list = state.shelf.months.slice();
    var focus = state.shelf.activeFocusMonth;
    list.sort(function (a, b) {
      if (a.yearMonth === focus && b.yearMonth !== focus) return -1;
      if (b.yearMonth === focus && a.yearMonth !== focus) return 1;
      return b.yearMonth.localeCompare(a.yearMonth);
    });
    return list;
  }

  /* --------------------------------------------------------------------------
   * Navigation Actions (§2.1, §2.3)
   * -------------------------------------------------------------------------- */
  function saveCurrentTabScroll() {
    if (state.activeOverlay) return;
    state.tabScroll[state.activeTab] = window.scrollY || 0;
    var view = state.tabViews[state.activeTab];
    if (view && view.view === 'month-screen' && view.yearMonth) {
      state.monthScroll[view.yearMonth] = window.scrollY || 0;
    }
  }

  function getLandingViewForTab(tab) {
    if (tab === 'today') return { view: 'today-landing' };
    if (tab === 'library') return { view: 'library-landing' };
    if (tab === 'collections') return { view: 'collections-landing' };
    return { view: 'more-landing' };
  }

  function selectTab(tab) {
    saveCurrentTabScroll();
    // Leaving Today consumes any displayed G02 rollover interruption so it stays one-time on routine returns
    if (state.activeTab === 'today' && tab !== 'today' && !state.shelf.activeFocusMonth && state.rolloverInterruption.eligible && !state.rolloverInterruption.consumed) {
      state.rolloverInterruption.consumed = true;
    }
    if (state.activeTab === tab) {
      // Reselecting active primary tab returns to its landing at top scroll (§2.3)
      state.tabViews[tab] = getLandingViewForTab(tab);
      state.tabScroll[tab] = 0;
      notify('Returned to ' + tab + ' overview.');
      return { restoreScroll: 0 };
    }
    state.activeTab = tab;
    notify('Switched to ' + tab + '.');
    return { restoreScroll: state.tabScroll[tab] || 0 };
  }

  function setTabView(tab, viewObj, opts) {
    saveCurrentTabScroll();
    state.activeTab = tab;
    state.tabViews[tab] = viewObj;
    if (viewObj.view === 'field-notebook' || viewObj.view === 'view-discoveries') {
      // Entering Field Notebook (including View Discoveries) clears New Discoveries indicator (§3.3)
      state.newDiscoveriesIndicator = false;
    }
    notify((opts && opts.announce) || '');
  }

  function navigateBackInTab() {
    var tab = state.activeTab;
    var cur = state.tabViews[tab];
    if (!cur) return;
    if (cur.returnView) {
      var targetTab = cur.returnTab || tab;
      var targetView = cur.returnView;
      state.activeTab = targetTab;
      state.tabViews[targetTab] = targetView;
      notify('Returned to previous screen.');
      return;
    }
    state.tabViews[tab] = getLandingViewForTab(tab);
    notify('Returned to ' + tab + ' overview.');
  }

  /* --------------------------------------------------------------------------
   * Month Screen & Monthly Introduction Actions (G05, §4.1–§4.3)
   * -------------------------------------------------------------------------- */
  function openMonthScreen(yearMonth, opts) {
    var o = opts || {};
    var month = F.MONTHS_BY_ID[yearMonth];
    if (!month) {
      notify('That month is not available.');
      return;
    }
    var targetTab = o.tab || state.activeTab;
    var returnTab = o.returnTab || state.activeTab;
    var returnView = o.returnView || clone(state.tabViews[state.activeTab]);
    var isPreview = isAdvancePreviewMonth(yearMonth);

    // Block access to non-preview future months
    if (yearMonth > getCurrentYearMonth() && !isPreview) {
      notify('This upcoming month is not yet available.');
      return;
    }

    var destinationView = {
      view: 'month-screen',
      yearMonth: yearMonth,
      isPreview: isPreview,
      returnTab: returnTab,
      returnView: returnView
    };

    // G05: First intentional Month Screen entry (non-preview) shows full Monthly Introduction + Welcome
    if (!isPreview && !state.seenMonthIntros[yearMonth] && !o.skipIntroCheck) {
      saveCurrentTabScroll();
      state.activeTab = targetTab;
      state.tabViews[targetTab] = destinationView;
      state.activeOverlay = 'month-intro';
      state.activeMonthIntro = {
        yearMonth: yearMonth,
        screenIndex: 0,
        isPreview: false,
        canSkipToWelcome: !!state.seenMonthPreviews[yearMonth],
        isReplay: false
      };
      notify('Opened Monthly Introduction for ' + month.heading + '.');
      return;
    }

    setTabView(targetTab, destinationView, { announce: 'Opened ' + month.heading + (isPreview ? ' Advance Preview' : ' Month Screen') + '.' });
  }

  function openMonthlyIntroReplay(yearMonth, isPreview) {
    var month = F.MONTHS_BY_ID[yearMonth];
    if (!month) return;
    saveCurrentTabScroll();
    state.activeOverlay = 'month-intro';
    state.activeMonthIntro = {
      yearMonth: yearMonth,
      screenIndex: 0,
      isPreview: !!isPreview,
      canSkipToWelcome: !isPreview && !!state.seenMonthPreviews[yearMonth] && !state.seenMonthIntros[yearMonth],
      isReplay: !!state.seenMonthIntros[yearMonth]
    };
    notify('Opened ' + (isPreview ? 'advance preview introduction' : 'Monthly Introduction') + ' for ' + month.heading + '.');
  }

  function advanceMonthlyIntro(delta) {
    var intro = state.activeMonthIntro;
    if (!intro) return;
    var month = F.MONTHS_BY_ID[intro.yearMonth];
    var maxIndex = intro.isPreview ? month.introScreens.length - 2 : month.introScreens.length - 1;
    var next = intro.screenIndex + delta;
    if (next < 0) next = 0;
    if (next > maxIndex) {
      completeMonthlyIntro();
      return;
    }
    intro.screenIndex = next;
    notify('Monthly Introduction screen ' + (next + 1) + ' of ' + (maxIndex + 1) + '.');
  }

  function skipMonthlyIntroToWelcome() {
    var intro = state.activeMonthIntro;
    if (!intro || intro.isPreview) return;
    var month = F.MONTHS_BY_ID[intro.yearMonth];
    intro.screenIndex = month.introScreens.length - 1;
    notify('Skipped to Welcome for ' + month.heading + '.');
  }

  function completeMonthlyIntro() {
    var intro = state.activeMonthIntro;
    if (!intro) return;
    if (intro.isPreview) {
      state.seenMonthPreviews[intro.yearMonth] = true;
    } else {
      state.seenMonthIntros[intro.yearMonth] = true;
    }
    state.activeOverlay = null;
    state.activeMonthIntro = null;
    notify('Entered ' + F.formatYearMonth(intro.yearMonth) + ' Month Screen.');
  }

  /* --------------------------------------------------------------------------
   * Challenge & Foundations Reader Actions (§5.1–§5.3, G04-A, G04-B)
   * -------------------------------------------------------------------------- */
  function openChallenge(challengeId, opts) {
    var o = opts || {};
    var ch = F.CHALLENGES_BY_ID[challengeId];
    if (!ch || !isChallengeReleased(ch)) {
      notify('This Challenge is not yet available.');
      return;
    }
    saveCurrentTabScroll();
    // If opened via G02 rollover continuation, mark rollover opportunity consumed
    if (o.fromRolloverContinuation) {
      state.rolloverInterruption.consumed = true;
    }
    var isReread = !!o.reread || isCompleted(challengeId);
    var startIndex = 0;
    if (!o.reread && !isCompleted(challengeId) && state.savedPositions[challengeId]) {
      startIndex = Math.min(state.savedPositions[challengeId].screenIndex || 0, ch.screens.length - 1);
    }
    state.activeOverlay = 'challenge';
    state.activeChallengeSession = {
      challengeId: challengeId,
      isFoundation: false,
      screenIndex: startIndex,
      origin: o.origin || 'today',
      originTab: o.originTab || state.activeTab,
      originView: o.originView || clone(state.tabViews[state.activeTab]),
      isReread: isReread
    };
    if (!isCompleted(challengeId)) {
      state.savedPositions[challengeId] = { screenIndex: startIndex, updatedOn: state.simulatedDate };
    }
    notify('Opened Challenge: ' + ch.title + '. Screen ' + (startIndex + 1) + ' of ' + ch.screens.length + '.');
  }

  function openFoundationReading(foundationId, opts) {
    var o = opts || {};
    var fnd = F.FOUNDATIONS_BY_ID[foundationId];
    if (!fnd || !fnd.available) {
      state.modal = {
        type: 'foundation-unavailable',
        title: fnd ? fnd.title : 'Reading Unavailable'
      };
      notify('This Foundations reading is currently unavailable.');
      return;
    }
    saveCurrentTabScroll();
    var startIndex = 0;
    if (!o.reread && !isCompleted(foundationId) && state.foundationPositions[foundationId]) {
      startIndex = Math.min(state.foundationPositions[foundationId].screenIndex || 0, fnd.screens.length - 1);
    }
    state.activeOverlay = 'challenge';
    state.activeChallengeSession = {
      challengeId: foundationId,
      isFoundation: true,
      screenIndex: startIndex,
      origin: 'foundations',
      originTab: 'library',
      originView: { view: 'foundations-overview', returnTab: 'library', returnView: { view: 'library-landing' } },
      isReread: isCompleted(foundationId)
    };
    if (!isCompleted(foundationId)) {
      state.foundationPositions[foundationId] = { screenIndex: startIndex, updatedOn: state.simulatedDate };
    }
    notify('Opened Foundations reading: ' + fnd.title + '.');
  }

  function launchExternalDeepLink(linkId) {
    var link = F.EXTERNAL_LINKS[linkId];
    if (!link || link.status !== 'released') {
      // Fail closed neutrally without leaking embargo dates or future copy (§5.3, §9.1)
      state.activeOverlay = 'external-unavailable';
      state.activeExternalError = {
        linkId: linkId,
        simulatedReason: link ? link.status : 'invalid'
      };
      notify('Requested teaching link is unavailable.');
      return;
    }
    var ch = F.CHALLENGES_BY_ID[link.challengeId];
    if (!ch || !isChallengeReleased(ch)) {
      state.activeOverlay = 'external-unavailable';
      state.activeExternalError = { linkId: linkId, simulatedReason: 'embargoed' };
      notify('Requested teaching link is unavailable.');
      return;
    }
    // G04-B: Direct entry BEFORE App Introduction, App Tutorial, or Monthly Introduction (keeps pending flags untouched!)
    state.onboarding.tutorialActive = false;
    state.activeOverlay = 'challenge';
    var startIndex = (!isCompleted(ch.id) && state.savedPositions[ch.id])
      ? Math.min(state.savedPositions[ch.id].screenIndex || 0, ch.screens.length - 1)
      : 0;
    state.activeChallengeSession = {
      challengeId: ch.id,
      isFoundation: false,
      screenIndex: startIndex,
      origin: 'external',
      originTab: 'today',
      originMeta: { externalLabel: link.sourceNote },
      isReread: isCompleted(ch.id)
    };
    if (!isCompleted(ch.id)) {
      state.savedPositions[ch.id] = { screenIndex: startIndex, updatedOn: state.simulatedDate };
    }
    notify('Opened external Challenge directly: ' + ch.title + '.');
  }

  function closeExternalUnavailable() {
    state.activeOverlay = null;
    state.activeExternalError = null;
    state.activeTab = 'today';
    state.tabViews.today = { view: 'today-landing' };
    notify('Returned to Today.');
  }

  function stepChallengeScreen(delta) {
    var sess = state.activeChallengeSession;
    if (!sess) return;
    var item = sess.isFoundation ? F.FOUNDATIONS_BY_ID[sess.challengeId] : F.CHALLENGES_BY_ID[sess.challengeId];
    if (!item) return;
    var next = sess.screenIndex + delta;
    if (next < 0) next = 0;
    if (next >= item.screens.length) {
      // Swiping or stepping past final screen NEVER implicitly finishes (§5.1, §5.2)
      return;
    }
    sess.screenIndex = next;
    // Autosave reading position on every screen change
    if (!isCompleted(sess.challengeId)) {
      if (sess.isFoundation) {
        state.foundationPositions[sess.challengeId] = { screenIndex: next, updatedOn: state.simulatedDate };
      } else {
        state.savedPositions[sess.challengeId] = { screenIndex: next, updatedOn: state.simulatedDate };
      }
    }
    notify('Screen ' + (next + 1) + ' of ' + item.screens.length + '.');
  }

  function startChallengeFromBeginning() {
    var sess = state.activeChallengeSession;
    if (!sess) return;
    sess.screenIndex = 0;
    // Resets reading position ONLY; never deletes completions, Cards, or Saved Scripture (§5.1)
    if (!isCompleted(sess.challengeId)) {
      if (sess.isFoundation) {
        state.foundationPositions[sess.challengeId] = { screenIndex: 0, updatedOn: state.simulatedDate };
      } else {
        state.savedPositions[sess.challengeId] = { screenIndex: 0, updatedOn: state.simulatedDate };
      }
    }
    notify('Returned to screen 1. Completions and saved items are unchanged.');
  }

  function returnFromChallengeSession() {
    var sess = state.activeChallengeSession;
    state.activeOverlay = null;
    state.activeChallengeSession = null;
    if (!sess) return;
    if (sess.origin === 'external') {
      // G04-A: External Challenge Exit/Finish ALWAYS returns to Today (never Month/Shelf/Library, no onboarding wall)
      state.activeTab = 'today';
      state.tabViews.today = { view: 'today-landing' };
      return;
    }
    state.activeTab = sess.originTab || 'today';
    if (sess.originView) {
      state.tabViews[state.activeTab] = sess.originView;
    }
  }

  function exitActiveChallenge() {
    var sess = state.activeChallengeSession;
    if (!sess) return;
    // Reading position already autosaved; leave Challenge unfinished if not already completed
    returnFromChallengeSession();
    notify('Exited Challenge. Reading position saved.');
  }

  function grantCardIfNotEarned(cardId) {
    if (!cardId || !F.CARDS_BY_ID[cardId]) return false;
    if (state.earnedAwards[cardId]) return false; // Idempotent; retains earliest credible earnedOn
    state.earnedAwards[cardId] = {
      cardId: cardId,
      earnedOn: state.simulatedDate,
      cardViewed: false,
      hubAnnouncementAcked: false
    };
    state.newDiscoveriesIndicator = true;
    return true;
  }

  function finishActiveChallenge() {
    var sess = state.activeChallengeSession;
    if (!sess) return;
    var id = sess.challengeId;
    var newlyEarnedCount = 0;

    if (!isCompleted(id)) {
      state.completedChallengeIds.push(id);
    }
    delete state.savedPositions[id];
    delete state.foundationPositions[id];

    if (sess.isFoundation) {
      var fnd = F.FOUNDATIONS_BY_ID[id];
      if (fnd && fnd.awardEligibleCardId) {
        if (grantCardIfNotEarned(fnd.awardEligibleCardId)) {
          newlyEarnedCount += 1;
        }
      }
    } else {
      var ch = F.CHALLENGES_BY_ID[id];
      if (ch) {
        var month = F.MONTHS_BY_ID[ch.yearMonth];
        if (month) {
          month.discoveries.forEach(function (disc) {
            var allMet = disc.qualifyingChallengeIds.every(function (qid) { return isCompleted(qid); });
            if (allMet && grantCardIfNotEarned(disc.cardId)) {
              newlyEarnedCount += 1;
            }
          });
          if (month.fullMonthDiscovery && month.finalized) {
            var prog = getMonthProgress(month.yearMonth);
            if (prog.allCompleted && grantCardIfNotEarned(month.fullMonthDiscovery.cardId)) {
              newlyEarnedCount += 1;
            }
          }
        }
      }
    }

    returnFromChallengeSession();
    var msg = 'Challenge finished.';
    if (state.activeTab === 'today' && newlyEarnedCount > 0 && state.announcementsEnabled) {
      msg = 'Challenge finished. New Scripture Card announcement available on Today.';
    }
    notify(msg);
  }

  /* --------------------------------------------------------------------------
   * Hub Announcements & Guest Invitation Actions (§3.3, §3.4)
   * -------------------------------------------------------------------------- */
  function dismissHubAnnouncement() {
    // Acknowledges announcement batch ONLY; never deletes Cards, New Discoveries, or per-Card New (§3.3)
    Object.keys(state.earnedAwards).forEach(function (cardId) {
      state.earnedAwards[cardId].hubAnnouncementAcked = true;
    });
    notify('Announcement dismissed. Your earned Cards remain in Field Notebook.');
  }

  function openViewDiscoveries() {
    var cardIds = getUnannouncedEarnedCardIds();
    // Acknowledge this announcement batch when opening View Discoveries, clear New Discoveries indicator, keep per-Card New!
    cardIds.forEach(function (id) {
      if (state.earnedAwards[id]) state.earnedAwards[id].hubAnnouncementAcked = true;
    });
    setTabView('today', {
      view: 'view-discoveries',
      cardIds: cardIds,
      returnTab: 'today',
      returnView: { view: 'today-landing' }
    }, { announce: 'Opened newly earned Scripture Cards.' });
  }

  function dismissGuestInvitePermanently() {
    state.account.guestInviteDismissed = true;
    notify('Continuing as guest. You can always manage account options under More.');
  }

  function toggleAnnouncementsEnabled(enabled) {
    state.announcementsEnabled = !!enabled;
    notify(enabled
      ? 'Earned Scripture Card announcements enabled.'
      : 'Earned Scripture Card announcements hidden. You will continue earning Cards normally.');
  }

  /* --------------------------------------------------------------------------
   * Full Card Viewer & Share Export (§7.3)
   * -------------------------------------------------------------------------- */
  function openFullCard(cardId) {
    if (!state.earnedAwards[cardId] || !F.CARDS_BY_ID[cardId]) {
      notify('Only earned Scripture Cards can be viewed.');
      return;
    }
    // Opening full Card view clears THAT specific Card's New marker (§3.3, §7.3)
    state.earnedAwards[cardId].cardViewed = true;
    var returnTab = state.activeTab;
    var returnView = clone(state.tabViews[state.activeTab]);
    setTabView(state.activeTab, {
      view: 'full-card',
      cardId: cardId,
      returnTab: returnTab,
      returnView: returnView
    }, { announce: 'Opened earned Scripture Card: ' + F.CARDS_BY_ID[cardId].title + '.' });
  }

  function openShareCardModal(cardId) {
    if (!state.earnedAwards[cardId] || !F.CARDS_BY_ID[cardId]) return;
    state.modal = { type: 'share-card', cardId: cardId, sharedConfirmed: false };
    notify('Opened Share Scripture Card export preview.');
  }

  function confirmSimulatedShare() {
    if (state.modal && state.modal.type === 'share-card') {
      state.modal.sharedConfirmed = true;
      notify('Simulated export complete with export-time Bibleberry attribution. In-app Card unchanged.');
    }
  }

  /* --------------------------------------------------------------------------
   * Saved Scripture Actions (§7.4)
   * -------------------------------------------------------------------------- */
  function isScriptureSaved(scriptureId) {
    return state.savedScriptures.some(function (s) { return s.id === scriptureId; });
  }

  function toggleSaveScripture(scriptureObj) {
    if (!scriptureObj || !scriptureObj.id) return;
    var idx = -1;
    for (var i = 0; i < state.savedScriptures.length; i++) {
      if (state.savedScriptures[i].id === scriptureObj.id) { idx = i; break; }
    }
    if (idx >= 0) {
      state.savedScriptures.splice(idx, 1);
      notify('Removed ' + scriptureObj.reference + ' from Saved Scripture.');
    } else {
      state.savedScriptures.unshift({
        id: scriptureObj.id,
        book: scriptureObj.book,
        reference: scriptureObj.reference,
        text: scriptureObj.text,
        sourceLabel: scriptureObj.sourceLabel,
        savedOn: state.simulatedDate
      });
      notify('Saved ' + scriptureObj.reference + ' to Saved Scripture.');
    }
  }

  /* --------------------------------------------------------------------------
   * Shelf & Active Focus Policy (§6.1–§6.3, G03)
   * -------------------------------------------------------------------------- */
  function findShelfEntry(yearMonth) {
    for (var i = 0; i < state.shelf.months.length; i++) {
      if (state.shelf.months[i].yearMonth === yearMonth) return state.shelf.months[i];
    }
    return null;
  }

  function addToShelf(yearMonth) {
    if (!isHistoricalMonth(yearMonth)) {
      notify('Only historical publication months can be added to the Shelf.');
      return;
    }
    if (findShelfEntry(yearMonth)) {
      notify(F.formatYearMonth(yearMonth) + ' is already on your Shelf.');
      return;
    }
    if (state.shelf.months.length >= 3) {
      // Open in-place manual replacement chooser (§6.2)
      state.modal = {
        type: 'shelf-replace',
        incomingYearMonth: yearMonth,
        selectedOutYearMonth: null,
        replacementFocusChoice: 'none',
        step: 'choose'
      };
      notify('Your Shelf already holds 3 months. Choose a month to put away.');
      return;
    }
    state.shelf.months.push({
      yearMonth: yearMonth,
      admissionKind: 'readerSelected',
      protected: true, // Explicitly added months are permanently protected (Kept on Shelf)
      admittedOn: state.simulatedDate
    });
    notify('Added ' + F.formatYearMonth(yearMonth) + ' to your Shelf (Kept on Shelf).');
  }

  function selectShelfReplaceTarget(outYearMonth) {
    if (!state.modal || state.modal.type !== 'shelf-replace') return;
    state.modal.selectedOutYearMonth = outYearMonth;
    state.modal.step = 'confirm';
    // Default reassign focus choice if replacing current Active Focus
    if (outYearMonth === state.shelf.activeFocusMonth) {
      state.modal.replacementFocusChoice = 'none';
    }
    notify('Review replacement of ' + F.formatYearMonth(outYearMonth) + '.');
  }

  function setModalFocusChoice(choice) {
    if (state.modal) {
      state.modal.replacementFocusChoice = choice;
      notify('');
    }
  }

  function confirmShelfReplace() {
    if (!state.modal || state.modal.type !== 'shelf-replace' || !state.modal.selectedOutYearMonth) return;
    var outYm = state.modal.selectedOutYearMonth;
    var inYm = state.modal.incomingYearMonth;
    var wasFocus = state.shelf.activeFocusMonth === outYm;
    var focusChoice = state.modal.replacementFocusChoice;

    state.shelf.months = state.shelf.months.filter(function (e) { return e.yearMonth !== outYm; });
    state.shelf.months.push({
      yearMonth: inYm,
      admissionKind: 'readerSelected',
      protected: true,
      admittedOn: state.simulatedDate
    });

    if (wasFocus) {
      state.shelf.activeFocusMonth = focusChoice === 'none' ? null : focusChoice;
    }
    state.modal = null;
    notify('Replaced ' + F.formatYearMonth(outYm) + ' with ' + F.formatYearMonth(inYm) + ' on your Shelf. All reading progress preserved.');
  }

  function keepOnShelf(yearMonth) {
    var entry = findShelfEntry(yearMonth);
    if (!entry) return;
    entry.protected = true;
    notify(F.formatYearMonth(yearMonth) + ' is now Kept on Shelf (protected from rollover).');
  }

  function setActiveFocus(yearMonth) {
    if (!findShelfEntry(yearMonth)) return;
    // Selecting Active Focus does NOT falsely mark an auto-admitted month as permanently Kept on Shelf (G03)
    state.shelf.activeFocusMonth = yearMonth;
    notify('Set ' + F.formatYearMonth(yearMonth) + ' as Active Focus.');
  }

  function clearActiveFocus() {
    state.shelf.activeFocusMonth = null;
    // Does not remove month from Shelf or alter Kept on Shelf protection, and never evicts immediately (G03)
    notify('Cleared Active Focus. Your Shelf months remain unchanged.');
  }

  function requestPutAway(yearMonth) {
    var entry = findShelfEntry(yearMonth);
    if (!entry) return;
    if (state.shelf.activeFocusMonth === yearMonth) {
      // Putting away Active Focus requires explicit reassign-or-no-focus prompt (§6.2)
      state.modal = {
        type: 'put-away-focus',
        targetYearMonth: yearMonth,
        replacementFocusChoice: 'none'
      };
      notify('Choose what happens to your Active Focus before putting ' + F.formatYearMonth(yearMonth) + ' away.');
      return;
    }
    state.shelf.months = state.shelf.months.filter(function (e) { return e.yearMonth !== yearMonth; });
    notify('Put away ' + F.formatYearMonth(yearMonth) + ' from your Shelf. All reading progress and earned Cards remain intact.');
  }

  function confirmPutAwayActiveFocus() {
    if (!state.modal || state.modal.type !== 'put-away-focus') return;
    var ym = state.modal.targetYearMonth;
    var choice = state.modal.replacementFocusChoice;
    state.shelf.months = state.shelf.months.filter(function (e) { return e.yearMonth !== ym; });
    state.shelf.activeFocusMonth = choice === 'none' ? null : choice;
    state.modal = null;
    notify('Put away ' + F.formatYearMonth(ym) + ' from your Shelf. All completions and earned Cards remain preserved.');
  }

  /**
   * Simulates month rollover (e.g., Nov 30 -> Dec 1) enforcing G02 & G03!
   */
  function simulateRolloverToDecember() {
    var priorYm = '2026-11';
    state.simulatedDate = '2026-12-01';
    state.todayChallengeUnavailable = false;
    var priorProg = getMonthProgress(priorYm);
    var rolloverNotes = [];

    // 1. G03 Shelf auto-admission if reader completed >= 1 Challenge in prior month
    if (priorProg.completed >= 1 && !findShelfEntry(priorYm)) {
      if (state.shelf.months.length < 3) {
        state.shelf.months.push({
          yearMonth: priorYm,
          admissionKind: 'autoAdmitted',
          protected: false,
          admittedOn: '2026-12-01'
        });
        rolloverNotes.push('Auto-admitted November 2026 into an open Shelf slot.');
      } else {
        // G03: Only unprotected, non-active-focus auto-admitted entries may be replaced
        var candidates = state.shelf.months.filter(function (e) {
          return e.admissionKind === 'autoAdmitted' && !e.protected && e.yearMonth !== state.shelf.activeFocusMonth;
        });
        candidates.sort(function (a, b) {
          if (a.admittedOn !== b.admittedOn) return (a.admittedOn || '').localeCompare(b.admittedOn || '');
          return a.yearMonth.localeCompare(b.yearMonth);
        });
        if (candidates.length > 0) {
          var evicted = candidates[0];
          state.shelf.months = state.shelf.months.filter(function (e) { return e.yearMonth !== evicted.yearMonth; });
          state.shelf.months.push({
            yearMonth: priorYm,
            admissionKind: 'autoAdmitted',
            protected: false,
            admittedOn: '2026-12-01'
          });
          rolloverNotes.push('Auto-admitted November 2026, replacing oldest unprotected non-focus month (' + F.formatYearMonth(evicted.yearMonth) + '). Protected and Active Focus months were kept safe (G03).');
        } else {
          rolloverNotes.push('All 3 Shelf slots are protected by Kept on Shelf and/or Active Focus — nothing was displaced (G03). November 2026 remains in Library.');
        }
      }
    }

    // 2. G02 Check for unfinished interrupted Challenge in prior month
    var priorMonth = F.MONTHS_BY_ID[priorYm];
    var interrupted = null;
    if (priorMonth) {
      priorMonth.challenges.forEach(function (ch) {
        if (state.savedPositions[ch.id] && !isCompleted(ch.id)) {
          interrupted = ch.id;
        }
      });
    }
    if (interrupted) {
      state.rolloverInterruption = {
        eligible: true,
        consumed: false,
        priorYearMonth: priorYm,
        challengeId: interrupted
      };
      rolloverNotes.push('Recorded G02 prior-month interrupted reading (shown on Today only when no Active Focus is set).');
    }

    notify('Simulated rollover to December 1, 2026. ' + (rolloverNotes.join(' ') || 'December 2026 is now Current Month.'));
  }

  /* --------------------------------------------------------------------------
   * App Introduction & Guided App Tutorial (G06)
   * -------------------------------------------------------------------------- */
  function startAppIntroReplay() {
    saveCurrentTabScroll();
    state.onboarding.introReplayMode = true;
    state.onboarding.introStep = 0;
    state.activeOverlay = 'app-intro';
    notify('Replaying App Introduction.');
  }

  function stepAppIntro(delta) {
    var next = state.onboarding.introStep + delta;
    if (next < 0) next = 0;
    if (next > 2) {
      completeAppIntro();
      return;
    }
    state.onboarding.introStep = next;
    notify('App Introduction screen ' + (next + 1) + ' of 3.');
  }

  function completeAppIntro() {
    var wasReplay = state.onboarding.introReplayMode;
    state.onboarding.introStatus = 'completed';
    state.onboarding.introReplayMode = false;
    state.activeOverlay = null;
    if (wasReplay) {
      state.activeTab = 'more';
      state.tabViews.more = { view: 'more-landing' };
      notify('Finished reviewing App Introduction. Returned to More.');
      return;
    }
    // Ordinary first use sequences App Introduction → independent skippable Guided App Tutorial (G06)
    state.activeTab = 'today';
    state.tabViews.today = { view: 'today-landing' };
    if (state.onboarding.tutorialStatus === 'pending') {
      state.onboarding.tutorialActive = true;
      state.onboarding.tutorialStep = 0;
      state.onboarding.tutorialReplayMode = false;
      notify('App Introduction complete. Starting optional Guided App Tutorial.');
    } else {
      notify('Welcome to Today.');
    }
  }

  function skipAppIntro() {
    var wasReplay = state.onboarding.introReplayMode;
    if (!wasReplay) {
      state.onboarding.introStatus = 'skipped';
    }
    state.onboarding.introReplayMode = false;
    state.activeOverlay = null;
    if (wasReplay) {
      state.activeTab = 'more';
      state.tabViews.more = { view: 'more-landing' };
      notify('Closed App Introduction. Returned to More.');
      return;
    }
    state.activeTab = 'today';
    state.tabViews.today = { view: 'today-landing' };
    if (state.onboarding.tutorialStatus === 'pending') {
      state.onboarding.tutorialActive = true;
      state.onboarding.tutorialStep = 0;
      state.onboarding.tutorialReplayMode = false;
      notify('Skipped App Introduction. You may take or skip the Guided App Tutorial.');
    } else {
      notify('Skipped App Introduction.');
    }
  }

  function setReminderPreference(enabled, time) {
    state.onboarding.reminderEnabled = !!enabled;
    if (time) state.onboarding.reminderTime = time;
    notify('Updated optional reminder preference.');
  }

  function startAppTutorialReplay() {
    state.onboarding.tutorialActive = true;
    state.onboarding.tutorialStep = 0;
    state.onboarding.tutorialReplayMode = true;
    state.activeTab = 'today';
    state.tabViews.today = { view: 'today-landing' };
    notify('Started Guided App Tutorial (Step 1 of 4).');
  }

  var TUTORIAL_STEPS = [
    {
      tab: 'today',
      targetSelector: '[data-tutorial-target="nav-today"]',
      title: '1 of 4 • Today',
      body: 'Today puts current teaching first, with a direct link to this month’s agenda and at most one calm historical continuation when you choose an Active Focus.'
    },
    {
      tab: 'library',
      targetSelector: '[data-tutorial-target="nav-library"]',
      title: '2 of 4 • Library & Shelf',
      body: 'Library opens to your optional 0–3 month Shelf for focused historical study, with direct access to Browse All Months and optional Foundations readings.'
    },
    {
      tab: 'collections',
      targetSelector: '[data-tutorial-target="nav-collections"]',
      title: '3 of 4 • Collections',
      body: 'Collections gathers your earned-only Field Notebook of Scripture Cards alongside your independent Saved Scripture passages.'
    },
    {
      tab: 'more',
      targetSelector: '[data-tutorial-target="nav-more"]',
      title: '4 of 4 • More',
      body: 'More holds Ministry News, Podcasts & Resources, Appearance preferences, optional Account & Progress, and replay links for the Introduction and this App Tutorial.'
    }
  ];

  function stepTutorial(delta) {
    var next = state.onboarding.tutorialStep + delta;
    if (next < 0) next = 0;
    if (next >= TUTORIAL_STEPS.length) {
      finishTutorial(false);
      return;
    }
    state.onboarding.tutorialStep = next;
    state.activeTab = TUTORIAL_STEPS[next].tab;
    state.tabViews[state.activeTab] = getLandingViewForTab(state.activeTab);
    notify('App Tutorial step ' + (next + 1) + ' of ' + TUTORIAL_STEPS.length + ': ' + TUTORIAL_STEPS[next].title);
  }

  function finishTutorial(wasSkipped) {
    var wasReplay = state.onboarding.tutorialReplayMode;
    state.onboarding.tutorialActive = false;
    state.onboarding.tutorialReplayMode = false;
    if (!wasReplay) {
      state.onboarding.tutorialStatus = wasSkipped ? 'skipped' : 'completed';
    }
    // Never awards Cards, never increments Challenge count (G06, G07)!
    if (wasReplay) {
      state.activeTab = 'more';
      state.tabViews.more = { view: 'more-landing' };
      notify((wasSkipped ? 'Closed' : 'Finished') + ' App Tutorial replay. Returned to More.');
    } else {
      state.activeTab = 'today';
      state.tabViews.today = { view: 'today-landing' };
      notify(wasSkipped ? 'Skipped App Tutorial. Replay anytime under More.' : 'Completed App Tutorial. Welcome to Today.');
    }
  }

  /* --------------------------------------------------------------------------
   * Simulated Account & Guest-to-Account Merge (G08, §9.3)
   * -------------------------------------------------------------------------- */
  function openAccountMergeModal(initialMode) {
    state.account.mergeScenario = initialMode || state.account.mergeScenario || 'existing-conflict';
    state.account.mergeStatus = 'idle';
    state.modal = {
      type: 'account-merge',
      emailInput: 'reader@example.org',
      mode: state.account.mergeScenario
    };
    notify('Opened simulated Account sign-in and guest continuity flow.');
  }

  function setAccountMergeMode(mode) {
    state.account.mergeScenario = mode;
    if (state.modal && state.modal.type === 'account-merge') {
      state.modal.mode = mode;
    }
    notify('Selected simulated merge outcome: ' + mode);
  }

  function runSimulatedAccountMerge(modeOverride) {
    var mode = modeOverride || state.account.mergeScenario || 'existing-conflict';
    state.account.mergeScenario = mode;
    state.account.mergeStatus = 'authenticating';
    notify('Authenticating (simulated)…');

    // Deterministic brief step progression so reviewers see Authenticating → Reconciling → Verified/Failed
    setTimeout(function () {
      if (!state.modal || state.modal.type !== 'account-merge') return;
      state.account.mergeStatus = 'reconciling';
      notify('Reconciling guest records (simulated)…');

      setTimeout(function () {
        if (!state.modal || state.modal.type !== 'account-merge') return;
        if (mode === 'partial-failure') {
          // Never claim success on failure; retain local guest records intact for safe retry (§9.3, G08)
          state.account.mergeStatus = 'failed';
          notify('Simulated reconciliation paused due to temporary connection error. Your local guest records remain safe; retry anytime.');
          return;
        }
        finalizeVerifiedMerge(mode);
      }, 220);
    }, 180);
  }

  function finalizeVerifiedMerge(mode) {
    var acct = state.account.simulatedExistingAccount;
    var hadGuestCompletions = getDistinctCompletedCount() > 0;
    var hadGuestCards = Object.keys(state.earnedAwards).length > 0;
    var hadGuestSaved = state.savedScriptures.length > 0;
    var hadGuestShelf = state.shelf.months.length > 0;
    var guestShelfYms = state.shelf.months.map(function (m) { return m.yearMonth; }).sort().join(',');
    var acctShelfYms = acct.shelf.months.map(function (m) { return m.yearMonth; }).sort().join(',');
    var guestFocus = state.shelf.activeFocusMonth || null;
    var acctFocus = acct.shelf.activeFocusMonth || null;
    var realShelfConflict = false;
    var isExistingAccount = mode === 'existing-account' || mode === 'existing-clean' || mode === 'existing-conflict';

    if (isExistingAccount) {
      // Merge completions idempotently
      acct.completedChallengeIds.forEach(function (id) {
        if (!isCompleted(id)) state.completedChallengeIds.push(id);
      });
      // Merge earned awards retaining EARLIEST credible earnedOn
      Object.keys(acct.earnedAwards).forEach(function (cardId) {
        var incoming = acct.earnedAwards[cardId];
        var existing = state.earnedAwards[cardId];
        if (!existing) {
          state.earnedAwards[cardId] = clone(incoming);
        } else if (incoming.earnedOn < existing.earnedOn) {
          existing.earnedOn = incoming.earnedOn;
        }
      });
      // Merge Saved Scripture deduplicated by id
      acct.savedScriptures.forEach(function (sc) {
        if (!isScriptureSaved(sc.id)) {
          state.savedScriptures.push(clone(sc));
        }
      });

      // Existing-account Shelf precedence ALWAYS applies on existing-account sign-in,
      // even when the guest Shelf is empty (§9.3, G08).
      // Show the G08 conflict sentence ONLY when actual differing guest Shelf selections were displaced.
      var shelvesEqual = guestShelfYms === acctShelfYms && guestFocus === acctFocus;
      realShelfConflict = hadGuestShelf && !shelvesEqual;
      state.shelf = clone(acct.shelf);
    }

    var preservedCategories = [];
    if (hadGuestCompletions) preservedCategories.push('completed Challenges');
    if (hadGuestCards) preservedCategories.push('earned Scripture Cards and earned dates');
    if (hadGuestSaved) preservedCategories.push('Saved Scripture passages');
    if (!isExistingAccount && hadGuestShelf) preservedCategories.push('Shelf selections');
    if (preservedCategories.length === 0) preservedCategories.push('preferences');

    state.account.signedIn = true;
    state.account.email = acct.email;
    state.account.mergeStatus = 'verifiedSuccess';
    state.account.mergeConfirmationShown = true;
    state.account.lastMergeSummary = {
      mode: mode,
      preservedCategories: preservedCategories,
      hadShelfConflict: realShelfConflict,
      dismissed: false
    };
    state.modal = null;
    state.activeTab = 'today';
    state.tabViews.today = { view: 'today-landing' };
    notify('Simulated verified account merge complete.');
  }

  function dismissMergeConfirmation() {
    if (state.account.lastMergeSummary) {
      state.account.lastMergeSummary.dismissed = true;
    }
    notify('Dismissed merge confirmation.');
  }

  function signOutSimulated() {
    state.account.signedIn = false;
    state.account.email = null;
    state.account.mergeStatus = 'idle';
    state.account.lastMergeSummary = null;
    notify('Signed out of simulated account. Returned to local guest mode.');
  }

  /* --------------------------------------------------------------------------
   * Preferences & Reviewer Controls
   * -------------------------------------------------------------------------- */
  function setPaletteMode(mode) {
    state.appearance.paletteMode = mode === 'manual' ? 'manual' : 'seasons';
    notify('Appearance palette mode set to ' + (mode === 'manual' ? 'Choose My Colors' : 'Follow Bibleberry Seasons') + '.');
  }

  function setManualPalette(paletteId) {
    state.appearance.manualPalette = paletteId;
    state.appearance.paletteMode = 'manual';
    notify('Selected manual palette: ' + getSeasonLabel() + '.');
  }

  function setContrastMode(contrast) {
    state.appearance.contrastMode = contrast;
    notify('Contrast mode set to ' + contrast + '.');
  }

  function setTextScale(scale) {
    state.appearance.textScale = scale;
    notify('Text size set to ' + scale + '.');
  }

  function setReducedMotion(enabled) {
    state.appearance.reducedMotion = !!enabled;
    notify('Reduced motion ' + (enabled ? 'enabled' : 'disabled') + '.');
  }

  function setSimulatedDate(isoDate) {
    state.simulatedDate = isoDate;
    state.todayChallengeUnavailable = false;
    notify('Simulated date set to ' + F.formatCivilDate(isoDate) + '.');
  }

  function toggleTodayUnavailable() {
    state.todayChallengeUnavailable = !state.todayChallengeUnavailable;
    notify('Today Challenge availability: ' + (state.todayChallengeUnavailable ? 'Unavailable fallback' : 'Available') + '.');
  }

  function setNewsLoadState(loadState) {
    state.newsUi.loadState = loadState;
    notify('Ministry News state set to: ' + loadState + '.');
  }

  function setLibraryLoadState(loadState) {
    state.libraryUi.loadState = loadState;
    notify('Library Catalogue state set to: ' + loadState + '.');
  }

  function closeModal() {
    state.modal = null;
    notify('Closed dialog.');
  }

  return {
    TUTORIAL_STEPS: TUTORIAL_STEPS,
    init: init,
    subscribe: subscribe,
    notify: notify,
    getState: getState,
    loadScenario: loadScenario,
    resetCurrentScenario: resetCurrentScenario,
    getCurrentYearMonth: getCurrentYearMonth,
    getPreviousYearMonth: getPreviousYearMonth,
    getAdvancePreviewYearMonth: getAdvancePreviewYearMonth,
    isAdvancePreviewMonth: isAdvancePreviewMonth,
    isHistoricalMonth: isHistoricalMonth,
    isChallengeReleased: isChallengeReleased,
    getTodayChallenge: getTodayChallenge,
    getResolvedPalette: getResolvedPalette,
    getResolvedContrast: getResolvedContrast,
    getSeasonLabel: getSeasonLabel,
    isCompleted: isCompleted,
    getDistinctCompletedCount: getDistinctCompletedCount,
    getLifetimeStatus: getLifetimeStatus,
    getMonthProgress: getMonthProgress,
    getDiscoveryProgress: getDiscoveryProgress,
    getUnannouncedEarnedCardIds: getUnannouncedEarnedCardIds,
    getAllEarnedCardsSorted: getAllEarnedCardsSorted,
    getEarnedCardsByCategory: getEarnedCardsByCategory,
    getEarnedCardsForPublicationMonth: getEarnedCardsForPublicationMonth,
    isGuestInviteEligible: isGuestInviteEligible,
    getTodayContinuation: getTodayContinuation,
    getOrderedShelfMonths: getOrderedShelfMonths,
    findShelfEntry: findShelfEntry,
    selectTab: selectTab,
    setTabView: setTabView,
    navigateBackInTab: navigateBackInTab,
    openMonthScreen: openMonthScreen,
    openMonthlyIntroReplay: openMonthlyIntroReplay,
    advanceMonthlyIntro: advanceMonthlyIntro,
    skipMonthlyIntroToWelcome: skipMonthlyIntroToWelcome,
    completeMonthlyIntro: completeMonthlyIntro,
    openChallenge: openChallenge,
    openFoundationReading: openFoundationReading,
    launchExternalDeepLink: launchExternalDeepLink,
    closeExternalUnavailable: closeExternalUnavailable,
    stepChallengeScreen: stepChallengeScreen,
    startChallengeFromBeginning: startChallengeFromBeginning,
    exitActiveChallenge: exitActiveChallenge,
    finishActiveChallenge: finishActiveChallenge,
    dismissHubAnnouncement: dismissHubAnnouncement,
    openViewDiscoveries: openViewDiscoveries,
    dismissGuestInvitePermanently: dismissGuestInvitePermanently,
    toggleAnnouncementsEnabled: toggleAnnouncementsEnabled,
    openFullCard: openFullCard,
    openShareCardModal: openShareCardModal,
    confirmSimulatedShare: confirmSimulatedShare,
    isScriptureSaved: isScriptureSaved,
    toggleSaveScripture: toggleSaveScripture,
    addToShelf: addToShelf,
    selectShelfReplaceTarget: selectShelfReplaceTarget,
    setModalFocusChoice: setModalFocusChoice,
    confirmShelfReplace: confirmShelfReplace,
    keepOnShelf: keepOnShelf,
    setActiveFocus: setActiveFocus,
    clearActiveFocus: clearActiveFocus,
    requestPutAway: requestPutAway,
    confirmPutAwayActiveFocus: confirmPutAwayActiveFocus,
    simulateRolloverToDecember: simulateRolloverToDecember,
    startAppIntroReplay: startAppIntroReplay,
    stepAppIntro: stepAppIntro,
    completeAppIntro: completeAppIntro,
    skipAppIntro: skipAppIntro,
    setReminderPreference: setReminderPreference,
    startAppTutorialReplay: startAppTutorialReplay,
    stepTutorial: stepTutorial,
    finishTutorial: finishTutorial,
    openAccountMergeModal: openAccountMergeModal,
    setAccountMergeMode: setAccountMergeMode,
    runSimulatedAccountMerge: runSimulatedAccountMerge,
    finalizeVerifiedMerge: finalizeVerifiedMerge,
    dismissMergeConfirmation: dismissMergeConfirmation,
    signOutSimulated: signOutSimulated,
    setPaletteMode: setPaletteMode,
    setManualPalette: setManualPalette,
    setContrastMode: setContrastMode,
    setTextScale: setTextScale,
    setReducedMotion: setReducedMotion,
    setSimulatedDate: setSimulatedDate,
    toggleTodayUnavailable: toggleTodayUnavailable,
    setNewsLoadState: setNewsLoadState,
    setLibraryLoadState: setLibraryLoadState,
    closeModal: closeModal
  };
})();
