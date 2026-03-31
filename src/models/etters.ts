import type { ExtensionContext, Memento } from "vscode";
import type { JSONObj } from "./base_types";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export enum StateType {
	global = "Global",
	workspace = "Workspace",
}

type Serializable = { toJson: () => JSONObj };

export interface IEtter<T> {
	getValue: (context: ExtensionContext) => T;
	setValue: (context: ExtensionContext, newValue: T) => Thenable<void>;
}

export class ExtensionContextListEtter<T extends Serializable> {
	key: string;
	deserializer: (json: JSONObj) => T;

	constructor(key: string, deserializer: (json: JSONObj) => T) {
		this.key = key;
		this.deserializer = deserializer;
	}

	private getStoragePath(context: ExtensionContext, stateType: StateType): string | null {
		if (stateType === StateType.workspace) {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				return null;
			}
			const vscodePath = path.join(workspaceFolder.uri.fsPath, ".vscode");
			if (!fs.existsSync(vscodePath)) {
				fs.mkdirSync(vscodePath, { recursive: true });
			}
			return path.join(vscodePath, `save-commands-${this.key}.json`);
		}
		// Global storage
		const globalPath = context.globalStorageUri.fsPath;
		if (!fs.existsSync(globalPath)) {
			fs.mkdirSync(globalPath, { recursive: true });
		}
		return path.join(globalPath, `save-commands-${this.key}.json`);
	}

	global: IEtter<Array<T>> = {
		getValue: (context) => {
			return this.getValue(context, StateType.global);
		},
		setValue: (context, newValue) => {
			return this.setValue(context, newValue, StateType.global);
		},
	};

	workspace: IEtter<Array<T>> = {
		getValue: (context) => {
			return this.getValue(context, StateType.workspace);
		},
		setValue: (context, newValue) => {
			return this.setValue(context, newValue, StateType.workspace);
		},
	};

	private getValue(context: ExtensionContext, stateType: StateType): Array<T> {
		const filePath = this.getStoragePath(context, stateType);
		if (!filePath || !fs.existsSync(filePath)) {
			return [];
		}
		try {
			const content = fs.readFileSync(filePath, "utf8");
			const values = JSON.parse(content) as Array<JSONObj>;
			return values.map((value) => this.deserializer(value));
		} catch (e) {
			console.error(`Error reading storage file ${filePath}:`, e);
			return [];
		}
	}

	private async setValue(
		context: ExtensionContext,
		newValue: Array<T>,
		stateType: StateType,
	): Promise<void> {
		const filePath = this.getStoragePath(context, stateType);
		if (!filePath) {
			return;
		}
		try {
			const content = JSON.stringify(newValue.map((v) => v.toJson()), null, 2);
			fs.writeFileSync(filePath, content, "utf8");
		} catch (e) {
			console.error(`Error writing storage file ${filePath}:`, e);
		}
	}
}
