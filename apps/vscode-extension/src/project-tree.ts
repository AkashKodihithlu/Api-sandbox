import * as vscode from 'vscode';
import { AuthenticationService } from './auth.js';
import {
  ControlPlaneClient,
  ControlPlaneError,
  type ApiDefinitionSummary,
  type EnvironmentSummary,
  type ProjectSummary,
  type ScenarioSummary,
} from './client.js';
import { ProjectSelectionService } from './project-state.js';

type NodeKind = 'project' | 'api' | 'environment' | 'scenario' | 'message';

export class MockFlowTreeItem extends vscode.TreeItem {
  constructor(
    readonly kind: NodeKind,
    readonly label: string,
    readonly value?: ProjectSummary | ApiDefinitionSummary | EnvironmentSummary | ScenarioSummary,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
    readonly project?: ProjectSummary,
  ) {
    super(label, collapsibleState);
  }
}

export class MockFlowTreeProvider implements vscode.TreeDataProvider<MockFlowTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    MockFlowTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly authentication: AuthenticationService,
    private readonly createClient: () => ControlPlaneClient,
    private readonly projectSelection: ProjectSelectionService,
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: MockFlowTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MockFlowTreeItem): Promise<MockFlowTreeItem[]> {
    if (element) return this.getChildNodes(element);
    if (!(await this.authentication.getToken())) {
      const item = new MockFlowTreeItem('message', 'Sign in to view MockFlow projects.');
      item.command = { command: 'mockflow.signIn', title: 'Sign In' };
      return [item];
    }

    try {
      const projects = await this.createClient().listProjects();
      if (projects.length === 0)
        return [new MockFlowTreeItem('message', 'No MockFlow projects found.')];

      const selectedId = this.projectSelection.getCurrentProjectId();
      return projects.map((project) => {
        const item = new MockFlowTreeItem(
          'project',
          project.name,
          project,
          project.id === selectedId
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = project.id === selectedId ? 'current project' : project.slug;
        item.tooltip = `${project.name} (${project.role.toLowerCase()})`;
        item.contextValue = 'mockflow.project';
        item.command = {
          command: 'mockflow.selectProject',
          title: 'Select Project',
          arguments: [project],
        };
        return item;
      });
    } catch (error) {
      return [this.errorItem(error)];
    }
  }

  private async getChildNodes(element: MockFlowTreeItem): Promise<MockFlowTreeItem[]> {
    try {
      if (element.kind === 'project') {
        const project = element.value as ProjectSummary;
        const [apis, environments] = await Promise.all([
          this.createClient().listApis(project.id),
          this.createClient().listEnvironments(project.id),
        ]);
        const apiNodes = apis.map((api) => {
          const item = new MockFlowTreeItem(
            'api',
            `${api.method} ${api.path}`,
            api,
            vscode.TreeItemCollapsibleState.Collapsed,
            project,
          );
          item.description = api.isPublished ? 'published' : 'draft';
          item.tooltip = api.name;
          item.contextValue = api.isPublished ? 'mockflow.api.published' : 'mockflow.api.draft';
          return item;
        });
        const environmentNodes = environments.map((environment) => {
          const item = new MockFlowTreeItem(
            'environment',
            `Environment: ${environment.name}`,
            environment,
          );
          item.contextValue = 'mockflow.environment';
          return item;
        });
        return [...apiNodes, ...environmentNodes];
      }

      if (element.kind === 'api') {
        const api = element.value as ApiDefinitionSummary;
        const scenarios = await this.createClient().listScenarios(api.id);
        if (scenarios.length === 0)
          return [new MockFlowTreeItem('message', 'No scenarios configured.')];
        return scenarios.map((scenario) => {
          const item = new MockFlowTreeItem('scenario', scenario.name, scenario);
          item.description = `${scenario.statusCode}${scenario.isDefault ? ' · default' : ''}`;
          item.contextValue = 'mockflow.scenario';
          return item;
        });
      }
      return [];
    } catch (error) {
      return [this.errorItem(error)];
    }
  }

  private errorItem(error: unknown): MockFlowTreeItem {
    const message =
      error instanceof ControlPlaneError ? error.message : 'Could not load MockFlow data.';
    const item = new MockFlowTreeItem('message', message);
    item.command = { command: 'mockflow.refresh', title: 'Refresh' };
    return item;
  }
}
