import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOrReuseWorktree, getRepoRoot, validateBranchName } from "./git.ts";
import { ensureGitignoreIncludesWorktrees } from "./gitignore.ts";
import { ensureDirectory, getWorktreeDir, getWorktreesDir, sanitizeWorktreeName } from "./paths.ts";
import { switchToFreshWorktreeSession } from "./session.ts";

interface WorktreeCommandDependencies {
	ensureDirectory?: (path: string) => Promise<void>;
	ensureGitignoreIncludesWorktrees?: (repoRoot: string) => Promise<void>;
	pathExists?: (path: string) => boolean;
	switchToFreshWorktreeSession?: (ctx: ExtensionCommandContext, branch: string, worktreeDir: string) => Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

export function registerWorktreeCommand(pi: ExtensionAPI): void {
	pi.registerCommand("worktree", {
		description: "Create or reuse a Git worktree and switch Pi into it",
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

	const branch = args.trim();
	if (!branch) {
		ctx.ui.notify("Usage: /worktree <name>", "error");
		return;
	}

	const rootResult = await getRepoRoot(pi, ctx.cwd);
	if (!rootResult.ok) {
		ctx.ui.notify(rootResult.error, "error");
		return;
	}

	const repoRoot = rootResult.value;
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
		await switchSession(ctx, branch, worktreeDir);
	} catch (error) {
		ctx.ui.notify(errorMessage(error, "Failed to switch to worktree session"), "error");
	}
}
