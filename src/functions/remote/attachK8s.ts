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
			const cmd = `kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"\\t"}{.metadata.name}{"\\t"}{range .spec.containers[*]}{.name}{","}{end}{"\\n"}{end}'`;
			if (conn) {
				const session = await sshPool.getSSH(conn);
				rawOutput = await execSsh(session.client, cmd);
			} else {
				rawOutput = await execLocal(cmd);
			}
		} catch (e: any) {
			vscode.window.showErrorMessage(
				`Failed to list Kubernetes pods: ${e.message || e}`,
			);
			return;
		}

		const lines = rawOutput
			.toString()
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l !== "");

		if (lines.length === 0) {
			vscode.window.showInformationMessage("No Kubernetes pods found.");
			return;
		}

		const quickPickItems = lines.map((line) => {
			const parts = line.split("\t");
			const namespace = parts[0];
			const podName = parts[1];
			const containers = (parts[2] || "").split(",").filter((c) => c !== "");
			return {
				label: podName,
				description: `Namespace: ${namespace}`,
				detail: `Containers: ${containers.join(", ")}`,
				podName,
				namespace,
				containers,
			};
		});

		const selectedPod = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: "Select a Kubernetes pod to attach to",
		});

		if (!selectedPod) return;

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

		const session = sessionManager.createSession("k8s", {
			podName: selectedPod.podName,
			namespace: selectedPod.namespace,
			containerName,
			sshConnection: conn,
		});

		sessionManager.setExplicitSession(session);
		remoteExplorerProvider.refresh();
		await vscode.commands.executeCommand("save-commands-remote-view.focus");
		vscode.window.showInformationMessage(
			`Attached to Kubernetes Pod: ${selectedPod.label}${
				containerName ? ` (${containerName})` : ""
			}`,
		);
	};
}
