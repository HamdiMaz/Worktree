import { existsSync } from "node:fs";
import { SessionManager, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const WORKTREE_CUSTOM_TYPE = "pi-worktree";

const SENTINEL_PROVIDER = "pi-worktree";
const SENTINEL_MODEL = "session-persistence-sentinel";

type SessionMessage = Parameters<SessionManager["appendMessage"]>[0];

interface WorktreeSessionManager {
	resetLeaf(): void;
	appendMessage(message: SessionMessage): string;
	appendCustomMessageEntry(customType: string, content: string, display: boolean, details?: unknown): string;
	getSessionFile(): string | undefined;
}

export interface SwitchWorktreeSessionOptions {
	forkSessionFromSeed?: (sourceSessionFile: string, worktreeDir: string) => WorktreeSessionManager;
	createSessionForWorktree?: (worktreeDir: string) => WorktreeSessionManager;
	sessionFileExists?: (path: string) => boolean;
}

function zeroUsage(): SessionMessage extends { usage: infer T } ? T : never {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	} as SessionMessage extends { usage: infer T } ? T : never;
}

export function buildSessionPersistenceSentinelMessage(timestamp = Date.now()): SessionMessage {
	return {
		role: "assistant",
		content: [],
		api: "synthetic",
		provider: SENTINEL_PROVIDER,
		model: SENTINEL_MODEL,
		usage: zeroUsage(),
		stopReason: "aborted",
		timestamp,
	};
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
	const createSessionForWorktree = options.createSessionForWorktree ?? ((cwd: string) => SessionManager.create(cwd));
	const seedSessionFile = ctx.sessionManager.getSessionFile();
	const hasPersistedSeedSession = seedSessionFile !== undefined && sessionFileExists(seedSessionFile);

	const sessionManager = hasPersistedSeedSession
		? forkSessionFromSeed(seedSessionFile, worktreeDir)
		: createSessionForWorktree(worktreeDir);

	if (!hasPersistedSeedSession) {
		sessionManager.appendMessage(buildSessionPersistenceSentinelMessage());
	}

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

	const switchResult = await ctx.switchSession(sessionFile, {
		withSession: async (nextCtx) => {
			nextCtx.ui.notify(`Switched to worktree: ${worktreeDir}`, "info");
		},
	});
	if (switchResult.cancelled) {
		throw new Error("Switch to worktree session was cancelled.");
	}
}
