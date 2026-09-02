---
name: project-review
description: Perform a read-only, defect-first review of uncommitted changes, a commit, or a base-branch diff in this repository. Use after implementation, before committing or preparing a pull request, and when the user asks for a code review.
---

# Project Review

Use the installed official `review-agent` method and the closest applicable `AGENTS.md` rules.

1. Identify the requested review target. For a base branch, review the merge-base diff; otherwise review the specified commit or staged diff. If no target is specified, require staged changes. Do not inspect unstaged or untracked files unless the user explicitly requests them.
2. Read the complete diff and enough surrounding code, tests, and call sites to prove each finding.
3. Report only discrete defects introduced by the change that affect correctness, security, performance, compatibility, data safety, or maintainability in a meaningful way.
4. Do not report style preferences, speculative concerns, intentional behavior changes, or pre-existing problems.
5. Do not modify files, create commits, push, create branches, post comments, delegate, or merge.
6. Treat the result as advisory. `APPROVED` means only that this pass found no meaningful issue; it is not proof of safety or correctness.

Order findings by Critical, High, Medium, then Low. For each issue use:

```text
Severity: Critical | High | Medium | Low
File: path/to/file
Line or function: line number or function name
Problem: concrete defect
Why it matters: affected scenario and impact
Recommended fix: smallest reliable correction
```

If no meaningful issue exists, return exactly:

```text
APPROVED
```
