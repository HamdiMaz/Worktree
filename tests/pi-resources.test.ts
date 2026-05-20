import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { copyProjectPiResources } from "../extensions/pi-resources.ts";

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

describe("project .pi resource copying", () => {
	it("copies existing allowlisted .pi resources into a worktree missing .pi", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-worktree-resources-"));
		try {
			const repoRoot = join(root, "repo");
			const worktreeDir = join(root, "worktree");
			await mkdir(join(repoRoot, ".pi", "skills", "my-skill"), { recursive: true });
			await mkdir(join(repoRoot, ".pi", "prompts"), { recursive: true });
			await mkdir(join(repoRoot, ".pi", "npm"), { recursive: true });
			await mkdir(worktreeDir, { recursive: true });
			await writeFile(join(repoRoot, ".pi", "settings.json"), "{\"theme\":\"dark\"}\n", "utf8");
			await writeFile(join(repoRoot, ".pi", "skills", "my-skill", "SKILL.md"), "---\nname: my-skill\ndescription: Test skill\n---\n", "utf8");
			await writeFile(join(repoRoot, ".pi", "prompts", "review.md"), "Review this\n", "utf8");
			await writeFile(join(repoRoot, ".pi", "SYSTEM.md"), "System instructions\n", "utf8");
			await writeFile(join(repoRoot, ".pi", "ralph-loop-debug.jsonl"), "debug\n", "utf8");
			await writeFile(join(repoRoot, ".pi", "npm", "package.json"), "{}\n", "utf8");

			await copyProjectPiResources(repoRoot, worktreeDir);

			assert.equal(await readFile(join(worktreeDir, ".pi", "settings.json"), "utf8"), "{\"theme\":\"dark\"}\n");
			assert.equal(await readFile(join(worktreeDir, ".pi", "skills", "my-skill", "SKILL.md"), "utf8"), "---\nname: my-skill\ndescription: Test skill\n---\n");
			assert.equal(await readFile(join(worktreeDir, ".pi", "prompts", "review.md"), "utf8"), "Review this\n");
			assert.equal(await readFile(join(worktreeDir, ".pi", "SYSTEM.md"), "utf8"), "System instructions\n");
			assert.equal(await pathExists(join(worktreeDir, ".pi", "ralph-loop-debug.jsonl")), false);
			assert.equal(await pathExists(join(worktreeDir, ".pi", "npm")), false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("skips missing allowlisted entries without creating placeholders", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-worktree-resources-"));
		try {
			const repoRoot = join(root, "repo");
			const worktreeDir = join(root, "worktree");
			await mkdir(join(repoRoot, ".pi", "skills"), { recursive: true });
			await mkdir(worktreeDir, { recursive: true });
			await writeFile(join(repoRoot, ".pi", "skills", "skill.md"), "skill\n", "utf8");

			await copyProjectPiResources(repoRoot, worktreeDir);

			assert.deepEqual((await readdir(join(worktreeDir, ".pi"))).sort(), ["skills"]);
			assert.equal(await readFile(join(worktreeDir, ".pi", "skills", "skill.md"), "utf8"), "skill\n");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("skips symlinks in allowlisted .pi resources", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-worktree-resources-"));
		try {
			const repoRoot = join(root, "repo");
			const worktreeDir = join(root, "worktree");
			await mkdir(join(repoRoot, ".pi", "skills", "real-skill"), { recursive: true });
			await mkdir(join(repoRoot, ".pi", "npm"), { recursive: true });
			await mkdir(worktreeDir, { recursive: true });
			await writeFile(join(repoRoot, ".pi", "real-settings.json"), "source settings\n", "utf8");
			await writeFile(join(repoRoot, ".pi", "skills", "real-skill", "SKILL.md"), "real skill\n", "utf8");
			await writeFile(join(repoRoot, ".pi", "npm", "secret.txt"), "secret\n", "utf8");
			await symlink(join(repoRoot, ".pi", "real-settings.json"), join(repoRoot, ".pi", "settings.json"));
			await symlink(join(repoRoot, ".pi", "npm"), join(repoRoot, ".pi", "skills", "npm-link"), "dir");

			await copyProjectPiResources(repoRoot, worktreeDir);

			assert.equal(await pathExists(join(worktreeDir, ".pi", "settings.json")), false);
			assert.equal(await readFile(join(worktreeDir, ".pi", "skills", "real-skill", "SKILL.md"), "utf8"), "real skill\n");
			assert.equal(await pathExists(join(worktreeDir, ".pi", "skills", "npm-link")), false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("removes the target .pi directory when copying fails partway through", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-worktree-resources-"));
		const unreadableFile = join(root, "repo", ".pi", "skills", "locked.md");
		try {
			const repoRoot = join(root, "repo");
			const worktreeDir = join(root, "worktree");
			await mkdir(join(repoRoot, ".pi", "skills"), { recursive: true });
			await mkdir(worktreeDir, { recursive: true });
			await writeFile(join(repoRoot, ".pi", "settings.json"), "settings\n", "utf8");
			await writeFile(unreadableFile, "locked\n", "utf8");
			await chmod(unreadableFile, 0o000);

			await assert.rejects(copyProjectPiResources(repoRoot, worktreeDir));

			assert.equal(await pathExists(join(worktreeDir, ".pi")), false);
		} finally {
			await chmod(unreadableFile, 0o600).catch(() => undefined);
			await rm(root, { recursive: true, force: true });
		}
	});

	it("skips when the repo root has no .pi directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-worktree-resources-"));
		try {
			const repoRoot = join(root, "repo");
			const worktreeDir = join(root, "worktree");
			await mkdir(repoRoot, { recursive: true });
			await mkdir(worktreeDir, { recursive: true });

			await copyProjectPiResources(repoRoot, worktreeDir);

			assert.equal(await pathExists(join(worktreeDir, ".pi")), false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("does not overwrite an existing worktree .pi directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-worktree-resources-"));
		try {
			const repoRoot = join(root, "repo");
			const worktreeDir = join(root, "worktree");
			await mkdir(join(repoRoot, ".pi"), { recursive: true });
			await mkdir(join(worktreeDir, ".pi"), { recursive: true });
			await writeFile(join(repoRoot, ".pi", "settings.json"), "source\n", "utf8");
			await writeFile(join(worktreeDir, ".pi", "settings.json"), "target\n", "utf8");

			await copyProjectPiResources(repoRoot, worktreeDir);

			assert.equal(await readFile(join(worktreeDir, ".pi", "settings.json"), "utf8"), "target\n");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
