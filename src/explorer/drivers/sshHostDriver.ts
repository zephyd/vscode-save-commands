import * as vscode from "vscode";
import type SshConnection from "../../models/ssh_connection";
import { sshPool } from "../sshPool";
import { execSsh } from "./driverUtils";
import type { FSDriver, FSEntry } from "./fsDriver";

export class SshHostDriver implements FSDriver {
	constructor(private sshConnection: SshConnection) {}

	private async runCommand(
		cmd: string,
		stdinData?: Uint8Array,
	): Promise<Buffer> {
		const session = await sshPool.getSSH(this.sshConnection);
		return execSsh(
			session.client,
			cmd,
			stdinData,
			this.sshConnection.sudoPassword,
		);
	}

	public async stat(path: string): Promise<vscode.FileStat> {
		const cleanPath = this.escapePath(path);
		try {
			const output = await this.runCommand(`stat -c "%s %Y %F" ${cleanPath}`);
			const parts = output.toString().trim().split(/\s+/);
			const size = Number.parseInt(parts[0], 10);
			const mtime = Number.parseInt(parts[1], 10) * 1000;
			const typeStr = parts.slice(2).join(" ").toLowerCase();
			let type: vscode.FileType;
			if (typeStr.includes("directory")) {
				type = vscode.FileType.Directory;
			} else if (typeStr.includes("symbolic link")) {
				type = vscode.FileType.SymbolicLink;
			} else {
				type = vscode.FileType.File;
			}
			return {
				type,
				ctime: 0,
				mtime,
				size,
			};
		} catch (e) {
			try {
				await this.runCommand(`test -d ${cleanPath}`);
				return {
					type: vscode.FileType.Directory,
					ctime: 0,
					mtime: Date.now(),
					size: 0,
				};
			} catch (errD) {
				try {
					await this.runCommand(`test -f ${cleanPath}`);
					let size = 0;
					try {
						const sizeOutput = await this.runCommand(`wc -c < ${cleanPath}`);
						size = Number.parseInt(sizeOutput.toString().trim(), 10) || 0;
					} catch (errSz) {}
					return {
						type: vscode.FileType.File,
						ctime: 0,
						mtime: Date.now(),
						size,
					};
				} catch (errF) {
					throw new Error(`File not found: ${path}`);
				}
			}
		}
	}

	public async readDirectory(path: string): Promise<FSEntry[]> {
		const cleanPath = this.escapePath(path);
		const output = await this.runCommand(`ls -F -A ${cleanPath}`);
		const lines = output
			.toString()
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l !== "");
		const entries: FSEntry[] = [];
		for (const line of lines) {
			let name = line;
			let type = vscode.FileType.File;
			if (line.endsWith("/")) {
				name = line.substring(0, line.length - 1);
				type = vscode.FileType.Directory;
			} else if (line.endsWith("@")) {
				name = line.substring(0, line.length - 1);
				type = vscode.FileType.SymbolicLink;
			} else if (line.endsWith("*")) {
				name = line.substring(0, line.length - 1);
				type = vscode.FileType.File;
			}
			entries.push({ name, type });
		}
		return entries;
	}

	public async readFile(path: string): Promise<Uint8Array> {
		const cleanPath = this.escapePath(path);
		const output = await this.runCommand(`cat ${cleanPath}`);
		return new Uint8Array(output);
	}

	public async writeFile(
		path: string,
		content: Uint8Array,
		options: { create: boolean; overwrite: boolean },
	): Promise<void> {
		const cleanPath = this.escapePath(path);
		if (options.create) {
			const lastSlash = path.lastIndexOf("/");
			if (lastSlash > 0) {
				const parent = path.substring(0, lastSlash);
				await this.createDirectory(parent);
			}
		}
		await this.runCommand(`cat > ${cleanPath}`, content);
	}

	public async delete(
		path: string,
		options: { recursive: boolean },
	): Promise<void> {
		const cleanPath = this.escapePath(path);
		const flags = options.recursive ? "-rf" : "-f";
		await this.runCommand(`rm ${flags} ${cleanPath}`);
	}

	public async rename(
		oldPath: string,
		newPath: string,
		options: { overwrite: boolean },
	): Promise<void> {
		const cleanOld = this.escapePath(oldPath);
		const cleanNew = this.escapePath(newPath);
		if (!options.overwrite) {
			try {
				await this.stat(newPath);
				throw new Error(`Destination path already exists: ${newPath}`);
			} catch (e) {}
		}
		await this.runCommand(`mv ${cleanOld} ${cleanNew}`);
	}

	public async createDirectory(path: string): Promise<void> {
		const cleanPath = this.escapePath(path);
		await this.runCommand(`mkdir -p ${cleanPath}`);
	}

	private escapePath(path: string): string {
		return `"${path.replace(/"/g, '\\"')}"`;
	}
}
