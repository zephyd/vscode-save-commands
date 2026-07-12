import { instanceToPlain, plainToInstance } from "class-transformer";
import type TreeItem from "../TreeItem";
import { uuidv4 } from "../utils";
import type { JSONObj, PickProperties } from "./base_types";
import ReadableError from "./error";
import { ExtensionContextListEtter, type IEtter, StateType } from "./etters";

const SSH_CONNECTIONS_STORAGE_KEY = "ssh_connections";

export default class SshConnection {
	id!: string;
	name!: string;
	host!: string;
	port!: number;
	username!: string;
	password!: string;
	sudoPassword?: string;
	sortOrder?: number;

	static create(fields: {
		name: string;
		host: string;
		port: number;
		username: string;
		password: string;
		sudoPassword?: string;
	}) {
		return SshConnection.fromJsonSafe({
			id: uuidv4(),
			name: fields.name,
			host: fields.host,
			port: fields.port,
			username: fields.username,
			password: fields.password,
			sudoPassword: fields.sudoPassword,
			sortOrder: 0,
		});
	}

	toJson(): JSONObj {
		return instanceToPlain(this);
	}

	static fromJson(json: JSONObj): SshConnection {
		return plainToInstance(SshConnection, json);
	}

	static fromJsonSafe(json: PickProperties<SshConnection>): SshConnection {
		return SshConnection.fromJson(json);
	}

	static etters: ExtensionContextListEtter<SshConnection> =
		new ExtensionContextListEtter(SSH_CONNECTIONS_STORAGE_KEY, this.fromJson);

	static getEtterFromTreeContext(treeItem: TreeItem): {
		etter: IEtter<Array<SshConnection>>;
		stateType: StateType;
	} {
		const stateType = treeItem.stateType;
		if (stateType === StateType.workspace) {
			return {
				stateType: StateType.workspace,
				etter: SshConnection.etters.workspace,
			};
		}
		if (stateType === StateType.global) {
			return {
				stateType: StateType.global,
				etter: SshConnection.etters.global,
			};
		}
		throw new ReadableError(
			`Unknown stateType: ${stateType} to get SshConnection etter`,
		);
	}
}
