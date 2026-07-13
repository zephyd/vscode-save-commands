import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";
import * as path from "node:path";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		let targetSessionId = "";
		let dirPath = "";

		if (node) {
			targetSessionId = node.uri.authority;
			if (node.fileType === vscode.FileType.Directory) {
				dirPath = node.uri.path;
			} else {
				const lastSlash = node.uri.path.lastIndexOf("/");
				dirPath = lastSlash > 0 ? node.uri.path.substring(0, lastSlash) : "/";
			}
		} else {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showWarningMessage(
					"No active file in editor or selected item to focus on.",
				);
				return;
			}

			const uri = activeEditor.document.uri;
			if (uri.scheme === "save-commands-remote") {
				targetSessionId = uri.authority;
				const lastSlash = uri.path.lastIndexOf("/");
				dirPath = lastSlash > 0 ? uri.path.substring(0, lastSlash) : "/";
			} else if (uri.scheme === "file") {
				targetSessionId = "local-session";
				dirPath = path.dirname(uri.fsPath);
				if (process.platform === "win32") {
					dirPath = dirPath.replace(/\\/g, "/");
				}
			} else {
				vscode.window.showWarningMessage(
					`Active editor scheme '${uri.scheme}' is not supported for remote explorer focus.`,
				);
				return;
			}
		}

		const session = sessionManager.getSession(targetSessionId);
		if (session) {
			sessionManager.setExplicitSession(session);
			session.cwd = dirPath;
			remoteExplorerProvider.refresh();
			vscode.window.showInformationMessage(`Explorer focused to: ${dirPath}`);
		} else {
			vscode.window.showErrorMessage(
				`No session found matching authority/ID: ${targetSessionId}`,
			);
		}
	};
}
