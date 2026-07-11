import * as vscode from "vscode";
import type TreeItem from "../TreeItem";
import ReadableError from "../models/error";
import { ExecCommands } from "../models/exec_commands";
import SshConnection from "../models/ssh_connection";
import { confirmationDialog } from "../utils";

export default function (context: vscode.ExtensionContext) {
	return async (item: TreeItem) => {
		confirmationDialog({
			onConfirm: () => {
				ReadableError.runGuarded(async () => {
					const { etter } = SshConnection.getEtterFromTreeContext(item);
					const connections = etter.getValue(context);
					const i = connections.findIndex(
						(d: SshConnection) => d.id === item.id,
					);
					if (i > -1) {
						connections.splice(i, 1);
					}
					await etter.setValue(context, connections);
					vscode.commands.executeCommand(ExecCommands.refreshView);
				}, "Failed Deleting SSH Connection");
			},
			message: "Are you sure you want to delete the SSH connection?",
		});
	};
}
