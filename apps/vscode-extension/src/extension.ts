import * as vscode from 'vscode';
import { validateRequestSchemaDefinition } from '@mockflow/contracts';
import { AuthenticationService } from './auth.js';
import {
  ControlPlaneClient,
  ControlPlaneError,
  type ApiDefinitionSummary,
  type ProjectSummary,
} from './client.js';
import { DiscoveryReviewService } from './discovery-review.js';
import { DiscoveryTreeProvider } from './discovery-tree.js';
import {
  buildApiDefinitionDraft,
  createDraftFromDiscovery,
  detectApiConflict,
  parseAndValidateScenarioInput,
} from './draft-builder.js';
import { ProjectSelectionService } from './project-state.js';
import { MockFlowTreeItem, MockFlowTreeProvider } from './project-tree.js';
import {
  buildHostedEndpointUrl,
  RuntimeTestError,
  testPublishedEndpoint,
} from './runtime-tester.js';

function createClient(authentication: AuthenticationService): ControlPlaneClient {
  const configuredUrl = vscode.workspace
    .getConfiguration('mockflow')
    .get<string>('controlApiBaseUrl', 'http://localhost:4000');
  return new ControlPlaneClient(configuredUrl, () => authentication.getToken());
}

function getRuntimeBaseUrl(): string {
  return vscode.workspace
    .getConfiguration('mockflow')
    .get<string>('runtimeBaseUrl', 'http://localhost:4001');
}

async function resolveProjectAndApi(
  client: ControlPlaneClient,
  projectSelection: ProjectSelectionService,
  item?: MockFlowTreeItem,
): Promise<{ project: ProjectSummary; api: ApiDefinitionSummary } | undefined> {
  if (item?.kind === 'api' && item.value && item.project) {
    return { project: item.project, api: item.value as ApiDefinitionSummary };
  }

  const projects = await client.listProjects();
  if (projects.length === 0) {
    void vscode.window.showWarningMessage('Create or select a MockFlow project first.');
    return undefined;
  }

  const selectedId = projectSelection.getCurrentProjectId();
  let project = projects.find((entry) => entry.id === selectedId);
  if (!project) {
    project = await vscode.window
      .showQuickPick(
        projects.map((entry) => ({ label: entry.name, description: entry.slug, project: entry })),
        { placeHolder: 'Select a MockFlow project' },
      )
      .then((choice) => choice?.project);
  }
  if (!project) return undefined;

  const apis = await client.listApis(project.id);
  if (apis.length === 0) {
    void vscode.window.showInformationMessage('No API definitions found in this project.');
    return undefined;
  }

  const api = await vscode.window
    .showQuickPick(
      apis.map((entry) => ({
        label: `${entry.method} ${entry.path}`,
        description: entry.isPublished ? 'published' : 'draft',
        api: entry,
      })),
      { placeHolder: 'Select an API definition' },
    )
    .then((choice) => choice?.api);

  return api ? { project, api } : undefined;
}

