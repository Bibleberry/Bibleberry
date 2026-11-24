import type { RouteRestoration } from '../navigation/index.ts'

const activeScreenSelector = '.r06-screen:not([hidden])'
const monthAgendaSelector = '[data-month-agenda]'

export function captureScreenRestoration(
  viewport: HTMLElement,
  lastFocused: HTMLElement | null,
): RouteRestoration | undefined {
  const screen = viewport.querySelector<HTMLElement>(activeScreenSelector)
  if (!screen || (screen.hasAttribute('data-month-screen') && !screen.querySelector(monthAgendaSelector))) return

  // Record an element's position in this screen without storing labels, text,
  // or form values from the reader. Check the element type again on return.
  const steps: string[] = []
  const focused = lastFocused && screen.contains(lastFocused) ? lastFocused : document.activeElement
  if (focused instanceof HTMLElement && screen.contains(focused)) {
    for (let node = focused; node !== screen && node.parentElement; node = node.parentElement) {
      const index = Array.from(node.parentElement.children).indexOf(node)
      steps.unshift(`${node.localName}:${index}`)
    }
  }
  return { scrollTop: viewport.scrollTop, focusId: steps.length ? steps.join('/') : undefined }
}

function findSavedFocus(screen: HTMLElement, focusId: string): HTMLElement | null {
  let node: Element | undefined = screen
  for (const step of focusId.split('/')) {
    const [tag, index] = step.split(':')
    node = node.children[Number(index)]
    if (node?.localName !== tag) return null
  }
  return node instanceof HTMLElement && !node.closest('[hidden], [inert]') && node.getClientRects().length
    ? node
    : null
}

export function restoreScreen(
  viewport: HTMLElement,
  restoration: RouteRestoration | undefined,
  focusScreen: boolean,
) {
  const screen = viewport.querySelector<HTMLElement>(activeScreenSelector)
  if (!screen) return
  const month = screen.hasAttribute('data-month-screen')
  if (month) viewport.scrollTop = 0
  let focusId = restoration?.focusId

  // A focused host owns its initial focus (for example, the Monthly Introduction).
  if (focusScreen && !screen.contains(document.activeElement)) screen.focus({ preventScroll: true })

  const restore = () => {
    if (month && !screen.querySelector(monthAgendaSelector)) return false
    const currentWeek = restoration ? null : screen.querySelector('[data-current-week]')
    const targetScroll = currentWeek
      ? viewport.scrollTop + currentWeek.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      : restoration?.scrollTop ?? 0
    viewport.scrollTop = targetScroll
    if (focusId) {
      const target = findSavedFocus(screen, focusId)
      if (target) {
        target.focus({ preventScroll: true })
        if (document.activeElement === target) focusId = undefined
      }
    }
    return viewport.scrollTop >= targetScroll - 1 && !focusId
  }

  if (restore()) return

  // Gateway-backed hosts can grow after their loading state. Give their content
  // a chance to return before restoring a deeper offset or focus target.
  const restoreWhenReady = () => {
    if (restore()) stop()
  }
  const observer = new ResizeObserver(restoreWhenReady)
  observer.observe(screen)
  // Introduction and calendar can have the same height, so also observe the
  // calendar mounting after the reader finishes the Introduction.
  const contentObserver = month ? new MutationObserver(restoreWhenReady) : undefined
  contentObserver?.observe(screen, { childList: true, subtree: true })
  function stop() {
    observer.disconnect()
    contentObserver?.disconnect()
    viewport.removeEventListener('pointerdown', cancelRestore)
    viewport.removeEventListener('keydown', cancelRestore)
    viewport.removeEventListener('wheel', cancelRestore)
    viewport.removeEventListener('touchstart', cancelRestore)
  }
  function cancelRestore() {
    if (!month || screen?.querySelector(monthAgendaSelector)) stop()
  }
  viewport.addEventListener('pointerdown', cancelRestore)
  viewport.addEventListener('keydown', cancelRestore)
  viewport.addEventListener('wheel', cancelRestore, { passive: true })
  viewport.addEventListener('touchstart', cancelRestore, { passive: true })
  return stop
}
