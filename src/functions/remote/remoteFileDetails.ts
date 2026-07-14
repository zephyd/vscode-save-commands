import * as vscode from "vscode";
import type { FileNode } from "../../explorer/remoteExplorerProvider";
import { sessionManager } from "../../explorer/session";
import { sshPool } from "../../explorer/sshPool";
import { execLocal, execSsh } from "../../explorer/drivers/driverUtils";

function formatBytes(bytes: number, decimals = 2) {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

function escapePath(path: string): string {
	return `"${path.replace(/(["\\$`])/g, "\\$1")}"`;
}

function formatLabel(icon: string, key: string): string {
	let padding = "";
	if (key === "Name") {
		padding = "\u00a0".repeat(16);
	} else if (key === "Path" || key === "Type") {
		padding = "\u00a0".repeat(18);
	} else if (key === "Size") {
		padding = "\u00a0".repeat(19);
	} else if (key === "Permissions") {
		padding = "\u00a0".repeat(6);
	} else if (key === "Owner / Group") {
		padding = "\u00a0".repeat(1);
	} else if (key === "Last Modified") {
		padding = "\u00a0".repeat(3);
	} else if (key === "Symlink Target") {
		padding = "";
	}
	return `${icon} ${key}${padding} `;
}

interface ExtraDetails {
	permissions?: string;
	octal?: string;
	owner?: string;
	group?: string;
	target?: string;
}

async function getFileExtraDetails(uri: vscode.Uri): Promise<ExtraDetails> {
	const session = sessionManager.getSession(uri.authority);
	if (!session) return {};

	const cleanPath = escapePath(uri.path);
	let cmd = "";

	if (session.type === "local") {
		try {
			const fs = require("node:fs");
			const stats = fs.lstatSync(uri.fsPath);
			const mode = stats.mode;
			const octal = (mode & 0o777).toString(8).padStart(3, "0");
			const isDir = stats.isDirectory();
			const isLink = stats.isSymbolicLink();
			const typeChar = isDir ? "d" : isLink ? "l" : "-";
			const permString = typeChar + [
				mode & 128 ? "r" : "-", mode & 64 ? "w" : "-", mode & 32 ? "x" : "-",
				mode & 16 ? "r" : "-", mode & 8 ? "w" : "-", mode & 4 ? "x" : "-",
				mode & 2 ? "r" : "-", mode & 1 ? "w" : "-", mode & (isDir ? 1 : 1) ? "x" : "-"
			].join("");

			let target: string | undefined;
			if (isLink) {
				target = fs.readlinkSync(uri.fsPath);
			}

			return {
				permissions: permString,
				octal: `0${octal}`,
				owner: process.env.USERNAME || "local",
				group: "local",
				target,
			};
		} catch (e) {
			return {};
		}
	}

	if (session.type === "ssh") {
		cmd = `stat -c "%A %a %U %G %N" ${cleanPath}`;
	} else if (session.type === "docker") {
		cmd = `docker exec ${session.containerId} stat -c "%A %a %U %G %N" ${cleanPath}`;
	} else if (session.type === "k8s") {
		const containerFlag = session.containerName ? ` -c ${session.containerName}` : "";
		const kubectlPrefix = `kubectl exec ${session.podName} -n ${session.namespace}${containerFlag} --`;
		cmd = `${kubectlPrefix} stat -c "%A %a %U %G %N" ${cleanPath}`;
	}

	try {
		let outputBuffer: Buffer;
		if (session.sshConnection) {
			const ssh = await sshPool.getSSH(session.sshConnection);
			outputBuffer = await execSsh(
				ssh.client,
				cmd,
				undefined,
				session.sshConnection.sudoPassword,
			);
		} else {
			outputBuffer = await execLocal(cmd);
		}

		const output = outputBuffer.toString().trim();
		const match = output.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
		if (match) {
			const permissions = match[1];
			const octal = `0${match[2]}`;
			const owner = match[3];
			const group = match[4];
			const rawName = match[5];
			let target: string | undefined;

			if (rawName.includes("->")) {
				const parts = rawName.split("->");
				target = parts[1].trim().replace(/^['"`]|['"`]$/g, "");
			}

			return { permissions, octal, owner, group, target };
		}
	} catch (e) {
		// Fallback
	}

	return {};
}

export default function (context: vscode.ExtensionContext) {
	return async (node?: FileNode) => {
		if (!node) return;

		try {
			const stat = await vscode.workspace.fs.stat(node.uri);
			const extra = await getFileExtraDetails(node.uri);

			const filename = node.filename;
			const isDir = node.fileType === vscode.FileType.Directory;
			const isLink = !!extra.target;

			const fileTypeStr = isDir ? "Directory" : isLink ? "Symbolic Link" : "File";
			const sizeStr = isDir ? "N/A" : `${formatBytes(stat.size)} (${stat.size} bytes)`;
			const permissionsStr = extra.permissions ? `${extra.permissions} (${extra.octal})` : "N/A";
			const ownerStr = extra.owner ? `${extra.owner} / ${extra.group || "N/A"}` : "N/A";
			const modifiedTimeStr = new Date(stat.mtime).toLocaleString();

			const items: vscode.QuickPickItem[] = [
				{
					label: formatLabel("$(symbol-key)", "Name"),
					description: filename,
				},
				{
					label: formatLabel("$(folder)", "Path"),
					description: node.uri.path,
				},
				{
					label: formatLabel("$(info)", "Type"),
					description: fileTypeStr,
				},
				{
					label: formatLabel("$(database)", "Size"),
					description: sizeStr,
				},
				{
					label: formatLabel("$(lock)", "Permissions"),
					description: permissionsStr,
				},
				{
					label: formatLabel("$(person)", "Owner / Group"),
					description: ownerStr,
				},
				{
					label: formatLabel("$(calendar)", "Last Modified"),
					description: modifiedTimeStr,
				},
			];

			if (isLink && extra.target) {
				items.splice(2, 0, {
					label: formatLabel("$(references)", "Symlink Target"),
					description: extra.target,
				});
			}

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: `File Details: ${filename} (Click to copy item to clipboard)`,
			});

			if (selected?.description) {
				await vscode.env.clipboard.writeText(selected.description);
				vscode.window.showInformationMessage(`Copied "${selected.description}" to clipboard.`);
			}
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Failed to get file details: ${errMsg}`);
		}
	};
}