async function configureApiWorkflow(
  client: ControlPlaneClient,
  tree: MockFlowTreeProvider,
  api: ApiDefinitionSummary,
): Promise<void> {
  const action = await vscode.window.showQuickPick(
    [
      { label: 'Add response scenario', value: 'add-scenario' },
      { label: 'Edit existing scenario', value: 'edit-scenario' },
      { label: 'Edit request JSON Schema', value: 'edit-schema' },
    ],
    { placeHolder: `Configure ${api.method} ${api.path}` },
  );
  if (!action) return;

  if (action.value === 'edit-schema') {
    const rawSchema = await vscode.window.showInputBox({
      prompt: 'Request JSON Schema (leave blank to clear)',
      value: api.requestSchema ? JSON.stringify(api.requestSchema) : '',
      ignoreFocusOut: true,
    });
    if (rawSchema === undefined) return;
    let parsedSchema: Record<string, unknown> | null = null;
    if (rawSchema.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawSchema);
      } catch {
        void vscode.window.showErrorMessage('Request schema must be valid JSON.');
        return;
      }
      const issues = validateRequestSchemaDefinition(parsed);
      if (issues.length > 0) {
        void vscode.window.showErrorMessage(issues[0]?.message ?? 'Invalid request schema.');
        return;
      }
      parsedSchema = parsed as Record<string, unknown>;
    }
    await client.updateApi(api.id, { requestSchema: parsedSchema });
    tree.refresh();
    void vscode.window.showInformationMessage(
      `Updated request schema for ${api.method} ${api.path}.`,
    );
    return;
  }

  if (action.value === 'add-scenario') {
    const name = await vscode.window.showInputBox({
      prompt: 'Scenario name',
      value: 'Custom Scenario',
      ignoreFocusOut: true,
    });
    if (!name) return;
    const statusRaw = await vscode.window.showInputBox({
      prompt: 'HTTP status code (100-599)',
      value: '200',
      ignoreFocusOut: true,
    });
    if (!statusRaw) return;
    const headersJson = await vscode.window.showInputBox({
      prompt: 'Response headers as JSON object',
      value: '{}',
      ignoreFocusOut: true,
    });
    if (headersJson === undefined) return;
    const bodyJson = await vscode.window.showInputBox({
      prompt: 'Response body as JSON (leave blank for empty body)',
      value: '{"ok":true}',
      ignoreFocusOut: true,
    });
    if (bodyJson === undefined) return;
    const delayRaw = await vscode.window.showInputBox({
      prompt: 'Artificial delay in ms (0-10000)',
      value: '0',
      ignoreFocusOut: true,
    });
    if (delayRaw === undefined) return;

    const validated = parseAndValidateScenarioInput({
      name,
      statusCode: Number(statusRaw),
      headersJson,
      bodyJson,
      delayMs: Number(delayRaw),
      isDefault: false,
    });
    if (!validated.ok) {
      void vscode.window.showErrorMessage(validated.message);
      return;
    }
    await client.createScenario(api.id, validated.scenario);
    tree.refresh();
    void vscode.window.showInformationMessage(`Added scenario "${validated.scenario.name}".`);
    return;
  }

  const scenarios = await client.listScenarios(api.id);
  if (scenarios.length === 0) {
    void vscode.window.showInformationMessage('No scenarios exist yet. Add one first.');
    return;
  }

  const picked = await vscode.window
    .showQuickPick(
      scenarios.map((scenario) => ({
        label: scenario.name,
        description: `${scenario.statusCode}${scenario.isDefault ? ' · default' : ''}`,
        scenario,
      })),
      { placeHolder: 'Select scenario to edit' },
    )
    .then((choice) => choice?.scenario);
  if (!picked) return;

  const statusRaw = await vscode.window.showInputBox({
    prompt: 'HTTP status code (100-599)',
    value: String(picked.statusCode),
    ignoreFocusOut: true,
  });
  if (!statusRaw) return;
  const headersJson = await vscode.window.showInputBox({
    prompt: 'Response headers as JSON object',
    value: JSON.stringify(picked.headers ?? {}),
    ignoreFocusOut: true,
  });
  if (headersJson === undefined) return;
  const bodyJson = await vscode.window.showInputBox({
    prompt: 'Response body as JSON (leave blank for empty body)',
    value: picked.body === null || picked.body === undefined ? '' : JSON.stringify(picked.body),
    ignoreFocusOut: true,
  });
  if (bodyJson === undefined) return;
  const delayRaw = await vscode.window.showInputBox({
    prompt: 'Artificial delay in ms (0-10000)',
    value: String(picked.delayMs ?? 0),
    ignoreFocusOut: true,
  });
  if (delayRaw === undefined) return;

  const validated = parseAndValidateScenarioInput({
    name: picked.name,
    statusCode: Number(statusRaw),
    headersJson,
    bodyJson,
    delayMs: Number(delayRaw),
    isDefault: picked.isDefault,
  });
  if (!validated.ok) {
    void vscode.window.showErrorMessage(validated.message);
    return;
  }

  await client.updateScenario(picked.id, {
    statusCode: validated.scenario.statusCode,
    headers: validated.scenario.headers,
    body: validated.scenario.body,
    delayMs: validated.scenario.delayMs,
  });
  tree.refresh();
  void vscode.window.showInformationMessage(`Updated scenario "${picked.name}".`);
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
  const runtimeOutput = vscode.window.createOutputChannel('MockFlow Runtime');

  const publishApiFlow = async (project: ProjectSummary, api: ApiDefinitionSummary) => {
    const client = createClient(authentication);
    const scenarios = await client.listScenarios(api.id);
    if (scenarios.length === 0) {
      void vscode.window.showWarningMessage(
        'Add at least one response scenario before publishing this endpoint.',
      );
      return;
    }

    const hostedUrl = buildHostedEndpointUrl(getRuntimeBaseUrl(), project.slug, api.path);
    const confirmation = await vscode.window.showInformationMessage(
      `Publish ${api.method} ${api.path} to ${hostedUrl}?`,
      'Publish',
      'Cancel',
    );
    if (confirmation !== 'Publish') return;

    const updated = await client.updateApi(api.id, { isPublished: true });
    tree.refresh();
    const followUp = await vscode.window.showInformationMessage(
      `Published ${updated.method} ${updated.path} at ${hostedUrl}`,
      'Copy URL',
      'Test Request',
    );
    if (followUp === 'Copy URL') {
      await vscode.env.clipboard.writeText(hostedUrl);
      void vscode.window.showInformationMessage('Copied hosted MockFlow URL to clipboard.');
    } else if (followUp === 'Test Request') {
      await testApiFlow(project, updated);
    }
  };

  const testApiFlow = async (project: ProjectSummary, api: ApiDefinitionSummary) => {
    if (!api.isPublished) {
      void vscode.window.showWarningMessage(
        'Publish this endpoint before testing it against the hosted runtime.',
      );
      return;
    }

    let requestBody: unknown;
    if (['POST', 'PUT', 'PATCH'].includes(api.method.toUpperCase())) {
      const rawBody = await vscode.window.showInputBox({
        prompt: 'Optional JSON request body (leave blank for none)',
        value: '',
        ignoreFocusOut: true,
      });
      if (rawBody === undefined) return;
      if (rawBody.trim().length > 0) {
        try {
          requestBody = JSON.parse(rawBody);
        } catch {
          void vscode.window.showErrorMessage('Request body must be valid JSON.');
          return;
        }
      }
    }

    const scenarioName = await vscode.window.showInputBox({
      prompt: 'Optional scenario name override (leave blank for default)',
      value: '',
      ignoreFocusOut: true,
    });
    if (scenarioName === undefined) return;

    const result = await testPublishedEndpoint({
      runtimeBaseUrl: getRuntimeBaseUrl(),
      projectSlug: project.slug,
      method: api.method,
      path: api.path,
      body: requestBody,
      scenarioName,
    });

    runtimeOutput.appendLine(
      `[${new Date().toISOString()}] ${api.method} ${result.url} -> ${result.statusCode} (${result.durationMs} ms)`,
    );
    runtimeOutput.appendLine(`Headers: ${JSON.stringify(result.headers)}`);
    runtimeOutput.appendLine(`Body: ${result.bodyText || '<empty>'}`);
    runtimeOutput.appendLine('---');
    runtimeOutput.show(true);
  };

  context.subscriptions.push(
    runtimeOutput,
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
      const generated = createDraftFromDiscovery(group);

      const action = await vscode.window.showQuickPick(
        [
          {
            label: 'Create draft with suggested response',
            description: generated.suggestedScenario.suggestionLabel,
            value: 'create',
          },
          {
            label: 'Edit draft & suggested response before creating',
            description: 'Customize method, path, status, and JSON body',
            value: 'edit',
          },
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
      if (action.value === 'create' && (!generated.path || !generated.method)) {
        void vscode.window.showWarningMessage(
          'Uncertain or unsupported discoveries must be edited into a static route before creating a draft.',
        );
        return;
      }

      let method = generated.method ?? 'GET';
      let path = generated.path ?? '/';
      let statusCode = generated.suggestedScenario.statusCode;
      let bodyJson =
        generated.suggestedScenario.body === null
          ? ''
          : JSON.stringify(generated.suggestedScenario.body);

      if (action.value === 'edit') {
        const editedMethod = await vscode.window.showInputBox({
          prompt: 'HTTP method (GET, POST, PUT, PATCH, DELETE)',
          value: method,
          ignoreFocusOut: true,
        });
        if (!editedMethod) return;
        const editedPath = await vscode.window.showInputBox({
          prompt: 'API path (must start with /)',
          value: path,
          ignoreFocusOut: true,
        });
        if (!editedPath) return;
        const editedStatus = await vscode.window.showInputBox({
          prompt: `Default scenario status code (${generated.suggestedScenario.suggestionLabel})`,
          value: String(statusCode),
          ignoreFocusOut: true,
        });
        if (!editedStatus) return;
        const editedBody = await vscode.window.showInputBox({
          prompt: 'Default scenario JSON body (suggested placeholder; leave blank for empty)',
          value: bodyJson,
          ignoreFocusOut: true,
        });
        if (editedBody === undefined) return;

        method = editedMethod.toUpperCase() as typeof method;
        path = editedPath;
        statusCode = Number(editedStatus);
        bodyJson = editedBody;
      }

      const projectId = projectSelection.getCurrentProjectId();
      if (!projectId) {
        void vscode.window.showWarningMessage('Select a MockFlow project before creating a draft.');
        return;
      }

      const validatedDraft = buildApiDefinitionDraft({
        name: `${method} ${path}`,
        method,
        path,
        description: generated.description,
        requestSchema: generated.requestSchemaSuggestion?.value ?? undefined,
      });
      if (!validatedDraft.ok) {
        void vscode.window.showErrorMessage(validatedDraft.message);
        return;
      }

      const validatedScenario = parseAndValidateScenarioInput({
        name: generated.suggestedScenario.name,
        statusCode,
        headersJson: '{}',
        bodyJson,
        delayMs: 0,
        isDefault: true,
      });
      if (!validatedScenario.ok) {
        void vscode.window.showErrorMessage(validatedScenario.message);
        return;
      }

      try {
        const client = createClient(authentication);
        const existingApis = await client.listApis(projectId);
        const conflict = detectApiConflict(validatedDraft.draft, existingApis);
        if (conflict) {
          const choice = await vscode.window.showWarningMessage(
            `An API definition already exists for ${conflict.method} ${conflict.path} (${conflict.isPublished ? 'published' : 'draft'}).`,
            'Configure Existing',
            'Cancel',
          );
          if (choice === 'Configure Existing') {
            await configureApiWorkflow(client, tree, conflict);
          }
          return;
        }

        const createdApi = await client.createApi(projectId, validatedDraft.draft);
        await client.createScenario(createdApi.id, validatedScenario.scenario);
        tree.refresh();

        const nextStep = await vscode.window.showInformationMessage(
          `Created draft for ${createdApi.method} ${createdApi.path} (not published yet).`,
          'Edit Scenarios',
          'Publish',
        );
        if (nextStep === 'Edit Scenarios') {
          await configureApiWorkflow(client, tree, createdApi);
        } else if (nextStep === 'Publish') {
          const projects = await client.listProjects();
          const project = projects.find((entry) => entry.id === projectId);
          if (project) {
            await publishApiFlow(project, createdApi);
          }
        }
      } catch (error) {
        const message =
          error instanceof ControlPlaneError ? error.message : 'Could not create the API draft.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.configureApi', async (item?: MockFlowTreeItem) => {
      try {
        const client = createClient(authentication);
        const resolved = await resolveProjectAndApi(client, projectSelection, item);
        if (!resolved) return;
        await configureApiWorkflow(client, tree, resolved.api);
      } catch (error) {
        const message =
          error instanceof ControlPlaneError
            ? error.message
            : 'Could not update the API definition.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.publishApi', async (item?: MockFlowTreeItem) => {
      try {
        const client = createClient(authentication);
        const resolved = await resolveProjectAndApi(client, projectSelection, item);
        if (!resolved) return;
        await publishApiFlow(resolved.project, resolved.api);
      } catch (error) {
        const message =
          error instanceof ControlPlaneError ? error.message : 'Could not publish the endpoint.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.unpublishApi', async (item?: MockFlowTreeItem) => {
      try {
        const client = createClient(authentication);
        const resolved = await resolveProjectAndApi(client, projectSelection, item);
        if (!resolved) return;
        const confirm = await vscode.window.showInformationMessage(
          `Unpublish ${resolved.api.method} ${resolved.api.path}? It will stop serving runtime traffic.`,
          'Unpublish',
          'Cancel',
        );
        if (confirm !== 'Unpublish') return;
        await client.updateApi(resolved.api.id, { isPublished: false });
        tree.refresh();
        void vscode.window.showInformationMessage(
          `Unpublished ${resolved.api.method} ${resolved.api.path}.`,
        );
      } catch (error) {
        const message =
          error instanceof ControlPlaneError ? error.message : 'Could not unpublish the endpoint.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.copyEndpointUrl', async (item?: MockFlowTreeItem) => {
      try {
        const client = createClient(authentication);
        const resolved = await resolveProjectAndApi(client, projectSelection, item);
        if (!resolved) return;
        const url = buildHostedEndpointUrl(
          getRuntimeBaseUrl(),
          resolved.project.slug,
          resolved.api.path,
        );
        await vscode.env.clipboard.writeText(url);
        void vscode.window.showInformationMessage(`Copied hosted URL: ${url}`);
      } catch (error) {
        const message =
          error instanceof ControlPlaneError ? error.message : 'Could not copy hosted URL.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('mockflow.testEndpoint', async (item?: MockFlowTreeItem) => {
      try {
        const client = createClient(authentication);
        const resolved = await resolveProjectAndApi(client, projectSelection, item);
        if (!resolved) return;
        await testApiFlow(resolved.project, resolved.api);
      } catch (error) {
        const message =
          error instanceof RuntimeTestError || error instanceof ControlPlaneError
            ? error.message
            : 'Could not test the published endpoint.';
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.window.registerTreeDataProvider('mockflow.discovery', discoveryTree),
  );
}

export function deactivate(): void {}
