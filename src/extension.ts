import * as vscode from "vscode";
import TreeDataProvider from "./TreeProvider";
import { ExecCommands } from "./models/exec_commands";
import "reflect-metadata";
import {
	addCommandFn,
	copyCommandFn,
	deleteCommandFn,
	deleteCommandsFn,
	addFolderFn,
	editCommandFn,
	resetFn,
	runCommandFn,
	runCommandInActiveTerminalFn,
	deleteFolderFn,
	editFolderFn,
	exportFn,
	importFn,
	runFolderFn,
	runFolderInActiveTerminalFn,
} from "./functions";
import DragAndDropController from "./DragAndDropController";
import * as fs from "node:fs";
import { StateType } from "./models/etters";
import Command from "./models/command";

export function activate(context: vscode.ExtensionContext) {
	const treeView = new TreeDataProvider(context);
	const treeDnDController = new DragAndDropController(context);

	// biome-ignore lint/suspicious/noExplicitAny: Needed
	const callbacks: Record<ExecCommands, (...args: any[]) => any> = {
		[ExecCommands.addCommand]: addCommandFn(context),
		[ExecCommands.deleteCommand]: deleteCommandFn(context),
		[ExecCommands.runCommand]: runCommandFn(context),
		[ExecCommands.deleteCommands]: deleteCommandsFn(context),
		[ExecCommands.editCommand]: editCommandFn(context),
		[ExecCommands.copyCommand]: copyCommandFn(context),
		[ExecCommands.runCommandInActiveTerminal]:
			runCommandInActiveTerminalFn(context),
		[ExecCommands.reset]: resetFn(context),
		[ExecCommands.runFolder]: runFolderFn(context),
		[ExecCommands.runFolderInActiveTerminal]: runFolderInActiveTerminalFn(context),
		[ExecCommands.addFolder]: addFolderFn(context),
		[ExecCommands.deleteFolder]: deleteFolderFn(context),
		[ExecCommands.editFolder]: editFolderFn(context),
		[ExecCommands.export]: exportFn(context),
		[ExecCommands.import]: importFn(context),
		[ExecCommands.refreshView]: () => treeView.refresh(),
		[ExecCommands.openConfigFile]: async () => {
			vscode.commands.executeCommand("save-commands.openFileInternal", StateType.workspace);
		},
		[ExecCommands.openGlobalConfigFile]: async () => {
			vscode.commands.executeCommand("save-commands.openFileInternal", StateType.global);
		}
	};

	vscode.commands.registerCommand("save-commands.openFileInternal", async (stateType: StateType) => {
		try {
			const etter = Command.etters;
			// @ts-ignore
			const filePath = etter.getStoragePath(context, stateType);
			if (!fs.existsSync(filePath)) {
				fs.writeFileSync(filePath, "[]", "utf8");
			}
			const doc = await vscode.workspace.openTextDocument(filePath);
			await vscode.window.showTextDocument(doc);
		} catch (e) {
			vscode.window.showErrorMessage(`Failed to open config file: ${e}`);
		}
	});

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
			new vscode.RelativePattern(workspaceFolder, ".vscode/save-commands-*.json")
		);
		watcher.onDidChange(() => treeView.refresh());
		watcher.onDidCreate(() => treeView.refresh());
		watcher.onDidDelete(() => treeView.refresh());
		context.subscriptions.push(watcher);
	}

	context.subscriptions.push(...subscriptions);
}

// this method is called when your extension is deactivated
export function deactivate() { }
