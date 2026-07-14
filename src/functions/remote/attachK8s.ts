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
		const namespaceFilter = config.get<string>("k8s.namespaceFilter") || "";
		const keywordFilter = config.get<string>("k8s.keywordFilter") || "";

		let rawOutput: Buffer | undefined;
		try {
			const namespaceArg = namespaceFilter.trim() ? `-n ${namespaceFilter.trim()}` : "-A";
			const cmd = `kubectl get pods ${namespaceArg} -o jsonpath='{range .items[*]}{.metadata.namespace}{"\\t"}{.metadata.name}{"\\t"}{range .spec.containers[*]}{.name}{","}{end}{"\\n"}{end}'`;
			if (conn) {
				const session = await sshPool.getSSH(conn);
				rawOutput = await execSsh(session.client, cmd);
			} else {
				rawOutput = await execLocal(cmd);
			}
		} catch (e: any) {
			vscode.window.showWarningMessage(
				`Failed to list Kubernetes pods: ${e.message || e}. Falling back to manual input.`,
			);
		}

		const quickPickItems: {
			label: string;
			description: string;
			detail: string;
			podName: string;
			namespace: string;
			containers: string[];
		}[] = [];

		if (rawOutput) {
			const lines = rawOutput
				.toString()
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l !== "");

			const keywords = keywordFilter.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);

			for (const line of lines) {
				const parts = line.split("\t");
				const namespace = parts[0];
				const podName = parts[1];
				const containers = (parts[2] || "").split(",").filter((c) => c !== "");

				if (keywords.length > 0) {
					const matched = keywords.some(
						(kw) =>
							podName.toLowerCase().includes(kw) ||
							namespace.toLowerCase().includes(kw)
					);
					if (!matched) continue;
				}
				quickPickItems.push({
					label: podName,
					description: `Namespace: ${namespace}`,
					detail: `Containers: ${containers.join(", ")}`,
					podName,
					namespace,
					containers,
				});
			}
		}

		const nsLabel = namespaceFilter || "All";
		const kwLabel = keywordFilter || "None";
		const selectedPod = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: `Select a pod  |  Namespace: ${nsLabel}  |  Keyword: ${kwLabel}`,
		});

		if (!selectedPod) return;

		let namespace = selectedPod.namespace;
		let podName = selectedPod.podName;
		let containerName: string | undefined;

		if (selectedPod.containers.length > 1) {
			containerName = await vscode.window.showQuickPick(
				selectedPod.containers,
				{
					placeHolder: "Select container in the pod",
				},
			);
			if (!containerName) return;
		} else if (selectedPod.containers.length === 1) {
			containerName = selectedPod.containers[0];
		}

		const initialDir = config.get<string>("k8s.initialDir") || "/";

		const session = sessionManager.createSession("k8s", {
			podName: podName,
			namespace: namespace,
			containerName,
			sshConnection: conn,
			cwd: initialDir.trim() || "/",
		});

		sessionManager.setExplicitSession(session);
		remoteExplorerProvider.refresh();
		await vscode.commands.executeCommand("save-commands-remote-view.focus");
		vscode.window.showInformationMessage(
			`Attached to Kubernetes Pod: ${podName}${
				containerName ? ` (${containerName})` : ""
			}`,
		);
	};
}
