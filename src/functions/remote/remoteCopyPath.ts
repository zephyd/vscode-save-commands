import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		if (!node) return;
		await vscode.env.clipboard.writeText(node.uri.path);
		vscode.window.showInformationMessage(`Copied path: ${node.uri.path}`);
	};
}
