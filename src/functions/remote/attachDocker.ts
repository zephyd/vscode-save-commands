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

		const config = vscode.workspace.getConfiguration("save-commands");
		const filterArgs = config.get<string>("docker.filterArgs") || "";
		const keywordFilter = config.get<string>("docker.keywordFilter") || "";

		let rawOutput: Buffer | undefined;
		try {
			const filterArg = filterArgs.trim() ? ` ${filterArgs.trim()}` : "";
			const cmd = `docker ps${filterArg} --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}"`;
			if (conn) {
				const session = await sshPool.getSSH(conn);
				rawOutput = await execSsh(
					session.client,
					cmd,
				);
			} else {
				rawOutput = await execLocal(cmd);
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
			vscode.window.showWarningMessage(
				`Failed to list Docker containers: ${errMsg}. Falling back to manual input.`,
			);
		}

		const quickPickItems = [
			{
				label: "$(search) Change filters...",
				description: `Current: Args="${filterArgs || "None"}", Keyword="${keywordFilter || "None"}"`,
				detail: "Change the docker ps arguments and container keyword filters",
				id: "__change_filter__",
			},
			{
				label: "$(pencil) Enter container ID/Name manually...",
				description: "Skip list search and input target name directly",
				detail: "",
				id: "__manual__",
			},
		];

		if (rawOutput) {
			const lines = rawOutput
				.toString()
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l !== "");

			const keywords = keywordFilter.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);

			for (const line of lines) {
				const parts = line.split("\t");
				const id = parts[0];
				const name = parts[1] || "Unnamed";
				const image = parts[2] || "Unknown Image";
				const status = parts[3] || "";

				if (keywords.length > 0) {
					const matched = keywords.some(
						(kw) =>
							name.toLowerCase().includes(kw) ||
							image.toLowerCase().includes(kw)
					);
					if (!matched) continue;
				}
				quickPickItems.push({
					label: name,
					description: `${image} (${id})`,
					detail: status,
					id,
				});
			}
		}

		const selected = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: "Select a Docker container to attach to",
		});

		if (!selected) return;

		let containerId = selected.id;
		let containerLabel = selected.label;

		if (selected.id === "__change_filter__") {
			await vscode.commands.executeCommand("save-commands.configureRemoteFilters");
			return vscode.commands.executeCommand("save-commands.attachDocker", item);
		}

		if (selected.id === "__manual__") {
			const manualId = await vscode.window.showInputBox({
				placeHolder: "Enter Docker Container ID or Name",
				prompt: "Type the target Container ID or Name to attach to",
			});
			if (!manualId || !manualId.trim()) return;
			containerId = manualId.trim();
			containerLabel = manualId.trim();
		}

		const session = sessionManager.createSession("docker", {
			containerId: containerId,
			sshConnection: conn,
		});

		sessionManager.setExplicitSession(session);
		remoteExplorerProvider.refresh();
		await vscode.commands.executeCommand("save-commands-remote-view.focus");
		vscode.window.showInformationMessage(
			`Attached to Docker container: ${containerLabel}`,
		);
	};
}
