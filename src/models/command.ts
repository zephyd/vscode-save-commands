import { instanceToPlain, plainToInstance } from "class-transformer";
import { singleInput as takeSingleInput, uuidv4 } from "../utils";
import type { ExtensionContext } from "vscode";
import {
	FALLBACK_PLACEHOLDER_TYPE,
	PlaceholderType,
} from "./placeholder_types";
import type { JSONObj, PickProperties } from "./base_types";
import { ExtensionContextListEtter, type IEtter, StateType } from "./etters";
import type TreeItem from "../TreeItem";
import ReadableError from "./error";

const COMMAND_STORAGE_KEY = "commands";

export enum ResolveCommandType {
	runActive = "RUN (Active)",
	runNew = "RUN (New)",
	copy = "COPY",
}

export default class Command {
	id!: string;
	name!: string;
	command!: string;
	placeholderTypeId!: string;
	sortOrder?: number;
	parentFolderId?: string | null;

	getPlaceholderType(): PlaceholderType {
		return (
			PlaceholderType.getPlaceholderTypeFromId(this.placeholderTypeId) ??
			FALLBACK_PLACEHOLDER_TYPE
		);
	}

	static create(fields: {
		name: string;
		command: string;
		parentFolderId: string | null;
		placeholderType: PlaceholderType;
	}) {
		const id = uuidv4();
		const { name, command, parentFolderId, placeholderType } = fields;
		return Command.fromJsonSafe({
			id,
			name,
			command,
			placeholderTypeId: placeholderType.id,
			// TODO: Handle sortOrder
			sortOrder: 0,
			parentFolderId: parentFolderId,
		});
	}

	toJson(): JSONObj {
		return instanceToPlain(this);
	}

	static fromJson(json: JSONObj): Command {
		return plainToInstance(Command, json);
	}

	static fromJsonSafe(json: PickProperties<Command>): Command {
		return Command.fromJson(json);
	}

	static etters: ExtensionContextListEtter<Command> =
		new ExtensionContextListEtter(COMMAND_STORAGE_KEY, this.fromJson);

	static getEtterFromTreeContext(treeItem: TreeItem): {
		etter: IEtter<Array<Command>>;
		stateType: StateType;
	} {
		const stateType = treeItem.stateType;
		if (stateType === StateType.workspace) {
			return {
				stateType: StateType.workspace,
				etter: Command.etters.workspace,
			};
		}
		if (stateType === StateType.global) {
			return { stateType: StateType.global, etter: Command.etters.global };
		}
		throw new ReadableError(
			`Unknown stateType: ${stateType} to get Command etter`,
		);
	}

	async resolveCommand(
		context: ExtensionContext,
		resolveCommandType: ResolveCommandType,
	): Promise<string | null> {
		let resolvedCommand = this.command;

		// 1. Handle Dynamic Interactive Parameters: {{Prompt:Default}}
		const dynamicPromptRegex = /{{([^}]+)}}/g;
		let match;
		
		// We use a copy of the command to process one by one
		let currentResolved = resolvedCommand;
		
		// Reset regex index
		dynamicPromptRegex.lastIndex = 0;
		while ((match = dynamicPromptRegex.exec(currentResolved)) !== null) {
			const fullMatch = match[0];
			const content = match[1];
			const parts = content.split(':');
			const promptLabel = parts[0].trim();
			const defaultValue = parts.length > 1 ? parts.slice(1).join(':').trim() : promptLabel;

			const input = await takeSingleInput({
				promptText: `${resolveCommandType} | ${this.name} | ${promptLabel}`,
				placeholder: `Default: ${defaultValue}`,
			});

			if (input === undefined) {
				return null; // Cancelled
			}

			const finalInput = input === "" ? defaultValue : input;
			
			// Replace only the CURRENT match. Since matches are sequential, we can replace the first occurrence of fullMatch
			// However, to be safe with identical matches, we should replace at the regex position.
			const before = currentResolved.substring(0, match.index);
			const after = currentResolved.substring(match.index + fullMatch.length);
			currentResolved = before + finalInput + after;
			
			// Adjust regex index because the length changed
			dynamicPromptRegex.lastIndex = before.length + finalInput.length;
		}
		
		resolvedCommand = currentResolved;

		// 2. Original Placeholder Type Logic ({{}}, {}, etc.)
		const placeholderType = this.getPlaceholderType();
		const regex = placeholderType.regex;
		const matches = placeholderType.extractPlaceholders(resolvedCommand);
		if (!matches) {
			return resolvedCommand;
		}

		const inputs: Record<string, string> = {};

		for (const placeholder in matches) {
			const input = await takeSingleInput({
				promptText: `${resolveCommandType} | ${this.name} | ${placeholder} | `,
				placeholder: `Enter ${placeholder}`,
			});
			if (input === undefined) {
				return null; // Cancelled
			}
			// If user hits Enter with empty string, use the label as default
			const finalInput = input === "" ? placeholder : input;
			for (const match of matches[placeholder]) {
				inputs[match] = finalInput;
			}
		}
		resolvedCommand = resolvedCommand.replace(regex, (match) => {
			if (match in inputs) {
				return inputs[match];
			}
			return match;
		});

		return resolvedCommand;
	}
}
