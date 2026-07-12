import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		if (!node) return;

		const localDest = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: "Download to this folder",
		});

		if (!localDest || localDest.length === 0) return;
		const targetDir = localDest[0];

		const srcUri = node.uri;
		const filename = srcUri.path.substring(srcUri.path.lastIndexOf("/") + 1);
		const destUri = vscode.Uri.joinPath(targetDir, filename);

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Downloading ${filename}...`,
				cancellable: false,
			},
			async () => {
				const downloadRecursive = async (src: vscode.Uri, dest: vscode.Uri) => {
					const stat = await vscode.workspace.fs.stat(src);
					if (stat.type === vscode.FileType.Directory) {
						await vscode.workspace.fs.createDirectory(dest);
						const entries = await vscode.workspace.fs.readDirectory(src);
						for (const [name, type] of entries) {
							const childSrc = src.with({ path: `${src.path}/${name}` });
							const childDest = vscode.Uri.joinPath(dest, name);
							await downloadRecursive(childSrc, childDest);
						}
					} else {
						const content = await vscode.workspace.fs.readFile(src);
						await vscode.workspace.fs.writeFile(dest, content);
					}
				};

				try {
					await downloadRecursive(srcUri, destUri);
					vscode.window.showInformationMessage(
						`Successfully downloaded ${filename}`,
					);
				} catch (e: any) {
					vscode.window.showErrorMessage(`Download failed: ${e.message || e}`);
				}
			},
		);
	};
}
