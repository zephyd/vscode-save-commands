import * as vscode from "vscode";
import type TreeItem from "./TreeItem";
import { ContextValue } from "./TreeProvider";
import Command from "./models/command";
import { CommandFolder } from "./models/command_folder";
import { ExecCommands } from "./models/exec_commands";
import { StateType } from "./models/etters";

export default class DragAndDropController implements vscode.TreeDragAndDropController<TreeItem> {
	dragMimeTypes = ["application/vnd.code.tree.save-commands-view"];
	dropMimeTypes = ["application/vnd.code.tree.save-commands-view"];

	constructor(private context: vscode.ExtensionContext) { }

	public async handleDrag(
		source: readonly TreeItem[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<void> {
		if (source.length > 0 && source[0].id) {
			// Move to string-based transfer for robustness
			const transferData = JSON.stringify({
				id: source[0].id,
				contextValue: source[0].contextValue,
				stateType: source[0].stateType
			});
			dataTransfer.set(
				"application/vnd.code.tree.save-commands-view",
				new vscode.DataTransferItem(transferData),
			);
		}
	}

	public async handleDrop(
		target: TreeItem | undefined,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<void> {
		const transferItem = dataTransfer.get("application/vnd.code.tree.save-commands-view");
		if (!transferItem) {
			return;
		}

		let sourceId: string;
		let sourceContext: string;
		let sourceStateType: StateType;

		try {
			const payload = JSON.parse(transferItem.value);
			sourceId = payload.id;
			sourceContext = payload.contextValue;
			sourceStateType = payload.stateType;
		} catch (e) {
			// Fallback for older versions or unexpected formats
			if (typeof transferItem.value === 'object') {
				sourceId = transferItem.value.id;
				sourceContext = transferItem.value.contextValue;
				sourceStateType = transferItem.value.stateType;
			} else {
				return;
			}
		}

		if (!sourceId) {
			return;
		}

		// Block transitions between Global and Workspace
		const targetStateType = target?.stateType ?? sourceStateType;
		if (sourceStateType !== targetStateType) {
			vscode.window.showWarningMessage("Moving items between Global and Workspace is not supported yet.");
			return;
		}

		// Determine new parentFolderId
		let newParentFolderId: string | null = null;
		if (target) {
			if (target.contextValue === ContextValue.folder) {
				newParentFolderId = target.id ?? null;
			} else if (target.contextValue === ContextValue.command) {
				newParentFolderId = target.parentFolderId ?? null;
			}
		}

		// Prevent moving a folder into itself
		if (sourceContext === ContextValue.folder && sourceId === newParentFolderId) {
			return;
		}

		try {
			if (sourceContext === ContextValue.command) {
				await this.moveCommand(sourceId, sourceStateType, newParentFolderId, target);
			} else if (sourceContext === ContextValue.folder) {
				await this.moveFolder(sourceId, sourceStateType, newParentFolderId, target);
			}

			vscode.commands.executeCommand(ExecCommands.refreshView);
		} catch (error) {
			vscode.window.showErrorMessage(`Error moving item: ${error}`);
		}
	}

	private async moveCommand(
		sourceId: string,
		sourceStateType: StateType,
		newParentFolderId: string | null,
		target: TreeItem | undefined,
	) {
		const etter = sourceStateType === StateType.global ? Command.etters.global : Command.etters.workspace;
		const commands = etter.getValue(this.context);
		const sourceIndex = commands.findIndex((c) => c.id === sourceId);

		if (sourceIndex === -1) return;

		const [command] = commands.splice(sourceIndex, 1);
		command.parentFolderId = newParentFolderId;

		// Reordering logic
		if (target?.id && target.contextValue === ContextValue.command) {
			const targetIndex = commands.findIndex((c) => c.id === target.id);
			if (targetIndex !== -1) {
				commands.splice(targetIndex, 0, command);
			} else {
				commands.push(command);
			}
		} else {
			commands.push(command);
		}

		// Update all sortOrders to stay consistent
		for (let i = 0; i < commands.length; i++) {
			commands[i].sortOrder = i;
		}

		await etter.setValue(this.context, commands);
	}

	private async moveFolder(
		sourceId: string,
		sourceStateType: StateType,
		newParentFolderId: string | null,
		target: TreeItem | undefined,
	) {
		const etter = sourceStateType === StateType.global ? CommandFolder.etters.global : CommandFolder.etters.workspace;
		const folders = etter.getValue(this.context);
		const sourceIndex = folders.findIndex((f) => f.id === sourceId);

		if (sourceIndex === -1) return;

		const [folder] = folders.splice(sourceIndex, 1);
		folder.parentFolderId = newParentFolderId;

		if (target?.id && target.contextValue === ContextValue.folder) {
			const targetIndex = folders.findIndex((f) => f.id === target.id);
			if (targetIndex !== -1) {
				folders.splice(targetIndex, 0, folder);
			} else {
				folders.push(folder);
			}
		} else {
			folders.push(folder);
		}

		// Update all sortOrders
		for (let i = 0; i < folders.length; i++) {
			folders[i].sortOrder = i;
		}

		await etter.setValue(this.context, folders);
	}
}
