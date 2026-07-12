import type { SFTPWrapper } from "ssh2";
import * as vscode from "vscode";
import type SshConnection from "../../models/ssh_connection";
import { sshPool } from "../sshPool";
import type { FSDriver, FSEntry } from "./fsDriver";

export class SFTPDriver implements FSDriver {
	constructor(private connection: SshConnection) {}

	private async getSftp(): Promise<SFTPWrapper> {
		const session = await sshPool.getSSH(this.connection);
		return session.sftp;
	}

	async stat(path: string): Promise<vscode.FileStat> {
		const sftp = await this.getSftp();
		return new Promise((resolve, reject) => {
			sftp.stat(path, (err, stats) => {
				if (err) return reject(err);
				resolve({
					type: stats.isDirectory()
						? vscode.FileType.Directory
						: stats.isFile()
							? vscode.FileType.File
							: stats.isSymbolicLink()
								? vscode.FileType.SymbolicLink
								: vscode.FileType.Unknown,
					ctime: stats.atime * 1000,
					mtime: stats.mtime * 1000,
					size: stats.size,
				});
			});
		});
	}

	async readDirectory(path: string): Promise<FSEntry[]> {
		const sftp = await this.getSftp();
		return new Promise((resolve, reject) => {
			sftp.readdir(path, (err, list) => {
				if (err) return reject(err);
				const entries = list.map((item) => {
					const mode = item.attrs.mode;
					// Check mode bits
					const isDir = (mode & 0o170000) === 0o040000;
					const isFile = (mode & 0o170000) === 0o100000;
					const isSymlink = (mode & 0o170000) === 0o120000;

					let type = vscode.FileType.Unknown;
					if (isDir) type = vscode.FileType.Directory;
					else if (isFile) type = vscode.FileType.File;
					else if (isSymlink) type = vscode.FileType.SymbolicLink;

					return {
						name: item.filename,
						type: type,
					};
				});
				resolve(entries);
			});
		});
	}

	async readFile(path: string): Promise<Uint8Array> {
		const sftp = await this.getSftp();
		return new Promise((resolve, reject) => {
			sftp.readFile(path, (err, data) => {
				if (err) return reject(err);
				resolve(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
			});
		});
	}

	async writeFile(
		path: string,
		content: Uint8Array,
		options: { create: boolean; overwrite: boolean },
	): Promise<void> {
		const sftp = await this.getSftp();
		return new Promise((resolve, reject) => {
			const buffer = Buffer.from(
				content.buffer,
				content.byteOffset,
				content.byteLength,
			);
			sftp.writeFile(path, buffer, (err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	async delete(path: string, options: { recursive: boolean }): Promise<void> {
		const sftp = await this.getSftp();
		const rmRecursive = async (p: string): Promise<void> => {
			const s = await this.stat(p);
			if (s.type === vscode.FileType.Directory) {
				const files = await this.readDirectory(p);
				for (const file of files) {
					const childPath = p.endsWith("/")
						? `${p}${file.name}`
						: `${p}/${file.name}`;
					await rmRecursive(childPath);
				}
				await new Promise<void>((resolve, reject) => {
					sftp.rmdir(p, (err) => {
						if (err) return reject(err);
						resolve();
					});
				});
			} else {
				await new Promise<void>((resolve, reject) => {
					sftp.unlink(p, (err) => {
						if (err) return reject(err);
						resolve();
					});
				});
			}
		};

		await rmRecursive(path);
	}

	async rename(
		oldPath: string,
		newPath: string,
		options: { overwrite: boolean },
	): Promise<void> {
		const sftp = await this.getSftp();
		return new Promise((resolve, reject) => {
			sftp.rename(oldPath, newPath, (err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	async createDirectory(path: string): Promise<void> {
		const sftp = await this.getSftp();
		return new Promise((resolve, reject) => {
			sftp.mkdir(path, (err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}
}
