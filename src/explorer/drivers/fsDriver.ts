import type * as vscode from "vscode";

export interface FSEntry {
	name: string;
	type: vscode.FileType;
}

export interface FSDriver {
	stat(path: string): Promise<vscode.FileStat>;
	readDirectory(path: string): Promise<FSEntry[]>;
	readFile(path: string): Promise<Uint8Array>;
	writeFile(
		path: string,
		content: Uint8Array,
		options: { create: boolean; overwrite: boolean },
	): Promise<void>;
	delete(path: string, options: { recursive: boolean }): Promise<void>;
	rename(
		oldPath: string,
		newPath: string,
		options: { overwrite: boolean },
	): Promise<void>;
	createDirectory(path: string): Promise<void>;
}
