import { describe, expect, it } from 'vitest';
import {
  CURRENT_PROJECT_KEY,
  ProjectSelectionService,
  type WorkspaceState,
} from '../src/project-state.js';

class MemoryWorkspaceState implements WorkspaceState {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }
  update(key: string, value: unknown) {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, value);
    return Promise.resolve();
  }
}

describe('ProjectSelectionService', () => {
  it('associates the selected project with the current workspace state', async () => {
    const state = new MemoryWorkspaceState();
    const projects = new ProjectSelectionService(state);

    await projects.selectProject('project-123');

    expect(projects.getCurrentProjectId()).toBe('project-123');
    expect(state.values.get(CURRENT_PROJECT_KEY)).toBe('project-123');
  });

  it('clears the workspace project on sign out', async () => {
    const projects = new ProjectSelectionService(new MemoryWorkspaceState());
    await projects.selectProject('project-123');
    await projects.clearProject();

    expect(projects.getCurrentProjectId()).toBeUndefined();
  });
});
