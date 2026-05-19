import { constants } from "node:fs";
import { access, appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export function gitignoreHasWorktrees(content: string): boolean {
	return content.split(/\r?\n/).some((line) => {
		const trimmed = line.trim();
		return trimmed === ".worktrees" || trimmed === ".worktrees/";
	});
}

export async function ensureGitignoreIncludesWorktrees(repoRoot: string): Promise<void> {
	const gitignorePath = resolve(repoRoot, ".gitignore");

	if (!(await fileExists(gitignorePath))) {
		return;
	}

	const content = await readFile(gitignorePath, "utf8");
	if (gitignoreHasWorktrees(content)) {
		return;
	}

	const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
	await appendFile(gitignorePath, `${separator}.worktrees\n`, "utf8");
}
