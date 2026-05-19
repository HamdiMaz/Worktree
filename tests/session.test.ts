import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { SessionManager, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildWorktreeContextMessage, switchToFreshWorktreeSession, WORKTREE_CUSTOM_TYPE } from "../extensions/session.ts";

const tempRoots: string[] = [];

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function makeTempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "pi-worktree-session-test-"));
	tempRoots.push(root);
	return root;
}

function appendSeedConversation(sessionManager: SessionManager): void {
	sessionManager.appendMessage({ role: "user", content: "seed", timestamp: Date.now() });
	sessionManager.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: "seed response" }],
		api: "test",
		provider: "test",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
}

class FakeForkedSessionManager {
	readonly customMessages: Array<{ customType: string; content: string; display: boolean; details?: unknown }> = [];
	resetLeafCalled = false;

	constructor(private readonly sessionFile: string | undefined) {}

	resetLeaf(): void {
		this.resetLeafCalled = true;
	}

	appendCustomMessageEntry(customType: string, content: string, display: boolean, details?: unknown): string {
		this.customMessages.push({ customType, content, display, details });
		return "custom-entry-id";
	}

	getSessionFile(): string | undefined {
		return this.sessionFile;
	}
}

function fakeCommandContext(seedSessionFile: string | undefined) {
	const notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];
	const switched: string[] = [];
	const forbiddenCalls: string[] = [];

	const ctx = {
		sessionManager: {
			getSessionFile() {
				return seedSessionFile;
			},
		},
		ui: {
			notify(message: string, type?: "info" | "warning" | "error") {
				notifications.push(type === undefined ? { message } : { message, type });
			},
		},
		async switchSession(sessionPath: string, options?: { withSession?: (ctx: ExtensionCommandContext) => Promise<void> }) {
			switched.push(sessionPath);
			await options?.withSession?.({
				ui: {
					notify(message: string, type?: "info" | "warning" | "error") {
						notifications.push(type === undefined ? { message } : { message, type });
					},
					setEditorText() {
						forbiddenCalls.push("setEditorText");
					},
				},
				sendUserMessage() {
					forbiddenCalls.push("sendUserMessage");
					return Promise.resolve();
				},
			} as unknown as ExtensionCommandContext);
			return { cancelled: false };
		},
	};

	return { ctx: ctx as unknown as ExtensionCommandContext, notifications, switched, forbiddenCalls };
}

describe("session helper", () => {
	it("builds hidden context text", () => {
		assert.equal(
			buildWorktreeContextMessage("feature/foo", "/repo/.worktrees/feature-foo"),
			"You are in git worktree `/repo/.worktrees/feature-foo` on branch `feature/foo`. Please keep all changes in this worktree.",
		);
	});

	it("forks a persisted seed session into a fresh active worktree context without triggering the agent", async () => {
		const root = makeTempRoot();
		const sourceDir = join(root, "source");
		const worktreeDir = join(root, "worktree");
		const sessionDir = join(root, "sessions");
		mkdirSync(sourceDir, { recursive: true });
		mkdirSync(worktreeDir, { recursive: true });
		const seedSession = SessionManager.create(sourceDir, sessionDir);
		appendSeedConversation(seedSession);
		const seedSessionFile = seedSession.getSessionFile();
		assert.ok(seedSessionFile);
		assert.equal(existsSync(seedSessionFile), true);
		const { ctx, notifications, switched, forbiddenCalls } = fakeCommandContext(seedSessionFile);

		await switchToFreshWorktreeSession(ctx, "feature/foo", worktreeDir, {
			forkSessionFromSeed: (sourceSessionFile, targetCwd) => SessionManager.forkFrom(sourceSessionFile, targetCwd, sessionDir),
		});

		assert.equal(switched.length, 1);
		const switchedSessionFile = switched[0];
		assert.ok(switchedSessionFile);
		assert.equal(existsSync(switchedSessionFile), true);
		const reopened = SessionManager.open(switchedSessionFile, sessionDir);
		assert.equal(reopened.getCwd(), worktreeDir);
		assert.deepEqual(reopened.buildSessionContext().messages, [
			{
				role: "custom",
				customType: WORKTREE_CUSTOM_TYPE,
				content: `You are in git worktree \`${worktreeDir}\` on branch \`feature/foo\`. Please keep all changes in this worktree.`,
				display: false,
				details: { branch: "feature/foo", worktreeDir },
				timestamp: reopened.buildSessionContext().messages[0]?.timestamp,
			},
		]);
		assert.deepEqual(notifications, [{ message: `Switched to worktree: ${worktreeDir}`, type: "info" }]);
		assert.deepEqual(forbiddenCalls, []);
	});

	it("fails safely when the current session is not persisted", async () => {
		const { ctx } = fakeCommandContext(undefined);

		await assert.rejects(
			switchToFreshWorktreeSession(ctx, "feature/foo", "/repo/.worktrees/feature-foo"),
			/current Pi session is not persisted/,
		);
	});

	it("fails safely when the forked session manager does not return a session file", async () => {
		const fakeForkedSession = new FakeForkedSessionManager(undefined);
		const { ctx } = fakeCommandContext("/sessions/current.jsonl");

		await assert.rejects(
			switchToFreshWorktreeSession(ctx, "feature/foo", "/repo/.worktrees/feature-foo", {
				forkSessionFromSeed: () => fakeForkedSession,
				sessionFileExists: (path) => path === "/sessions/current.jsonl",
			}),
			/Failed to create worktree session/,
		);
		assert.equal(fakeForkedSession.resetLeafCalled, true);
	});

	it("fails safely when Pi does not persist the forked session file", async () => {
		const fakeForkedSession = new FakeForkedSessionManager("/sessions/worktree.jsonl");
		const { ctx } = fakeCommandContext("/sessions/current.jsonl");

		await assert.rejects(
			switchToFreshWorktreeSession(ctx, "feature/foo", "/repo/.worktrees/feature-foo", {
				forkSessionFromSeed: () => fakeForkedSession,
				sessionFileExists: (path) => path === "/sessions/current.jsonl",
			}),
			/Pi did not persist the worktree session file/,
		);
	});
});
