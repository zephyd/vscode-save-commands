import * as vscode from "vscode";
import { sessionManager } from "./session";

export class FileNode extends vscode.TreeItem {
	constructor(
		public readonly uri: vscode.Uri,
		public readonly filename: string,
		public readonly fileType: vscode.FileType,
	) {
		super(
			filename,
			fileType === vscode.FileType.Directory
				? vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None,
		);

		this.contextValue =
			fileType === vscode.FileType.Directory ? "directory" : "file";
		this.resourceUri = uri;

		if (fileType === vscode.FileType.File) {
			this.command = {
				command: "vscode.open",
				title: "Open File",
				arguments: [uri],
			};
		}
	}
}

export class RemoteExplorerProvider
	implements vscode.TreeDataProvider<FileNode>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<
		FileNode | undefined | null | undefined
	>();
	readonly onDidChangeTreeData: vscode.Event<
		FileNode | undefined | null | undefined
	> = this._onDidChangeTreeData.event;

	private selectedNode?: FileNode;

	setSelectedNode(node?: FileNode): void {
		this.selectedNode = node;
	}

	getSelectedNode(): FileNode | undefined {
		return this.selectedNode;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: FileNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: FileNode): Promise<FileNode[]> {
		try {
			const session = sessionManager.getActiveSession();
			if (!element) {
				const p = session.cwd.startsWith("/") ? session.cwd : `/${session.cwd}`;
				const rootUri = vscode.Uri.parse(
					`save-commands-remote://${session.id}${p}`,
				);
				const entries = await vscode.workspace.fs.readDirectory(rootUri);

				entries.sort((a, b) => {
					if (
						a[1] === vscode.FileType.Directory &&
						b[1] !== vscode.FileType.Directory
					)
						return -1;
					if (
						a[1] !== vscode.FileType.Directory &&
						b[1] === vscode.FileType.Directory
					)
						return 1;
					return a[0].localeCompare(b[0]);
				});

				return entries.map(([name, type]) => {
					const childPath = p.endsWith("/") ? `${p}${name}` : `${p}/${name}`;
					const childUri = vscode.Uri.parse(
						`save-commands-remote://${session.id}${childPath}`,
					);
					return new FileNode(childUri, name, type);
				});
			}

			const entries = await vscode.workspace.fs.readDirectory(element.uri);

			entries.sort((a, b) => {
				if (
					a[1] === vscode.FileType.Directory &&
					b[1] !== vscode.FileType.Directory
				)
					return -1;
				if (
					a[1] !== vscode.FileType.Directory &&
					b[1] === vscode.FileType.Directory
				)
					return 1;
				return a[0].localeCompare(b[0]);
			});

			return entries.map(([name, type]) => {
				const p = element.uri.path;
				const childPath = p.endsWith("/") ? `${p}${name}` : `${p}/${name}`;
				const childUri = vscode.Uri.parse(
					`save-commands-remote://${element.uri.authority}${childPath}`,
				);
				return new FileNode(childUri, name, type);
			});
		} catch (e: any) {
			vscode.window.showErrorMessage(`Explorer error: ${e.message || e}`);
			return [];
		}
	}
}

export const remoteExplorerProvider = new RemoteExplorerProvider();
