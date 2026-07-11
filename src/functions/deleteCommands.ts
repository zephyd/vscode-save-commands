import * as vscode from "vscode";
import type TreeItem from "../TreeItem";
import Command from "../models/command";
import { CommandFolder } from "../models/command_folder";
import ReadableError from "../models/error";
import { ExecCommands } from "../models/exec_commands";
import { confirmationDialog } from "../utils";

export default function (context: vscode.ExtensionContext) {
	return (item: TreeItem) => {
		const { etter, stateType } = Command.getEtterFromTreeContext(item);
		const { etter: folderEtter } = CommandFolder.getEtterFromTreeContext(item);

		const commands = etter.getValue(context);
		if (!commands || commands.length === 0) {
			return;
		}
		confirmationDialog({
			onConfirm: () => {
				ReadableError.runGuarded(async () => {
					etter.setValue(context, []);
					folderEtter.setValue(context, []);
					vscode.commands.executeCommand(ExecCommands.refreshView);
					vscode.window.showInformationMessage(`${stateType} Commands Deleted`);
				});
			},
			message: `Are you sure you want to delete all ${stateType} commands?`,
		});
	};
}
