import * as vscode from "vscode";
import type TreeItem from "../TreeItem";
import Command, { ResolveCommandType } from "../models/command";
import ReadableError from "../models/error";

// TODO: Can be refactored
export default function (context: vscode.ExtensionContext) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			const { etter } = Command.getEtterFromTreeContext(item);
			const commands = etter.getValue(context);
			const i = commands.findIndex((d: Command) => d.id === item.id);
			if (i > -1) {
				const activeTerminal = vscode.window.activeTerminal;
				if (!activeTerminal) {
					throw new ReadableError("No Active Terminal Found");
				}

				const resolvedCommand = await commands[i].resolveCommand(
					context,
					ResolveCommandType.runActive,
				);

				if (resolvedCommand === null) {
					return; // User cancelled
				}

				activeTerminal.sendText(resolvedCommand);
				activeTerminal.show();
			} else {
				throw new ReadableError("Unable to find the command in state");
			}
		});
	};
}
