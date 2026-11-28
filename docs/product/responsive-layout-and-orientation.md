# Bibleberry — Portrait-first responsive layout and orientation decision

**Decision:** Approved by Aaron Waid, November 5, 2026  
**Status:** Binding product/UX direction; implementation details and ministry-facing visual mockups still require review  
**Design issue:** [#22 — Hub, personal exploration, What's New](https://github.com/Bibleberry/Bibleberry/issues/22)  
**Related requirements:** [R06, R19 and R21 in the application roadmap](application-development-roadmap.md); [#37 — low-end Android performance](https://github.com/Bibleberry/Bibleberry/issues/37)

## The decision

**Bibleberry has one coherent portrait-first interface for phones and tablets.** Readers use the same essential vertical teaching and navigation experience across device classes.

- **Phones, portrait:** Primary design and reference layout. Do not spend the initial UX effort designing a distinct phone-landscape experience.
- **Tablets, portrait:** The same fundamental vertical experience, adapted to a roomier screen. Preserve comfortable reading line lengths and the flexibility needed for long teaching, Scripture, visual content and interactive Challenges.
- **Tablets, landscape:** Keep the portrait-first reading composition **centered within an appropriate maximum content width**, with generous side margins. Do **not** require a separate two-column dashboard, split reading pane, or novel landscape navigation merely because there is more horizontal space.
- **Phones, landscape:** The app must remain functional and accessible when the screen rotates, even though phone landscape is not a separate primary design target.
- **Responsive windows:** Width constraints must respond gracefully to tablet split view, browser resizing, enlarged text and differing screen dimensions. Use a responsive `max-width` approach, **not** a fixed portrait-sized viewport or a forced orientation lock.

Tablet landscape should be supported without needing its own product design. A specific piece of teaching may use its available width where genuinely helpful for a diagram or interaction, but that is a content-level presentation choice, **not** permission to redesign the application's entire navigation in landscape.

## What this decision does not authorize

- It does not prescribe final pixel widths, typography, navigation placement, breakpoints, visual mockups or a particular tablet-specific layout component. Those decisions belong in the approved UX specification after Aaron's product review and Alexis's relevant visual/editorial review.
- It does not authorize forcing orientation or preventing rotation.
- It does not create a requirement for separate native phone/tablet applications.
- It does not relax accessibility, touch-target, long-form reading or performance expectations on older devices.

## How to evaluate proposed UX designs

During [#22](https://github.com/Bibleberry/Bibleberry/issues/22) mockup review and eventual implementation:

1. Review the **phone portrait** and **tablet portrait** experiences first.
2. Show how **tablet landscape** behaves with the *same centered composition and comfortable side padding*, rather than creating a distinct landscape dashboard.
3. Check short-height and narrow-window edge cases, including phone landscape, tablet split view, larger text, keyboard/focus and scrolling.
4. Confirm that diagrams, expandable studies and longer Challenges retain meaning, are not clipped, and do not force horizontal page scrolling.
5. Verify both real iPad/Safari and representative Android/tablet/browser behavior when available, plus appropriate emulation. Consider existing household iPhone/iPad hardware and the separate low-end Android requirement.
6. Avoid extra layouts, scripts and imagery that worsen the production bundle or performance on inexpensive hardware.

**Guiding principle:** Invest in a comfortable, mature reading and teaching experience, not in landscape-specific complexity that adds little value for readers. Preserve the teaching and make the delivery responsive.
