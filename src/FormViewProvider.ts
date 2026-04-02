import * as vscode from "vscode";
import { StateType } from "./models/etters";

export default class FormViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "save-commands-form-view";
	private _view?: vscode.WebviewView;
	private _pendingContext?: { stateType: StateType, folderId: string | null };

	constructor(private readonly _context: vscode.ExtensionContext) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._context.extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		if (this._pendingContext) {
			this.prepareForm(this._pendingContext.stateType, this._pendingContext.folderId);
			this._pendingContext = undefined;
		}

		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case "save": {
					vscode.commands.executeCommand("save-commands.handleFormSubmit", data.value);
					break;
				}
			}
		});
	}

	public prepareForm(stateType: StateType, folderId: string | null, command?: { id: string, name: string, command: string }) {
		if (this._view) {
			this._view.show(true);
			this._view.webview.postMessage({
				type: "setContext",
				stateType,
				folderId,
				commandId: command?.id,
				name: command?.name,
				command: command?.command
			});
		} else {
			this._pendingContext = { stateType, folderId };
			vscode.commands.executeCommand(`${FormViewProvider.viewType}.focus`);
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<style>
					body { padding: 4px 8px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); background: transparent; overflow-x: hidden; overflow-y: auto; }
					.container { display: flex; flex-direction: column; gap: 6px; }
					.input-row { position: relative; display: flex; align-items: center; }
					input, textarea { 
						width: 100%; 
						background: var(--vscode-input-background); 
						color: var(--vscode-input-foreground); 
						border: 1px solid var(--vscode-input-border); 
						padding: 4px 6px; 
						outline: none;
						box-sizing: border-box;
						font-size: 11px;
						font-family: inherit;
					}
					input { height: 24px; padding-right: 28px; }
					textarea { 
						min-height: 48px; 
						max-height: 120px; 
						resize: vertical; 
						padding-right: 28px;
						line-height: 1.4;
					}
					input:focus, textarea:focus { border-color: var(--vscode-focusBorder); }
					.icon-btn {
						position: absolute;
						right: 4px;
						top: 6px;
						width: 20px;
						height: 20px;
						display: flex;
						align-items: center;
						justify-content: center;
						cursor: pointer;
						opacity: 0.6;
						border-radius: 3px;
						font-size: 10px;
						font-weight: bold;
						z-index: 10;
					}
					.icon-btn:hover { background: var(--vscode-inputOption-activeBackground); opacity: 1; }
					.footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 9px; opacity: 0.4; }
					#save-trigger {
						display: flex;
						align-items: center;
						justify-content: center;
						cursor: pointer;
						color: var(--vscode-button-background);
						opacity: 0.8;
						transition: background 0.1s;
						width: 22px;
						height: 22px;
						border-radius: 3px;
					}
					#save-trigger:hover { 
						background: var(--vscode-inputOption-activeBackground); 
						opacity: 1; 
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div class="input-row">
						<input type="text" id="name" placeholder="label (e.g. My Script)">
					</div>
					<div class="input-row">
						<textarea id="command" placeholder="command (e.g. npm start\nnode index.js)" spellcheck="false"></textarea>
						<div class="icon-btn" id="dynamic-helper" title="Convert selected to dynamic parameter">D</div>
					</div>
					<div class="footer">
						<span id="scope-info">Target: Global</span>
						<div id="save-trigger" title="Save Command (Ctrl+Enter)">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646l-7.5 7.5l-3.5-3.5l.708-.708l2.792 2.792l7.146-7.146l.708.708z"/></svg>
						</div>
					</div>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					let currentContext = { stateType: 'Global', folderId: null, commandId: null };

					window.addEventListener('message', event => {
						const message = event.data;
						if (message.type === 'setContext') {
							currentContext = { 
								stateType: message.stateType, 
								folderId: message.folderId,
								commandId: message.commandId || null 
							};
							const isEdit = !!message.commandId;
							document.getElementById('scope-info').innerText = isEdit ? 'Editing in ' + message.stateType : 'Target: ' + message.stateType;
							document.getElementById('save-trigger').title = isEdit ? 'Update Command (Ctrl+Enter)' : 'Save Command (Ctrl+Enter)';
							
							document.getElementById('name').value = message.name || '';
							document.getElementById('command').value = message.command || '';
							document.getElementById('name').focus();
						}
					});

					const submit = () => {
						const name = document.getElementById('name').value;
						const command = document.getElementById('command').value;
						if (name && command) {
							vscode.postMessage({
								type: 'save',
								value: { name, command, ...currentContext }
							});
							document.getElementById('name').value = '';
							document.getElementById('command').value = '';
							currentContext.commandId = null; 
						}
					};

					// Dynamic Helper Logic
					document.getElementById('dynamic-helper').addEventListener('click', () => {
						const cmdInput = document.getElementById('command');
						const start = cmdInput.selectionStart;
						const end = cmdInput.selectionEnd;
						const text = cmdInput.value;
						const selected = text.substring(start, end).trim();
						
						const replacement = '{{input:' + selected + '}}';
						const newText = text.substring(0, start) + replacement + text.substring(end);
						
						cmdInput.value = newText;
						cmdInput.focus();
						// Set selection after the inserted parameter
						const newCursorPos = start + replacement.length;
						cmdInput.setSelectionRange(newCursorPos, newCursorPos);
					});

					document.getElementById('save-trigger').addEventListener('click', submit);
					
					document.body.addEventListener('keydown', (e) => {
						// Single Enter on the Name field submits
						if (e.key === 'Enter' && e.target.id === 'name') {
							submit();
						}
						// Ctrl+Enter (or Cmd+Enter) anywhere submits
						if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
							submit();
						}
					});
				</script>
			</body>
			</html>`;
	}
}
