import type * as vscode from "vscode";
import type FormViewProvider from "../FormViewProvider";
import type TreeItem from "../TreeItem";
import ReadableError from "../models/error";
import SshConnection from "../models/ssh_connection";

export default function (
	context: vscode.ExtensionContext,
	formViewProvider: FormViewProvider,
) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			const { etter, stateType } = SshConnection.getEtterFromTreeContext(item);
			const connections = etter.getValue(context);
			const conn = connections.find((d: SshConnection) => d.id === item.id);
			if (conn) {
				formViewProvider.prepareForm(stateType, null, "ssh", conn);
			} else {
				throw new ReadableError("Unable to find the SSH connection in state");
			}
		}, "Error editing SSH Connection");
	};
}
