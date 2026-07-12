import * as vscode from "vscode";
import { remoteExplorerProvider } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";

export default function (context: vscode.ExtensionContext) {
	return async () => {
		const activeTerminal = vscode.window.activeTerminal;
		const activeSession = sessionManager.getActiveSession();

		let detectedCwd: string | undefined;
		if (
			activeSession.type === "local" &&
			activeTerminal &&
			(activeTerminal as any).shellIntegration
		) {
			const cwdUri = (activeTerminal as any).shellIntegration.cwd;
			if (cwdUri) {
				detectedCwd = cwdUri.path;
			}
		}

		let selectedPath: string | undefined;
		const selectedNode = remoteExplorerProvider.getSelectedNode();
		if (selectedNode) {
			const uriPath = selectedNode.uri.path;
			if (selectedNode.fileType === vscode.FileType.Directory) {
				selectedPath = uriPath;
			} else {
				const lastSlash = uriPath.lastIndexOf("/");
				selectedPath =
					lastSlash > 0 ? uriPath.substring(0, lastSlash) : uriPath;
			}
		}

		const input = await vscode.window.showInputBox({
			prompt: "Enter working directory of terminal to sync Explorer to",
			value: selectedPath || detectedCwd || activeSession.cwd,
			placeHolder: "e.g. /home/user/project",
		});

		if (input !== undefined) {
			activeSession.cwd = input.trim();
			remoteExplorerProvider.refresh();
			vscode.window.showInformationMessage(`Explorer synced to: ${input}`);
		}
	};
}
