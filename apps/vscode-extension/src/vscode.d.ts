declare module 'vscode' {
  export interface Disposable {
    dispose(): unknown;
  }

  export interface SecretStorage {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
    delete(key: string): PromiseLike<void>;
  }

  export interface ExtensionContext {
    secrets: SecretStorage;
    subscriptions: { push(...items: Disposable[]): number };
    workspaceState: Memento;
  }

  export interface Uri { fsPath: string }

  export interface Memento {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): PromiseLike<void>;
  }

  export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
  }

  export class TreeItem {
    constructor(label: string, collapsibleState?: TreeItemCollapsibleState);
    description?: string;
    tooltip?: string;
    contextValue?: string;
    command?: { command: string; title: string; arguments?: unknown[] };
  }

  export interface TreeDataProvider<T> {
    onDidChangeTreeData?: Event<T | undefined | void>;
    getTreeItem(element: T): TreeItem;
    getChildren(element?: T): T[] | PromiseLike<T[]>;
  }

  export interface Event<T> {
    (listener: (event: T) => unknown): Disposable;
  }

  export class EventEmitter<T> implements Disposable {
    readonly event: Event<T>;
    fire(data?: T): void;
    dispose(): void;
  }

  export const workspace: {
    workspaceFolders: readonly { uri: Uri }[] | undefined;
    getConfiguration(section?: string): {
      get<T>(section: string, defaultValue?: T): T;
    };
  };

  export const window: {
    showInputBox(options?: {
      prompt?: string;
      value?: string;
      password?: boolean;
      ignoreFocusOut?: boolean;
      validateInput?: (value: string) => string | undefined;
    }): Promise<string | undefined>;
    showQuickPick<T extends { label: string }>(items: readonly T[], options?: { placeHolder?: string }): Promise<T | undefined>;
    showInformationMessage(message: string): Promise<unknown>;
    showErrorMessage(message: string): Promise<unknown>;
    showWarningMessage(message: string): Promise<unknown>;
    registerTreeDataProvider<T>(viewId: string, treeDataProvider: TreeDataProvider<T>): Disposable;
  };

  export const commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
  };
}
