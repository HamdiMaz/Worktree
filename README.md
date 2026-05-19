# Worktree

A Pi package extension for simplifying Git worktree workflows.

## Status

This package provides a `/worktree <name>` Pi slash command.

The command creates or reuses a Git worktree at:

```txt
<repoRoot>/.worktrees/<sanitized-name>
```

The raw `<name>` is used as the Git branch name. The filesystem directory name is sanitized, so `Feature/Auth` becomes `Feature-Auth`.

## Install for local development

```bash
npm install
npm run check
```

## Use with Pi during development

From this repository:

```bash
pi -e .
```

Pi loads the package through the manifest in `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions/index.ts"]
  }
}
```

## Usage

Inside a Git repository, run:

```txt
/worktree Feature/Auth
```

The command will:

- create `<repoRoot>/.worktrees` when missing
- append `.worktrees` to `.gitignore` when `.gitignore` exists and does not already include it
- create or reuse `<repoRoot>/.worktrees/Feature-Auth`
- create or use branch `Feature/Auth`
- switch Pi into a fresh session rooted at the worktree

The command does not trigger an agent response. Hidden context tells the agent which worktree and branch it is in on the next user message.

## Project layout

```text
extensions/index.ts      Pi extension entry point
extensions/README.md     Extension-specific notes
tests/                   Node test runner tests
```

## Release checks

Run before publishing:

```bash
npm run check
```
