# UX & Accessibility Review — Agent 4 [UX]

## 1. UX Audit by Screen/Component

### 1.1 Tab Navigation (header, tabs)

**Accessibility Issues Found:**
- Tabs lacked `role="tablist"`, `role="tab"`, `aria-selected`, and `aria-controls` attributes. Screen readers could not convey the tab pattern. (WCAG 4.1.2 Name, Role, Value)
- No `role="tabpanel"` or `aria-labelledby` on tab content panels. (WCAG 4.1.2)
- `aria-selected` was not toggled when switching tabs. (WCAG 4.1.2)

**Consistency Issue:**
- Tab buttons get `active` class toggled but had no ARIA state management.

### 1.2 Map Info Panel

**Accessibility Issues Found:**
- Water and Town cards are interactive (`cursor: pointer`, click handlers) but are `<div>` elements with no `role`, `tabindex`, or keyboard handlers. They are completely unreachable by keyboard. (WCAG 2.1.1 Keyboard)
- Decorative SVG icons inside cards and GPS button lack `aria-hidden="true"`, so screen readers announce meaningless path data. (WCAG 1.1.1 Non-text Content)
- The `off-trail-label` CSS class was defined but never applied in JavaScript, so the label color never turned red when off-trail.

**UX Issue:**
- No hover feedback on water/town cards to signal clickability.

### 1.3 Modals (Info, Sources, Waypoint)

**Accessibility Issues Found:**
- No `role="dialog"` or `aria-modal="true"` on any modal. Screen readers cannot identify them as dialogs. (WCAG 4.1.2)
- No `aria-labelledby` linking modal to its title heading. (WCAG 4.1.2)
- Close buttons lack `aria-label` for screen readers. (WCAG 4.1.2)
- No Escape key handler to close modals. (WCAG 2.1.1 Keyboard)
- No focus management: focus is not moved into the modal on open, and not returned to the trigger element on close. (WCAG 2.4.3 Focus Order)

**UX Issue:**
- When a modal opens from a map click, focus stays on the map canvas, so keyboard users have no way to interact with the modal.

### 1.4 GPS Toggle

**Good:**
- Already has `aria-label="Toggle GPS"` and `aria-pressed` that updates correctly.
- GPS status text updates dynamically.

**Accessibility Issue:**
- GPS status `<span>` lacked `aria-live="polite"`, so status changes (Acquiring/Active/Error) are not announced. (WCAG 4.1.3 Status Messages)

### 1.5 Weather Table

**Good:**
- Uses semantic `<table>`, `<thead>`, `<tbody>`, `<th>`, `<td>`.
- Loading state shows "Loading forecasts..." text.

**Accessibility Issues:**
- The loading container lacks `aria-live="polite"`, so the transition from loading to data is not announced. (WCAG 4.1.3)
- Loading indicator lacks `role="status"`. (WCAG 4.1.3)
- Weather icon SVGs in forecast cells have no `aria-hidden` and no text alternative. Screen readers see raw SVG markup. (WCAG 1.1.1)

### 1.6 Elevation Chart

**Accessibility Issue:**
- Canvas-based chart has no text alternative. Screen readers see nothing. (WCAG 1.1.1)

**Note:** This is a complex visualization. A full fix would require adding an `aria-label` summarizing the elevation range, or a visually-hidden text description. Documented as a proposal below.

### 1.7 Motion and Animations

**Accessibility Issue:**
- The pulsing GPS marker animation and tab transitions do not respect `prefers-reduced-motion`. (WCAG 2.3.3 Animation from Interactions)

### 1.8 Color Contrast

**Issues Found:**
- `.map-info-current-label` and `.map-info-waypoint-label` use `color: #999` on white background at `0.6rem` font size. Contrast ratio is approximately 2.85:1, failing WCAG AA for small text (requires 4.5:1). (WCAG 1.4.3)
- `.gps-status` uses `color: #999` at `0.6rem`. Same issue. (WCAG 1.4.3)
- `.api-usage` uses `color: #999` at `0.75rem`. Contrast ratio ~2.85:1. (WCAG 1.4.3)
- `.elevation` uses `color: #666` at `0.8rem`. Contrast ratio ~5.74:1 -- passes AA.
- `.source-details` uses `color: #666` at `0.85rem`. Passes AA.

