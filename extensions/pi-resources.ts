import { lstat, copyFile, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import type { Stats } from "node:fs";
import { join } from "node:path";

const PROJECT_PI_RESOURCE_ENTRIES = ["settings.json", "skills", "prompts", "extensions", "themes", "SYSTEM.md", "APPEND_SYSTEM.md"] as const;

async function getPathStats(path: string): Promise<Stats | undefined> {
	try {
		return await lstat(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

async function copySafeProjectResource(sourcePath: string, targetPath: string): Promise<boolean> {
	const stats = await getPathStats(sourcePath);
	if (!stats || stats.isSymbolicLink()) {
		return false;
	}

	if (stats.isDirectory()) {
		await mkdir(targetPath, { recursive: true });
		const entries = await readdir(sourcePath);
		for (const entry of entries) {
			await copySafeProjectResource(join(sourcePath, entry), join(targetPath, entry));
		}
		return true;
	}

	if (stats.isFile()) {
		await copyFile(sourcePath, targetPath);
		return true;
	}

	return false;
}

export async function copyProjectPiResources(repoRoot: string, worktreeDir: string): Promise<void> {
	const sourcePiDir = join(repoRoot, ".pi");
	const targetPiDir = join(worktreeDir, ".pi");

	if (await getPathStats(targetPiDir)) {
		return;
	}

	const sourcePiStats = await getPathStats(sourcePiDir);
	if (!sourcePiStats?.isDirectory()) {
		return;
	}

	let tempPiDir: string | undefined = await mkdtemp(join(worktreeDir, ".pi.tmp-"));
	try {
		let copiedAny = false;
		for (const entry of PROJECT_PI_RESOURCE_ENTRIES) {
			copiedAny = (await copySafeProjectResource(join(sourcePiDir, entry), join(tempPiDir, entry))) || copiedAny;
		}

		if (!copiedAny || (await getPathStats(targetPiDir))) {
			return;
		}

		await rename(tempPiDir, targetPiDir);
		tempPiDir = undefined;
	} finally {
		if (tempPiDir) {
			await rm(tempPiDir, { recursive: true, force: true });
		}
	}
}
