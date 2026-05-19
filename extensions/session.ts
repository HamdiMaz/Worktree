import { existsSync } from "node:fs";
import { SessionManager, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const WORKTREE_CUSTOM_TYPE = "pi-worktree";

interface WorktreeSessionManager {
	resetLeaf(): void;
	appendCustomMessageEntry(customType: string, content: string, display: boolean, details?: unknown): string;
	getSessionFile(): string | undefined;
}

export interface SwitchWorktreeSessionOptions {
	forkSessionFromSeed?: (sourceSessionFile: string, worktreeDir: string) => WorktreeSessionManager;
	sessionFileExists?: (path: string) => boolean;
}

export function buildWorktreeContextMessage(branch: string, worktreeDir: string): string {
	return `You are in git worktree \`${worktreeDir}\` on branch \`${branch}\`. Please keep all changes in this worktree.`;
}

export async function switchToFreshWorktreeSession(
	ctx: ExtensionCommandContext,
	branch: string,
	worktreeDir: string,
	options: SwitchWorktreeSessionOptions = {},
): Promise<void> {
	const sessionFileExists = options.sessionFileExists ?? existsSync;
	const forkSessionFromSeed = options.forkSessionFromSeed ?? ((sourceSessionFile: string, cwd: string) => SessionManager.forkFrom(sourceSessionFile, cwd));
	const seedSessionFile = ctx.sessionManager.getSessionFile();

	if (!seedSessionFile || !sessionFileExists(seedSessionFile)) {
		throw new Error("Cannot create a worktree session because the current Pi session is not persisted yet. Send a message first, then run /worktree again.");
	}

	const sessionManager = forkSessionFromSeed(seedSessionFile, worktreeDir);
	sessionManager.resetLeaf();

	const content = buildWorktreeContextMessage(branch, worktreeDir);
	sessionManager.appendCustomMessageEntry(WORKTREE_CUSTOM_TYPE, content, false, { branch, worktreeDir });

	const sessionFile = sessionManager.getSessionFile();
	if (!sessionFile) {
		throw new Error("Failed to create worktree session");
	}

	if (!sessionFileExists(sessionFile)) {
		throw new Error(`Pi did not persist the worktree session file: ${sessionFile}`);
	}

	await ctx.switchSession(sessionFile, {
		withSession: async (nextCtx) => {
			nextCtx.ui.notify(`Switched to worktree: ${worktreeDir}`, "info");
		},
	});
}
