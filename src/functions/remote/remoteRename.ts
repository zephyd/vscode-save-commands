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

		const name = await vscode.window.showInputBox({
			prompt: "Enter new name",
			value: currentName,
		});

		if (name && name !== currentName) {
			const parentPath =
				lastSlash >= 0 ? originalPath.substring(0, lastSlash) : "";
			const newPath = parentPath.endsWith("/")
				? `${parentPath}${name}`
				: `${parentPath}/${name}`;
			const newUri = node.uri.with({ path: newPath });

			try {
				await vscode.workspace.fs.rename(node.uri, newUri);
				remoteExplorerProvider.refresh();
			} catch (e: any) {
				vscode.window.showErrorMessage(`Failed to rename: ${e.message || e}`);
			}
		}
	};
}
