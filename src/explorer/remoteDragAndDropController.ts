import * as vscode from "vscode";
import type { FileNode } from "./remoteExplorerProvider";
import { remoteExplorerProvider } from "./remoteExplorerProvider";
import { sessionManager } from "./session";

export class RemoteDragAndDropController
	implements vscode.TreeDragAndDropController<FileNode>
{
	dragMimeTypes = [
		"application/vnd.code.tree.save-commands-remote-view",
		"text/uri-list",
	];
	dropMimeTypes = [
		"application/vnd.code.tree.save-commands-remote-view",
		"text/uri-list",
	];

	public async handleDrag(
		source: readonly FileNode[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<void> {
		if (source.length === 0) return;

		// 1. Internal payload for dragging within our own view
		const payload = source.map((node) => node.uri.toString());
		dataTransfer.set(
			"application/vnd.code.tree.save-commands-remote-view",
			new vscode.DataTransferItem(JSON.stringify(payload)),
		);

		// 2. Standard uri-list for dragging to editors/other folders
		const uriList = payload.join("\r\n");
		dataTransfer.set("text/uri-list", new vscode.DataTransferItem(uriList));
	}

	public async handleDrop(
		target: FileNode | undefined,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<void> {
		// Target directory
		let targetDirUri: vscode.Uri;
		if (target) {
			if (target.fileType === vscode.FileType.Directory) {
				targetDirUri = target.uri;
			} else {
				const pathStr = target.uri.path;
				const lastSlash = pathStr.lastIndexOf("/");
				const parentPath =
					lastSlash > 0 ? pathStr.substring(0, lastSlash) : "/";
				targetDirUri = target.uri.with({ path: parentPath });
			}
		} else {
			const session = sessionManager.getActiveSession();
			const p = session.cwd.startsWith("/") ? session.cwd : `/${session.cwd}`;
			targetDirUri = vscode.Uri.parse(
				`save-commands-remote://${session.id}${p}`,
			);
		}

		// Check internal drag drop first
		const transferItem = dataTransfer.get(
			"application/vnd.code.tree.save-commands-remote-view",
		);

		if (transferItem) {
			let sourceUris: string[] = [];
			try {
				sourceUris = JSON.parse(transferItem.value);
			} catch (e) {
				if (Array.isArray(transferItem.value)) {
					sourceUris = transferItem.value;
				}
			}

			if (sourceUris.length > 0) {
				try {
					for (const uriStr of sourceUris) {
						const srcUri = vscode.Uri.parse(uriStr);
						const filename = srcUri.path.substring(
							srcUri.path.lastIndexOf("/") + 1,
						);
						const destUri = targetDirUri.with({
							path: targetDirUri.path.endsWith("/")
								? `${targetDirUri.path}${filename}`
								: `${targetDirUri.path}/${filename}`,
						});

						if (srcUri.toString() === destUri.toString()) {
							continue;
						}

						if (destUri.path.startsWith(`${srcUri.path}/`)) {
							vscode.window.showErrorMessage(
								"Cannot move a folder into its own subdirectory.",
							);
							continue;
						}

						await vscode.workspace.fs.rename(srcUri, destUri);
					}
					remoteExplorerProvider.refresh();
				} catch (e: any) {
					vscode.window.showErrorMessage(
						`Failed to move files: ${e.message || e}`,
					);
				}
				return;
			}
		}

		// Fallback to text/uri-list for external drops (e.g. dragging local files from native explorer)
		const uriListItem = dataTransfer.get("text/uri-list");
		if (uriListItem) {
			const rawValue =
				typeof uriListItem.value === "string"
					? uriListItem.value
					: await uriListItem.asString();

			if (rawValue) {
				const uris = rawValue
					.split(/\r?\n/)
					.filter((line) => line.trim() !== "")
					.map((line) => vscode.Uri.parse(line));

				if (uris.length > 0) {
					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: "Uploading files...",
							cancellable: false,
						},
						async () => {
							const copyRecursive = async (
								src: vscode.Uri,
								dest: vscode.Uri,
							) => {
								const stat = await vscode.workspace.fs.stat(src);
								if (stat.type === vscode.FileType.Directory) {
									await vscode.workspace.fs.createDirectory(dest);
									const entries = await vscode.workspace.fs.readDirectory(src);
									for (const [name, type] of entries) {
										const childSrc =
											src.scheme === "file"
												? vscode.Uri.joinPath(src, name)
												: src.with({
														path: src.path.endsWith("/")
															? `${src.path}${name}`
															: `${src.path}/${name}`,
													});
										const childDest = dest.with({
											path: dest.path.endsWith("/")
												? `${dest.path}${name}`
												: `${dest.path}/${name}`,
										});
										await copyRecursive(childSrc, childDest);
									}
								} else {
									const content = await vscode.workspace.fs.readFile(src);
									await vscode.workspace.fs.writeFile(dest, content);
								}
							};

							for (const srcUri of uris) {
								const filename = srcUri.path.substring(
									srcUri.path.lastIndexOf("/") + 1,
								);
								const destUri = targetDirUri.with({
									path: targetDirUri.path.endsWith("/")
										? `${targetDirUri.path}${filename}`
										: `${targetDirUri.path}/${filename}`,
								});

								try {
									await copyRecursive(srcUri, destUri);
								} catch (e: any) {
									vscode.window.showErrorMessage(
										`Failed to copy/upload ${filename}: ${e.message || e}`,
									);
								}
							}

							remoteExplorerProvider.refresh();
							vscode.window.showInformationMessage(
								"Files copied/uploaded successfully.",
							);
						},
					);
				}
			}
		}
	}
}
