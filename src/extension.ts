import * as vscode from "vscode";
import TreeDataProvider from "./TreeProvider";
import { ExecCommands } from "./models/exec_commands";
import "reflect-metadata";
import * as fs from "node:fs";
import DragAndDropController from "./DragAndDropController";
import FormViewProvider from "./FormViewProvider";
import { remoteExplorerProvider } from "./explorer/remoteExplorerProvider";
import { remoteFileSystemProvider } from "./explorer/remoteFileSystemProvider";
import { sessionManager } from "./explorer/session";
import { sshPool } from "./explorer/sshPool";
import {
	addCommandFn,
	addFolderFn,
	addSshConnectionFn,
	browseRemoteFilesFn,
	copyCommandFn,
	deleteCommandFn,
	deleteCommandsFn,
	deleteFolderFn,
	deleteSshConnectionFn,
	editCommandFn,
	editFolderFn,
	editSshConnectionFn,
	openTerminalAtRemoteDirFn,
	remoteCopyFn,
	remoteCopyPathFn,
	remoteCopyRelativePathFn,
	remoteCutFn,
	remoteDeleteFn,
	remoteDownloadFn,
	remoteNewFileFn,
	remoteNewFolderFn,
	remotePasteFn,
	remoteRenameFn,
	resetFn,
	runCommandFn,
	runCommandInActiveTerminalFn,
	runFolderFn,
	runFolderInActiveTerminalFn,
	sshConnectFn,
	sshConnectInActiveTerminalFn,
	syncExplorerToTerminalFn,
} from "./functions";
import Command from "./models/command";
import { StateType } from "./models/etters";
import {
	FALLBACK_PLACEHOLDER_TYPE,
	PlaceholderType,
} from "./models/placeholder_types";
import SshConnection from "./models/ssh_connection";
import { getActivePlaceholderType } from "./utils";

