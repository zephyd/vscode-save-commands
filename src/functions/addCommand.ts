import * as vscode from "vscode";
import type FormViewProvider from "../FormViewProvider";
import type TreeItem from "../TreeItem";
import { ContextValue } from "../TreeProvider";
import Command from "../models/command";
import ReadableError from "../models/error";
import { getActivePlaceholderType } from "../utils";

export default function (formViewProvider: FormViewProvider) {
	return async (item: TreeItem) => {
		ReadableError.runGuarded(async () => {
			const { stateType } = Command.getEtterFromTreeContext(item);

			if (!item.contextValue) {
				return;
			}

			const folderId =
				item.contextValue === ContextValue.folder ? (item.id as string) : null;

			// Switch focus to the top sidebar form
			formViewProvider.prepareForm(stateType, folderId, "command", {
				placeholderTypeId: getActivePlaceholderType().id,
			});
		}, "Error Opening Command Form");
	};
}
