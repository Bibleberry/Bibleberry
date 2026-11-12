# R14-8: Earned Scripture Card Viewer robustness

## Verified behavior

- The shared Month Screen/Field Notebook viewer displays validated stored card snapshots without changing award acknowledgment flags.
- Long, unbroken titles, references, and themes wrap within the dialog. The dialog remains vertically scrollable at a 320px-wide viewport with enlarged text.
- Blank-line-separated transcription text is rendered as distinct paragraphs; all content remains in the dialog and available to assistive technology. The dialog is named by its title rather than assigning the full, potentially lengthy transcription as its automatic description.
- A failed image load retains the illustration description and complete transcription. A successful image retains its alternative text.
- Opening focuses Close; Tab and Shift+Tab remain contained; Escape and Close both dismiss and restore focus to the invoking control.

## Verification results

| Check | Result |
| --- | --- |
| `npx playwright test -c tests/cardViewer/playwright.config.ts` | Passed: 2 Chromium tests, including long content, 320px/200% text-size simulation, image failure, keyboard containment, focus return, and unchanged award flags |
| `npx playwright test -c tests/notebook/playwright.config.ts` | Passed: 2 Field Notebook browser regression tests |
| `npm run test:adapter` | Passed: 266 tests |
| `node --experimental-strip-types --test tests/sanity/earnedCardViewer.test.ts` | Passed: 5 earned-card model and boundary tests |
| `npm run lint` | Passed |
| `npm run build` | Passed; Vite reported two upstream Zod annotation-placement warnings |

## Limits and visual caveats

Browser coverage uses headless Chromium at a CSS viewport of 320×700 and simulates enlarged text with CSS sizing; it is not a real handset/browser zoom or screen-reader session. TalkBack, VoiceOver, and other assistive technologies were not directly exercised. Final notebook typography, artwork framing/cropping, and card visual design remain deferred. Sharing/export and watermark placement are not changed or tested.
