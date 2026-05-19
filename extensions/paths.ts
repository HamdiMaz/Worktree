import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export function sanitizeWorktreeName(name: string): string {
	const sanitized = name.trim().replace(/[^a-zA-Z0-9._-]/g, "-");

	if (sanitized === "." || sanitized === "..") {
		return sanitized.replace(/\./g, "-");
	}

	return sanitized;
}

export function getWorktreesDir(repoRoot: string): string {
	return resolve(repoRoot, ".worktrees");
}

export function getWorktreeDir(repoRoot: string, safeName: string): string {
	return resolve(getWorktreesDir(repoRoot), safeName);
}

export async function ensureDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}
