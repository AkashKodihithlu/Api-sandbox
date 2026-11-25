import * as vscode from 'vscode';
import { AuthenticationService } from './auth.js';
import { ControlPlaneClient, ControlPlaneError, type ProjectSummary } from './client.js';
import { ProjectSelectionService } from './project-state.js';
import { MockFlowTreeProvider } from './project-tree.js';

function createClient(authentication: AuthenticationService): ControlPlaneClient {
  const configuredUrl = vscode.workspace
    .getConfiguration('mockflow')
    .get<string>('controlApiBaseUrl', 'http://localhost:4000');
  return new ControlPlaneClient(configuredUrl, () => authentication.getToken());
}

export function activate(context: vscode.ExtensionContext): void {
  const authentication = new AuthenticationService(context.secrets);
  const projectSelection = new ProjectSelectionService(context.workspaceState);
  const tree = new MockFlowTreeProvider(authentication, () => createClient(authentication), projectSelection);

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
        tree.refresh();
        void vscode.window.showInformationMessage(`Signed in to MockFlow as ${user.email}.`);
      } catch (error) {
        const message = error instanceof ControlPlaneError ? error.message : 'Could not sign in to MockFlow.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.signOut', async () => {
      await authentication.signOut();
      await projectSelection.clearProject();
      tree.refresh();
      void vscode.window.showInformationMessage('Signed out of MockFlow.');
    }),
    vscode.commands.registerCommand('mockflow.selectProject', async (project?: ProjectSummary) => {
      try {
        let selection = project;
        if (!selection) {
          const projects = await createClient(authentication).listProjects();
          selection = await vscode.window.showQuickPick(
            projects.map((item) => ({ label: item.name, description: item.slug, project: item })),
            { placeHolder: 'Select a MockFlow project for this workspace' },
          ).then((item) => item?.project);
        }
        if (!selection) return;
        await projectSelection.selectProject(selection.id);
        tree.refresh();
        void vscode.window.showInformationMessage(`MockFlow project set to ${selection.name}.`);
      } catch (error) {
        const message = error instanceof ControlPlaneError ? error.message : 'Could not load MockFlow projects.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.refresh', () => tree.refresh()),
    vscode.window.registerTreeDataProvider('mockflow.projects', tree),
  );
}

export function deactivate(): void {}
