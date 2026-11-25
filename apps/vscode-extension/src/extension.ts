import * as vscode from 'vscode';
import { AuthenticationService } from './auth.js';
import {
  ControlPlaneClient,
  ControlPlaneError,
  type ApiDefinitionDraft,
  type ProjectSummary,
} from './client.js';
import { ProjectSelectionService } from './project-state.js';
import { MockFlowTreeProvider } from './project-tree.js';
import { DiscoveryReviewService } from './discovery-review.js';
import { DiscoveryTreeProvider } from './discovery-tree.js';

function createClient(authentication: AuthenticationService): ControlPlaneClient {
  const configuredUrl = vscode.workspace
    .getConfiguration('mockflow')
    .get<string>('controlApiBaseUrl', 'http://localhost:4000');
  return new ControlPlaneClient(configuredUrl, () => authentication.getToken());
}

export function activate(context: vscode.ExtensionContext): void {
  const authentication = new AuthenticationService(context.secrets);
  const projectSelection = new ProjectSelectionService(context.workspaceState);
  const tree = new MockFlowTreeProvider(
    authentication,
    () => createClient(authentication),
    projectSelection,
  );
  const discoveryReview = new DiscoveryReviewService();
  const discoveryTree = new DiscoveryTreeProvider(discoveryReview);

  context.subscriptions.push(
    vscode.commands.registerCommand('mockflow.signIn', async () => {
      const email = await vscode.window.showInputBox({
        prompt: 'MockFlow email',
        ignoreFocusOut: true,
        validateInput: (value) =>
          value.includes('@') ? undefined : 'Enter a valid email address.',
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
        const message =
          error instanceof ControlPlaneError ? error.message : 'Could not sign in to MockFlow.';
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
          selection = await vscode.window
            .showQuickPick(
              projects.map((item) => ({ label: item.name, description: item.slug, project: item })),
              { placeHolder: 'Select a MockFlow project for this workspace' },
            )
            .then((item) => item?.project);
        }
        if (!selection) return;
        await projectSelection.selectProject(selection.id);
        tree.refresh();
        void vscode.window.showInformationMessage(`MockFlow project set to ${selection.name}.`);
      } catch (error) {
        const message =
          error instanceof ControlPlaneError ? error.message : 'Could not load MockFlow projects.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.refresh', () => tree.refresh()),
    vscode.window.registerTreeDataProvider('mockflow.projects', tree),
    vscode.commands.registerCommand('mockflow.scanWorkspace', async () => {
      const workspace = vscode.workspace.workspaceFolders?.[0];
      if (!workspace) {
        void vscode.window.showWarningMessage(
          'Open a workspace folder before scanning for API calls.',
        );
        return;
      }
      try {
        await discoveryReview.scan(workspace.uri.fsPath);
        discoveryTree.refresh();
        void vscode.window.showInformationMessage(
          `${discoveryReview.visibleGroups().length} API discovery group(s) found locally.`,
        );
      } catch {
        void vscode.window.showErrorMessage('Could not scan this workspace for API calls.');
      }
    }),
    vscode.commands.registerCommand('mockflow.ignoreDiscovery', (groupId: string) => {
      discoveryReview.ignore(groupId);
      discoveryTree.refresh();
    }),
    vscode.commands.registerCommand('mockflow.reviewDiscovery', async (groupId: string) => {
      const group = discoveryReview.find(groupId);
      if (!group) return;
      const action = await vscode.window.showQuickPick(
        [
          { label: 'Create draft', value: 'create' },
          { label: 'Edit before creating', value: 'edit' },
          { label: 'Ignore discovery', value: 'ignore' },
        ],
        { placeHolder: `${group.method} ${group.path ?? 'dynamic URL'}` },
      );
      if (!action) return;
      if (action.value === 'ignore') {
        discoveryReview.ignore(group.id);
        discoveryTree.refresh();
        return;
      }
      if (action.value === 'create' && (!group.path || group.certainty !== 'static')) {
        void vscode.window.showWarningMessage(
          'Dynamic discoveries must be edited into a static path before creating a draft.',
        );
        return;
      }
      let method = group.method;
      let path = group.path ?? '/';
      if (action.value === 'edit') {
        const editedMethod = await vscode.window.showInputBox({
          prompt: 'HTTP method',
          value: method,
        });
        const editedPath =
          editedMethod && (await vscode.window.showInputBox({ prompt: 'API path', value: path }));
        if (!editedMethod || !editedPath) return;
        method = editedMethod.toUpperCase() as typeof method;
        path = editedPath;
      }
      const projectId = projectSelection.getCurrentProjectId();
      if (!projectId) {
        void vscode.window.showWarningMessage('Select a MockFlow project before creating a draft.');
        return;
      }
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !path.startsWith('/')) {
        void vscode.window.showErrorMessage('Draft method or path is invalid.');
        return;
      }
      try {
        const draftMethod = method as ApiDefinitionDraft['method'];
        await createClient(authentication).createApi(projectId, {
          name: `${draftMethod} ${path}`,
          method: draftMethod,
          path,
        });
        tree.refresh();
        void vscode.window.showInformationMessage(`Created draft for ${draftMethod} ${path}.`);
      } catch (error) {
        const message =
          error instanceof ControlPlaneError ? error.message : 'Could not create the API draft.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.window.registerTreeDataProvider('mockflow.discovery', discoveryTree),
  );
}

export function deactivate(): void {}
