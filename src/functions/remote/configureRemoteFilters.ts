import type * as vscode from "vscode";
import type TreeDataProvider from "../../TreeProvider";

export default function (context: vscode.ExtensionContext, sshTreeView: TreeDataProvider) {
	return async () => {
		sshTreeView.toggleAttachFilters();
	};
}
