# AI-Assisted Development Workflow Implementation Plan

> **For agentic workers:** Implement this plan task by task in the current checkout. Do not create a worktree or branch without explicit user approval.

**Goal:** Build a reusable, secure Codex → test → defect review → Git → GitHub PR workflow with durable project memory.

**Architecture:** Use Codex's native `review-agent` rules, `AGENTS.md`, MCP/plugin configuration, and an isolated `codex exec` review process. Keep repository automation dependency-free with PowerShell, and use the official Mem0 Codex plugin without a second overlapping memory integration.

**Tech Stack:** Git 2.55, Codex CLI 0.151, PowerShell, GitHub pull request templates, Mem0 Codex plugin.

## Global Constraints

- Preserve existing files and configuration; back up global Codex configuration before editing.
- Never print, commit, or store API keys, tokens, passwords, credentials, or raw `.env` contents.
- Do not install overlapping review or memory systems.
- Do not merge pull requests or create a new worktree/branch without explicit authorization.
- Use UTF-8 for Chinese project records.

---

### Task 1: Repository safety baseline

**Files:**
- Create: `D:\workspace\.gitignore`
- Create: `D:\workspace\README.md`

- [x] Initialize `D:\workspace` as a Git repository on `main` while preserving all current files.
- [x] Ignore secrets, credentials, local environments, caches, build output, databases, logs, editor files, downloaded research, and local backups.
- [x] Verify representative secret paths are ignored with `git check-ignore`.

### Task 2: Native Codex review workflow

**Files:**
- Create: `D:\workspace\.agents\skills\project-review\SKILL.md`
- Create: `D:\workspace\AGENTS.md`
- Create: `D:\workspace\tools\dev.ps1`
- Create: `D:\workspace\tools\dev-workflow.psd1`

- [x] Base project review behavior on the installed official `review-agent` rules and an isolated `codex exec` process.
- [x] Require defect-first review and the user-requested Critical/High/Medium/Low finding format.
- [x] Add dependency-free `test`, `review`, `check`, and `prepare-pr` entry points; fail clearly when a project-specific test command has not been configured.
- [x] Validate the skill and PowerShell syntax, then run a harmless review of the setup diff if authentication permits.

### Task 3: Durable memory

**Files:**
- Modify: `C:\Users\Ming\.codex\config.toml` only through the official plugin installer/configuration flow.
- Modify: `D:\workspace\AGENTS.md`
- Modify: `D:\workspace\CONTEXT.md`

- [x] Install the official Mem0 Codex plugin from the official Mem0 marketplace without adding a duplicate direct MCP server.
- [x] Verify installation state without displaying credentials.
- [x] Stop at the exact Mem0 credential/login boundary if `MEM0_API_KEY` is absent.
- [x] Define a strict memory allowlist for durable decisions and lessons, and a denylist for secrets and temporary noise.

### Task 4: GitHub pull request workflow

**Files:**
- Create: `D:\workspace\.github\pull_request_template.md`

- [x] Add Summary, Changes, Testing, Risks, and reviewer checklist sections.
- [x] Detect GitHub CLI and authentication without forcing installation.
- [x] Preserve any existing remote; report repository creation, remote addition, push, and PR creation as manual when unavailable.

### Task 5: Verification and records

**Files:**
- Modify: `D:\workspace\README.md`
- Modify: `D:\workspace\CONTEXT.md`
- Modify: `D:\workspace\踩坑日志.txt`

- [x] Verify Git repository health, ignore rules, script behavior, review invocation, Mem0 installation state, and absence of tracked secret files.
- [x] Review the complete diff for bugs, then re-evaluate whether every component is necessary and whether a simpler reliable design exists.
- [x] Record current state and any errors in UTF-8.
