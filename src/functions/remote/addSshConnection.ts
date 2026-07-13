import * as vscode from "vscode";
import type FormViewProvider from "../../FormViewProvider";
import type TreeItem from "../../TreeItem";
import ReadableError from "../../models/error";
import { StateType } from "../../models/etters";
import type TreeDataProvider from "../../TreeProvider";

export default function (
	context: vscode.ExtensionContext,
	formViewProvider: FormViewProvider,
	sshTreeView?: TreeDataProvider,
) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			let targetItem = item;
			if (!targetItem || !targetItem.stateType) {
				if (sshTreeView && !sshTreeView.getShowSshGroups()) {
					targetItem = { stateType: StateType.global } as unknown as TreeItem;
				} else {
					const selection = await vscode.window.showQuickPick(
						[StateType.global, StateType.workspace],
						{ placeHolder: "Select SSH Connection Scope" },
					);
					if (!selection) return;
					targetItem = { stateType: selection } as unknown as TreeItem;
				}
			}

			formViewProvider.prepareForm(targetItem.stateType, null, "ssh");
		}, "Error Adding SSH Connection");
	};
}
