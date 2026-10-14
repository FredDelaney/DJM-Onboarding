# Shared interface system

The consolidated global stylesheet remains `app/product.css`. Its `Interface tokens and controls` section owns neutral surfaces, text, spacing, control dimensions and semantic feedback colours. Tenant identity and the football pitch retain their existing tokens.

## Controls

Authenticated Agency controls use `data-ui-button="primary|secondary|tertiary|icon|nav"`. The single palette in `AgencyOperatingWorkspace.module.css` reads the shared interface tokens. Mobile geometry stays in the authenticated control system section, including wrapped labels and explicit centred icon buttons. `data-ui-tone="inverse"` preserves contrast on dark hero surfaces.

The old v2 colour variables and palette and the later duplicate calm palette were removed. Avoid adding another palette at the end of a stylesheet. Change the shared token or canonical role instead. The separate `AgencyMobileNavigation` component owns the five daily destinations and its 23px microphone.

## Feedback

Use `JourneyStatus` for loading, error, information, success and warning panels. `compact` is for inline settings and record feedback. The component accepts an optional title, description and actions. `onRetry`, `retryLabel`, `retryBusy` and `retryDisabled` provide a consistent retry control with a minimum 44px touch target.

Errors use an alert; other feedback uses a polite status. Loading and active retries expose `aria-busy`. Success must only follow a confirmed server response. A failed write retains its draft, and a pending write keeps the editor open. Existing business callbacks and data guards are unchanged.

Legacy inline feedback uses the same semantic colour, background, border and text tokens and accessible roles while retaining its existing layout. New feedback should use the shared component instead of another local panel definition. Reduced motion removes the shared spinner animation.

## CSS cleanup evidence

771 earlier declarations and 150 empty rules were removed from the two largest stylesheets. Each declaration was superseded by the same property under the exact same selector and conditional context with equal or higher importance. Custom and vendor properties, duplicate fallbacks within a rule, newer viewport unit fallbacks, and backdrop-filter declarations were preserved. Replacement values were accepted by both Chromium and WebKit.

A production-build comparison of the rendered cascade, including pseudo elements, found no changes across 236 page/viewport combinations after pruning and palette consolidation. This comparison follows the deliberate feedback token changes, so those improvements are not mistaken for pruning regressions. Six unused local feedback rules were also removed.

To repeat the comparison around another CSS-only cleanup, run `scripts/platform-polish-browser-qa.mjs` with `CSS_CASCADE_SNAPSHOT=/tmp/interface-before.json`, apply the cleanup, then run it with `CSS_CASCADE_COMPARE=/tmp/interface-before.json`. It also retains the navigation, modal, overflow and simulated iPhone safe-area checks.

`scripts/design-system-browser-qa.mjs` exercises the real feedback and entity editor components at 320, 390, 768 and 1440px. It checks semantic token overrides, contrast, error announcements, busy retries, reduced motion, confirmed saves and failed saves. `DESIGN_QA_BROWSER=webkit` runs the same cases in WebKit. The fixture is inserted only during QA and removed afterwards; it is never a shipped product route.

Keep the prefixed backdrop-filter declaration before the standard declaration when removing blur. The production CSS optimiser otherwise can leave the earlier blur active. A physical iPhone and device keyboard test remains separate from browser and simulated safe-area verification.
