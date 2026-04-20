# Accessibility Architecture

## Focus Trap — Keyboard Interaction

**Scope:** Skip-to-main link + drawer modal focus trap (Tab/Shift+Tab cycling).

**Implementation:** FocusTrap component (react-focus-trap library) + escape handler.

**Desktop Testing:** Chromium desktop, Tab key cycles through focusable elements.

**Mobile Testing:**

- Tab key unavailable on native touch interfaces (iOS/Android).
- **Covered by:** chromium-desktop with 375×667 viewport (mobile dimensions).
- **Use case:** Mobile user with external Bluetooth keyboard (desk, laptop stand).
- **Exclusion:** Focus trap tests skipped on mobile-safari and mobile-chrome projects (testIgnore in playwright.config.ts).

**Accessible to:** Keyboard users, screen reader + keyboard combos, mobile + external keyboard.

---

## Skip-to-Main Link

**Pattern:** Hidden by default, visible on Tab/focus.

**Implementation:** `a[href="#main"]` with `sr-only` class.

**Testing:** e2e/a11y/drawer-mobile-focus-trap.spec.ts › "4. Skip link is focusable and navigates to main"
