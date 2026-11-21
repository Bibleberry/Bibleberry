/*
 * Bibleberry R06 Connected Experience Prototype — App Shell Controller & Event Wiring
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.App = (function () {
  var F = window.R06Proto.Fixtures;
  var S = window.R06Proto.State;
  var A = window.R06Proto.Art;
  var VT = window.R06Proto.ViewsToday;
  var VM = window.R06Proto.ViewsMonth;
  var VL = window.R06Proto.ViewsLibrary;
  var VC = window.R06Proto.ViewsCollections;
  var VMore = window.R06Proto.ViewsMore;
  var VO = window.R06Proto.ViewsOverlays;

  var workbenchOpen = false;
  var workbenchHidden = false;
  var pendingScrollRestore = null;
  var pendingMonthScrollTarget = null;
  var modalTriggerSelector = null;
  var tutorialTriggerSelector = null;
  var prevModalKey = '';
  var prevTutorialActive = false;
  var prevViewKey = '';

  var FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  function cssAttrEscape(val) {
    return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function buildFocusSelector(el) {
    if (!el || el === document.body || el === document.documentElement || !el.getAttribute) return null;
    var testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + cssAttrEscape(testId) + '"]';
    if (el.id) return '#' + cssAttrEscape(el.id);
    var inputAction = el.getAttribute('data-input-action');
    if (inputAction) return '[data-input-action="' + cssAttrEscape(inputAction) + '"]';
    if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) {
      var name = el.getAttribute('name');
      var val = el.getAttribute('value');
      if (name && val) return 'input[name="' + cssAttrEscape(name) + '"][value="' + cssAttrEscape(val) + '"]';
      var chAct = el.getAttribute('data-change-action');
      if (chAct) return '[data-change-action="' + cssAttrEscape(chAct) + '"]';
    }
    var action = el.getAttribute('data-action');
    if (action) {
      var parts = ['[data-action="' + cssAttrEscape(action) + '"]'];
      ['data-tab', 'data-year-month', 'data-challenge-id', 'data-foundation-id', 'data-card-id', 'data-article-id', 'data-category', 'data-sub', 'data-palette-id', 'data-contrast', 'data-scale', 'data-year', 'data-mode', 'data-book', 'data-date', 'data-link-id', 'data-load-state'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v !== null) parts.push('[' + attr + '="' + cssAttrEscape(v) + '"]');
      });
      return parts.join('');
    }
    return null;
  }

  function captureFocusDescriptor(el) {
    if (!el || el === document.body || el === document.documentElement || !el.getAttribute) return null;
    var inputAction = el.getAttribute('data-input-action');
    return {
      selector: buildFocusSelector(el),
      inputAction: inputAction,
      selStart: inputAction && typeof el.selectionStart === 'number' ? el.selectionStart : null,
      selEnd: inputAction && typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
      testId: el.getAttribute('data-testid') || '',
      action: el.getAttribute('data-action') || '',
      yearMonth: el.getAttribute('data-year-month') || '',
      isInsideModal: !!(el.closest && el.closest('.modal-panel')),
      isInsideTutorial: !!(el.closest && el.closest('.tutorial-card')),
      isNavTab: el.getAttribute('data-action') === 'select-tab'
    };
  }

  function getFocusableElements(container) {
    if (!container) return [];
    var nodes = Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE_SELECTOR));
    return nodes.filter(function (el) {
      if (el.hasAttribute('hidden') || el.closest('[hidden]')) return false;
      var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      return true;
    });
  }

  function focusElementSafely(el) {
    if (!el || typeof el.focus !== 'function' || el.disabled) return false;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      el.focus();
    }
    return document.activeElement === el;
  }

  function setBackgroundInert(isInert) {
    var wb = document.getElementById('workbench-root');
    var vp = document.querySelector('.app-viewport');
    [wb, vp].forEach(function (el) {
      if (!el) return;
      if (isInert) {
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
      } else {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      }
    });
  }

  function getModalKey(state) {
    if (!state.modal) return '';
    return state.modal.type + ':' + (state.modal.step || '');
  }

  function getViewKey(state) {
    var view = state.tabViews[state.activeTab] || {};
    return [
      state.activeOverlay || '',
      state.activeTab || '',
      view.view || '',
      view.yearMonth || '',
      view.cardId || '',
      view.articleId || ''
    ].join('|');
  }

  var NAV_ITEMS = [
    { id: 'today', label: 'Today', icon: 'today', target: 'nav-today' },
    { id: 'library', label: 'Library', icon: 'library', target: 'nav-library' },
    { id: 'collections', label: 'Collections', icon: 'collections', target: 'nav-collections' },
    { id: 'more', label: 'More', icon: 'more', target: 'nav-more' }
  ];

  function applyDocumentTokens(state) {
    var root = document.documentElement;
    root.setAttribute('data-resolved-palette', S.getResolvedPalette());
    root.setAttribute('data-resolved-contrast', S.getResolvedContrast());
    root.setAttribute('data-text-scale', state.appearance.textScale || 'default');
    root.setAttribute('data-reduced-motion', state.appearance.reducedMotion ? 'true' : 'false');
  }

  function renderGlobalNav(state) {
    var navEl = document.getElementById('global-nav-root');
    var shellEl = document.getElementById('app-shell');
    var hideNav = !!state.activeOverlay;

    if (hideNav) {
      navEl.setAttribute('hidden', '');
      shellEl.classList.add('app-shell--focused');
      return;
    }

    navEl.removeAttribute('hidden');
    shellEl.classList.remove('app-shell--focused');

    var tutorialTarget = (state.onboarding.tutorialActive && S.TUTORIAL_STEPS[state.onboarding.tutorialStep])
      ? S.TUTORIAL_STEPS[state.onboarding.tutorialStep].tab
      : null;

    var html =
      '<div class="global-nav__brand">' +
        '<span class="global-nav__wordmark">Bibleberry</span>' +
        '<span class="global-nav__sub">R06 Reader Prototype</span>' +
      '</div>' +
      '<ul class="global-nav__list">' +
        NAV_ITEMS.map(function (item) {
          var isActive = state.activeTab === item.id;
          var isSpotlit = tutorialTarget === item.id;
          var showDot = item.id === 'collections' && state.newDiscoveriesIndicator;
          return (
            '<li>' +
              '<button type="button" class="global-nav__btn' + (isSpotlit ? ' tutorial-spotlight-ring' : '') + '"' +
                ' data-action="select-tab" data-tab="' + item.id + '"' +
                ' data-tutorial-target="' + item.target + '"' +
                ' data-testid="nav-tab-' + item.id + '"' +
                (isActive ? ' aria-current="page"' : '') + '>' +
                '<span class="global-nav__icon-wrap">' +
                  A.icon(item.icon) +
                  (showDot ? '<span class="global-nav__dot" aria-hidden="true"></span>' : '') +
                '</span>' +
                '<span>' + item.label + (showDot ? '<span class="sr-only"> (New Discoveries)</span>' : '') + '</span>' +
              '</button>' +
            '</li>'
          );
        }).join('') +
      '</ul>';

    navEl.innerHTML = html;
  }

  function renderMainContent(state) {
    var mainEl = document.getElementById('main-content');
    var html = '';

    if (state.activeOverlay === 'app-intro') {
      html = VO.renderAppIntro(state);
    } else if (state.activeOverlay === 'month-intro') {
      html = VO.renderMonthlyIntro(state);
    } else if (state.activeOverlay === 'challenge') {
      html = VO.renderChallengeReader(state);
    } else if (state.activeOverlay === 'external-unavailable') {
      html = VO.renderExternalUnavailable();
    } else {
      var view = state.tabViews[state.activeTab] || { view: state.activeTab + '-landing' };
      switch (view.view) {
        case 'today-landing':
          html = VT.renderTodayLanding(state);
          break;
        case 'view-discoveries':
          html = VT.renderViewDiscoveries(state, view);
          break;
        case 'month-screen':
          html = VM.renderMonthScreen(state, view);
          break;
        case 'library-landing':
          html = VL.renderLibraryLanding(state);
          break;
        case 'browse-all-months':
          html = VL.renderBrowseAllMonths(state);
          break;
        case 'foundations-overview':
          html = VL.renderFoundationsOverview(state);
          break;
        case 'collections-landing':
          html = VC.renderCollectionsLanding(state);
          break;
        case 'field-notebook':
          html = VC.renderFieldNotebook(state);
          break;
        case 'notebook-month-gallery':
          html = VC.renderNotebookMonthGallery(state, view);
          break;
        case 'all-earned-cards':
          html = VC.renderAllEarnedCards(state);
          break;
        case 'foundations-collection':
          html = VC.renderFoundationsCollection();
          break;
        case 'special-experiences-collection':
          html = VC.renderSpecialExperiencesCollection();
          break;
        case 'full-card':
          html = VC.renderFullCard(state, view);
          break;
        case 'saved-scripture':
          html = VC.renderSavedScripture(state);
          break;
        case 'more-landing':
          html = VMore.renderMoreLanding(state);
          break;
        case 'news-list':
          html = VMore.renderNewsList(state);
          break;
        case 'news-detail':
          html = VMore.renderNewsDetail(state, view);
          break;
        case 'more-appearance':
          html = VMore.renderAppearanceSettings(state);
          break;
        case 'more-account':
          html = VMore.renderAccountProgress(state);
          break;
        case 'more-podcasts':
          html = VMore.renderPodcastsResources();
          break;
        case 'more-about':
          html = VMore.renderAboutBibleberry();
          break;
        default:
          html = VT.renderTodayLanding(state);
      }
    }

    mainEl.innerHTML = html;
  }

  function restoreFocusAfterRender(state, focusDesc, extrasEl, prevModal, nextModal, prevTut, nextTut, prevView, nextView) {
    // 1. Modal open: keep background inert and focus contained inside .modal-panel
    if (nextModal) {
      setBackgroundInert(true);
      var panel = extrasEl ? extrasEl.querySelector('.modal-panel') : null;
      if (!panel) return;
      var focusables = getFocusableElements(panel);
      if (nextModal !== prevModal) {
        if (!prevModal && focusDesc && !focusDesc.isInsideModal && focusDesc.selector) {
          modalTriggerSelector = focusDesc.selector;
        }
        if (focusables.length > 0) {
          focusElementSafely(focusables[0]);
        } else {
          focusElementSafely(panel);
        }
        return;
      }
      // Same modal step re-rendered (e.g., radio selection or simulated share confirmation)
      if (focusDesc && focusDesc.isInsideModal && focusDesc.selector) {
        var sameInModal = panel.querySelector(focusDesc.selector);
        if (sameInModal && focusElementSafely(sameInModal)) return;
      }
      if (focusables.length > 0) {
        focusElementSafely(focusables[0]);
      } else {
        focusElementSafely(panel);
      }
      return;
    }

    // 2. Modal just closed: remove inert and restore focus to trigger (or #main-content if route changed)
    if (prevModal && !nextModal) {
      setBackgroundInert(false);
      var triggerSel = modalTriggerSelector;
      modalTriggerSelector = null;
      if (nextView === prevView && triggerSel) {
        var trig = document.querySelector(triggerSel);
        if (trig && focusElementSafely(trig)) return;
      }
      focusElementSafely(document.getElementById('main-content'));
      return;
    }

    setBackgroundInert(false);

    // 3. Guided App Tutorial active: preserve keyboard focus across Next/Back steps
    if (nextTut) {
      var tutCard = extrasEl ? extrasEl.querySelector('.tutorial-card') : null;
      if (!prevTut) {
        if (focusDesc && !focusDesc.isInsideTutorial && focusDesc.selector) {
          tutorialTriggerSelector = focusDesc.selector;
        }
        if (tutCard) {
          var nextBtn = tutCard.querySelector('[data-testid="tutorial-next-btn"]');
          if (nextBtn && focusElementSafely(nextBtn)) return;
        }
      } else if (tutCard && focusDesc && focusDesc.isInsideTutorial) {
        if (focusDesc.selector) {
          var sameTutBtn = tutCard.querySelector(focusDesc.selector);
          if (sameTutBtn && !sameTutBtn.disabled && focusElementSafely(sameTutBtn)) return;
        }
        var fallbackTutBtn = tutCard.querySelector('[data-testid="tutorial-next-btn"]');
        if (fallbackTutBtn && focusElementSafely(fallbackTutBtn)) return;
      }
      return;
    }

    // 4. Guided App Tutorial just closed: restore focus to replay trigger or #main-content
    if (prevTut && !nextTut) {
      var tutTrigSel = tutorialTriggerSelector;
      tutorialTriggerSelector = null;
      if (tutTrigSel) {
        var tutTrig = document.querySelector(tutTrigSel);
        if (tutTrig && focusElementSafely(tutTrig)) return;
      }
      focusElementSafely(document.getElementById('main-content'));
      return;
    }

    // 5. Search / text input focus + caret restoration
    if (focusDesc && focusDesc.inputAction) {
      var nextInput = document.querySelector('[data-input-action="' + cssAttrEscape(focusDesc.inputAction) + '"]');
      if (nextInput && focusElementSafely(nextInput)) {
        if (typeof focusDesc.selStart === 'number') {
          try { nextInput.setSelectionRange(focusDesc.selStart, focusDesc.selEnd); } catch (e) { /* ignore */ }
        }
        return;
      }
    }

    // 6. Primary navigation tab focus preservation
    if (focusDesc && focusDesc.isNavTab) {
      var navBtn = document.querySelector('[data-testid="nav-tab-' + cssAttrEscape(state.activeTab) + '"]');
      if (navBtn && focusElementSafely(navBtn)) return;
    }

    // 7. Same view/overlay re-render: restore exact focused control or its semantic successor
    if (focusDesc && nextView === prevView) {
      if (focusDesc.selector) {
        var exact = document.querySelector(focusDesc.selector);
        if (exact && !exact.disabled && focusElementSafely(exact)) return;
      }
      // Semantic fallback when activated control transforms or disables in-place
      if (focusDesc.testId === 'reader-next-btn') {
        var finBtn = document.querySelector('[data-testid="reader-finish-btn"]');
        if (finBtn && focusElementSafely(finBtn)) return;
      }
      if (focusDesc.testId === 'reader-prev-btn' || focusDesc.testId === 'reader-start-beginning-btn') {
        var nxtBtn = document.querySelector('[data-testid="reader-next-btn"]');
        if (nxtBtn && focusElementSafely(nxtBtn)) return;
      }
      if (focusDesc.action === 'keep-on-shelf' && focusDesc.yearMonth) {
        var openMo = document.querySelector('[data-testid="shelf-open-' + cssAttrEscape(focusDesc.yearMonth) + '"]');
        if (openMo && focusElementSafely(openMo)) return;
      }
      if (focusDesc.action === 'set-active-focus' && focusDesc.yearMonth) {
        var clrBtn = document.querySelector('[data-testid="shelf-clear-focus-' + cssAttrEscape(focusDesc.yearMonth) + '"]');
        if (clrBtn && focusElementSafely(clrBtn)) return;
      }
      if (focusDesc.action === 'clear-active-focus') {
        var firstShelfOpen = document.querySelector('.shelf-card [data-action="open-month"]');
        if (firstShelfOpen && focusElementSafely(firstShelfOpen)) return;
      }
    }

    // 8. Navigated to a new view or overlay: place focus cleanly on #main-content
    if (nextView !== prevView && prevView !== '') {
      focusElementSafely(document.getElementById('main-content'));
    }
  }

  function renderAll(state) {
    var focusDesc = captureFocusDescriptor(document.activeElement);
    var nextModal = getModalKey(state);
    var nextTut = !!(state.onboarding.tutorialActive && !state.activeOverlay);
    var nextView = getViewKey(state);

    applyDocumentTokens(state);

    var wbEl = document.getElementById('workbench-root');
    if (wbEl) {
      if (workbenchHidden) {
        wbEl.setAttribute('hidden', '');
        document.body.setAttribute('data-workbench-hidden', 'true');
        wbEl.innerHTML = '';
      } else {
        wbEl.removeAttribute('hidden');
        document.body.removeAttribute('data-workbench-hidden');
        wbEl.innerHTML = VO.renderReviewerWorkbench(state, workbenchOpen);
      }
    }

    renderGlobalNav(state);
    renderMainContent(state);

    var extrasEl = document.getElementById('overlay-extras-root');
    if (extrasEl) {
      extrasEl.innerHTML = VO.renderTutorialOverlay(state) + VO.renderModal(state);
    }

    var srEl = document.getElementById('sr-announcer');
    if (srEl && state.statusMessage) {
      srEl.textContent = '';
      setTimeout(function () { srEl.textContent = state.statusMessage; }, 20);
    }

    restoreFocusAfterRender(state, focusDesc, extrasEl, prevModalKey, nextModal, prevTutorialActive, nextTut, prevViewKey, nextView);
    prevModalKey = nextModal;
    prevTutorialActive = nextTut;
    prevViewKey = nextView;

    // Handle scroll restoration or current-week anchor positioning (§4.1)
    if (pendingMonthScrollTarget) {
      var ym = pendingMonthScrollTarget;
      pendingMonthScrollTarget = null;
      var savedY = state.monthScroll[ym];
      if (typeof savedY === 'number' && savedY > 0) {
        window.scrollTo(0, savedY);
      } else if (ym === S.getCurrentYearMonth() && !S.isAdvancePreviewMonth(ym)) {
        var anchor = document.getElementById('current-week-anchor');
        if (anchor) {
          anchor.scrollIntoView({ behavior: state.appearance.reducedMotion ? 'auto' : 'smooth', block: 'start' });
        } else {
          window.scrollTo(0, 0);
        }
      } else {
        window.scrollTo(0, 0);
      }
    } else if (typeof pendingScrollRestore === 'number') {
      var y = pendingScrollRestore;
      pendingScrollRestore = null;
      window.scrollTo(0, y);
    }
  }

  /* --------------------------------------------------------------------------
   * Delegated Click & Input Event Handlers
   * -------------------------------------------------------------------------- */
  function handleClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var state = S.getState();

    // Capture trigger selector before opening a modal or tutorial (covers pointer & keyboard clicks)
    var sel = buildFocusSelector(btn);
    if (sel && !btn.closest('.modal-panel')) {
      if (action === 'add-to-shelf' || action === 'put-away' || action === 'open-share-card' || action === 'open-account-merge' || action === 'open-foundation') {
        modalTriggerSelector = sel;
      }
      if (action === 'replay-app-tutorial') {
        tutorialTriggerSelector = sel;
      }
    }

    switch (action) {
      case 'select-tab': {
        var tab = btn.getAttribute('data-tab');
        var res = S.selectTab(tab);
        pendingScrollRestore = res.restoreScroll;
        break;
      }
      case 'nav-back': {
        var cur = state.tabViews[state.activeTab];
        var backView = cur && cur.returnView;
        S.navigateBackInTab();
        if (backView && backView.view === 'month-screen' && backView.yearMonth) {
          pendingMonthScrollTarget = backView.yearMonth;
        } else {
          pendingScrollRestore = state.tabScroll[state.activeTab] || 0;
        }
        break;
      }
      case 'open-month': {
        var ym = btn.getAttribute('data-year-month');
        pendingMonthScrollTarget = ym;
        S.openMonthScreen(ym);
        break;
      }
      case 'open-month-intro-replay': {
        S.openMonthlyIntroReplay(btn.getAttribute('data-year-month'), btn.getAttribute('data-is-preview') === 'true');
        pendingScrollRestore = 0;
        break;
      }
      case 'month-intro-prev':
        S.advanceMonthlyIntro(-1);
        pendingScrollRestore = 0;
        break;
      case 'month-intro-next':
        S.advanceMonthlyIntro(1);
        pendingScrollRestore = 0;
        break;
      case 'month-intro-skip-welcome':
        S.skipMonthlyIntroToWelcome();
        pendingScrollRestore = 0;
        break;
      case 'month-intro-complete': {
        var introYm = state.activeMonthIntro && state.activeMonthIntro.yearMonth;
        S.completeMonthlyIntro();
        if (introYm) pendingMonthScrollTarget = introYm;
        break;
      }
      case 'open-challenge': {
        var cid = btn.getAttribute('data-challenge-id');
        var origin = btn.getAttribute('data-origin') || 'today';
        var reread = btn.getAttribute('data-reread') === 'true';
        var fromRollover = btn.getAttribute('data-rollover') === 'true';
        S.openChallenge(cid, { origin: origin, reread: reread, fromRolloverContinuation: fromRollover });
        pendingScrollRestore = 0;
        break;
      }
      case 'open-foundation': {
        S.openFoundationReading(btn.getAttribute('data-foundation-id'));
        pendingScrollRestore = 0;
        break;
      }
      case 'challenge-prev':
        S.stepChallengeScreen(-1);
        pendingScrollRestore = 0;
        break;
      case 'challenge-next':
        S.stepChallengeScreen(1);
        pendingScrollRestore = 0;
        break;
      case 'challenge-start-beginning':
        S.startChallengeFromBeginning();
        pendingScrollRestore = 0;
        break;
      case 'challenge-exit': {
        var originViewExit = state.activeChallengeSession && state.activeChallengeSession.originView;
        S.exitActiveChallenge();
        if (originViewExit && originViewExit.view === 'month-screen' && originViewExit.yearMonth) {
          pendingMonthScrollTarget = originViewExit.yearMonth;
        } else {
          pendingScrollRestore = state.tabScroll[state.activeTab] || 0;
        }
        break;
      }
      case 'challenge-finish': {
        var originViewFin = state.activeChallengeSession && state.activeChallengeSession.originView;
        S.finishActiveChallenge();
        if (originViewFin && originViewFin.view === 'month-screen' && originViewFin.yearMonth) {
          pendingMonthScrollTarget = originViewFin.yearMonth;
        } else {
          pendingScrollRestore = 0;
        }
        break;
      }
      case 'toggle-save-scripture': {
        var chId = btn.getAttribute('data-challenge-id');
        var sIdx = Number(btn.getAttribute('data-screen-idx') || 0);
        var sess = state.activeChallengeSession;
        var srcItem = (sess && sess.isFoundation) ? F.FOUNDATIONS_BY_ID[chId] : F.CHALLENGES_BY_ID[chId];
        var scr = srcItem && srcItem.screens[sIdx] && srcItem.screens[sIdx].scripture;
        if (scr) S.toggleSaveScripture(scr);
        break;
      }
      case 'remove-saved-scripture': {
        var remId = btn.getAttribute('data-scripture-id');
        var found = state.savedScriptures.find(function (x) { return x.id === remId; });
        if (found) S.toggleSaveScripture(found);
        break;
      }
      case 'open-view-discoveries':
        S.openViewDiscoveries();
        pendingScrollRestore = 0;
        break;
      case 'dismiss-hub-announcement':
        S.dismissHubAnnouncement();
        break;
      case 'dismiss-guest-invite':
        S.dismissGuestInvitePermanently();
        break;
      case 'open-field-notebook':
        S.setTabView('collections', { view: 'field-notebook', returnTab: 'collections', returnView: { view: 'collections-landing' } }, { announce: 'Opened Field Notebook.' });
        pendingScrollRestore = 0;
        break;
      case 'open-field-notebook-from-anywhere':
        S.setTabView('collections', { view: 'field-notebook', returnTab: 'collections', returnView: { view: 'collections-landing' } }, { announce: 'Opened Field Notebook.' });
        pendingScrollRestore = 0;
        break;
      case 'open-saved-scripture':
        S.setTabView('collections', { view: 'saved-scripture', returnTab: 'collections', returnView: { view: 'collections-landing' } }, { announce: 'Opened Saved Scripture.' });
        pendingScrollRestore = 0;
        break;
      case 'select-notebook-year':
        state.notebookUi.selectedYear = Number(btn.getAttribute('data-year'));
        S.notify('Showing ' + state.notebookUi.selectedYear + ' publication months.');
        break;
      case 'open-notebook-month':
        S.setTabView('collections', {
          view: 'notebook-month-gallery',
          yearMonth: btn.getAttribute('data-year-month'),
          returnTab: 'collections',
          returnView: { view: 'field-notebook', returnTab: 'collections', returnView: { view: 'collections-landing' } }
        }, { announce: 'Opened publication month gallery.' });
        pendingScrollRestore = 0;
        break;
      case 'open-all-earned-cards':
        S.setTabView('collections', {
          view: 'all-earned-cards',
          returnTab: 'collections',
          returnView: { view: 'field-notebook', returnTab: 'collections', returnView: { view: 'collections-landing' } }
        }, { announce: 'Opened All Earned Cards.' });
        pendingScrollRestore = 0;
        break;
      case 'open-foundations-collection':
        S.setTabView('collections', {
          view: 'foundations-collection',
          returnTab: 'collections',
          returnView: { view: 'field-notebook', returnTab: 'collections', returnView: { view: 'collections-landing' } }
        }, { announce: 'Opened Foundations & Learning earned Cards.' });
        pendingScrollRestore = 0;
        break;
      case 'open-special-experiences':
        S.setTabView('collections', {
          view: 'special-experiences-collection',
          returnTab: 'collections',
          returnView: { view: 'field-notebook', returnTab: 'collections', returnView: { view: 'collections-landing' } }
        }, { announce: 'Opened Special Experiences earned Cards.' });
        pendingScrollRestore = 0;
        break;
      case 'open-full-card':
        S.openFullCard(btn.getAttribute('data-card-id'));
        pendingScrollRestore = 0;
        break;
      case 'open-share-card':
        S.openShareCardModal(btn.getAttribute('data-card-id'));
        break;
      case 'confirm-simulated-share':
        S.confirmSimulatedShare();
        break;
      case 'clear-notebook-search':
        state.notebookUi.searchQuery = '';
        S.notify('Cleared Card search.');
        break;
      case 'saved-scripture-mode':
        state.savedScriptureUi.mode = btn.getAttribute('data-mode');
        state.savedScriptureUi.selectedBook = null;
        S.notify('Switched Saved Scripture view mode.');
        break;
      case 'select-saved-book':
        state.savedScriptureUi.selectedBook = btn.getAttribute('data-book') || null;
        S.notify('Filtered Saved Scripture by book.');
        break;
      case 'clear-saved-search':
        state.savedScriptureUi.searchQuery = '';
        S.notify('Cleared Saved Scripture search.');
        break;
      case 'open-browse-all-months':
        S.setTabView('library', { view: 'browse-all-months', returnTab: 'library', returnView: { view: 'library-landing' } }, { announce: 'Opened Browse All Months.' });
        pendingScrollRestore = 0;
        break;
      case 'open-foundations':
        S.setTabView('library', { view: 'foundations-overview', returnTab: 'library', returnView: { view: 'library-landing' } }, { announce: 'Opened Foundations overview.' });
        pendingScrollRestore = 0;
        break;
      case 'toggle-library-year': {
        var yr = btn.getAttribute('data-year');
        state.libraryUi.expandedYears[yr] = !state.libraryUi.expandedYears[yr];
        S.notify((state.libraryUi.expandedYears[yr] ? 'Expanded ' : 'Collapsed ') + yr + '.');
        break;
      }
      case 'library-load-more':
        state.libraryUi.visibleCount += 12;
        state.libraryUi.expandedYears['2025'] = true;
        state.libraryUi.expandedYears['2024'] = true;
        S.notify('Loaded additional historical publication months.');
        break;
      case 'clear-library-search':
        state.libraryUi.searchQuery = '';
        S.notify('Cleared Library search.');
        break;
      case 'retry-library-load':
        S.setLibraryLoadState('ready');
        break;
      case 'add-to-shelf':
        S.addToShelf(btn.getAttribute('data-year-month'));
        break;
      case 'keep-on-shelf':
        S.keepOnShelf(btn.getAttribute('data-year-month'));
        break;
      case 'set-active-focus':
        S.setActiveFocus(btn.getAttribute('data-year-month'));
        break;
      case 'clear-active-focus':
        S.clearActiveFocus();
        break;
      case 'put-away':
        S.requestPutAway(btn.getAttribute('data-year-month'));
        break;
      case 'shelf-replace-choose':
        S.selectShelfReplaceTarget(btn.getAttribute('data-year-month'));
        break;
      case 'shelf-replace-confirm':
        S.confirmShelfReplace();
        break;
      case 'confirm-put-away-focus':
        S.confirmPutAwayActiveFocus();
        break;
      case 'open-all-news':
        S.setTabView('more', { view: 'news-list', returnTab: 'more', returnView: { view: 'more-landing' } }, { announce: 'Opened Ministry News.' });
        pendingScrollRestore = 0;
        break;
      case 'open-news-article': {
        var artId = btn.getAttribute('data-article-id');
        var fromTab = btn.getAttribute('data-from-tab') || state.activeTab;
        var fromView = btn.getAttribute('data-from-view') === 'news-list'
          ? { view: 'news-list', returnTab: 'more', returnView: { view: 'more-landing' } }
          : (fromTab === 'today' ? { view: 'today-landing' } : { view: 'more-landing' });
        S.setTabView(fromTab === 'today' ? 'today' : 'more', {
          view: 'news-detail',
          articleId: artId,
          returnTab: fromTab,
          returnView: fromView
        }, { announce: 'Opened Ministry News article.' });
        pendingScrollRestore = 0;
        break;
      }
      case 'filter-news-category':
        state.newsUi.category = btn.getAttribute('data-category');
        S.notify('Filtered Ministry News.');
        break;
      case 'retry-news-load':
        S.setNewsLoadState('ready');
        break;
      case 'open-more-sub': {
        var sub = btn.getAttribute('data-sub');
        S.setTabView('more', { view: 'more-' + sub, returnTab: 'more', returnView: { view: 'more-landing' } }, { announce: 'Opened ' + sub + '.' });
        pendingScrollRestore = 0;
        break;
      }
      case 'select-manual-palette':
        S.setManualPalette(btn.getAttribute('data-palette-id'));
        break;
      case 'set-contrast-mode':
        S.setContrastMode(btn.getAttribute('data-contrast'));
        break;
      case 'set-text-scale':
        S.setTextScale(btn.getAttribute('data-scale'));
        break;
      case 'toggle-reduced-motion-btn':
        S.setReducedMotion(!state.appearance.reducedMotion);
        break;
      case 'replay-app-intro':
        S.startAppIntroReplay();
        pendingScrollRestore = 0;
        break;
      case 'app-intro-prev':
        S.stepAppIntro(-1);
        pendingScrollRestore = 0;
        break;
      case 'app-intro-next':
        S.stepAppIntro(1);
        pendingScrollRestore = 0;
        break;
      case 'app-intro-skip':
        S.skipAppIntro();
        pendingScrollRestore = 0;
        break;
      case 'replay-app-tutorial':
        S.startAppTutorialReplay();
        pendingScrollRestore = 0;
        break;
      case 'tutorial-prev':
        S.stepTutorial(-1);
        break;
      case 'tutorial-next':
        S.stepTutorial(1);
        break;
      case 'tutorial-skip':
        S.finishTutorial(true);
        break;
      case 'open-account-merge':
        S.openAccountMergeModal();
        break;
      case 'run-account-merge':
        S.runSimulatedAccountMerge();
        break;
      case 'retry-merge-success':
        S.runSimulatedAccountMerge('existing-conflict');
        break;
      case 'dismiss-merge-confirmation':
        S.dismissMergeConfirmation();
        break;
      case 'sign-out-simulated':
        S.signOutSimulated();
        break;
      case 'close-external-unavailable':
        S.closeExternalUnavailable();
        pendingScrollRestore = 0;
        break;
      case 'close-modal':
        S.closeModal();
        break;

      /* --- Reviewer Workbench Controls --- */
      case 'toggle-workbench':
        workbenchOpen = !workbenchOpen;
        renderAll(S.getState());
        break;
      case 'reset-scenario':
        S.resetCurrentScenario();
        pendingScrollRestore = 0;
        break;
      case 'set-sim-date':
        S.setSimulatedDate(btn.getAttribute('data-date'));
        break;
      case 'sim-rollover-dec1':
        S.simulateRolloverToDecember();
        break;
      case 'toggle-today-unavailable':
        S.toggleTodayUnavailable();
        break;
      case 'launch-external-link':
        workbenchOpen = false;
        S.launchExternalDeepLink(btn.getAttribute('data-link-id'));
        pendingScrollRestore = 0;
        break;
      case 'set-news-load':
        S.setNewsLoadState(btn.getAttribute('data-load-state'));
        break;
      case 'set-library-load':
        S.setLibraryLoadState(btn.getAttribute('data-load-state'));
        break;
      default:
        break;
    }
  }

  function handleChange(e) {
    var el = e.target.closest('[data-change-action]');
    if (!el) return;
    var action = el.getAttribute('data-change-action');
    var state = S.getState();

    switch (action) {
      case 'load-scenario':
        S.loadScenario(el.value);
        pendingScrollRestore = 0;
        break;
      case 'set-palette-mode':
        S.setPaletteMode(el.value);
        break;
      case 'toggle-announcements':
        S.toggleAnnouncementsEnabled(el.checked);
        break;
      case 'toggle-reduced-motion':
        S.setReducedMotion(el.checked);
        break;
      case 'toggle-intro-reminder':
        S.setReminderPreference(el.checked, state.onboarding.reminderTime);
        break;
      case 'set-intro-reminder-time':
        S.setReminderPreference(true, el.value);
        break;
      case 'modal-focus-choice':
        S.setModalFocusChoice(el.value);
        break;
      case 'set-merge-mode':
        S.setAccountMergeMode(el.value);
        break;
      default:
        break;
    }
  }

  function handleInput(e) {
    var el = e.target.closest('[data-input-action]');
    if (!el) return;
    var action = el.getAttribute('data-input-action');
    var state = S.getState();

    if (action === 'library-search') {
      state.libraryUi.searchQuery = el.value;
      S.notify('');
    } else if (action === 'notebook-search') {
      state.notebookUi.searchQuery = el.value;
      S.notify('');
    } else if (action === 'saved-scripture-search') {
      state.savedScriptureUi.searchQuery = el.value;
      S.notify('');
    }
  }

  function handleKeyDown(e) {
    var state = S.getState();

    // Trap Tab / Shift+Tab strictly inside active modal panel
    if (e.key === 'Tab' && state.modal) {
      var panel = document.querySelector('#overlay-extras-root .modal-panel');
      if (!panel) return;
      var focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        focusElementSafely(panel);
        return;
      }
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      var active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          focusElementSafely(last);
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        focusElementSafely(first);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (state.modal) {
        var isBusyMerge = state.modal.type === 'account-merge' &&
          (state.account.mergeStatus === 'authenticating' || state.account.mergeStatus === 'reconciling');
        if (!isBusyMerge) {
          e.preventDefault();
          S.closeModal();
        }
      } else if (state.onboarding.tutorialActive) {
        e.preventDefault();
        S.finishTutorial(true);
      }
    }
  }

  /* Optional redundant one-screen horizontal swipe inside Challenge Reader (§5.1) */
  function wireOptionalSwipe() {
    var startX = 0;
    var startY = 0;
    var tracking = false;

    document.addEventListener('touchstart', function (e) {
      var zone = e.target.closest('[data-swipe-zone="challenge"]');
      if (!zone || !e.touches || e.touches.length !== 1) return;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!tracking || !e.changedTouches || e.changedTouches.length !== 1) return;
      tracking = false;
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      // Never hijack vertical scrolling; never implicitly finish on last screen!
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        if (dx < 0) S.stepChallengeScreen(1);
        else S.stepChallengeScreen(-1);
      }
    }, { passive: true });
  }

  function boot() {
    S.init();

    // Optional URL query string support for reviewer bookmarks and Playwright smoke tests
    try {
      var params = new URLSearchParams(window.location.search);
      var qScenario = params.get('scenario');
      var forceReset = params.get('reset') === '1';
      if (qScenario && F.SCENARIOS_BY_ID[qScenario] && (forceReset || S.getState().scenarioId !== qScenario)) {
        S.loadScenario(qScenario, { silent: true });
      }
      if (params.get('workbench') === 'open') {
        workbenchOpen = true;
      } else if (params.get('workbench') === 'hidden') {
        workbenchHidden = true;
      }
    } catch (e) {
      // Ignore query parse errors
    }

    S.subscribe(renderAll);
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleChange);
    document.addEventListener('input', handleInput);
    document.addEventListener('keydown', handleKeyDown);
    wireOptionalSwipe();

    renderAll(S.getState());
  }

  return {
    boot: boot
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  window.R06Proto.App.boot();
});
