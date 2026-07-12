import * as vscode from "vscode";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		const clipboard = remoteExplorerProvider.getClipboard();
		if (!clipboard.uri) {
			vscode.window.showErrorMessage("Clipboard is empty.");
			return;
		}

		let targetDirUri: vscode.Uri;
		if (node) {
			if (node.fileType === vscode.FileType.Directory) {
				targetDirUri = node.uri;
			} else {
				const pathStr = node.uri.path;
				const lastSlash = pathStr.lastIndexOf("/");
				const parentPath =
					lastSlash > 0 ? pathStr.substring(0, lastSlash) : "/";
				targetDirUri = node.uri.with({ path: parentPath });
			}
		} else {
			const session = sessionManager.getActiveSession();
			const p = session.cwd.startsWith("/") ? session.cwd : `/${session.cwd}`;
			targetDirUri = vscode.Uri.parse(
				`save-commands-remote://${session.id}${p}`,
			);
		}

		const srcUri = clipboard.uri;
		const filename = srcUri.path.substring(srcUri.path.lastIndexOf("/") + 1);
		const destUri = targetDirUri.with({
			path: targetDirUri.path.endsWith("/")
				? `${targetDirUri.path}${filename}`
				: `${targetDirUri.path}/${filename}`,
		});

		try {
			const copyRecursive = async (src: vscode.Uri, dest: vscode.Uri) => {
				const stat = await vscode.workspace.fs.stat(src);
				if (stat.type === vscode.FileType.Directory) {
					await vscode.workspace.fs.createDirectory(dest);
					const entries = await vscode.workspace.fs.readDirectory(src);
					for (const [name, type] of entries) {
						const childSrc = src.with({ path: `${src.path}/${name}` });
						const childDest = dest.with({ path: `${dest.path}/${name}` });
						await copyRecursive(childSrc, childDest);
					}
				} else {
					const content = await vscode.workspace.fs.readFile(src);
					await vscode.workspace.fs.writeFile(dest, content);
				}
			};

			await copyRecursive(srcUri, destUri);

			if (clipboard.isCut) {
				await vscode.workspace.fs.delete(srcUri, { recursive: true });
				remoteExplorerProvider.clearClipboard();
			}

			remoteExplorerProvider.refresh();
			vscode.window.showInformationMessage(`Pasted: ${filename}`);
		} catch (e: any) {
			vscode.window.showErrorMessage(`Failed to paste: ${e.message || e}`);
		}
	};
}
