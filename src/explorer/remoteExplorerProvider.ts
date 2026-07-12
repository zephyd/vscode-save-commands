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

	private clipboardUri?: vscode.Uri;
	private clipboardIsCut = false;

	setClipboard(uri: vscode.Uri, isCut = false): void {
		this.clipboardUri = uri;
		this.clipboardIsCut = isCut;
	}

	getClipboard(): { uri: vscode.Uri | undefined; isCut: boolean } {
		return { uri: this.clipboardUri, isCut: this.clipboardIsCut };
	}

	clearClipboard(): void {
		this.clipboardUri = undefined;
		this.clipboardIsCut = false;
	}

	private treeView?: vscode.TreeView<FileNode>;

	setTreeView(treeView: vscode.TreeView<FileNode>): void {
		this.treeView = treeView;
		this.updateDescription();
	}

	updateDescription(): void {
		if (this.treeView) {
			const session = sessionManager.getActiveSession();
			if (session.type === "local") {
				this.treeView.description = "Local File System";
			} else if (session.type === "ssh") {
				const conn = session.sshConnection;
				this.treeView.description = conn
					? `SSH: ${conn.name}`
					: "SSH Connection";
			} else if (session.type === "docker") {
				const containerName = session.containerId?.substring(0, 12) || "";
				const connName = session.sshConnection
					? ` @ ${session.sshConnection.name}`
					: "";
				this.treeView.description = `Docker: ${containerName}${connName}`;
			} else if (session.type === "k8s") {
				const connName = session.sshConnection
					? ` @ ${session.sshConnection.name}`
					: "";
				this.treeView.description = `K8s: ${session.podName}${connName}`;
			}
		}
	}

	refresh(): void {
		this.updateDescription();
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
