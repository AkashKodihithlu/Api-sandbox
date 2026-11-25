export const CURRENT_PROJECT_KEY = 'mockflow.currentProjectId';

export interface WorkspaceState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export class ProjectSelectionService {
  constructor(private readonly state: WorkspaceState) {}

  getCurrentProjectId(): string | undefined {
    return this.state.get<string>(CURRENT_PROJECT_KEY);
  }

  async selectProject(projectId: string): Promise<void> {
    await this.state.update(CURRENT_PROJECT_KEY, projectId);
  }

  async clearProject(): Promise<void> {
    await this.state.update(CURRENT_PROJECT_KEY, undefined);
  }
}
