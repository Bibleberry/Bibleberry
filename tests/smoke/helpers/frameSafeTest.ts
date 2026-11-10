import { test as base, expect, type Page } from '@playwright/test';

type InitFunction<Arg> = (arg: Arg) => void;

/**
 * Registers a browser-state seeder that only runs in the top-level http(s) app document.
 *
 * `page.addInitScript` runs in every frame, including third-party iframes and Chromium
 * `chrome-error://chromewebdata/` documents (used when an embed cannot load). Storage access
 * there throws `SecurityError`, which would surface as a false first-party `pageerror`.
 * The guard skips those documents instead of ignoring errors, so real app errors still surface.
 */
export async function addTopFrameInitScript<Arg = undefined>(
  page: Page,
  script: InitFunction<Arg>,
  arg?: Arg,
): Promise<void> {
  const content = `(() => {
    if (window !== window.top) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    (${script.toString()})(${JSON.stringify(arg) ?? 'undefined'});
  })();`;
  await page.addInitScript({ content });
}

/**
 * Drop-in `test` whose `page.addInitScript(fn, arg)` calls are frame-safe.
 * Non-function scripts are passed through unchanged.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const original = page.addInitScript.bind(page) as (script: unknown, arg?: unknown) => Promise<void>;
    page.addInitScript = (async (script: unknown, arg?: unknown) => {
      if (typeof script === 'function') {
        return addTopFrameInitScript(page, script as InitFunction<unknown>, arg);
      }
      return original(script, arg);
    }) as Page['addInitScript'];
    await provide(page);
  },
});

export { expect };
