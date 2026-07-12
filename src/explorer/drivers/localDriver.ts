import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { FSDriver, FSEntry } from "./fsDriver";

export class LocalDriver implements FSDriver {
	private cleanPath(p: string): string {
		if (process.platform === "win32") {
			let res = p;
			if (/^\/[a-zA-Z]:/.test(res)) {
				res = res.substring(1);
			}
			return res.replace(/\//g, "\\");
		}
		return p;
	}

	async stat(filePath: string): Promise<vscode.FileStat> {
		const clean = this.cleanPath(filePath);
		const stats = await fs.stat(clean);
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
		const clean = this.cleanPath(dirPath);
		const names = await fs.readdir(clean);
		const entries: FSEntry[] = [];
		for (const name of names) {
			try {
				const fullPath = path.join(clean, name);
				const s = await this.stat(fullPath);
				entries.push({ name, type: s.type });
			} catch (e) {
				// Ignore files that fail stat (e.g. permission issues or broken links)
			}
		}
		return entries;
	}

	async readFile(filePath: string): Promise<Uint8Array> {
		const clean = this.cleanPath(filePath);
		const buf = await fs.readFile(clean);
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	}

	async writeFile(
		filePath: string,
		content: Uint8Array,
		options: { create: boolean; overwrite: boolean },
	): Promise<void> {
		const clean = this.cleanPath(filePath);
		const parent = path.dirname(clean);
		await fs.mkdir(parent, { recursive: true });
		await fs.writeFile(clean, content);
	}

	async delete(
		filePath: string,
		options: { recursive: boolean },
	): Promise<void> {
		const clean = this.cleanPath(filePath);
		await fs.rm(clean, { recursive: true, force: true });
	}

	async rename(
		oldPath: string,
		newPath: string,
		options: { overwrite: boolean },
	): Promise<void> {
		const cleanOld = this.cleanPath(oldPath);
		const cleanNew = this.cleanPath(newPath);
		await fs.rename(cleanOld, cleanNew);
	}

	async createDirectory(dirPath: string): Promise<void> {
		const clean = this.cleanPath(dirPath);
		await fs.mkdir(clean, { recursive: true });
	}
}
