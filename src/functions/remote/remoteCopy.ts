import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		if (!node) return;
		remoteExplorerProvider.setClipboard(node.uri, false);
		vscode.window.showInformationMessage(`Copied: ${node.filename}`);
	};
}
