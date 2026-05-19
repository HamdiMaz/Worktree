import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import type { ExecOptions, ExecResult } from "@earendil-works/pi-coding-agent";
import { branchExists, createOrReuseWorktree, getRepoRoot, isGitWorktree } from "../extensions/git.ts";

function result(overrides: Partial<ExecResult>): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
		...overrides,
	};
}

type ExecCall = { command: string; args: string[]; options?: ExecOptions };

function fakePiExec(handler: (call: ExecCall) => ExecResult | Promise<ExecResult>) {
	const calls: ExecCall[] = [];
	return {
		calls,
		pi: {
			async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
				const call = { command, args, options };
				calls.push(call);
				return handler(call);
			},
		},
	};
}

describe("git helpers", () => {
	it("resolves the repository root", async () => {
		const { pi, calls } = fakePiExec(() => result({ stdout: "/repo\n" }));

		assert.deepEqual(await getRepoRoot(pi, "/repo/packages/app"), { ok: true, value: "/repo" });
		assert.deepEqual(calls[0], {
			command: "git",
			args: ["rev-parse", "--show-toplevel"],
			options: { cwd: "/repo/packages/app" },
		});
	});

	it("returns a user-facing error when not in a git repo", async () => {
		const { pi } = fakePiExec(() => result({ code: 128, stderr: "fatal: not a git repository\n" }));

		assert.deepEqual(await getRepoRoot(pi, "/tmp"), { ok: false, error: "Not inside a git repository." });
	});

	it("checks whether a local branch exists", async () => {
		const exists = fakePiExec(() => result({ code: 0 }));
		const missing = fakePiExec(() => result({ code: 1 }));

		assert.equal(await branchExists(exists.pi, "/repo", "feature/foo"), true);
		assert.equal(await branchExists(missing.pi, "/repo", "feature/foo"), false);
		assert.deepEqual(exists.calls[0]?.args, ["show-ref", "--verify", "--quiet", "refs/heads/feature/foo"]);
	});

	it("detects a worktree root", async () => {
		const worktreeDir = resolve("/repo/.worktrees/Feature-Auth");
		const { pi } = fakePiExec(() => result({ stdout: `${worktreeDir}\n` }));

		assert.equal(await isGitWorktree(pi, worktreeDir), true);
	});

	it("rejects an existing non-worktree path", async () => {
		const worktreeDir = resolve("/repo/.worktrees/Feature-Auth");
		const { pi } = fakePiExec(() => result({ code: 128, stderr: "fatal\n" }));

		assert.deepEqual(
			await createOrReuseWorktree(pi, "/repo", "Feature/Auth", worktreeDir, { pathExists: () => true }),
			{ ok: false, error: `Path already exists but is not a git worktree: ${worktreeDir}` },
		);
	});

	it("reuses an existing worktree path", async () => {
		const worktreeDir = resolve("/repo/.worktrees/Feature-Auth");
		const { pi } = fakePiExec((call) => {
			if (call.args[0] === "rev-parse") return result({ stdout: `${worktreeDir}\n` });
			if (call.args[0] === "worktree" && call.args[1] === "list") return result({ stdout: `worktree ${worktreeDir}\nHEAD abc123\nbranch refs/heads/Feature/Auth\n` });
			throw new Error(`Unexpected command: ${call.command} ${call.args.join(" ")}`);
		});

		assert.deepEqual(
			await createOrReuseWorktree(pi, "/repo", "Feature/Auth", worktreeDir, { pathExists: () => true }),
			{ ok: true, value: { reused: true } },
		);
	});

	it("rejects an existing unrelated git repository rooted at the worktree path", async () => {
		const worktreeDir = resolve("/repo/.worktrees/Feature-Auth");
		const { pi } = fakePiExec((call) => {
			if (call.args[0] === "rev-parse") return result({ stdout: `${worktreeDir}\n` });
			if (call.args[0] === "worktree" && call.args[1] === "list") return result({ stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/main\n" });
			throw new Error(`Unexpected command: ${call.command} ${call.args.join(" ")}`);
		});

		assert.deepEqual(
			await createOrReuseWorktree(pi, "/repo", "Feature/Auth", worktreeDir, { pathExists: () => true }),
			{ ok: false, error: `Path already exists but is not a git worktree for this repository: ${worktreeDir}` },
		);
	});

	it("adds a worktree from an existing branch", async () => {
		const { pi, calls } = fakePiExec((call) => {
			if (call.args[0] === "show-ref") return result({ code: 0 });
			return result({ code: 0 });
		});

		assert.deepEqual(await createOrReuseWorktree(pi, "/repo", "feature/foo", "/repo/.worktrees/feature-foo", { pathExists: () => false }), {
			ok: true,
			value: { reused: false },
		});
		assert.deepEqual(calls[1]?.args, ["worktree", "add", "/repo/.worktrees/feature-foo", "feature/foo"]);
	});

	it("creates a new branch when the local branch is missing", async () => {
		const { pi, calls } = fakePiExec((call) => {
			if (call.args[0] === "show-ref") return result({ code: 1 });
			return result({ code: 0 });
		});

		assert.deepEqual(await createOrReuseWorktree(pi, "/repo", "feature/foo", "/repo/.worktrees/feature-foo", { pathExists: () => false }), {
			ok: true,
			value: { reused: false },
		});
		assert.deepEqual(calls[1]?.args, ["worktree", "add", "-b", "feature/foo", "/repo/.worktrees/feature-foo"]);
	});

	it("returns a branch lookup error without running worktree add", async () => {
		const { pi, calls } = fakePiExec((call) => {
			if (call.args[0] === "show-ref") return result({ code: 128, stderr: "fatal: bad repo\n" });
			throw new Error(`Unexpected command: ${call.command} ${call.args.join(" ")}`);
		});

		assert.deepEqual(await createOrReuseWorktree(pi, "/repo", "feature/foo", "/repo/.worktrees/feature-foo", { pathExists: () => false }), {
			ok: false,
			error: "fatal: bad repo",
		});
		assert.equal(calls.some((call) => call.args[0] === "worktree" && call.args[1] === "add"), false);
	});

	it("surfaces git stderr when worktree creation fails", async () => {
		const { pi } = fakePiExec((call) => {
			if (call.args[0] === "show-ref") return result({ code: 1 });
			return result({ code: 128, stderr: "fatal: invalid branch\n" });
		});

		assert.deepEqual(await createOrReuseWorktree(pi, "/repo", "bad branch", "/repo/.worktrees/bad-branch", { pathExists: () => false }), {
			ok: false,
			error: "fatal: invalid branch",
		});
	});
});
