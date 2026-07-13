import * as cp from "node:child_process";
import type { Client } from "ssh2";

/**
 * 在远程主机上执行 SSH 命令，支持 sudo 提权及 su (PTY 模式) 提权
 *
 * @param client ssh2 客户端实例
 * @param cmd 待执行的目标命令
 * @param stdinData 需要写入命令标准输入的二进制数据
 * @param sudoPassword 用于 sudo 提权的密码
 * @param rootPassword 用于 su 提权的密码（会强制启用 PTY）
 * @returns 命令返回的标准输出二进制 Buffer
 */
export function execSsh(
	client: Client,
	cmd: string,
	stdinData?: Uint8Array,
	sudoPassword?: string,
	rootPassword?: string,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		let finalCmd = cmd;
		let usePty = false;

		if (rootPassword) {
			// 如果是 root 密码，使用 su 提权，为了避开引号冲突，把命令做 base64 保护
			const b64Cmd = Buffer.from(cmd).toString("base64");
			finalCmd = `su - root -c "echo '${b64Cmd}' | base64 -d | bash"`;
			usePty = true; // 强制分配 PTY，确保 su 能够读取密码
		} else if (sudoPassword && !cmd.startsWith("sudo -S")) {
			const escaped = cmd.replace(/'/g, "'\\''");
			finalCmd = `sudo -S sh -c '${escaped}'`;
		}

		client.exec(finalCmd, usePty ? { pty: true } : {}, (err, stream) => {
			if (err) return reject(err);

			const stdoutChunks: Buffer[] = [];
			const stderrChunks: Buffer[] = [];

			stream.on("data", (data: Buffer) => {
				stdoutChunks.push(data);
			});

			stream.stderr.on("data", (data: Buffer) => {
				const str = data.toString();
				// 过滤掉 sudo 自身的密码输入提示信息
				if (
					!str.includes("[sudo] password") &&
					!str.includes("password for") &&
					!str.toLowerCase().includes("password")
				) {
					stderrChunks.push(data);
				}
			});

			stream.on("close", (code: number) => {
				if (code !== 0) {
					// PTY 模式下 stdout 和 stderr 是合并的，所以如果 stderr 为空，则从 stdout 读取报错原因
					const errorMsg = Buffer.concat(
						stderrChunks.length ? stderrChunks : stdoutChunks,
					)
						.toString()
						.trim();
					reject(new Error(errorMsg || `Command failed with code ${code}`));
				} else {
					let output = Buffer.concat(stdoutChunks);
					if (usePty) {
						// PTY 模式下 su 的 "Password: " 提示行会进入标准输出，在此将其过滤剪掉
						const text = output.toString("utf8");
						const lines = text.split(/\r?\n/);
						if (
							lines.length > 0 &&
							(lines[0].toLowerCase().includes("password") ||
								lines[0].includes("密码"))
						) {
							const firstNewline = output.indexOf(10); // \n
							if (firstNewline !== -1) {
								output = output.subarray(firstNewline + 1);
							}
						}
					}
					resolve(output);
				}
			});

			if (rootPassword) {
				stream.write(`${rootPassword}\n`);
			} else if (sudoPassword) {
				stream.write(`${sudoPassword}\n`);
			}

			if (stdinData) {
				stream.write(stdinData);
			}

			if (rootPassword || sudoPassword || stdinData) {
				stream.end();
			}
		});
	});
}

/**
 * 在本地执行命令
 *
 * @param cmd 待执行的目标命令
 * @param stdinData 需要写入命令标准输入的二进制数据
 * @returns 命令返回的标准输出二进制 Buffer
 */
export function execLocal(
	cmd: string,
	stdinData?: Uint8Array,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn(cmd, { shell: true });
		const stdoutChunks: any[] = [];
		const stderrChunks: any[] = [];

		child.stdout.on("data", (data: Buffer) => {
			stdoutChunks.push(data);
		});

		child.stderr.on("data", (data: Buffer) => {
			stderrChunks.push(data);
		});

		child.on("close", (code) => {
			if (code !== 0) {
				const errorMsg = Buffer.concat(stderrChunks).toString().trim();
				reject(new Error(errorMsg || `Command failed with code ${code}`));
			} else {
				resolve(Buffer.concat(stdoutChunks));
			}
		});

		if (stdinData) {
			child.stdin.write(stdinData);
			child.stdin.end();
		}
	});
}
