# Mobile Responsive Spec

## Goals

- Keep the canvas usable on narrow screens without shrinking controls into unreadable layouts.
- Preserve the desktop three-panel composition at larger widths.
- Make navigation, controls, fullscreen, zoom, pan, and export usable with touch.
- Allow the mobile page to scroll naturally while keeping the canvas at a practical viewing height.

## Breakpoints

- Above `1150px`: three-column desktop layout.
- `761px` to `1150px`: canvas above two side panels.
- `481px` to `760px`: single-column mobile layout with two-row navigation.
- At `480px` and below: compact spacing, wrapped canvas actions, and full-width controls.

## Mobile layout

- The header uses the brand on the first row and equal-width navigation links on the second row.
- The canvas layout becomes a vertically scrollable column in this order: fractal type, canvas, settings.
- The canvas receives a minimum height of `360px` and targets roughly `56dvh` when space allows.
- Settings panels remain expanded/collapsible cards and use the full available width.
- Learn and coming-soon pages use the same horizontal page padding and remain readable without horizontal scrolling.

## Touch and accessibility

- Interactive controls use at least `44px` of height where practical.
- The canvas keeps `touch-action: none` so pointer gestures remain available for pan and zoom behavior.
- Text remains visible in navigation; links may wrap rather than becoming icon-only controls.
- Focus outlines remain visible for keyboard and assistive-technology users.

## Validation

- Verify at `320px`, `375px`, `390px`, `768px`, and `1024px` viewport widths.
- Confirm no horizontal page overflow.
- Confirm the canvas, settings cards, fullscreen button, and export button remain reachable.
