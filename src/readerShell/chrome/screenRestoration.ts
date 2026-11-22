import type { RouteRestoration } from '../navigation/index.ts'

const activeScreenSelector = '.r06-screen:not([hidden])'

export function captureScreenRestoration(
  viewport: HTMLElement,
  lastFocused: HTMLElement | null,
): RouteRestoration | undefined {
  const screen = viewport.querySelector<HTMLElement>(activeScreenSelector)
  if (!screen) return

  // Record an element's position in this screen without storing labels, text,
  // or form values from the reader. Check the element type again on return.
  const steps: string[] = []
  if (lastFocused && screen.contains(lastFocused)) {
    for (let node = lastFocused; node !== screen && node.parentElement; node = node.parentElement) {
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
  const targetScroll = restoration?.scrollTop ?? 0
  let focusId = restoration?.focusId

  // A focused host owns its initial focus (for example, the Monthly Introduction).
  if (focusScreen && !screen.contains(document.activeElement)) screen.focus({ preventScroll: true })

  const restore = () => {
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
  const observer = new ResizeObserver(() => {
    if (restore()) stop()
  })
  observer.observe(screen)
  function stop() {
    observer.disconnect()
    viewport.removeEventListener('pointerdown', stop)
    viewport.removeEventListener('keydown', stop)
    viewport.removeEventListener('wheel', stop)
    viewport.removeEventListener('touchstart', stop)
  }
  viewport.addEventListener('pointerdown', stop)
  viewport.addEventListener('keydown', stop)
  viewport.addEventListener('wheel', stop, { passive: true })
  viewport.addEventListener('touchstart', stop, { passive: true })
  return stop
}
