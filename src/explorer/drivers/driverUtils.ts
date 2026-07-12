import * as cp from "node:child_process";
import type { Client } from "ssh2";

export function execSsh(
	client: Client,
	cmd: string,
	stdinData?: Uint8Array,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		client.exec(cmd, (err, stream) => {
			if (err) return reject(err);

			const stdoutChunks: any[] = [];
			const stderrChunks: any[] = [];

			stream.on("data", (data: Buffer) => {
				stdoutChunks.push(data);
			});

			stream.stderr.on("data", (data: Buffer) => {
				stderrChunks.push(data);
			});

			stream.on("close", (code: number) => {
				if (code !== 0) {
					const errorMsg = Buffer.concat(stderrChunks).toString().trim();
					reject(new Error(errorMsg || `Command failed with code ${code}`));
				} else {
					resolve(Buffer.concat(stdoutChunks));
				}
			});

			if (stdinData) {
				stream.write(stdinData);
				stream.end();
			}
		});
	});
}

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
