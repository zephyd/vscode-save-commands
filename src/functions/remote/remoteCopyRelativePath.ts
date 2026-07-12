import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		if (!node) return;
		const session = sessionManager.getActiveSession();
		const rootPath = session.cwd;
		let relativePath = node.uri.path;
		if (relativePath.startsWith(rootPath)) {
			relativePath = relativePath.substring(rootPath.length);
			if (relativePath.startsWith("/")) {
				relativePath = relativePath.substring(1);
			}
		}
		await vscode.env.clipboard.writeText(relativePath);
		vscode.window.showInformationMessage(
			`Copied relative path: ${relativePath}`,
		);
	};
}
