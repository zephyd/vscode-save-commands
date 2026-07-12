import * as vscode from "vscode";
import type TreeItem from "../TreeItem";
import { remoteExplorerProvider } from "../explorer/remoteExplorerProvider";
import { sessionManager } from "../explorer/session";
import ReadableError from "../models/error";
import SshConnection from "../models/ssh_connection";

export default function (context: vscode.ExtensionContext) {
	return async (item: TreeItem) => {
		await ReadableError.runGuarded(async () => {
			const { etter } = SshConnection.getEtterFromTreeContext(item);
			const connections = etter.getValue(context);
			const conn = connections.find((d: SshConnection) => d.id === item.id);

			if (!conn) {
				throw new ReadableError("Unable to find the SSH connection in state");
			}

			// Create SSH session
			const session = sessionManager.createSession("ssh", {
				sshConnection: conn,
			});

			// Set as explicitly browsed session
			sessionManager.setExplicitSession(session);

			// Refresh and focus Remote Explorer
			remoteExplorerProvider.refresh();
			await vscode.commands.executeCommand("save-commands-remote-view.focus");
		}, "Error browsing remote files");
	};
}
