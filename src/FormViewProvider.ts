import * as vscode from "vscode";
import type { StateType } from "./models/etters";

export default class FormViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "save-commands-form-view";
	private _view?: vscode.WebviewView;
	private _pendingContext?: {
		stateType: StateType;
		folderId: string | null;
		mode: "command" | "ssh";
		initialData?: {
			id?: string;
			name?: string;
			command?: string;
			placeholderTypeId?: string;
			host?: string;
			port?: number;
			username?: string;
			password?: string;
		};
	};

	constructor(private readonly _context: vscode.ExtensionContext) {}

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
			this.prepareForm(
				this._pendingContext.stateType,
				this._pendingContext.folderId,
				this._pendingContext.mode,
				this._pendingContext.initialData,
			);
			this._pendingContext = undefined;
		}

		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case "save": {
					vscode.commands.executeCommand(
						"save-commands.handleFormSubmit",
						data.value,
					);
					break;
				}
				case "saveSsh": {
					vscode.commands.executeCommand(
						"save-commands.handleSshFormSubmit",
						data.value,
					);
					break;
				}
			}
		});
	}

	public prepareForm(
		stateType: StateType,
		folderId: string | null,
		mode: "command" | "ssh",
		initialData?: {
			id?: string;
			name?: string;
			command?: string;
			placeholderTypeId?: string;
			host?: string;
			port?: number;
			username?: string;
			password?: string;
		},
	) {
		if (this._view) {
			this._view.show(true);
			this._view.webview.postMessage({
				type: "setContext",
				stateType,
				folderId,
				mode,
				commandId: initialData?.id,
				name: initialData?.name,
				command: initialData?.command,
				placeholderTypeId: initialData?.placeholderTypeId,
				host: initialData?.host,
				port: initialData?.port,
				username: initialData?.username,
				password: initialData?.password,
			});
		} else {
			this._pendingContext = { stateType, folderId, mode, initialData };
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
					
					/* Default / Command Mode (No labels by default, except name and type) */
					.input-row { position: relative; margin-bottom: 2px; }
					.input-row label { display: none; }
					
					.container.mode-command #name-row,
					.container.mode-command #placeholder-type-row {
						display: flex;
						align-items: center;
						gap: 8px;
					}
					
					.container.mode-command #name-row label,
					.container.mode-command #placeholder-type-row label {
						display: inline-block;
						font-size: 11px; 
						font-weight: 500; 
						width: 60px; 
						min-width: 60px;
						color: var(--vscode-foreground); 
						opacity: 0.8;
						user-select: none;
					}
					
					/* SSH Mode (Show aligned labels for all fields) */
					.container.mode-ssh .input-row { display: flex; align-items: center; gap: 8px; }
					.container.mode-ssh .input-row label { 
						display: inline-block;
						font-size: 11px; 
						font-weight: 500; 
						width: 60px; 
						min-width: 60px;
						color: var(--vscode-foreground); 
						opacity: 0.8;
						user-select: none;
					}
					
					input, textarea, select { 
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
					input, select { height: 24px; }
					textarea { 
						min-height: 48px; 
						max-height: 120px; 
						resize: vertical; 
						line-height: 1.4;
					}
					input:focus, textarea:focus, select:focus { border-color: var(--vscode-focusBorder); }
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
					#save-trigger, #dynamic-helper {
						display: flex;
						align-items: center;
						justify-content: center;
						cursor: pointer;
						opacity: 0.6;
						transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
						width: 22px;
						height: 22px;
						border-radius: 3px;
					}
					#save-trigger { color: var(--vscode-foreground); opacity: 0.8; }
					#dynamic-helper { 
						font-family: monospace; 
						font-weight: bold; 
						font-size: 13px;
						color: var(--vscode-foreground);
						margin-right: 4px;
						width: auto;
						min-width: 22px;
						padding: 0 4px;
						white-space: nowrap;
					}
					#save-trigger:hover, #dynamic-helper:hover { 
						background: var(--vscode-inputOption-activeBackground); 
						opacity: 1;
						transform: scale(1.05);
					}
					#save-trigger:active { transform: scale(0.95); }
				</style>
			</head>
			<body>
				<div class="container mode-command">
					<div class="input-row" id="name-row">
						<label for="name">Name:</label>
						<input type="text" id="name" placeholder="My Script">
					</div>
					<div class="input-row" id="placeholder-type-row">
						<label for="placeholder-type">Type:</label>
						<select id="placeholder-type">
							<option value="singleCurlyBraces">singleCurlyBraces ({name})</option>
							<option value="doubleCurlyBraces">doubleCurlyBraces ({{name}})</option>
							<option value="singleAngleBraces">singleAngleBraces (&lt;name&gt;)</option>
							<option value="doubleAngleBraces">doubleAngleBraces (&lt;&lt;name&gt;&gt;)</option>
						</select>
					</div>
					<div class="input-row" id="command-row">
						<textarea id="command" placeholder="command (e.g. npx @vscode/vsce package --no-yarn)" spellcheck="false"></textarea>
					</div>
					<!-- SSH Fields -->
					<div class="input-row ssh-field" id="host-row" style="display: none;">
						<label for="host">Host:</label>
						<input type="text" id="host" placeholder="192.168.1.10">
					</div>
					<div class="input-row ssh-field" id="port-row" style="display: none;">
						<label for="port">Port:</label>
						<input type="text" id="port" placeholder="22">
					</div>
					<div class="input-row ssh-field" id="username-row" style="display: none;">
						<label for="username">Username:</label>
						<input type="text" id="username" placeholder="root">
					</div>
					<div class="input-row ssh-field" id="password-row" style="display: none;">
						<label for="password">Password:</label>
						<input type="password" id="password" placeholder="Password">
					</div>
					<div class="footer">
						<span id="scope-info">Target: Global</span>
						<div style="display: flex; align-items: center;">
							<div id="dynamic-helper" title="Wrap selection as parameter">{ }</div>
							<div id="save-trigger" title="Save Command (Ctrl+Enter)">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
									<path d="M13.854 3.646L6 11.5L2.146 7.646L2.854 6.939L6 10.086L13.146 2.939L13.854 3.646Z" />
								</svg>
							</div>
						</div>
					</div>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					let currentContext = { stateType: 'Global', folderId: null, commandId: null, mode: 'command' };

					const updateHelperButton = () => {
						const type = document.getElementById('placeholder-type').value;
						const helper = document.getElementById('dynamic-helper');
						if (type === 'singleCurlyBraces') {
							helper.innerText = '{ }';
							helper.title = 'Wrap selection as parameter ({input})';
						} else if (type === 'doubleCurlyBraces') {
							helper.innerText = '{{ }}';
							helper.title = 'Wrap selection as parameter ({{input}})';
						} else if (type === 'singleAngleBraces') {
							helper.innerText = '< >';
							helper.title = 'Wrap selection as parameter (<input>)';
						} else if (type === 'doubleAngleBraces') {
							helper.innerText = '<< >>';
							helper.title = 'Wrap selection as parameter (<<input>>)';
						}
					};

					document.getElementById('placeholder-type').addEventListener('change', updateHelperButton);

					window.addEventListener('message', event => {
						const message = event.data;
						if (message.type === 'setContext') {
							currentContext = { 
								stateType: message.stateType, 
								folderId: message.folderId,
								commandId: message.commandId || null,
								mode: message.mode || 'command'
							};
							const isEdit = !!message.commandId;
							const container = document.querySelector('.container');
							
							if (currentContext.mode === 'ssh') {
								container.classList.remove('mode-command');
								container.classList.add('mode-ssh');
								
								document.getElementById('command-row').style.display = 'none';
								document.getElementById('placeholder-type-row').style.display = 'none';
								document.getElementById('dynamic-helper').style.display = 'none';
								document.querySelectorAll('.ssh-field').forEach(el => el.style.display = 'flex');
								
								document.getElementById('scope-info').innerText = isEdit ? 'Editing SSH in ' + message.stateType : 'Target SSH: ' + message.stateType;
								document.getElementById('save-trigger').title = isEdit ? 'Update SSH Connection (Ctrl+Enter)' : 'Save SSH Connection (Ctrl+Enter)';
								
								document.getElementById('name').value = message.name || '';
								document.getElementById('host').value = message.host || '';
								document.getElementById('port').value = message.port || '22';
								document.getElementById('username').value = message.username || '';
								document.getElementById('password').value = message.password || '';
								document.getElementById('name').placeholder = 'My Server';
							} else {
								container.classList.remove('mode-ssh');
								container.classList.add('mode-command');
								
								document.getElementById('command-row').style.display = 'block';
								document.getElementById('placeholder-type-row').style.display = 'flex';
								document.getElementById('dynamic-helper').style.display = 'flex';
								document.querySelectorAll('.ssh-field').forEach(el => el.style.display = 'none');
								
								document.getElementById('scope-info').innerText = isEdit ? 'Editing in ' + message.stateType : 'Target: ' + message.stateType;
								document.getElementById('save-trigger').title = isEdit ? 'Update Command (Ctrl+Enter)' : 'Save Command (Ctrl+Enter)';
								
								document.getElementById('name').value = message.name || '';
								document.getElementById('command').value = message.command || '';
								document.getElementById('placeholder-type').value = message.placeholderTypeId || 'singleCurlyBraces';
								document.getElementById('name').placeholder = 'My Script';
								
								updateHelperButton();
							}
							document.getElementById('name').focus();
						}
					});

					const submit = () => {
						const name = document.getElementById('name').value;
						if (currentContext.mode === 'ssh') {
							const host = document.getElementById('host').value;
							const port = parseInt(document.getElementById('port').value, 10) || 22;
							const username = document.getElementById('username').value;
							const password = document.getElementById('password').value;
							if (name && host && username) {
								vscode.postMessage({
									type: 'saveSsh',
									value: { name, host, port, username, password, ...currentContext }
								});
								clearForm();
							}
						} else {
							const command = document.getElementById('command').value;
							const placeholderTypeId = document.getElementById('placeholder-type').value;
							if (name && command) {
								vscode.postMessage({
									type: 'save',
									value: { name, command, placeholderTypeId, ...currentContext }
								});
								clearForm();
							}
						}
					};

					const clearForm = () => {
						document.getElementById('name').value = '';
						document.getElementById('command').value = '';
						document.getElementById('host').value = '';
						document.getElementById('port').value = '22';
						document.getElementById('username').value = '';
						document.getElementById('password').value = '';
						currentContext.commandId = null; 
					};

					// Dynamic Helper Logic
					document.getElementById('dynamic-helper').addEventListener('click', () => {
						const cmdInput = document.getElementById('command');
						const start = cmdInput.selectionStart;
						const end = cmdInput.selectionEnd;
						const text = cmdInput.value;
						const selected = text.substring(start, end).trim();
						
						const type = document.getElementById('placeholder-type').value;
						let replacement = '';
						if (type === 'singleCurlyBraces') {
							replacement = '{input:' + selected + '}';
						} else if (type === 'doubleCurlyBraces') {
							replacement = '{{input:' + selected + '}}';
						} else if (type === 'singleAngleBraces') {
							replacement = '<input:' + selected + '>';
						} else if (type === 'doubleAngleBraces') {
							replacement = '<<input:' + selected + '>>';
						}
						
						const newText = text.substring(0, start) + replacement + text.substring(end);
						
						cmdInput.value = newText;
						cmdInput.focus();
						const newCursorPos = start + replacement.length;
						cmdInput.setSelectionRange(newCursorPos, newCursorPos);
					});

					document.getElementById('save-trigger').addEventListener('click', submit);
					
					document.body.addEventListener('keydown', (e) => {
						if (e.key === 'Enter' && e.target.id === 'name') {
							e.preventDefault();
							document.getElementById('command').focus();
						}
						if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
							submit();
						}
					});
				</script>
			</body>
			</html>`;
	}
}
