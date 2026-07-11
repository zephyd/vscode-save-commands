import * as vscode from "vscode";
import type TreeItem from "../TreeItem";
import ReadableError from "../models/error";
import SshConnection from "../models/ssh_connection";

export default function (context: vscode.ExtensionContext) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			const { etter } = SshConnection.getEtterFromTreeContext(item);
			const connections = etter.getValue(context);
			const conn = connections.find((d: SshConnection) => d.id === item.id);
			if (conn) {
				const activeTerminal = vscode.window.activeTerminal;
				if (!activeTerminal) {
					throw new ReadableError("No Active Terminal Found");
				}
				const sshCommand = `ssh -o StrictHostKeyChecking=no ${conn.username}@${conn.host} -p ${conn.port}`;
				activeTerminal.show();
				activeTerminal.sendText(sshCommand);
				if (conn.password) {
					setTimeout(() => {
						activeTerminal.sendText(conn.password);
					}, 1500);
				}
			} else {
				throw new ReadableError("Unable to find the SSH connection in state");
			}
		}, "Unable to connect via SSH in active terminal");
	};
}
