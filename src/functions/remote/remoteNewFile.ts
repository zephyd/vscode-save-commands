import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		let targetUri: vscode.Uri;
		if (node) {
			targetUri = node.uri;
		} else {
			const session = sessionManager.getActiveSession();
			const p = session.cwd.startsWith("/") ? session.cwd : `/${session.cwd}`;
			targetUri = vscode.Uri.parse(`save-commands-remote://${session.id}${p}`);
		}

		let parentUri = targetUri;
		if (node && node.fileType === vscode.FileType.File) {
			const pathStr = targetUri.path;
			const lastSlash = pathStr.lastIndexOf("/");
			const parentPath = lastSlash > 0 ? pathStr.substring(0, lastSlash) : "/";
			parentUri = targetUri.with({ path: parentPath });
		}

		const name = await vscode.window.showInputBox({
			prompt: "Enter the name of the new file",
			placeHolder: "file.txt",
		});

		if (name) {
			const fileUri = parentUri.with({
				path: parentUri.path.endsWith("/")
					? `${parentUri.path}${name}`
					: `${parentUri.path}/${name}`,
			});
			try {
				await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
				remoteExplorerProvider.refresh();
			} catch (e: any) {
				vscode.window.showErrorMessage(
					`Failed to create file: ${e.message || e}`,
				);
			}
		}
	};
}
