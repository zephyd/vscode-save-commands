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

		const quickPickItems = [
			{
				label: "$(search) Change filters...",
				description: `Current: Namespace="${namespaceFilter || "All"}", Keyword="${keywordFilter || "None"}"`,
				detail: "Change the namespace and keyword filters used to list pods",
				podName: "__change_filter__",
				namespace: "",
				containers: [] as string[],
			},
			{
				label: "$(pencil) Enter pod details manually...",
				description: "Skip list search and input namespace/pod name directly",
				detail: "",
				podName: "__manual__",
				namespace: "",
				containers: [] as string[],
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

		const selectedPod = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: "Select a Kubernetes pod to attach to",
		});

		if (!selectedPod) return;

		let namespace = selectedPod.namespace;
		let podName = selectedPod.podName;
		let containerName: string | undefined;

		if (selectedPod.podName === "__change_filter__") {
			await vscode.commands.executeCommand("save-commands.configureRemoteFilters");
			return vscode.commands.executeCommand("save-commands.attachK8s", item);
		}

		if (selectedPod.podName === "__manual__") {
			const manualNs = await vscode.window.showInputBox({
				placeHolder: "Enter Kubernetes Namespace (e.g. default)",
				prompt: "Type the namespace of the target pod",
				value: "default",
			});
			if (!manualNs || !manualNs.trim()) return;
			namespace = manualNs.trim();

			const manualPod = await vscode.window.showInputBox({
				placeHolder: "Enter Pod Name",
				prompt: "Type the name of the target pod",
			});
			if (!manualPod || !manualPod.trim()) return;
			podName = manualPod.trim();

			const manualContainer = await vscode.window.showInputBox({
				placeHolder: "Enter Container Name (Optional)",
				prompt:
					"Type the container name if the pod has multiple containers (leave empty for default)",
			});
			containerName = manualContainer?.trim() || undefined;
		} else {
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
		}

		const session = sessionManager.createSession("k8s", {
			podName: podName,
			namespace: namespace,
			containerName,
			sshConnection: conn,
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
