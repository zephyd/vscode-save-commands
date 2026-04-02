import * as vscode from "vscode";
import type { StateType } from "./models/etters";
import { ContextValue } from "./TreeProvider";

class TreeItem extends vscode.TreeItem {
	children: TreeItem[] | undefined;
	parentFolderId?: string | null;
	sortOrder?: number;

	stateType: StateType;

	constructor(fields: {
		id: string | undefined | null;
		label: string;
		tooltip?: string;
		contextValue: ContextValue;
		children?: TreeItem[];
		parentFolderId?: string | null;
		sortOrder?: number;
		stateType: StateType;
	}) {
		// Roots should always be expanded
		let collapsibleState = vscode.TreeItemCollapsibleState.None;
		if (fields.contextValue && (fields.contextValue as string).startsWith('root')) {
			collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		} else if (fields.contextValue === ContextValue.folder) {
			// Folders should always be collapsible even if empty, so they can be drop targets.
			// If they have children initially (like roots), we expand them.
			// Otherwise they start Collapsed but remain folders.
			collapsibleState = (fields.children && fields.children.length > 0) 
				? vscode.TreeItemCollapsibleState.Expanded 
				: vscode.TreeItemCollapsibleState.Collapsed;
		}

		super(fields.label, collapsibleState);
		this.children = fields.children;
		this.tooltip = fields.tooltip;
		this.id = fields.id ?? undefined;
		this.contextValue = fields.contextValue ?? undefined;
		this.parentFolderId = fields.parentFolderId;
		this.sortOrder = fields.sortOrder;
		this.stateType = fields.stateType;

		if (this.contextValue === ContextValue.folder) {
			this.iconPath = new vscode.ThemeIcon("folder");
		} else if (this.contextValue === ContextValue.command) {
			this.iconPath = new vscode.ThemeIcon("terminal");
			// Using the double-click-safe command registered in extension.ts
			this.command = {
				command: "save-commands.editCommandDouble",
				title: "Edit Command",
				arguments: [this]
			};
		}
	}
}

export default TreeItem;
