# Pre-Commit Quality Checklist

Paste this into your CLAUDE.md or system prompt. Before reporting ANY code change as done, run through every item. Report only real issues with file paths and line numbers. Do not report theoretical concerns.

---

## Build & Syntax
1. Run the build and confirm zero errors or warnings
2. Check for duplicate function names, duplicate CSS properties on the same element, and duplicate event listeners

## Values & Data
3. Check for hardcoded pixel values that should use variables, safe-area env(), or dynamic calculation — no hardcoded snapshots of runtime values (like viewport height on mount)
4. Check that no content is truncated, clipped, or cut off — especially on 320px wide screens and devices with notches/gesture bars
5. Check for code that fails silently: missing error handling, swallowed exceptions, unreachable code after early returns

## Layout & CSS
6. Check for double/stacked padding or margin between parent and child containers that could create visible gaps
7. Check for nested overflow:hidden chains that could clip content or break scrolling
8. Check that flex:1 children inside scrollable parents have minHeight:0, and flex children that should shrink have minWidth:0
9. Check that no inline styles change based on runtime state in a way that causes layout flashing or jumps (e.g., tab switches toggling overflow or padding)

## Mobile (iOS + Android)
10. Check that visualViewport or keyboard-handling code doesn't fire on desktop or when the component is display:none — and that getBoundingClientRect() isn't called on hidden elements (returns zeros)
11. Check that env(safe-area-inset-bottom) always has a fallback value and that bottom nav spacing is consistent across all tabs/views
12. Check for input bars and toolbars that might overflow or clip on narrow screens

## Tab / Route Persistence
13. Check that switching between display:none and display:flex doesn't break flex layout recalculation or cause content to disappear
14. Check that useEffects with DOM measurements don't run while the component is hidden

## Regression
15. List every page/tab/view affected by this change and confirm each one still works — do not ship changes that fix one view but break another

---

## How to use

**In Claude Code / Cowork:** Add the checklist to your project's `.claude/CLAUDE.md` file under a `## Rule — Pre-Commit Quality Checklist` heading. Claude will automatically run it before reporting changes as done.

**As a manual prompt:** After any code change, paste this:

```
Run the pre-commit checklist against the changes you just made. Check every item. Report only real issues with file paths and line numbers.
```
