import { existsSync } from "node:fs";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { branchExists, createOrReuseWorktree, getRepoRoot, validateBranchName } from "./git.ts";
import { ensureGitignoreIncludesWorktrees } from "./gitignore.ts";
import {
	ensureDirectory,
	generateWorktreeName,
	getWorktreeDir,
	getWorktreesDir,
	sanitizeWorktreeName,
} from "./paths.ts";
import { copyProjectPiResources } from "./pi-resources.ts";
import { switchToFreshWorktreeSession } from "./session.ts";

const MAX_GENERATED_NAME_ATTEMPTS = 10;

interface WorktreeCommandDependencies {
	ensureDirectory?: (path: string) => Promise<void>;
	ensureGitignoreIncludesWorktrees?: (repoRoot: string) => Promise<void>;
	pathExists?: (path: string) => boolean;
	generateName?: () => string;
	copyProjectPiResources?: (repoRoot: string, worktreeDir: string) => Promise<void>;
	switchToFreshWorktreeSession?: (ctx: ExtensionCommandContext, branch: string, worktreeDir: string) => Promise<void>;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

async function findUnusedWorktreeName(
	pi: Pick<ExtensionAPI, "exec">,
	repoRoot: string,
	generateName: () => string,
	pathExists: (path: string) => boolean,
): Promise<Result<string>> {
	for (let attempt = 0; attempt < MAX_GENERATED_NAME_ATTEMPTS; attempt += 1) {
		const candidate = generateName().trim();
		if (!candidate) continue;

		const validation = await validateBranchName(pi, repoRoot, candidate);
		if (!validation.ok) continue;

		if (await branchExists(pi, repoRoot, candidate)) continue;

		if (pathExists(getWorktreeDir(repoRoot, sanitizeWorktreeName(candidate)))) continue;

		return { ok: true, value: candidate };
	}

	return { ok: false, error: `Could not generate an unused worktree name after ${MAX_GENERATED_NAME_ATTEMPTS} attempts` };
}

export function registerWorktreeCommand(pi: ExtensionAPI): void {
	pi.registerCommand("worktree", {
		description: "Create or reuse a Git worktree (random name when omitted) and switch Pi into it",
		handler: async (args, ctx) => {
			await handleWorktreeCommand(pi, args, ctx);
		},
	});
}

export async function handleWorktreeCommand(
	pi: Pick<ExtensionAPI, "exec">,
	args: string,
	ctx: ExtensionCommandContext,
	dependencies: WorktreeCommandDependencies = {},
): Promise<void> {
	await ctx.waitForIdle();

	const requestedName = args.trim();
	const pathExists = dependencies.pathExists ?? existsSync;

	const rootResult = await getRepoRoot(pi, ctx.cwd);
	if (!rootResult.ok) {
		ctx.ui.notify(rootResult.error, "error");
		return;
	}

	const repoRoot = rootResult.value;

	let branch = requestedName;
	if (!branch) {
		const nameResult = await findUnusedWorktreeName(
			pi,
			repoRoot,
			dependencies.generateName ?? (() => generateWorktreeName()),
			pathExists,
		);
		if (!nameResult.ok) {
			ctx.ui.notify(nameResult.error, "error");
			return;
		}
		branch = nameResult.value;
	}

	const branchValidation = await validateBranchName(pi, repoRoot, branch);
	if (!branchValidation.ok) {
		ctx.ui.notify(branchValidation.error, "error");
		return;
	}

	const safeName = sanitizeWorktreeName(branch);
	const worktreesDir = getWorktreesDir(repoRoot);
	const worktreeDir = getWorktreeDir(repoRoot, safeName);
	const makeDirectory = dependencies.ensureDirectory ?? ensureDirectory;
	const updateGitignore = dependencies.ensureGitignoreIncludesWorktrees ?? ensureGitignoreIncludesWorktrees;
	const copyResources = dependencies.copyProjectPiResources ?? copyProjectPiResources;
	const switchSession = dependencies.switchToFreshWorktreeSession ?? switchToFreshWorktreeSession;

	try {
		await makeDirectory(worktreesDir);
	} catch (error) {
		ctx.ui.notify(errorMessage(error, `Failed to create worktrees directory: ${worktreesDir}`), "error");
		return;
	}

	try {
		await updateGitignore(repoRoot);
	} catch (error) {
		ctx.ui.notify(errorMessage(error, "Failed to update .gitignore"), "error");
		return;
	}

	const createOptions = dependencies.pathExists === undefined ? {} : { pathExists: dependencies.pathExists };
	const worktreeResult = await createOrReuseWorktree(pi, repoRoot, branch, worktreeDir, createOptions);
	if (!worktreeResult.ok) {
		ctx.ui.notify(worktreeResult.error, "error");
		return;
	}

	try {
		await copyResources(repoRoot, worktreeDir);
	} catch (error) {
		ctx.ui.notify(`Could not copy .pi resources into worktree: ${errorMessage(error, "copy failed")}`, "warning");
	}

	try {
		await switchSession(ctx, branch, worktreeDir);
	} catch (error) {
		ctx.ui.notify(errorMessage(error, "Failed to switch to worktree session"), "error");
	}
}
