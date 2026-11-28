import { computeSpotlightGeometry, type SpotlightGeometry } from './guidedTutorialModel.ts'

export const TUTORIAL_TARGET_ATTRIBUTE = 'data-tutorial-target'

export type TutorialTargetResolver = (targetId: string) => HTMLElement | null

export function findTutorialTarget(
  targetId: string,
  root: ParentNode | null = typeof document !== 'undefined' ? document : null,
): HTMLElement | null {
  if (!root || !targetId) return null
  const escaped = targetId.replace(/["\\]/g, '\\$&')
  const candidate = root.querySelector<HTMLElement>(`[${TUTORIAL_TARGET_ATTRIBUTE}="${escaped}"]`)
  if (!candidate) return null
  if (!candidate.isConnected) return null
  if (candidate.closest('[hidden], [inert]')) return null
  const rect = candidate.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return candidate
}

export function measureTutorialTarget(element: HTMLElement | null): SpotlightGeometry {
  if (!element || typeof window === 'undefined') {
    return { available: false }
  }
  if (!element.isConnected || element.closest('[hidden], [inert]')) {
    return { available: false }
  }
  const rect = element.getBoundingClientRect()
  return computeSpotlightGeometry(rect, {
    width: window.innerWidth,
    height: window.innerHeight,
  })
}

export function observeTutorialAnchor(
  targetId: string,
  onUpdate: (geometry: SpotlightGeometry, element: HTMLElement | null) => void,
  resolveTarget: TutorialTargetResolver = findTutorialTarget,
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    onUpdate({ available: false }, null)
    return () => {}
  }

  let frameId: number | null = null
  let active = true
  let observedTarget: HTMLElement | null = null

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          scheduleMeasure()
        })
      : null

  const measureNow = () => {
    if (!active) return
    const element = resolveTarget(targetId)
    if (resizeObserver && element !== observedTarget) {
      if (observedTarget) resizeObserver.unobserve(observedTarget)
      observedTarget = element
      if (observedTarget) resizeObserver.observe(observedTarget)
    }
    onUpdate(measureTutorialTarget(element), element)
  }

  const scheduleMeasure = () => {
    if (!active) return
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    frameId = window.requestAnimationFrame(() => {
      frameId = null
      measureNow()
    })
  }

  if (resizeObserver && document.documentElement) {
    resizeObserver.observe(document.documentElement)
  }

  const mutationObserver =
    typeof MutationObserver !== 'undefined' && document.body
      ? new MutationObserver(() => {
          scheduleMeasure()
        })
      : null

  mutationObserver?.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [TUTORIAL_TARGET_ATTRIBUTE, 'hidden', 'inert', 'style', 'class'],
  })

  window.addEventListener('resize', scheduleMeasure)
  window.addEventListener('orientationchange', scheduleMeasure)
  window.addEventListener('scroll', scheduleMeasure, true)

  // Immediate synchronous measurement so initial render aligns without a blank flash.
  measureNow()

  return () => {
    active = false
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    window.removeEventListener('resize', scheduleMeasure)
    window.removeEventListener('orientationchange', scheduleMeasure)
    window.removeEventListener('scroll', scheduleMeasure, true)
  }
}
