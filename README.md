# AI-assisted development workspace

This repository uses Codex for implementation, a separate defect-first review pass, durable project knowledge, Git history, and GitHub pull requests.

## Daily workflow

```powershell
pwsh -File .\tools\dev.ps1 test
pwsh -File .\tools\dev.ps1 check
git add <only-the-files-you-intend-to-review>
pwsh -File .\tools\dev.ps1 review
git diff --cached
pwsh -File .\tools\dev.ps1 prepare-pr -HumanReviewed
```

The workflow requires PowerShell 7 (`pwsh`), one startup-resolved native `git.exe`, and a native `codex.exe`. It fails early instead of attempting an alternate shell, alias, function, or shim. Every Git inspection disables replacement objects. Review has a single 600-second deadline covering both Git exports, input transmission, output draining, and model execution; streams Git output through a 4 MiB hard limit; rejects binary or diff-attribute-suppressed staged changes; forces accepted text changes to render independently of diff attributes; disables external diff and text-conversion programs; terminates process trees on timeout; and discards the result if HEAD or the Git index changes while review is running. These limits are configured in `tools/dev-workflow.psd1`. `test` is intentionally marked `NOT_CONFIGURED` because this repository currently contains documents, not an application. In a future code project, set the exact test and quality commands in the same configuration file; the workflow never guesses commands.

Inside Codex, `$project-review` runs the repository review skill for interactive use. `tools/dev.ps1 review` writes the staged diff as strict UTF-8 under ignored `work/`, then sends it through standard input to a separate read-only, ephemeral Codex process whose working directory is the existing protected Windows System32 directory outside the repository. No files are created there, and review refuses to run with an elevated Administrator token. The script verifies that this directory and its ancestors contain no project `AGENTS.md`, `.agents/skills`, `.codex/config.toml`, or Git repository boundary; ignores user configuration; disables shell and multi-agent tools; and supplies the defect-first rules inline. A random one-use nonce only binds the structured result to the current run; it does not prove review quality or prompt-injection resistance. The staged tree hash and rendered diff must both remain identical throughout review. Results containing terminal control or bidirectional-format characters are rejected, and raw child-process logs are never printed. The disposable files under `work/` are deleted after review; unstaged and untracked contents are not included in the review input.

This process prevents live project instructions from changing the automated reviewer and prevents accidental mixing of working-tree files. It is still not an operating-system confidentiality boundary; use a separately isolated machine or container when hard file isolation is required. Native `/review` and `codex review --uncommitted` include untracked files and use a different output format.

AI review is advisory. `APPROVED` means only that the model reported no finding; it is not a security or quality guarantee. `prepare-pr` always stops on current Critical or High AI findings. Before and after every test or quality command, it requires tracked working-tree content to equal the staged index, rejects non-ignored untracked files and tracked entries carrying `assume-unchanged` or `skip-worktree`, and verifies that the index tree hash has not changed. Binary changes, diff-attribute-suppressed changes, and submodule pointer changes require separate content-aware review and are rejected by this gate. This prevents hidden unstaged fixes or validation-time rewrites from making a staged change appear valid. After resolving every reported issue, a human must inspect `git diff --cached` and may then run `prepare-pr -HumanReviewed`. Agents must never supply this switch on the user's behalf. After `prepare-pr` completes, inspect `git status`, make a focused commit, push the chosen branch, and open a pull request. Pull requests are never merged automatically.

## Memory

The official Mem0 Codex plugin `0.2.15` is installed from the `mem0ai/mem0` marketplace. Its MCP and skills will become active after `MEM0_API_KEY` is added to the Codex Desktop local environment and Codex is restarted. `mem0.md` defines what may and may not be remembered.

After adding the credential, restart Codex in this repository and run `/mem0:onboard`. Do not add a separate direct Mem0 MCP entry; the plugin already registers it.

Mem0 searches relevant project memories at the start of work and saves only durable decisions and proven lessons. Credentials, raw environment files, temporary debugging output, and meaningless conversation history must never be stored.

`CONTEXT.md` remains the small local progress record required by this workspace. It is not a second semantic-memory service.

## Search record

2026-09-01:

- OpenAI Codex documentation confirmed native skills, repository-level `.agents/skills`, `AGENTS.md`, MCP configuration, `/review`, and `codex review --uncommitted`.
- The official OpenAI Codex repository contains the `review-agent` sample; the same official skill is already installed locally at `C:\Users\Ming\.codex\skills\.system\review-agent`.
- Mem0's official Codex documentation recommends its plugin marketplace for the full MCP + skill + optional hooks experience and warns against configuring a duplicate direct MCP server.
- `skills.sh` lists the official `openai/codex` code-review skill, but no third-party review skill was installed because Codex already provides the required native reviewer.

Sources:

- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/cli/slash-commands
- https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/review-agent/SKILL.md
- https://docs.mem0.ai/integrations/codex
- https://www.skills.sh/openai/codex/code-review
