# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Added the `/worktree <name>` Pi slash command to create or reuse Git worktrees under `.worktrees/` and switch into a worktree-bound session without automatically triggering the agent.
- Added automatic fallback session persistence for `/worktree <name>` so it works from a brand-new Pi session without requiring a send-message-and-retry workaround.

## 0.1.0 - 2026-05-19

- Initial Pi extension package scaffold.
