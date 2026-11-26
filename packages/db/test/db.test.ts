import { describe, expect, it } from 'vitest';
import {
  apiDefinitions,
  createDatabase,
  environmentScenarios,
  environments,
  projectMembers,
  projects,
  requestLogs,
  responseScenarios,
  users,
} from '../src/index.js';

describe('@mockflow/db', () => {
  it('exports all Drizzle schema tables and createDatabase helper', () => {
    expect(users).toBeDefined();
    expect(projects).toBeDefined();
    expect(projectMembers).toBeDefined();
    expect(apiDefinitions).toBeDefined();
    expect(responseScenarios).toBeDefined();
    expect(environments).toBeDefined();
    expect(environmentScenarios).toBeDefined();
    expect(requestLogs).toBeDefined();
    expect(typeof createDatabase).toBe('function');
  });
});
