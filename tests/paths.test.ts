import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { ensureDirectory, getWorktreeDir, getWorktreesDir, sanitizeWorktreeName } from "../extensions/paths.ts";

describe("path helpers", () => {
	it("sanitizes branch names for filesystem paths", () => {
		assert.equal(sanitizeWorktreeName("Feature/Auth"), "Feature-Auth");
		assert.equal(sanitizeWorktreeName("feature auth:api"), "feature-auth-api");
		assert.equal(sanitizeWorktreeName("release_1.0-fix"), "release_1.0-fix");
	});

	it("does not return directory traversal names", () => {
		assert.equal(sanitizeWorktreeName("."), "-");
		assert.equal(sanitizeWorktreeName(".."), "--");
	});

	it("builds .worktrees paths under the repository root", () => {
		const repoRoot = resolve("/tmp/example-repo");
		assert.equal(getWorktreesDir(repoRoot), resolve(repoRoot, ".worktrees"));
		assert.equal(getWorktreeDir(repoRoot, "Feature-Auth"), resolve(repoRoot, ".worktrees", "Feature-Auth"));
	});

	it("creates directories recursively", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-worktree-paths-"));
		try {
			const nested = join(root, "a", "b", "c");
			await ensureDirectory(nested);
			const info = await stat(nested);
			assert.equal(info.isDirectory(), true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
