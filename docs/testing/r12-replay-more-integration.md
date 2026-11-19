# R12 Replay Introduction from More

The ordinary app's **More → Review Introduction** action opens the accepted
`ReplayableOnboarding` component in replay mode. Skip, Escape, and Finish return
to More; focus returns to the Review Introduction button so keyboard and
screen-reader users can resume at their entry point. The replay receives the
current More origin and reminder time. Reminder preferences change only when
the reader explicitly chooses **Save reminder preference**.

Replay does not write onboarding completion state, participation data, Saved
Scripture, earned awards, Shelf data, or other local settings. The existing
first-use onboarding remains a separate path and continues to run before any
replay UI.

## Focused browser verification

```sh
npx playwright test --config tests/appIntegration/playwright.config.ts \
  tests/appIntegration/app-shell-integration.spec.ts \
  --grep "Review Introduction"
```

The focused checks cover More entry, repeated Skip/Escape/Finish exits, focus
return, preservation of local reader/participation/Shelf storage, and the
explicit reminder-save action.

The existing standalone onboarding behavior can be checked separately:

```sh
npx playwright test --config tests/onboardingReplay/playwright.config.ts \
  tests/onboardingReplay/onboarding-replay.spec.ts
```
