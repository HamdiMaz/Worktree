import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecOptions, ExecResult, ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { handleWorktreeCommand } from "../extensions/worktree-command.ts";

function execResult(overrides: Partial<ExecResult>): ExecResult {
	return { stdout: "", stderr: "", code: 0, killed: false, ...overrides };
}

type ExecCall = { command: string; args: string[]; options?: ExecOptions };

function fakePi(handler: (call: ExecCall) => ExecResult | Promise<ExecResult>) {
	const calls: ExecCall[] = [];
	return {
		calls,
		pi: {
			async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
				const call: ExecCall = options === undefined ? { command, args } : { command, args, options };
				calls.push(call);
				return handler(call);
			},
		} as Pick<ExtensionAPI, "exec">,
	};
}

function fakeCtx(cwd = "/repo") {
	const notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];
	let waited = false;

	const ctx = {
		cwd,
		ui: {
			notify(message: string, type?: "info" | "warning" | "error") {
				notifications.push(type === undefined ? { message } : { message, type });
			},
		},
		async waitForIdle() {
			waited = true;
		},
	};

	return {
		ctx: ctx as unknown as ExtensionCommandContext,
		notifications,
		get waited() {
			return waited;
		},
	};
}

describe("worktree command orchestration", () => {
	it("generates a random name when no name is given", async () => {
		const { pi, calls } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 0 });
			if (call.args[0] === "show-ref") return execResult({ code: 1 });
			return execResult({ code: 0 });
		});
		const fake = fakeCtx();
		const { ctx, notifications } = fake;
		const switched: Array<{ branch: string; worktreeDir: string }> = [];

		await handleWorktreeCommand(pi, "   ", ctx, {
			ensureDirectory: async () => undefined,
			ensureGitignoreIncludesWorktrees: async () => undefined,
			pathExists: () => false,
			generateName: () => "a1b2c",
			switchToFreshWorktreeSession: async (_ctx, branch, worktreeDir) => {
				switched.push({ branch, worktreeDir });
			},
		});

		assert.equal(fake.waited, true);
		assert.deepEqual(switched, [{ branch: "a1b2c", worktreeDir: "/repo/.worktrees/a1b2c" }]);
		assert.deepEqual(calls.map((call) => call.args), [
			["rev-parse", "--show-toplevel"],
			["check-ref-format", "--branch", "a1b2c"],
			["show-ref", "--verify", "--quiet", "refs/heads/a1b2c"],
			["check-ref-format", "--branch", "a1b2c"],
			["show-ref", "--verify", "--quiet", "refs/heads/a1b2c"],
			["worktree", "add", "-b", "a1b2c", "/repo/.worktrees/a1b2c"],
		]);
		assert.deepEqual(notifications, []);
	});

	it("skips generated names that already exist", async () => {
		const generated = ["aaaaa", "bbbbb"];
		const usedExistingEntries = new Set(["refs/heads/aaaaa", "/repo/.worktrees/bbbbb"]);
		const { pi } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 0 });
			if (call.args[0] === "show-ref") return execResult({ code: usedExistingEntries.has(call.args.at(-1) ?? "") ? 0 : 1 });
			return execResult({ code: 0 });
		});
		const { ctx, notifications } = fakeCtx();
		const switched: Array<{ branch: string; worktreeDir: string }> = [];

		await handleWorktreeCommand(pi, "", ctx, {
			ensureDirectory: async () => undefined,
			ensureGitignoreIncludesWorktrees: async () => undefined,
			pathExists: (path) => usedExistingEntries.has(path),
			generateName: () => generated.shift() ?? "ccccc",
			switchToFreshWorktreeSession: async (_ctx, branch, worktreeDir) => {
				switched.push({ branch, worktreeDir });
			},
		});

		assert.deepEqual(switched, [{ branch: "ccccc", worktreeDir: "/repo/.worktrees/ccccc" }]);
		assert.deepEqual(notifications, []);
	});

	it("reports an error when no unused generated name can be found", async () => {
		const { pi } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 0 });
			if (call.args[0] === "show-ref") return execResult({ code: 0 });
			return execResult({ code: 0 });
		});
		const { ctx, notifications } = fakeCtx();

		await handleWorktreeCommand(pi, "", ctx, {
			ensureDirectory: async () => undefined,
			ensureGitignoreIncludesWorktrees: async () => undefined,
			pathExists: () => false,
			generateName: () => "aaaaa",
			switchToFreshWorktreeSession: async () => undefined,
		});

		assert.deepEqual(notifications, [
			{ message: "Could not generate an unused worktree name after 10 attempts", type: "error" },
		]);
	});

	it("shows a user-facing error outside a git repo", async () => {
		const { pi } = fakePi(() => execResult({ code: 128, stderr: "fatal\n" }));
		const { ctx, notifications } = fakeCtx("/tmp");

		await handleWorktreeCommand(pi, "feature/foo", ctx, {
			ensureDirectory: async () => undefined,
			ensureGitignoreIncludesWorktrees: async () => undefined,
			pathExists: () => false,
			switchToFreshWorktreeSession: async () => undefined,
		});

		assert.deepEqual(notifications, [{ message: "Not inside a git repository.", type: "error" }]);
	});

	it("creates .worktrees, updates gitignore, creates worktree, and switches sessions", async () => {
		const { pi, calls } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 0 });
			if (call.args[0] === "show-ref") return execResult({ code: 1 });
			return execResult({ code: 0 });
		});
		const { ctx, notifications } = fakeCtx("/repo/packages/app");
		const ensuredDirectories: string[] = [];
		const gitignoreRoots: string[] = [];
		const copiedResources: Array<{ repoRoot: string; worktreeDir: string }> = [];
		const switched: Array<{ branch: string; worktreeDir: string }> = [];

		await handleWorktreeCommand(pi, "Feature/Auth", ctx, {
			ensureDirectory: async (path) => {
				ensuredDirectories.push(path);
			},
			ensureGitignoreIncludesWorktrees: async (repoRoot) => {
				gitignoreRoots.push(repoRoot);
			},
			pathExists: () => false,
			copyProjectPiResources: async (repoRoot, worktreeDir) => {
				copiedResources.push({ repoRoot, worktreeDir });
			},
			switchToFreshWorktreeSession: async (_ctx, branch, worktreeDir) => {
				switched.push({ branch, worktreeDir });
			},
		});

		assert.deepEqual(ensuredDirectories, ["/repo/.worktrees"]);
		assert.deepEqual(gitignoreRoots, ["/repo"]);
		assert.deepEqual(copiedResources, [{ repoRoot: "/repo", worktreeDir: "/repo/.worktrees/Feature-Auth" }]);
		assert.deepEqual(calls.map((call) => call.args), [
			["rev-parse", "--show-toplevel"],
			["check-ref-format", "--branch", "Feature/Auth"],
			["show-ref", "--verify", "--quiet", "refs/heads/Feature/Auth"],
			["worktree", "add", "-b", "Feature/Auth", "/repo/.worktrees/Feature-Auth"],
		]);
		assert.deepEqual(switched, [{ branch: "Feature/Auth", worktreeDir: "/repo/.worktrees/Feature-Auth" }]);
		assert.deepEqual(notifications, []);
	});

	it("surfaces branch validation errors before filesystem side effects", async () => {
		const { pi, calls } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 128, stderr: "fatal: 'bad branch' is not a valid branch name\n" });
			throw new Error(`Unexpected command: ${call.command} ${call.args.join(" ")}`);
		});
		const { ctx, notifications } = fakeCtx();
		const sideEffects: string[] = [];

		await handleWorktreeCommand(pi, "bad branch", ctx, {
			ensureDirectory: async () => {
				sideEffects.push("ensureDirectory");
			},
			ensureGitignoreIncludesWorktrees: async () => {
				sideEffects.push("ensureGitignoreIncludesWorktrees");
			},
			pathExists: () => {
				sideEffects.push("pathExists");
				return false;
			},
			switchToFreshWorktreeSession: async () => {
				sideEffects.push("switchToFreshWorktreeSession");
			},
		});

		assert.deepEqual(notifications, [{ message: "fatal: 'bad branch' is not a valid branch name", type: "error" }]);
		assert.deepEqual(sideEffects, []);
		assert.equal(calls.some((call) => call.args[0] === "worktree" && call.args[1] === "add"), false);
	});

	it("surfaces worktree creation errors", async () => {
		const { pi } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 0 });
			if (call.args[0] === "show-ref") return execResult({ code: 1 });
			return execResult({ code: 128, stderr: "fatal: invalid branch\n" });
		});
		const { ctx, notifications } = fakeCtx();

		await handleWorktreeCommand(pi, "bad branch", ctx, {
			ensureDirectory: async () => undefined,
			ensureGitignoreIncludesWorktrees: async () => undefined,
			pathExists: () => false,
			switchToFreshWorktreeSession: async () => undefined,
		});

		assert.deepEqual(notifications, [{ message: "fatal: invalid branch", type: "error" }]);
	});

	it("continues switching sessions when copying .pi resources fails", async () => {
		const { pi } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 0 });
			if (call.args[0] === "show-ref") return execResult({ code: 0 });
			return execResult({ code: 0 });
		});
		const { ctx, notifications } = fakeCtx();
		const switched: Array<{ branch: string; worktreeDir: string }> = [];

		await handleWorktreeCommand(pi, "feature/foo", ctx, {
			ensureDirectory: async () => undefined,
			ensureGitignoreIncludesWorktrees: async () => undefined,
			pathExists: () => false,
			copyProjectPiResources: async () => {
				throw new Error("copy failed");
			},
			switchToFreshWorktreeSession: async (_ctx, branch, worktreeDir) => {
				switched.push({ branch, worktreeDir });
			},
		});

		assert.deepEqual(notifications, [{ message: "Could not copy .pi resources into worktree: copy failed", type: "warning" }]);
		assert.deepEqual(switched, [{ branch: "feature/foo", worktreeDir: "/repo/.worktrees/feature-foo" }]);
	});

	it("surfaces session switch errors without triggering the agent", async () => {
		const { pi } = fakePi((call) => {
			if (call.args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (call.args[0] === "check-ref-format") return execResult({ code: 0 });
			if (call.args[0] === "show-ref") return execResult({ code: 0 });
			return execResult({ code: 0 });
		});
		const { ctx, notifications } = fakeCtx();

		await handleWorktreeCommand(pi, "feature/foo", ctx, {
			ensureDirectory: async () => undefined,
			ensureGitignoreIncludesWorktrees: async () => undefined,
			pathExists: () => false,
			switchToFreshWorktreeSession: async () => {
				throw new Error("session failed");
			},
		});

		assert.deepEqual(notifications, [{ message: "session failed", type: "error" }]);
	});
});
