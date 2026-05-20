# Pi Worktree

A small Pi extension that makes Git worktrees easy to open from inside Pi.

If you already use worktrees, this removes the setup ceremony: no manual folder creation, no separate `git worktree add`, no reopening Pi in another directory.

## The shortcut

Inside any Git repository, run:

```txt
/worktree Feature/Auth
```

Pi Worktree creates or reuses the matching worktree and switches Pi into it.

## What it handles for you

The command takes care of the repetitive setup:

- creates `.worktrees/` when needed
- creates or reuses the Git branch
- creates or reuses the matching worktree
- adds `.worktrees` to an existing `.gitignore` when needed
- copies safe project `.pi` resources into the worktree when the worktree lacks `.pi`
- opens a fresh Pi session rooted in the worktree
- works from both brand-new and already-persisted Pi sessions

You stay inside Pi. The extension handles the ceremony.

## Usage

Run the command with the branch name you want:

```txt
/worktree my-feature
```

Pi will move you into:

```txt
.worktrees/my-feature
```

From there, just keep prompting or coding as usual. The command switches sessions without automatically triggering an agent response.

If your repository root has a `.pi/` directory and the worktree does not, Pi Worktree copies the safe project resources it finds (`settings.json`, `skills/`, `prompts/`, `extensions/`, `themes/`, `SYSTEM.md`, and `APPEND_SYSTEM.md`). Missing entries are skipped, symlinks are ignored, and copy failures only show a warning before the session switch continues.

## Naming

The name you pass is used as the Git branch name.

If the name contains path separators, the folder name is cleaned up:

```txt
/worktree Feature/Auth
```

Branch:

```txt
Feature/Auth
```

Folder:

```txt
.worktrees/Feature-Auth
```

## Installation

Install the package with Pi:

```bash
pi install npm:@mazli/pi-worktree
```

Or try it for a single Pi run without installing it permanently:

```bash
pi -e npm:@mazli/pi-worktree
```

## Development

From this repository:

```bash
npm install
npm run check
pi -e .
```

The package entry point is declared in `package.json` and loads the extension from `extensions/`.

## License

MIT
