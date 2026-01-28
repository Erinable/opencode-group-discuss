# Gotchas & Pitfalls

Things to watch out for in this codebase.

## [2026-01-28 15:24]
Build tools not available in worktree - npm/npx/tsc commands fail

_Context: 004-add-theme-system-with-color-blindness-support worktree environment. Build tools (npm, npx, tsc) are not available in the PATH. Verification commands requiring these tools cannot be executed in the worktree. Use manual code review or verify in the parent repository instead._
