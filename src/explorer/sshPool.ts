import { Client, type SFTPWrapper } from "ssh2";
import type SshConnection from "../models/ssh_connection";

export interface SSHSession {
	client: Client;
	sftp: SFTPWrapper;
}

class SshPool {
	private pool: Map<string, Promise<SSHSession>> = new Map();

	public async getSSH(conn: SshConnection): Promise<SSHSession> {
		const key = conn.id;
		const cached = this.pool.get(key);

		if (cached) {
			try {
				const session = await cached;
				// Try a dummy operation or check state to see if client is alive.
				// ssh2 Client has internal state we can check, or we can rely on close/end/error event handlers to remove it.
				return session;
			} catch (e) {
				this.pool.delete(key);
			}
		}

		const promise = this.connect(conn);
		this.pool.set(key, promise);
		return promise;
	}

	private connect(conn: SshConnection): Promise<SSHSession> {
		return new Promise((resolve, reject) => {
			const client = new Client();
			let hasFinished = false;

			const cleanup = () => {
				this.pool.delete(conn.id);
				try {
					client.end();
				} catch (e) {}
			};

			client.on("ready", () => {
				client.sftp((err, sftp) => {
					if (err) {
						cleanup();
						if (!hasFinished) {
							hasFinished = true;
							reject(err);
						}
						return;
					}
					if (!hasFinished) {
						hasFinished = true;
						resolve({ client, sftp });
					}
				});
			});

			client.on("error", (err) => {
				cleanup();
				if (!hasFinished) {
					hasFinished = true;
					reject(err);
				}
			});

			client.on("end", () => {
				cleanup();
			});

			client.on("close", () => {
				cleanup();
			});

			try {
				client.connect({
					host: conn.host,
					port: conn.port || 22,
					username: conn.username,
					password: conn.password,
					readyTimeout: 20000,
					keepaliveInterval: 10000,
					keepaliveCountMax: 3,
				});
			} catch (err) {
				cleanup();
				if (!hasFinished) {
					hasFinished = true;
					reject(err);
				}
			}
		});
	}

	public closeAll() {
		for (const key of this.pool.keys()) {
			const cached = this.pool.get(key);
			if (cached) {
				cached
					.then((session) => {
						try {
							session.client.end();
						} catch (e) {}
					})
					.catch(() => {});
			}
		}
		this.pool.clear();
	}
}

export const sshPool = new SshPool();
