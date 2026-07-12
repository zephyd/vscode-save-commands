import * as vscode from "vscode";
import type TreeItem from "../../TreeItem";
import { execLocal, execSsh } from "../../explorer/drivers/driverUtils";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";
import { sshPool } from "../../explorer/sshPool";
import SshConnection from "../../models/ssh_connection";

export default function (context: vscode.ExtensionContext) {
	return async (item?: TreeItem) => {
		let conn: SshConnection | undefined;
		if (item?.id) {
			try {
				const { etter } = SshConnection.getEtterFromTreeContext(item);
				const connections = etter.getValue(context);
				conn = connections.find((d: SshConnection) => d.id === item.id);
			} catch (e) {}
		}

		let rawOutput: Buffer;
		try {
			if (conn) {
				const session = await sshPool.getSSH(conn);
				rawOutput = await execSsh(
					session.client,
					'docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}"',
				);
			} else {
				rawOutput = await execLocal(
					'docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}"',
				);
			}
		} catch (e: any) {
			let errMsg = e.message || e;
			if (
				errMsg.includes(
					"permission denied while trying to connect to the Docker daemon socket",
				)
			) {
				errMsg +=
					"\n\n💡 Tip: Run 'sudo usermod -aG docker $USER' on the remote host, then close and reconnect SSH to apply group permissions.";
			}
			vscode.window.showErrorMessage(
				`Failed to list Docker containers: ${errMsg}`,
			);
			return;
		}

		const lines = rawOutput
			.toString()
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l !== "");

		if (lines.length === 0) {
			vscode.window.showInformationMessage(
				"No running Docker containers found.",
			);
			return;
		}

		const quickPickItems = lines.map((line) => {
			const parts = line.split("\t");
			const id = parts[0];
			const name = parts[1] || "Unnamed";
			const image = parts[2] || "Unknown Image";
			const status = parts[3] || "";
			return {
				label: name,
				description: `${image} (${id})`,
				detail: status,
				id,
			};
		});

		const selected = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: "Select a Docker container to attach to",
		});

		if (!selected) return;

		const session = sessionManager.createSession("docker", {
			containerId: selected.id,
			sshConnection: conn,
		});

		sessionManager.setExplicitSession(session);
		remoteExplorerProvider.refresh();
		await vscode.commands.executeCommand("save-commands-remote-view.focus");
		vscode.window.showInformationMessage(
			`Attached to Docker container: ${selected.label}`,
		);
	};
}
