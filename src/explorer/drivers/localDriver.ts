import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { FSDriver, FSEntry } from "./fsDriver";

export class LocalDriver implements FSDriver {
	async stat(filePath: string): Promise<vscode.FileStat> {
		const stats = await fs.stat(filePath);
		return {
			type: stats.isDirectory()
				? vscode.FileType.Directory
				: stats.isFile()
					? vscode.FileType.File
					: stats.isSymbolicLink()
						? vscode.FileType.SymbolicLink
						: vscode.FileType.Unknown,
			ctime: stats.ctimeMs,
			mtime: stats.mtimeMs,
			size: stats.size,
		};
	}

	async readDirectory(dirPath: string): Promise<FSEntry[]> {
		const names = await fs.readdir(dirPath);
		const entries: FSEntry[] = [];
		for (const name of names) {
			try {
				const fullPath = path.join(dirPath, name);
				const s = await this.stat(fullPath);
				entries.push({ name, type: s.type });
			} catch (e) {
				// Ignore files that fail stat (e.g. permission issues or broken links)
			}
		}
		return entries;
	}

	async readFile(filePath: string): Promise<Uint8Array> {
		const buf = await fs.readFile(filePath);
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	}

	async writeFile(
		filePath: string,
		content: Uint8Array,
		options: { create: boolean; overwrite: boolean },
	): Promise<void> {
		const parent = path.dirname(filePath);
		await fs.mkdir(parent, { recursive: true });
		await fs.writeFile(filePath, content);
	}

	async delete(
		filePath: string,
		options: { recursive: boolean },
	): Promise<void> {
		await fs.rm(filePath, { recursive: true, force: true });
	}

	async rename(
		oldPath: string,
		newPath: string,
		options: { overwrite: boolean },
	): Promise<void> {
		await fs.rename(oldPath, newPath);
	}

	async createDirectory(dirPath: string): Promise<void> {
		await fs.mkdir(dirPath, { recursive: true });
	}
}
