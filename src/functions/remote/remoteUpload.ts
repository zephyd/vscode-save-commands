import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";

export default function (
	context: vscode.ExtensionContext,
	mode: "files" | "folder",
) {
	return async (node?: FileNode) => {
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

		const canSelectFiles = mode === "files";
		const canSelectFolders = mode === "folder";

		const localFiles = await vscode.window.showOpenDialog({
			canSelectFiles,
			canSelectFolders,
			canSelectMany: true,
			openLabel: canSelectFiles ? "Upload Files" : "Upload Folder",
			title: canSelectFiles
				? "Select Files to Upload"
				: "Select Folder to Upload",
		});

		if (!localFiles || localFiles.length === 0) return;

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: canSelectFiles ? "Uploading files..." : "Uploading folder...",
				cancellable: false,
			},
			async () => {
				const uploadRecursive = async (src: vscode.Uri, dest: vscode.Uri) => {
					const stat = await vscode.workspace.fs.stat(src);
					if (stat.type === vscode.FileType.Directory) {
						await vscode.workspace.fs.createDirectory(dest);
						const entries = await vscode.workspace.fs.readDirectory(src);
						for (const [name, type] of entries) {
							const childSrc = vscode.Uri.joinPath(src, name);
							const childDest = dest.with({
								path: dest.path.endsWith("/")
									? `${dest.path}${name}`
									: `${dest.path}/${name}`,
							});
							await uploadRecursive(childSrc, childDest);
						}
					} else {
						const content = await vscode.workspace.fs.readFile(src);
						await vscode.workspace.fs.writeFile(dest, content);
					}
				};

				for (const localUri of localFiles) {
					const filename = localUri.path.substring(
						localUri.path.lastIndexOf("/") + 1,
					);
					const destUri = targetDirUri.with({
						path: targetDirUri.path.endsWith("/")
							? `${targetDirUri.path}${filename}`
							: `${targetDirUri.path}/${filename}`,
					});

					try {
						await uploadRecursive(localUri, destUri);
					} catch (e: any) {
						vscode.window.showErrorMessage(
							`Failed to upload ${filename}: ${e.message || e}`,
						);
					}
				}

				remoteExplorerProvider.refresh();
				vscode.window.showInformationMessage("Upload completed successfully.");
			},
		);
	};
}
