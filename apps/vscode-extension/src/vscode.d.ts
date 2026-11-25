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
  }

  export const workspace: {
    getConfiguration(section?: string): {
      get<T>(section: string, defaultValue?: T): T;
    };
  };

  export const window: {
    showInputBox(options?: {
      prompt?: string;
      password?: boolean;
      ignoreFocusOut?: boolean;
      validateInput?: (value: string) => string | undefined;
    }): Promise<string | undefined>;
    showInformationMessage(message: string): Promise<unknown>;
    showErrorMessage(message: string): Promise<unknown>;
  };

  export const commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
  };
}