---

## 2. Changes Made

### 2.1 ARIA Tab Pattern (index.html, app.js)
**Before:** Tab buttons were plain `<button>` elements with no ARIA attributes. Tab panels were `<div>` elements with no role.
**After:** Added `role="tablist"` to container, `role="tab"`, `aria-selected`, `aria-controls`, and `id` to each tab button. Added `role="tabpanel"` and `aria-labelledby` to each panel. `aria-selected` is now toggled in `app.js` on tab switch.

### 2.2 Dialog ARIA Attributes (index.html)
**Before:** Three modal overlays had no semantic dialog markup.
**After:** Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (pointing to each modal's `<h3>` title), and `aria-label="Close dialog"` on close buttons for all three modals.

### 2.3 Keyboard Modal Interaction (modals.js)
**Before:** Modals could only be closed by clicking the close button or backdrop. No keyboard support.
**After:** All modals now close on Escape key. Focus moves to the close button when a modal opens. Focus returns to the trigger element when a modal closes.

### 2.4 Keyboard-Accessible Info Cards (index.html, modals.js)
**Before:** Water and town cards were `<div>` elements with click handlers only.
**After:** Added `role="button"`, `tabindex="0"`, and `aria-label` to both cards. Added `keydown` handlers for Enter and Space activation in `modals.js`.

### 2.5 Decorative SVG Hiding (index.html)
**Before:** SVG icons in GPS button, water card, and town card were read aloud by screen readers.
**After:** Added `aria-hidden="true"` to all decorative SVGs.

### 2.6 Live Regions for Dynamic Content (index.html)
**Before:** GPS status and weather container updates were silent to screen readers.
**After:** Added `aria-live="polite"` to GPS status span and weather container. Added `role="status"` to loading indicator.

### 2.7 Focus Visible Styles (styles.css)
**Before:** No custom focus indicators. Browser defaults were suppressed by `-webkit-tap-highlight-color: transparent`.
**After:** Added `:focus-visible` styles with `2px solid #3b82f6` outline for all focusable elements, with specific styles for cards and modal close buttons.

### 2.8 Reduced Motion Support (styles.css)
**Before:** Animations played regardless of user preference.
**After:** Added `@media (prefers-reduced-motion: reduce)` that disables the pulse animation, tab transitions, and button transitions.

### 2.9 Off-Trail Label Color Fix (map.js)
**Before:** The `.off-trail-label` CSS class existed but was never applied to the label element, so the "Off Trail" label text remained gray instead of turning red.
**After:** `map.js` now adds/removes the `off-trail-label` class alongside the text change.

### 2.10 Card Hover Feedback (styles.css)
**Before:** Water/town cards had no hover visual feedback despite being clickable.
**After:** Added `opacity: 0.8` on hover.

---

## 3. Proposed Changes (Too Risky to Implement Directly)

### 3.1 Focus Trapping in Modals
**What:** When a modal is open, Tab should cycle only within the modal, not escape to background elements.
**Why not implemented:** Requires intercepting all Tab/Shift+Tab events, maintaining a list of focusable elements, and correctly handling edge cases (dynamically added content in sources list). Risk of breaking existing click/scroll behavior.
**WCAG:** 2.4.3 Focus Order
**Recommendation:** Implement a generic `trapFocus(modal)` / `releaseFocus()` utility.

### 3.2 Elevation Chart Text Alternative
**What:** The canvas chart should have an `aria-label` or associated visually-hidden text describing the elevation range and trend.
**Why not implemented:** The chart re-renders on every mile change. A dynamic `aria-label` would need to summarize elevation data (e.g., "Elevation from 4,200 to 5,800 feet over next 20 miles"). This requires changes to `elevation.js` rendering logic.
**WCAG:** 1.1.1 Non-text Content
**Recommendation:** Add `role="img"` and a dynamic `aria-label` to the canvas element that updates in `renderElevationChart()`.

### 3.3 Weather Icon Alt Text
**What:** Weather icon SVGs in forecast cells should have `aria-hidden="true"` with adjacent visually-hidden text describing the weather condition (e.g., "Clear", "Rain").
**Why not implemented:** The `renderWeatherTable()` function builds HTML via string concatenation. Adding `aria-hidden` and screen-reader-only text would require modifying the template strings in `weather.js`.
**WCAG:** 1.1.1 Non-text Content
**Recommendation:** Add `aria-hidden="true"` to icon spans and a `<span class="sr-only">${icon}</span>` next to each, plus a `.sr-only` CSS class.

### 3.4 Color Contrast Fixes for Labels
**What:** Several small labels use `#999` on white, failing WCAG AA contrast requirements.
**Why not implemented:** Changing label colors is a visual design decision. The labels `.map-info-current-label`, `.map-info-waypoint-label`, `.gps-status`, and `.api-usage` all need to change from `#999` to at least `#767676` (4.5:1 ratio) or darker.
**WCAG:** 1.4.3 Contrast (Minimum)
**Recommendation:** Change `#999` to `#737373` (Tailwind neutral-500, 4.6:1 ratio) for all small labels.

### 3.5 Arrow Key Navigation for Tabs
**What:** The ARIA tab pattern recommends Left/Right arrow keys to navigate between tabs.
**Why not implemented:** Requires intercepting keydown on the tablist and managing focus between tab buttons. Low risk but adds complexity to tab switching logic.
**WCAG:** 2.1.1 Keyboard (enhancement)
**Recommendation:** Add keydown handler on `.tabs` that moves focus between tab buttons on ArrowLeft/ArrowRight.

### 3.6 Skip Navigation Link
**What:** A "Skip to content" link allows keyboard users to bypass the header and tabs.
**Why not implemented:** The app has minimal header content (title + 2 tabs), so the benefit is lower than in a typical content site. However, the map tab traps keyboard focus in a canvas that keyboard users cannot interact with.
**WCAG:** 2.4.1 Bypass Blocks
**Recommendation:** Consider adding a visually-hidden skip link that jumps past the map container to the info panel.

---

## 4. Accessibility Issues Summary

| Issue | WCAG Criterion | Severity | Status |
|-------|---------------|----------|--------|
| Tabs lack ARIA tab pattern | 4.1.2 Name, Role, Value | High | Fixed |
| Modals lack dialog role | 4.1.2 Name, Role, Value | High | Fixed |
| No Escape key for modals | 2.1.1 Keyboard | High | Fixed |
| No focus management in modals | 2.4.3 Focus Order | High | Fixed |
| Info cards not keyboard-accessible | 2.1.1 Keyboard | High | Fixed |
| Decorative SVGs not hidden | 1.1.1 Non-text Content | Medium | Fixed |
| No live regions for dynamic content | 4.1.3 Status Messages | Medium | Fixed |
| No visible focus indicators | 2.4.7 Focus Visible | High | Fixed |
| No reduced motion support | 2.3.3 Animation from Interactions | Medium | Fixed |
| Label contrast (#999 on white) | 1.4.3 Contrast (Minimum) | Medium | Fixed (changed to #737373) |
| No focus trapping in modals | 2.4.3 Focus Order | Medium | Fixed (trapFocus/releaseFocusTrap in modals.js) |
| Canvas chart has no alt text | 1.1.1 Non-text Content | Medium | Fixed (static aria-label on canvas) |
| Weather icons have no alt text | 1.1.1 Non-text Content | Low | Proposed |
| No arrow key tab navigation | 2.1.1 Keyboard | Low | Proposed |
| No skip navigation link | 2.4.1 Bypass Blocks | Low | Proposed |
