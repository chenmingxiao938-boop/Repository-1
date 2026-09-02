# Development workflow

## Before coding

- Read `CONTEXT.md` and the files relevant to the task.
- Understand the existing architecture and public behavior before changing anything.
- If Mem0 tools are available, search project memory using the repository path and the task topic. If they are unavailable, use `CONTEXT.md`; do not pretend memory was searched.

## While coding

- Make the smallest reasonable change and preserve existing behavior unless the task explicitly changes it.
- Add or update tests for changed behavior.
- Do not add fallback behavior, silent recovery, or speculative post-processing that hides failures.
- Do not create a branch or worktree without explicit user approval.

## After coding

- Run the configured tests and relevant lint/type checks.
- Inspect the complete `git diff` and run `git diff --check`.
- Stage only the intended files, then run `pwsh -File ./tools/dev.ps1 review`.
- Treat AI review as advisory; `APPROVED` is not proof of safety or correctness.
- Fix every Critical and High finding before declaring completion.
- A human must inspect `git diff --cached`. Never supply `-HumanReviewed` on the user's behalf.
- Re-run verification after fixes, then update `CONTEXT.md` and append genuine errors or lessons to `踩坑日志.txt` in UTF-8.

# Code review rules

- Review defects, not stylistic preferences.
- Check logic bugs, regressions, incorrect assumptions, security, exposed secrets, API misuse, error handling, edge cases, concurrency, data loss, performance, duplicated logic, unnecessary complexity, missing tests, incorrect tests, and breaking changes.
- Report only issues demonstrated by the changed code and surrounding call paths. Do not invent findings.
- Keep review read-only: do not modify files, commit, push, create branches, post comments, or merge.
- Order findings by severity: Critical, High, Medium, Low.
- For every meaningful issue use exactly:

  ```text
  Severity: Critical | High | Medium | Low
  File: path/to/file
  Line or function: line number or function name
  Problem: concrete defect
  Why it matters: affected scenario and impact
  Recommended fix: smallest reliable correction
  ```

- If no meaningful issue exists, return exactly `APPROVED`.

# Memory policy

- Save only durable project knowledge: architecture decisions, technology/API/database choices, coding conventions, important product requirements, recurring bugs and proven fixes, deployment decisions, important limitations, and reusable lessons.
- Store enough scope and date to distinguish this project from other projects and to identify facts that may become stale.
- Never save secrets, API keys, access tokens, passwords, raw `.env` contents, private credentials, temporary debugging noise, speculative conclusions, or meaningless chat history.
- Before saving, remove sensitive values and keep only the durable decision or lesson.

# Git policy

- Never commit secrets or `.env` files.
- Keep commits focused and inspect `git diff` before committing.
- After human review, the user runs `pwsh -File ./tools/dev.ps1 prepare-pr -HumanReviewed` before pushing a review branch.
- Never merge a pull request automatically.
