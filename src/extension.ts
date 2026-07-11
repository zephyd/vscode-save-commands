import * as vscode from "vscode";
import TreeDataProvider from "./TreeProvider";
import { ExecCommands } from "./models/exec_commands";
import "reflect-metadata";
import * as fs from "node:fs";
import DragAndDropController from "./DragAndDropController";
import FormViewProvider from "./FormViewProvider";
import {
	addCommandFn,
	addFolderFn,
	addSshConnectionFn,
	copyCommandFn,
	deleteCommandFn,
	deleteCommandsFn,
	deleteFolderFn,
	deleteSshConnectionFn,
	editCommandFn,
	editFolderFn,
	editSshConnectionFn,
	resetFn,
	runCommandFn,
	runCommandInActiveTerminalFn,
	runFolderFn,
	runFolderInActiveTerminalFn,
	sshConnectFn,
	sshConnectInActiveTerminalFn,
} from "./functions";
import Command from "./models/command";
import { StateType } from "./models/etters";
import SshConnection from "./models/ssh_connection";

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
		}) => {
			try {
				const { name, command, stateType, folderId, commandId } = data;
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
						// Keep other properties like parentId unless we want to change them
						vscode.window.showInformationMessage(`Updated Command: ${name}`);
					}
				} else {
					// CREATE MODE
					const placeholderType =
						currentCommands.length > 0
							? currentCommands[0].getPlaceholderType()
							: Command.fromJson({}).getPlaceholderType();

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
}

export function deactivate() {}
