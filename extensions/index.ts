import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWorktreeCommand } from "./worktree-command.ts";

export default function worktreeExtension(pi: ExtensionAPI): void {
	registerWorktreeCommand(pi);
}
