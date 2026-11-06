import { randomInt } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export const GENERATED_WORKTREE_NAME_LENGTH = 5;

const WORKTREE_NAME_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateWorktreeName(length = GENERATED_WORKTREE_NAME_LENGTH): string {
	let name = "";

	for (let index = 0; index < length; index += 1) {
		name += WORKTREE_NAME_ALPHABET[randomInt(WORKTREE_NAME_ALPHABET.length)];
	}

	return name;
}

export function sanitizeWorktreeName(name: string): string {
	const sanitized = name.trim().replace(/[^a-zA-Z0-9._-]/g, "-");

	if (sanitized === "" || sanitized === "." || sanitized === "..") {
		return sanitized.replace(/\./g, "-") || "-";
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
