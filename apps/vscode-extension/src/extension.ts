import * as vscode from 'vscode';
import { AuthenticationService } from './auth.js';
import { ControlPlaneClient, ControlPlaneError } from './client.js';

function createClient(authentication: AuthenticationService): ControlPlaneClient {
  const configuredUrl = vscode.workspace
    .getConfiguration('mockflow')
    .get<string>('controlApiBaseUrl', 'http://localhost:4000');
  return new ControlPlaneClient(configuredUrl, () => authentication.getToken());
}

export function activate(context: vscode.ExtensionContext): void {
  const authentication = new AuthenticationService(context.secrets);

  context.subscriptions.push(
    vscode.commands.registerCommand('mockflow.signIn', async () => {
      const email = await vscode.window.showInputBox({
        prompt: 'MockFlow email',
        ignoreFocusOut: true,
        validateInput: (value) => (value.includes('@') ? undefined : 'Enter a valid email address.'),
      });
      if (!email) return;
      const password = await vscode.window.showInputBox({
        prompt: 'MockFlow password',
        password: true,
        ignoreFocusOut: true,
      });
      if (!password) return;

      try {
        const user = await authentication.signIn(createClient(authentication), email, password);
        void vscode.window.showInformationMessage(`Signed in to MockFlow as ${user.email}.`);
      } catch (error) {
        const message = error instanceof ControlPlaneError ? error.message : 'Could not sign in to MockFlow.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.signOut', async () => {
      await authentication.signOut();
      void vscode.window.showInformationMessage('Signed out of MockFlow.');
    }),
  );
}

export function deactivate(): void {}
