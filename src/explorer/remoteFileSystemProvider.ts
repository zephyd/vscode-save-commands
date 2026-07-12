import * as vscode from "vscode";
import { sessionManager } from "./session";

export class RemoteFileSystemProvider implements vscode.FileSystemProvider {
	private _onDidChangeFile = new vscode.EventEmitter<
		vscode.FileChangeEvent[]
	>();
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
		this._onDidChangeFile.event;

	watch(
		uri: vscode.Uri,
		options: {
			readonly recursive: boolean;
			readonly excludes: readonly string[];
		},
	): vscode.Disposable {
		return new vscode.Disposable(() => {});
	}

	private getDriver(uri: vscode.Uri) {
		const session = sessionManager.getSession(uri.authority);
		if (!session) {
			throw vscode.FileSystemError.Unavailable(
				"Session expired or unavailable",
			);
		}
		return session.driver;
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		try {
			const driver = this.getDriver(uri);
			return await driver.stat(uri.path);
		} catch (e: any) {
			if (e.code === "ENOENT" || e.message?.includes("No such file")) {
				throw vscode.FileSystemError.FileNotFound(uri);
			}
			throw e;
		}
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const driver = this.getDriver(uri);
		const entries = await driver.readDirectory(uri.path);
		return entries.map((item) => [item.name, item.type]);
	}

	async createDirectory(uri: vscode.Uri): Promise<void> {
		const driver = this.getDriver(uri);
		await driver.createDirectory(uri.path);
		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Created, uri }]);
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const driver = this.getDriver(uri);
		return await driver.readFile(uri.path);
	}

	async writeFile(
		uri: vscode.Uri,
		content: Uint8Array,
		options: { readonly create: boolean; readonly overwrite: boolean },
	): Promise<void> {
		const driver = this.getDriver(uri);
		await driver.writeFile(uri.path, content, options);
		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
	}

	async delete(
		uri: vscode.Uri,
		options: { readonly recursive: boolean },
	): Promise<void> {
		const driver = this.getDriver(uri);
		await driver.delete(uri.path, options);
		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
	}

	async rename(
		oldUri: vscode.Uri,
		newUri: vscode.Uri,
		options: { readonly overwrite: boolean },
	): Promise<void> {
		const driver = this.getDriver(oldUri);
		if (oldUri.authority !== newUri.authority) {
			throw vscode.FileSystemError.Unavailable(
				"Cannot rename across different sessions",
			);
		}
		await driver.rename(oldUri.path, newUri.path, options);
		this._onDidChangeFile.fire([
			{ type: vscode.FileChangeType.Deleted, uri: oldUri },
			{ type: vscode.FileChangeType.Created, uri: newUri },
		]);
	}
}
export const remoteFileSystemProvider = new RemoteFileSystemProvider();
