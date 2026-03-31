import * as vscode from "vscode";
import type TreeItem from "../TreeItem";
import Command, { ResolveCommandType } from "../models/command";
import ReadableError from "../models/error";
import { generateString } from "../utils";

export default function (context: vscode.ExtensionContext) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			const { etter } = Command.getEtterFromTreeContext(item);
			const commands = etter.getValue(context);
			const i = commands.findIndex((d: Command) => d.id === item.id);
			if (i > -1) {
				const resolvedCommand = await commands[i].resolveCommand(
					context,
					ResolveCommandType.runNew,
				);
				
				if (resolvedCommand === null) {
					return; // User cancelled
				}

				const terminalId = `${commands[i].name}-${generateString(5)}`;
				const terminal = vscode.window.createTerminal(terminalId);
				terminal.sendText(resolvedCommand);
				terminal.show();
			} else {
				throw new ReadableError("Unable to find the command in state");
			}
		}, "Unable to execute the command");
	};
}
