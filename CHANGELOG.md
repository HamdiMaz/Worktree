# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- `/worktree` now works without a name: it generates a random 5-character lowercase alphanumeric name and retries until the name is unused by both branches and worktree folders.

## v0.1.1

- Added best-effort copying of safe project `.pi` resources into new worktrees when the target worktree lacks `.pi`.

## v0.1.0

- Added the `/worktree <name>` Pi slash command to create or reuse Git worktrees under `.worktrees/` and switch into a worktree-bound session without automatically triggering the agent.
- Added automatic fallback session persistence for `/worktree <name>` so it works from a brand-new Pi session without requiring a send-message-and-retry workaround.
- Initial Pi extension package scaffold.
