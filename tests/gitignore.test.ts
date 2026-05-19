import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ensureGitignoreIncludesWorktrees, gitignoreHasWorktrees } from "../extensions/gitignore.ts";

describe("gitignore helper", () => {
	it("detects .worktrees entries", () => {
		assert.equal(gitignoreHasWorktrees("node_modules/\n.worktrees\n"), true);
		assert.equal(gitignoreHasWorktrees("node_modules/\n.worktrees/\n"), true);
		assert.equal(gitignoreHasWorktrees("node_modules/\ndist/\n"), false);
	});

	it("appends .worktrees when .gitignore exists and is missing it", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "pi-worktree-gitignore-"));
		try {
			const gitignore = join(repoRoot, ".gitignore");
			await writeFile(gitignore, "node_modules/\ndist/", "utf8");

			await ensureGitignoreIncludesWorktrees(repoRoot);

			assert.equal(await readFile(gitignore, "utf8"), "node_modules/\ndist/\n.worktrees\n");
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it("does not append when .gitignore already contains .worktrees", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "pi-worktree-gitignore-"));
		try {
			const gitignore = join(repoRoot, ".gitignore");
			await writeFile(gitignore, "node_modules/\n.worktrees/\n", "utf8");

			await ensureGitignoreIncludesWorktrees(repoRoot);

			assert.equal(await readFile(gitignore, "utf8"), "node_modules/\n.worktrees/\n");
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it("does nothing when .gitignore is absent", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "pi-worktree-gitignore-"));
		try {
			await ensureGitignoreIncludesWorktrees(repoRoot);
			await assert.rejects(readFile(join(repoRoot, ".gitignore"), "utf8"), { code: "ENOENT" });
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it("propagates unexpected .gitignore access errors", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-worktree-gitignore-"));
		try {
			const repoRoot = join(tempDir, "not-a-directory");
			await writeFile(repoRoot, "not a directory", "utf8");

			await assert.rejects(ensureGitignoreIncludesWorktrees(repoRoot), { code: "ENOTDIR" });
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
