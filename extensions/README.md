# Pi Worktree Extension

This directory contains the Pi extension entry point for `@mazli/pi-worktree`.

## Runtime behavior

The extension registers `/worktree <name>`.

The command:

- uses `<name>` as the Git branch name
- uses a sanitized `<name>` as the directory name
- creates worktrees under `<repoRoot>/.worktrees/`
- creates `.worktrees` when missing
- appends `.worktrees` to an existing `.gitignore` when missing
- switches Pi into a fresh worktree-bound session
- adds hidden worktree context without sending a user message

The current Pi session must be persisted before the switch can happen. If Pi reports that it is not persisted yet, send a message first, then run `/worktree <name>` again.

## Files

```txt
index.ts              Extension entry point
worktree-command.ts   Command orchestration
paths.ts              Path and directory helpers
gitignore.ts          .gitignore helper
git.ts                Git command helpers
session.ts            Pi session switching helper
```
