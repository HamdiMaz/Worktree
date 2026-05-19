import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerWorktreeCommand(pi: ExtensionAPI): void {
	pi.registerCommand("worktree", {
		description: "Create or reuse a Git worktree and switch Pi into it",
		handler: async () => undefined,
	});
}
