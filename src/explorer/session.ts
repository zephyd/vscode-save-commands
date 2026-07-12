import * as vscode from "vscode";
import type SshConnection from "../models/ssh_connection";
import type { FSDriver } from "./drivers/fsDriver";
import { LocalDriver } from "./drivers/localDriver";
import { SFTPDriver } from "./drivers/sftpDriver";

export interface Session {
	id: string;
	type: "local" | "ssh" | "docker" | "k8s";
	sshConnection?: SshConnection;
	containerId?: string;
	podName?: string;
	namespace?: string;
	containerName?: string;
	cwd: string;
	driver: FSDriver;
}

class SessionManager {
	private sessions: Map<string, Session> = new Map();
	private explicitSession?: Session;
	private localSession: Session;

	constructor() {
		this.localSession = {
			id: "local-session",
			type: "local",
			cwd: process.env.USERPROFILE || process.env.HOME || "/",
			driver: new LocalDriver(),
		};
	}

	public createSession(
		type: "local" | "ssh" | "docker" | "k8s",
		options: {
			sshConnection?: SshConnection;
			containerId?: string;
			podName?: string;
			namespace?: string;
			containerName?: string;
			cwd?: string;
		},
	): Session {
		const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
		let driver: FSDriver;
		let cwd = options.cwd || "/";

		if (type === "local") {
			driver = new LocalDriver();
			cwd = options.cwd || process.env.USERPROFILE || process.env.HOME || "/";
		} else if (type === "ssh") {
			if (!options.sshConnection) {
				throw new Error("sshConnection required for ssh session");
			}
			driver = new SFTPDriver(options.sshConnection);
			cwd = options.cwd || "/";
		} else {
			// Placeholder fallback to local driver (Phase 2 & 3 will replace this)
			driver = new LocalDriver();
		}

		const session: Session = {
			id,
			type,
			sshConnection: options.sshConnection,
			containerId: options.containerId,
			podName: options.podName,
			namespace: options.namespace,
			containerName: options.containerName,
			cwd,
			driver,
		};

		this.sessions.set(id, session);
		return session;
	}

	public getSession(id: string): Session | undefined {
		if (id === "local-session") return this.localSession;
		return this.sessions.get(id);
	}

	public setExplicitSession(session: Session) {
		this.explicitSession = session;
	}

	public getExplicitSession(): Session | undefined {
		return this.explicitSession;
	}

	public clearExplicitSession() {
		this.explicitSession = undefined;
	}

	public getActiveSession(): Session {
		const activeTerminal = vscode.window.activeTerminal as any;
		if (activeTerminal?._sessionId) {
			const session = this.sessions.get(activeTerminal._sessionId);
			if (session) return session;
		}

		if (this.explicitSession) {
			return this.explicitSession;
		}

		return this.localSession;
	}
}

export const sessionManager = new SessionManager();
