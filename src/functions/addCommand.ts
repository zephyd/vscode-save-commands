import * as vscode from "vscode";
import Command from "../models/command";
import type TreeItem from "../TreeItem";
import ReadableError from "../models/error";
import { ContextValue } from "../TreeProvider";
import type FormViewProvider from "../FormViewProvider";

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
			formViewProvider.prepareForm(stateType, folderId);
			
		}, "Error Opening Command Form");
	};
}
