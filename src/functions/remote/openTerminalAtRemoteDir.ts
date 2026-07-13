import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { type Session, sessionManager } from "../../explorer/session";
import { generateString } from "../../utils";

export default function (context: vscode.ExtensionContext, reuse = false) {
	return async (node?: FileNode) => {
		let session: Session | undefined;
		let targetPath = "";

		if (node) {
			session = sessionManager.getSession(node.uri.authority);
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

		if (reuse) {
			const existingTerminal = vscode.window.terminals.find(
				(t: vscode.Terminal & { _sessionId?: string }) =>
					t._sessionId === session?.id,
			);
			if (existingTerminal) {
				existingTerminal.show();
				existingTerminal.sendText(`cd "${targetPath}"`);
				if (process.platform === "win32" && session.type === "local") {
					const match = targetPath.match(/^[a-zA-Z]:/);
					if (match) {
						existingTerminal.sendText(match[0]);
					}
				}
				return;
			}
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
		} else if (session.type === "docker") {
			const containerId = session.containerId;
			const targetCmd = `docker exec -w "${targetPath}" -it ${containerId} sh`;
			if (session.sshConnection) {
				const conn = session.sshConnection;
				const sshCommand = `ssh -o StrictHostKeyChecking=no ${conn.username}@${conn.host} -p ${conn.port}`;
				const terminalId = `Docker-SSH-${conn.name}-${generateString(5)}`;
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
					if (conn.sudoPassword) {
						terminal.sendText(
							`sudo -S docker exec -w "${targetPath}" -it ${containerId} sh`,
						);
						setTimeout(() => {
							terminal.sendText(conn.sudoPassword);
						}, 1000);
					} else {
						terminal.sendText(targetCmd);
					}
				}, delay + 500);
			} else {
				const terminal = vscode.window.createTerminal({
					name: `Docker: ${containerId?.substring(0, 12)}`,
				}) as any;
				terminal._sessionId = session.id;
				terminal.show();
				terminal.sendText(targetCmd);
			}
		} else if (session.type === "k8s") {
			const containerArg = session.containerName
				? `-c ${session.containerName}`
				: "";
			const targetCmd = `kubectl exec -it ${session.podName} -n ${session.namespace} ${containerArg} -- sh -c "cd '${targetPath}' && (command -v bash >/dev/null 2>&1 && exec bash || exec sh)"`;
			if (session.sshConnection) {
				const conn = session.sshConnection;
				const sshCommand = `ssh -o StrictHostKeyChecking=no ${conn.username}@${conn.host} -p ${conn.port}`;
				const terminalId = `K8s-SSH-${conn.name}-${generateString(5)}`;
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
					terminal.sendText(targetCmd);
				}, delay + 500);
			} else {
				const terminal = vscode.window.createTerminal({
					name: `K8s: ${session.podName}`,
				}) as any;
				terminal._sessionId = session.id;
				terminal.show();
				terminal.sendText(targetCmd);
			}
		}
	};
}
