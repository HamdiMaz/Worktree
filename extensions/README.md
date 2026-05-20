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
- copies safe root `.pi` resources into the worktree when the target lacks `.pi`
- switches Pi into a fresh worktree-bound session
- adds hidden worktree context without sending a user message

The command uses hybrid session creation. If the current Pi session has a persisted file, the worktree session is forked from it for lineage. If the current session is brand new and has no file yet, the extension creates a fresh persisted worktree session directly without sending or cancelling an agent message.

## Files

```txt
index.ts              Extension entry point
worktree-command.ts   Command orchestration
paths.ts              Path and directory helpers
gitignore.ts          .gitignore helper
git.ts                Git command helpers
pi-resources.ts       Project .pi resource copy helper
session.ts            Pi session switching helper
```
