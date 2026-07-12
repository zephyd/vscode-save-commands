import * as vscode from "vscode";
import type TreeItem from "../TreeItem";
import ReadableError from "../models/error";
import SshConnection from "../models/ssh_connection";
import { generateString } from "../utils";

import { remoteExplorerProvider } from "../explorer/remoteExplorerProvider";
import { sessionManager } from "../explorer/session";

export default function (context: vscode.ExtensionContext) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			const { etter } = SshConnection.getEtterFromTreeContext(item);
			const connections = etter.getValue(context);
			const conn = connections.find((d: SshConnection) => d.id === item.id);
			if (conn) {
				const sshCommand = `ssh -o StrictHostKeyChecking=no ${conn.username}@${conn.host} -p ${conn.port}`;
				const terminalId = `SSH-${conn.name}-${generateString(5)}`;
				const terminal = vscode.window.createTerminal(terminalId) as any;

				// Create session and link to terminal
				const session = sessionManager.createSession("ssh", {
					sshConnection: conn,
				});
				terminal._sessionId = session.id;

				terminal.show();
				terminal.sendText(sshCommand);
				if (conn.password) {
					setTimeout(() => {
						terminal.sendText(conn.password);
					}, 1500);
				}

				// Refresh Remote Explorer view
				remoteExplorerProvider.refresh();
			} else {
				throw new ReadableError("Unable to find the SSH connection in state");
			}
		}, "Unable to connect via SSH");
	};
}
