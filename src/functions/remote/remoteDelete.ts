import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		if (!node) return;

		const originalPath = node.uri.path;
		const lastSlash = originalPath.lastIndexOf("/");
		const currentName =
			lastSlash >= 0 ? originalPath.substring(lastSlash + 1) : originalPath;

		const confirm = await vscode.window.showWarningMessage(
			`Are you sure you want to delete '${currentName}'? This action cannot be undone.`,
			{ modal: true },
			"Delete",
		);

		if (confirm === "Delete") {
			try {
				await vscode.workspace.fs.delete(node.uri, { recursive: true });
				remoteExplorerProvider.refresh();
			} catch (e: any) {
				vscode.window.showErrorMessage(`Failed to delete: ${e.message || e}`);
			}
		}
	};
}