export function activate(context: vscode.ExtensionContext) {
	const treeView = new TreeDataProvider(context);
	const treeDnDController = new DragAndDropController(context);
	const formViewProvider = new FormViewProvider(context);

	vscode.window.registerWebviewViewProvider(
		FormViewProvider.viewType,
		formViewProvider,
	);

	const callbacks: Record<ExecCommands, (...args: any[]) => any> = {
		[ExecCommands.addCommand]: addCommandFn(formViewProvider),
		[ExecCommands.deleteCommand]: deleteCommandFn(context),
		[ExecCommands.runCommand]: runCommandFn(context),
		[ExecCommands.deleteCommands]: deleteCommandsFn(context),
		[ExecCommands.editCommand]: editCommandFn(context, formViewProvider),
		[ExecCommands.copyCommand]: copyCommandFn(context),
		[ExecCommands.runCommandInActiveTerminal]:
			runCommandInActiveTerminalFn(context),
		[ExecCommands.reset]: resetFn(context),
		[ExecCommands.runFolder]: runFolderFn(context),
		[ExecCommands.runFolderInActiveTerminal]:
			runFolderInActiveTerminalFn(context),
		[ExecCommands.addFolder]: addFolderFn(context),
		[ExecCommands.deleteFolder]: deleteFolderFn(context),
		[ExecCommands.editFolder]: editFolderFn(context),
		[ExecCommands.refreshView]: () => treeView.refresh(),
		[ExecCommands.openConfigFile]: async () => {
			vscode.commands.executeCommand(
				"save-commands.openFileInternal",
				StateType.workspace,
			);
		},
		[ExecCommands.openGlobalConfigFile]: async () => {
			vscode.commands.executeCommand(
				"save-commands.openFileInternal",
				StateType.global,
			);
		},
		[ExecCommands.sshConnect]: sshConnectFn(context),
		[ExecCommands.sshConnectInActiveTerminal]:
			sshConnectInActiveTerminalFn(context),
		[ExecCommands.addSshConnection]: addSshConnectionFn(
			context,
			formViewProvider,
		),
		[ExecCommands.deleteSshConnection]: deleteSshConnectionFn(context),
		[ExecCommands.openSshConfigFile]: async () => {
			vscode.commands.executeCommand(
				"save-commands.openSshFileInternal",
				StateType.workspace,
			);
		},
		[ExecCommands.openGlobalSshConfigFile]: async () => {
			vscode.commands.executeCommand(
				"save-commands.openSshFileInternal",
				StateType.global,
			);
		},
		[ExecCommands.editSshConnection]: editSshConnectionFn(
			context,
			formViewProvider,
		),
	};

	vscode.commands.registerCommand(
		"save-commands.handleFormSubmit",
		async (data: {
			name: string;
			command: string;
			stateType: StateType;
			folderId: string | null;
			commandId?: string;
			placeholderTypeId?: string;
		}) => {
			try {
				const {
					name,
					command,
					stateType,
					folderId,
					commandId,
					placeholderTypeId,
				} = data;
				const etter =
					stateType === StateType.global
						? Command.etters.global
						: Command.etters.workspace;
				const currentCommands = etter.getValue(context);

				if (commandId) {
					// UPDATE MODE
					const idx = currentCommands.findIndex((c) => c.id === commandId);
					if (idx > -1) {
						currentCommands[idx].name = name.trim();
						currentCommands[idx].command = command.trim();
						if (placeholderTypeId) {
							currentCommands[idx].placeholderTypeId = placeholderTypeId;
						}
						// Keep other properties like parentId unless we want to change them
						vscode.window.showInformationMessage(`Updated Command: ${name}`);
					}
				} else {
					// CREATE MODE
					const placeholderTypeIdToUse =
						placeholderTypeId || getActivePlaceholderType().id;
					const placeholderType =
						PlaceholderType.getPlaceholderTypeFromId(placeholderTypeIdToUse) ??
						FALLBACK_PLACEHOLDER_TYPE;

					const newCmd = Command.create({
						name: name.trim(),
						command: command.trim(),
						parentFolderId: folderId,
						placeholderType: placeholderType,
					});
					currentCommands.push(newCmd);
					vscode.window.showInformationMessage(`Added Command: ${name}`);
				}

				etter.setValue(context, currentCommands);
				treeView.refresh();
			} catch (e) {
				vscode.window.showErrorMessage(`Failed to save: ${e}`);
			}
		},
	);

	vscode.commands.registerCommand(
		"save-commands.handleSshFormSubmit",
		async (data: {
			name: string;
			host: string;
			port: number;
			username: string;
			password?: string;
			stateType: StateType;
			commandId?: string | null;
		}) => {
			try {
				const { name, host, port, username, password, stateType, commandId } =
					data;
				const etter =
					stateType === StateType.global
						? SshConnection.etters.global
						: SshConnection.etters.workspace;
				const currentConnections = etter.getValue(context);

				if (commandId) {
					// UPDATE MODE
					const idx = currentConnections.findIndex((c) => c.id === commandId);
					if (idx > -1) {
						currentConnections[idx].name = name.trim();
						currentConnections[idx].host = host.trim();
						currentConnections[idx].port = port;
						currentConnections[idx].username = username.trim();
						currentConnections[idx].password = (password || "").trim();
						vscode.window.showInformationMessage(
							`Updated SSH Connection: ${name}`,
						);
					}
				} else {
					// CREATE MODE
					const newConn = SshConnection.create({
						name: name.trim(),
						host: host.trim(),
						port: port,
						username: username.trim(),
						password: (password || "").trim(),
					});
					currentConnections.push(newConn);
					vscode.window.showInformationMessage(`Added SSH Connection: ${name}`);
				}

				await etter.setValue(context, currentConnections);
				treeView.refresh();
			} catch (e) {
				vscode.window.showErrorMessage(`Failed to save SSH Connection: ${e}`);
			}
		},
	);

	vscode.commands.registerCommand(
		"save-commands.openFileInternal",
		async (stateType: StateType) => {
			try {
				const etter = Command.etters;
				// @ts-ignore
				const filePath = etter.getStoragePath(context, stateType);

				if (!filePath) {
					vscode.window.showWarningMessage(
						`No workspace open to manage ${stateType} config.`,
					);
					return;
				}

				if (!fs.existsSync(filePath)) {
					fs.writeFileSync(filePath, "[]", "utf8");
				}
				const doc = await vscode.workspace.openTextDocument(filePath);
				await vscode.window.showTextDocument(doc);
			} catch (e) {
				vscode.window.showErrorMessage(`Failed to open config file: ${e}`);
			}
		},
	);

	vscode.commands.registerCommand(
		"save-commands.openSshFileInternal",
		async (stateType: StateType) => {
			try {
				const etter = SshConnection.etters;
				// @ts-ignore
				const filePath = etter.getStoragePath(context, stateType);

				if (!filePath) {
					vscode.window.showWarningMessage(
						`No workspace open to manage ${stateType} SSH config.`,
					);
					return;
				}

				if (!fs.existsSync(filePath)) {
					fs.writeFileSync(filePath, "[]", "utf8");
				}
				const doc = await vscode.workspace.openTextDocument(filePath);
				await vscode.window.showTextDocument(doc);
			} catch (e) {
				vscode.window.showErrorMessage(`Failed to open SSH config file: ${e}`);
			}
		},
	);

	// Double-click detection state
	let lastClickTime = 0;
	let lastClickedId = "";

	// Register the double-click-specific edit command
	vscode.commands.registerCommand(
		"save-commands.editCommandDouble",
		async (item: any) => {
			const now = Date.now();
			if (now - lastClickTime < 500 && lastClickedId === item.id) {
				// Trigger the real edit command only on double click
				await vscode.commands.executeCommand(ExecCommands.editCommand, item);
			}
			lastClickTime = now;
			lastClickedId = item.id || "";
		},
	);

	const subscriptions = Object.keys(callbacks).map((key) => {
		return vscode.commands.registerCommand(key, callbacks[key as ExecCommands]);
	});

	vscode.window.createTreeView("save-commands-view", {
		treeDataProvider: treeView,
		dragAndDropController: treeDnDController,
	});

	// File Change Watchers
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(
				workspaceFolder,
				".vscode/save-commands-*.json",
			),
		);
		watcher.onDidChange(() => treeView.refresh());
		watcher.onDidCreate(() => treeView.refresh());
		watcher.onDidDelete(() => treeView.refresh());
		context.subscriptions.push(watcher);
	}

	context.subscriptions.push(...subscriptions);

	// Register Remote FileSystemProvider
	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider(
			"save-commands-remote",
			remoteFileSystemProvider,
			{ isCaseSensitive: true },
		),
	);

	// Register Remote Explorer Tree View
	const remoteExplorerTreeView = vscode.window.createTreeView(
		"save-commands-remote-view",
		{
			treeDataProvider: remoteExplorerProvider,
		},
	);
	remoteExplorerTreeView.onDidChangeSelection((e) => {
		if (e.selection.length > 0) {
			remoteExplorerProvider.setSelectedNode(e.selection[0]);
		} else {
			remoteExplorerProvider.setSelectedNode(undefined);
		}
	});
	context.subscriptions.push(remoteExplorerTreeView);

	// Active Terminal Listener
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTerminal(() => {
			remoteExplorerProvider.refresh();
		}),
	);

	// Register explorer commands
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"save-commands.browseRemoteFiles",
			browseRemoteFilesFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.openTerminalAtRemoteDir",
			openTerminalAtRemoteDirFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.syncExplorerToTerminal",
			syncExplorerToTerminalFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.refreshRemoteExplorer",
			() => {
				remoteExplorerProvider.refresh();
			},
		),
		vscode.commands.registerCommand("save-commands.goUpRemoteExplorer", () => {
			const session = sessionManager.getActiveSession();
			if (session.cwd && session.cwd !== "/") {
				const normalized = session.cwd.replace(/\\/g, "/");
				const lastSlash = normalized.lastIndexOf("/");
				let parent = "/";
				if (lastSlash > 0) {
					parent = normalized.substring(0, lastSlash);
				} else if (normalized.includes(":") && !normalized.endsWith("/")) {
					parent = `${normalized.substring(0, normalized.indexOf(":") + 1)}/`;
				}
				session.cwd = parent;
				remoteExplorerProvider.refresh();
			}
		}),
		vscode.commands.registerCommand(
			"save-commands.remoteNewFile",
			remoteNewFileFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteNewFolder",
			remoteNewFolderFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteRename",
			remoteRenameFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteDelete",
			remoteDeleteFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteCopyPath",
			remoteCopyPathFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteCopyRelativePath",
			remoteCopyRelativePathFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteCopy",
			remoteCopyFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteCut",
			remoteCutFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remotePaste",
			remotePasteFn(context),
		),
		vscode.commands.registerCommand(
			"save-commands.remoteDownload",
			remoteDownloadFn(context),
		),
	);
}

export function deactivate() {
	sshPool.closeAll();
}
