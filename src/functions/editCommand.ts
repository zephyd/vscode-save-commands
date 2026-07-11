import type * as vscode from "vscode";
import type FormViewProvider from "../FormViewProvider";
import type TreeItem from "../TreeItem";
import Command from "../models/command";
import ReadableError from "../models/error";

export default function (
	context: vscode.ExtensionContext,
	formViewProvider: FormViewProvider,
) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			const { etter, stateType } = Command.getEtterFromTreeContext(item);
			const commands = etter.getValue(context);
			const cmd = commands.find((d: Command) => d.id === item.id);

			if (!cmd) {
				throw new ReadableError("Unable to find the command in state");
			}

			// Activate the sidebar form in Edit mode
			formViewProvider.prepareForm(
				stateType,
				item.parentFolderId ?? null,
				"command",
				{
					id: cmd.id,
					name: cmd.name,
					command: cmd.command,
					placeholderTypeId: cmd.placeholderTypeId,
				},
			);
		}, "Error Editing Command");
	};
}
