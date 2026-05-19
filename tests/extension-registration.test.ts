import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import setupExtension from "../extensions/index.ts";

describe("worktree extension registration", () => {
	it("registers the /worktree command without tools or events", () => {
		const registeredTools: unknown[] = [];
		const registeredCommands: Array<{ name: string; description?: string }> = [];
		const registeredEvents: string[] = [];
		const pi = {
			registerTool(tool: unknown) {
				registeredTools.push(tool);
			},
			registerCommand(name: string, options: { description?: string }) {
				registeredCommands.push({ name, description: options.description });
			},
			on(event: string) {
				registeredEvents.push(event);
			},
		};

		assert.equal(typeof setupExtension, "function");
		assert.doesNotThrow(() => setupExtension(pi as unknown as ExtensionAPI));
		assert.deepEqual(registeredTools, []);
		assert.deepEqual(registeredEvents, []);
		assert.deepEqual(registeredCommands, [
			{
				name: "worktree",
				description: "Create or reuse a Git worktree and switch Pi into it",
			},
		]);
	});
});
