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
	filtersRoot = "filtersRoot",
	filterItem = "filterItem",
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
	private showAttachFilters = false;

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

	toggleAttachFilters(): void {
		this.showAttachFilters = !this.showAttachFilters;
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

	private createFiltersTreeItem(): TreeItem {
		const config = vscode.workspace.getConfiguration("save-commands");
		const k8sNamespace = config.get<string>("k8s.namespaceFilter") || "None";
		const k8sKeyword = config.get<string>("k8s.keywordFilter") || "None";
		const k8sInitialDir = config.get<string>("k8s.initialDir") || "None";
		const dockerArgs = config.get<string>("docker.filterArgs") || "None";
		const dockerKeyword = config.get<string>("docker.keywordFilter") || "None";

		const children = [
			new TreeItem({
				id: "filter-k8s-namespace",
				label: `K8s Namespace: ${k8sNamespace}`,
				tooltip: "Click to edit Kubernetes Namespace filter",
				contextValue: ContextValue.filterItem,
				stateType: StateType.global,
				command: {
					command: "save-commands.editFilterItem",
					title: "Edit K8s Namespace Filter",
					arguments: [
						"k8s.namespaceFilter",
						"Kubernetes Namespace",
						k8sNamespace === "None" ? "" : k8sNamespace,
						"e.g. default"
					]
				}
			}),
			new TreeItem({
				id: "filter-k8s-keyword",
				label: `K8s Keyword: ${k8sKeyword}`,
				tooltip: "Click to edit Kubernetes Pod Keyword filter (space/comma separated)",
				contextValue: ContextValue.filterItem,
				stateType: StateType.global,
				command: {
					command: "save-commands.editFilterItem",
					title: "Edit K8s Keyword Filter",
					arguments: [
						"k8s.keywordFilter",
						"Kubernetes Pod Keyword",
						k8sKeyword === "None" ? "" : k8sKeyword,
						"e.g. nginx proxy (separated by space/comma)"
					]
				}
			}),
			new TreeItem({
				id: "filter-k8s-initial-dir",
				label: `K8s Initial Dir: ${k8sInitialDir}`,
				tooltip: "Click to edit Kubernetes container initial directory",
				contextValue: ContextValue.filterItem,
				stateType: StateType.global,
				command: {
					command: "save-commands.editFilterItem",
					title: "Edit K8s Initial Dir",
					arguments: [
						"k8s.initialDir",
						"Kubernetes Initial Directory",
						k8sInitialDir === "None" ? "" : k8sInitialDir,
						"e.g. /app or /var/log"
					]
				}
			}),
			new TreeItem({
				id: "filter-docker-args",
				label: `Docker Args: ${dockerArgs}`,
				tooltip: "Click to edit Docker ps filter arguments",
				contextValue: ContextValue.filterItem,
				stateType: StateType.global,
				command: {
					command: "save-commands.editFilterItem",
					title: "Edit Docker Args Filter",
					arguments: [
						"docker.filterArgs",
						"Docker ps Arguments",
						dockerArgs === "None" ? "" : dockerArgs,
						"e.g. -f status=running"
					]
				}
			}),
			new TreeItem({
				id: "filter-docker-keyword",
				label: `Docker Keyword: ${dockerKeyword}`,
				tooltip: "Click to edit Docker container name/image Keyword filter (space/comma separated)",
				contextValue: ContextValue.filterItem,
				stateType: StateType.global,
				command: {
					command: "save-commands.editFilterItem",
					title: "Edit Docker Keyword Filter",
					arguments: [
						"docker.keywordFilter",
						"Docker container Keyword",
						dockerKeyword === "None" ? "" : dockerKeyword,
						"e.g. web api (separated by space/comma)"
					]
				}
			})
		];

		return new TreeItem({
			id: "attach-filters-root",
			label: "Attach Filters Config",
			tooltip: "Configure Kubernetes and Docker attach filters directly",
			contextValue: ContextValue.filtersRoot,
			stateType: StateType.global,
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			children: children
		});
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
				if (this.showAttachFilters) {
					this.data.push(this.createFiltersTreeItem());
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
				if (this.showAttachFilters) {
					this.data.push(this.createFiltersTreeItem());
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
