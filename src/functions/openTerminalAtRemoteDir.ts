import * as vscode from "vscode";
import type { FileNode } from "../explorer/remoteExplorerProvider";
import { type Session, sessionManager } from "../explorer/session";
import { generateString } from "../utils";

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		let session: Session | undefined;
		let targetPath = "";

		if (node) {
			session = sessionManager.getSession(node.uri.authority);
			// If it is a directory, use its path. If it is a file, use its parent folder path.
			if (node.fileType === vscode.FileType.Directory) {
				targetPath = node.uri.path;
			} else {
				const lastSlash = node.uri.path.lastIndexOf("/");
				targetPath =
					lastSlash > 0 ? node.uri.path.substring(0, lastSlash) : node.uri.path;
			}
		} else {
			session = sessionManager.getActiveSession();
			targetPath = session.cwd;
		}

		if (!session) {
			vscode.window.showErrorMessage("No active session to open terminal for.");
			return;
		}

		if (session.type === "local") {
			const terminal = vscode.window.createTerminal({
				name: "Local Terminal",
				cwd: targetPath,
			}) as any;

			terminal._sessionId = session.id;
			terminal.show();
		} else if (session.type === "ssh" && session.sshConnection) {
			const conn = session.sshConnection;
			const sshCommand = `ssh -o StrictHostKeyChecking=no ${conn.username}@${conn.host} -p ${conn.port}`;
			const terminalId = `SSH-${conn.name}-${generateString(5)}`;

			const terminal = vscode.window.createTerminal(terminalId) as any;
			terminal._sessionId = session.id;
			terminal.show();
			terminal.sendText(sshCommand);

			const delay = conn.password ? 2000 : 1500;
			if (conn.password) {
				setTimeout(() => {
					terminal.sendText(conn.password);
				}, 1500);
			}

			setTimeout(() => {
				terminal.sendText(`cd "${targetPath}"`);
			}, delay + 500);
		}
	};
}
