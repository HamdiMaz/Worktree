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

async function checkBranchExists(pi: PiExec, repoRoot: string, branch: string): Promise<Result<boolean>> {
	const result = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoRoot });
	if (result.code === 0) return { ok: true, value: true };
	if (result.code === 1) return { ok: true, value: false };

	return { ok: false, error: commandError(result, "Failed to check branch") };
}

export async function branchExists(pi: PiExec, repoRoot: string, branch: string): Promise<boolean> {
	const result = await checkBranchExists(pi, repoRoot, branch);
	return result.ok && result.value;
}

export async function isGitWorktree(pi: PiExec, worktreeDir: string): Promise<boolean> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd: worktreeDir });
	return result.code === 0 && resolve(result.stdout.trim()) === resolve(worktreeDir);
}

async function isRegisteredWorktree(pi: PiExec, repoRoot: string, worktreeDir: string): Promise<Result<boolean>> {
	const result = await pi.exec("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot });
	if (result.code !== 0) {
		return { ok: false, error: commandError(result, "Failed to list worktrees") };
	}

	const resolvedWorktreeDir = resolve(worktreeDir);
	const registered = result.stdout
		.split("\n")
		.filter((line) => line.startsWith("worktree "))
		.some((line) => resolve(line.slice("worktree ".length)) === resolvedWorktreeDir);

	return { ok: true, value: registered };
}

export async function createWorktree(pi: PiExec, repoRoot: string, branch: string, worktreeDir: string): Promise<Result<WorktreeCreateResult>> {
	const existingBranch = await checkBranchExists(pi, repoRoot, branch);
	if (!existingBranch.ok) return existingBranch;

	const args = existingBranch.value
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
		if (!(await isGitWorktree(pi, worktreeDir))) {
			return { ok: false, error: `Path already exists but is not a git worktree: ${worktreeDir}` };
		}

		const registeredWorktree = await isRegisteredWorktree(pi, repoRoot, worktreeDir);
		if (!registeredWorktree.ok) return registeredWorktree;
		if (registeredWorktree.value) {
			return { ok: true, value: { reused: true } };
		}

		return { ok: false, error: `Path already exists but is not a git worktree for this repository: ${worktreeDir}` };
	}

	return createWorktree(pi, repoRoot, branch, worktreeDir);
}
