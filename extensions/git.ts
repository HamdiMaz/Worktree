import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

type PiExec = Pick<ExtensionAPI, "exec">;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WorktreeCreateResult {
	reused: boolean;
}

export interface CreateOrReuseWorktreeOptions {
	pathExists?: (path: string) => boolean;
}

function commandError(result: ExecResult, fallback: string): string {
	return result.stderr.trim() || result.stdout.trim() || fallback;
}

export async function getRepoRoot(pi: PiExec, cwd: string): Promise<Result<string>> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });

	if (result.code !== 0) {
		return { ok: false, error: "Not inside a git repository." };
	}

	const repoRoot = result.stdout.trim();
	if (!repoRoot) {
		return { ok: false, error: "Not inside a git repository." };
	}

	return { ok: true, value: repoRoot };
}

export async function branchExists(pi: PiExec, repoRoot: string, branch: string): Promise<boolean> {
	const result = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoRoot });
	return result.code === 0;
}

export async function isGitWorktree(pi: PiExec, worktreeDir: string): Promise<boolean> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd: worktreeDir });
	return result.code === 0 && resolve(result.stdout.trim()) === resolve(worktreeDir);
}

export async function createWorktree(pi: PiExec, repoRoot: string, branch: string, worktreeDir: string): Promise<Result<WorktreeCreateResult>> {
	const existingBranch = await branchExists(pi, repoRoot, branch);
	const args = existingBranch
		? ["worktree", "add", worktreeDir, branch]
		: ["worktree", "add", "-b", branch, worktreeDir];

	const result = await pi.exec("git", args, { cwd: repoRoot });
	if (result.code !== 0) {
		return { ok: false, error: commandError(result, "Failed to create worktree") };
	}

	return { ok: true, value: { reused: false } };
}

export async function createOrReuseWorktree(
	pi: PiExec,
	repoRoot: string,
	branch: string,
	worktreeDir: string,
	options: CreateOrReuseWorktreeOptions = {},
): Promise<Result<WorktreeCreateResult>> {
	const pathExists = options.pathExists ?? existsSync;

	if (pathExists(worktreeDir)) {
		if (await isGitWorktree(pi, worktreeDir)) {
			return { ok: true, value: { reused: true } };
		}

		return { ok: false, error: `Path already exists but is not a git worktree: ${worktreeDir}` };
	}

	return createWorktree(pi, repoRoot, branch, worktreeDir);
}
