import * as vscode from "vscode";
import TreeItem from "./TreeItem";
import Command from "./models/command";
import { CommandFolder } from "./models/command_folder";
import { StateType } from "./models/etters";
import SshConnection from "./models/ssh_connection";

export enum ContextValue {
	command = "command",
	folder = "folder",
	sshConnection = "sshConnection",
	none = "none",
	root = "root",
}

class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
	data: TreeItem[];
	private _onDidChangeTreeData: vscode.EventEmitter<
		TreeItem | undefined | undefined
	> = new vscode.EventEmitter<TreeItem | undefined | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | undefined> =
		this._onDidChangeTreeData.event;
	context: vscode.ExtensionContext;
	mode: "commands" | "ssh";
	private showSshGroups = false;
	private showCommandsGroups = false;

	constructor(
		context: vscode.ExtensionContext,
		mode: "commands" | "ssh" = "commands",
	) {
		this.context = context;
		this.mode = mode;
		this.data = [];
		if (this.mode === "ssh") {
			this.showSshGroups = this.context.globalState.get<boolean>("showSshGroups", false);
			vscode.commands.executeCommand(
				"setContext",
				"save-commands.show-ssh-groups",
				this.showSshGroups,
			);
		} else {
			this.showCommandsGroups = this.context.globalState.get<boolean>("showCommandsGroups", false);
			vscode.commands.executeCommand(
				"setContext",
				"save-commands.show-commands-groups",
				this.showCommandsGroups,
			);
		}
		this.refreshData();
	}

	getShowSshGroups(): boolean {
		return this.showSshGroups;
	}

	toggleSshGroups(): void {
		this.showSshGroups = !this.showSshGroups;
		this.context.globalState.update("showSshGroups", this.showSshGroups);
		vscode.commands.executeCommand(
			"setContext",
			"save-commands.show-ssh-groups",
			this.showSshGroups,
		);
		this.refresh();
	}

	getShowCommandsGroups(): boolean {
		return this.showCommandsGroups;
	}

	toggleCommandsGroups(): void {
		this.showCommandsGroups = !this.showCommandsGroups;
		this.context.globalState.update("showCommandsGroups", this.showCommandsGroups);
		vscode.commands.executeCommand(
			"setContext",
			"save-commands.show-commands-groups",
			this.showCommandsGroups,
		);
		this.refresh();
	}

	private createTreeMap(
		commands: Array<Command>,
		folders: Array<CommandFolder>,
		stateType: StateType,
	): Array<TreeItem> {
		const items: Array<TreeItem> = [];
		const foldersMap: Record<string, TreeItem> = {};

		// Create folders
		for (const folder of folders) {
			const treeItem = new TreeItem({
				id: folder.id,
				label: folder.name,
				children: [],
				parentFolderId: folder.parentFolderId,
				tooltip: folder.name,
				contextValue: ContextValue.folder,
				stateType: stateType,
			});
			items.push(treeItem);
			foldersMap[folder.id] = treeItem;
		}

		// Add commands to folder
		for (const command of commands) {
			const parentFolderId = command.parentFolderId;
			if (!parentFolderId || !foldersMap[parentFolderId]) {
				items.push(
					new TreeItem({
						id: command.id,
						label: command.name,
						tooltip: command.command,
						sortOrder: command.sortOrder,
						contextValue: ContextValue.command,
						parentFolderId: command.parentFolderId,
						children: [],
						stateType: stateType,
					}),
				);
				continue;
			}
			foldersMap[parentFolderId]?.children?.push(
				new TreeItem({
					id: command.id,
					label: command.name,
					tooltip: command.command,
					sortOrder: command.sortOrder,
					contextValue: ContextValue.command,
					parentFolderId: command.parentFolderId,
					children: [],
					stateType: stateType,
				}),
			);
		}

		// Add folder inside folders
		const filteredItems = items.filter((item) => {
			if (item.contextValue !== ContextValue.folder) return true;
			const parent = item.parentFolderId;
			if (!parent) return true;
			foldersMap[parent]?.children?.unshift(item);
			return false;
		});

		// Sort based on sort order
		const sortFn = (a: TreeItem, b: TreeItem) =>
			(a.sortOrder ?? 0) - (b.sortOrder ?? 0);
		filteredItems.sort(sortFn);

		for (const item of items) {
			if (item.children) {
				item.children.sort(sortFn);
			}
		}

		return filteredItems;
	}

	refreshData(): void {
		if (this.mode === "commands") {
			const globalCommands: Array<Command> = Command.etters.global.getValue(
				this.context,
			);
			const globalFolders: Array<CommandFolder> =
				CommandFolder.etters.global.getValue(this.context);
			const workspaceCommands: Array<Command> =
				Command.etters.workspace.getValue(this.context);
			const workspaceFolders: Array<CommandFolder> =
				CommandFolder.etters.workspace.getValue(this.context);

			const globalTree = this.createTreeMap(
				globalCommands,
				globalFolders,
				StateType.global,
			);
			const workspaceTree = this.createTreeMap(
				workspaceCommands,
				workspaceFolders,
				StateType.workspace,
			);

			if (this.showCommandsGroups) {
				const globalTreeItems: Array<TreeItem> =
					globalTree.length !== 0
						? globalTree
						: [
								new TreeItem({
									id: null,
									label: "No Commands Found",
									contextValue: ContextValue.none,
									stateType: StateType.global,
								}),
							];

				const workspaceTreeItems: Array<TreeItem> =
					workspaceTree.length !== 0
						? workspaceTree
						: [
								new TreeItem({
									id: null,
									label: "No Commands Found",
									contextValue: ContextValue.none,
									stateType: StateType.workspace,
								}),
							];

				this.data = [
					new TreeItem({
						id: null,
						label: "Global Commands",
						tooltip: "",
						contextValue: "root-global" as ContextValue,
						children: globalTreeItems,
						stateType: StateType.global,
					}),
				];

				const hasWorkspace =
					vscode.workspace.workspaceFolders &&
					vscode.workspace.workspaceFolders.length > 0;
				if (hasWorkspace) {
					this.data.push(
						new TreeItem({
							id: null,
							label: "Workspace Commands",
							tooltip: "",
							stateType: StateType.workspace,
							contextValue: "root-workspace" as ContextValue,
							children: workspaceTreeItems,
						}),
					);
				}
			} else {
				this.data = [...globalTree, ...workspaceTree];
				if (this.data.length === 0) {
					this.data = [
						new TreeItem({
							id: null,
							label: "No Commands Found",
							contextValue: ContextValue.none,
							stateType: StateType.global,
						}),
					];
				}
			}
		} else {
			// SSH mode
			const globalSshConnections: Array<SshConnection> =
				SshConnection.etters.global.getValue(this.context);
			const workspaceSshConnections: Array<SshConnection> =
				SshConnection.etters.workspace.getValue(this.context);

			const globalSshItems: Array<TreeItem> = globalSshConnections.map(
				(conn) =>
					new TreeItem({
						id: conn.id,
						label: conn.name,
						tooltip: `${conn.username}@${conn.host}:${conn.port}`,
						contextValue: ContextValue.sshConnection,
						stateType: StateType.global,
					}),
			);

			const workspaceSshItems: Array<TreeItem> = workspaceSshConnections.map(
				(conn) =>
					new TreeItem({
						id: conn.id,
						label: conn.name,
						tooltip: `${conn.username}@${conn.host}:${conn.port}`,
						contextValue: ContextValue.sshConnection,
						stateType: StateType.workspace,
					}),
			);

			if (this.showSshGroups) {
				const finalGlobalItems = globalSshItems.length !== 0 ? globalSshItems : [
					new TreeItem({
						id: null,
						label: "No SSH Connections Found",
						contextValue: ContextValue.none,
						stateType: StateType.global,
					}),
				];
				const finalWorkspaceItems = workspaceSshItems.length !== 0 ? workspaceSshItems : [
					new TreeItem({
						id: null,
						label: "No SSH Connections Found",
						contextValue: ContextValue.none,
						stateType: StateType.workspace,
					}),
				];

				this.data = [
					new TreeItem({
						id: null,
						label: "Global SSH Connections",
						tooltip: "",
						contextValue: "root-global-ssh" as ContextValue,
						children: finalGlobalItems,
						stateType: StateType.global,
					}),
				];

				const hasWorkspace =
					vscode.workspace.workspaceFolders &&
					vscode.workspace.workspaceFolders.length > 0;
				if (hasWorkspace) {
					this.data.push(
						new TreeItem({
							id: null,
							label: "Workspace SSH Connections",
							tooltip: "",
							contextValue: "root-workspace-ssh" as ContextValue,
							children: finalWorkspaceItems,
							stateType: StateType.workspace,
						}),
					);
				}
			} else {
				this.data = [...globalSshItems, ...workspaceSshItems];
				if (this.data.length === 0) {
					this.data = [
						new TreeItem({
							id: null,
							label: "No SSH Connections Found",
							contextValue: ContextValue.none,
							stateType: StateType.global,
						}),
					];
				}
			}
		}
	}

	refresh(): void {
		this.refreshData();
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	getChildren(
		element?: TreeItem | undefined,
	): vscode.ProviderResult<TreeItem[]> {
		if (element === undefined) {
			return this.data;
		}
		return element.children;
	}
}

export default TreeDataProvider;
