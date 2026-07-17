# Project Documentation Navigation Design

## Goal

Make every documentation page expose all project documentation roots as direct, visible links in
the top project bar.

## Interaction

- Render `FluctGraph`, `THQ API`, and `Toho Image Studio` in registry order.
- Mark the current project with `aria-current="page"`, a muted background, and a vermilion
  underline.
- Link every other project directly to its documentation root.
- Keep the links in one horizontally scrollable row on narrow screens instead of replacing them
  with a select control.
- Scroll the current project tab into view after route changes without animated motion.

## Scope

- Update `ProjectDocSwitcher` and its existing CSS module.
- Update component tests, cross-project navigation E2E coverage, and macOS visual snapshots.
- Do not change project registry data, documentation content, or the project information header.

## Accessibility And Responsive Behavior

- Preserve the `切换项目文档` navigation landmark.
- Use complete project names and visible keyboard focus states.
- Keep the horizontal scrolling inside the switcher so the page itself never overflows.
- Respect the existing reduced-motion behavior.

