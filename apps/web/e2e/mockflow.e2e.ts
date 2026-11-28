import { expect, Page, test } from '@playwright/test';

const runId = Date.now().toString(36);
const testEmail = `qa-e2e-${runId}@example.test`;
const testPassword = `QaE2ePass!${runId}99`;
const projectName = `QA Sandbox ${runId}`;
const projectSlug = `qa-sandbox-${runId}`;
const updatedProjectName = `QA Sandbox Updated ${runId}`;

type ErrorTracker = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  unexpectedHttpErrors: string[];
  setExpectedStatuses: (statuses: number[]) => void;
  assertClean: () => void;
};

function attachErrorTracker(page: Page): ErrorTracker {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const unexpectedHttpErrors: string[] = [];
  let expectedStatuses = new Set<number>();

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Chromium logs "Failed to load resource: the server responded with a status of ..."
      // during intentional negative or offline-runtime tests; ignore only if status is expected.
      const match = /Failed to load resource: the server responded with a status of (\d{3})/.exec(
        text,
      );
      if (match && expectedStatuses.has(Number(match[1]))) {
        return;
      }
      consoleErrors.push(text);
    }
  });

  page.on('requestfailed', (req) => {
    const reason = req.failure()?.errorText ?? 'failed';
    if (reason === 'net::ERR_ABORTED') {
      return;
    }
    failedRequests.push(`${req.method()} ${req.url()} (${reason})`);
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400 && !expectedStatuses.has(status)) {
      unexpectedHttpErrors.push(`${status} ${res.request().method()} ${res.url()}`);
    }
  });

  return {
    pageErrors,
    consoleErrors,
    failedRequests,
    unexpectedHttpErrors,
    setExpectedStatuses: (statuses: number[]) => {
      expectedStatuses = new Set(statuses);
    },
    assertClean: () => {
      expect(pageErrors, `Page errors: ${pageErrors.join('; ')}`).toEqual([]);
      expect(consoleErrors, `Console errors: ${consoleErrors.join('; ')}`).toEqual([]);
      expect(failedRequests, `Failed requests: ${failedRequests.join('; ')}`).toEqual([]);
      expect(
        unexpectedHttpErrors,
        `Unexpected HTTP errors: ${unexpectedHttpErrors.join('; ')}`,
      ).toEqual([]);
    },
  };
}

test.describe.serial('MockFlow End-to-End Flow', () => {
  let projectCreated = false;
  let projectDeleted = false;

  test.afterAll(async () => {
    if (projectCreated && !projectDeleted) {
      // eslint-disable-next-line no-console
      console.warn(
        `[CLEANUP NOTICE] Temporary project "${projectName}" (${projectSlug}) for ${testEmail} may remain in database.`,
      );
    }
  });

  test('1. Landing page, dedicated public routes, theme toggle, and extension download', async ({ page }) => {
    const tracker = attachErrorTracker(page);
    await page.goto('/');

    await expect(
      page.getByRole('heading', {
        name: 'Ship frontend and integrations without waiting on a backend.',
      }),
    ).toBeVisible();

    const header = page.locator('header.public-header');
    await expect(header.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Capabilities' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Workflow' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'VS Code Extension' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Get started' })).toBeVisible();
    await expect(page.locator('footer.public-footer')).toBeVisible();

    await header.getByRole('link', { name: 'Capabilities' }).click();
    await expect(page).toHaveURL(/\/capabilities$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Everything built into MockFlow');

    await header.getByRole('link', { name: 'Workflow' }).click();
    await expect(page).toHaveURL(/\/workflow$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('From local route draft');

    await header.getByRole('link', { name: 'VS Code Extension' }).click();
    await expect(page).toHaveURL(/\/extension$/);
    await expect(page.getByText('MockFlow: Scan Workspace for APIs').first()).toBeVisible();
    const downloadLink = page.getByRole('link', { name: /Download \.vsix/i });
    await expect(downloadLink).toHaveAttribute(
      'href',
      '/downloads/mockflow-vscode-extension-0.1.0.vsix',
    );
    const vsixRes = await page.request.get('/downloads/mockflow-vscode-extension-0.1.0.vsix');
    expect(vsixRes.status()).toBe(200);

    await header.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);

    const themeSwitch = page.getByRole('switch', { name: 'Toggle theme' });
    const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    await themeSwitch.click();
    const toggledTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(toggledTheme).not.toBe(initialTheme);
    await themeSwitch.click();

    tracker.assertClean();
  });

  test('2. Signup validates inputs, toggles password visibility, and registers temporary account', async ({
    page,
  }) => {
    const tracker = attachErrorTracker(page);
    await page.goto('/');
    await page.locator('header.public-header').getByRole('link', { name: 'Get started' }).click();
    await expect(page).toHaveURL(/\/signup$/);

    // Empty submit validation
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.error[role="alert"]')).toContainText('Email is required.');

    // Short password (< 12 chars) validation
    await page.getByLabel('Email address').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill('shortpw');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.error[role="alert"]')).toContainText('at least 12 characters');

    // Password visibility toggle
    const passwordInput = page.getByLabel('Password', { exact: true });
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Register valid temporary account
    await page.getByLabel(/Display name/i).fill('QA E2E User');
    await passwordInput.fill(testPassword);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.locator('.account-copy strong')).toHaveText(testEmail);

    tracker.assertClean();
  });

  test('3. Logout, protected route redirect, invalid signin, valid signin, and refresh persistence', async ({
    page,
  }) => {
    const tracker = attachErrorTracker(page);
    await page.goto('/signin');
    await page.getByLabel('Email address').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    const firstProjectsLoaded = page.waitForResponse(
      (res) => res.url().includes('/control/v1/projects') && res.status() === 200,
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await firstProjectsLoaded;
    await expect(page.getByText('No projects yet')).toBeVisible();

    // Sign out
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/signin$/);

    // Protected route check while signed out
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin$/);

    // Invalid credentials (401 expected)
    tracker.setExpectedStatuses([401]);
    await page.getByLabel('Email address').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.error[role="alert"]')).toContainText(/incorrect|invalid/i);
    tracker.setExpectedStatuses([]);

    // Valid sign-in
    const secondProjectsLoaded = page.waitForResponse(
      (res) => res.url().includes('/control/v1/projects') && res.status() === 200,
    );
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await secondProjectsLoaded;
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    // Refresh persistence
    const reloadProjectsLoaded = page.waitForResponse(
      (res) => res.url().includes('/control/v1/projects') && res.status() === 200,
    );
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await reloadProjectsLoaded;
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.locator('.account-copy strong')).toHaveText(testEmail);

    tracker.assertClean();
  });

  test('4. Full Dashboard CRUD: Projects, APIs, Scenarios, Environments, Runtime Tester, History, Responsive & Cleanup', async ({
    page,
  }) => {
    const tracker = attachErrorTracker(page);

    // Sign in
    await page.goto('/signin');
    await page.getByLabel('Email address').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // --- Projects CRUD ---
    const newProjectForm = page.locator('section.form-panel', { hasText: 'New project' });
    await newProjectForm.getByLabel('Name').fill(projectName);
    await newProjectForm.getByLabel('Slug').fill(projectSlug);
    await newProjectForm.getByLabel(/Description/i).fill('Temporary QA project');
    await newProjectForm.getByRole('button', { name: 'Create project' }).click();

    const projectItem = page.locator('.project-item', { hasText: projectName });
    await expect(projectItem).toBeVisible();
    projectCreated = true;
    await expect(projectItem.locator('.row-description')).toHaveText('Temporary QA project');

    // Edit project & clear description
    await projectItem.getByRole('button', { name: 'Edit' }).click();
    const projectEditForm = projectItem.locator('form.inline-edit-form');
    await projectEditForm.getByLabel('Name').fill(updatedProjectName);
    await projectEditForm.getByLabel('Description').fill('');
    await projectEditForm.getByRole('button', { name: 'Save changes' }).click();

    const updatedProjectItem = page.locator('.project-item', { hasText: updatedProjectName });
    await expect(updatedProjectItem).toBeVisible();
    await expect(updatedProjectItem.locator('.row-description')).toHaveCount(0);

    // --- APIs & Scenarios ---
    await updatedProjectItem.getByRole('button', { name: 'Open APIs' }).click();
    await expect(page.getByRole('heading', { name: 'APIs' })).toBeVisible();

    const newApiForm = page.locator('#create-api');
    await newApiForm.getByLabel('Name').fill('Get Status');
    await newApiForm.getByLabel('Method').selectOption('GET');
    await newApiForm.getByLabel('Path').fill('/status');
    await newApiForm.getByLabel(/Description/i).fill('Health endpoint');
    await newApiForm.getByRole('button', { name: 'Create draft' }).click();

    const statusApiRow = page.locator('.project-item', { hasText: '/status' });
    await expect(statusApiRow).toBeVisible();

    // Edit API and clear description
    await statusApiRow.getByRole('button', { name: 'Edit' }).click();
    const apiEditForm = statusApiRow.locator('form.inline-edit-form');
    await apiEditForm.getByLabel('Name').fill('Get Health Status');
    await apiEditForm.getByLabel('Description').fill('');
    await apiEditForm.getByRole('button', { name: 'Save endpoint' }).click();
    await expect(statusApiRow).toContainText('Get Health Status');

    // Create second API
    await newApiForm.getByLabel('Name').fill('Create Item');
    await newApiForm.getByLabel('Method').selectOption('POST');
    await newApiForm.getByLabel('Path').fill('/items');
    await newApiForm.getByRole('button', { name: 'Create draft' }).click();
    const itemsApiRow = page.locator('.project-item', { hasText: '/items' });
    await expect(itemsApiRow).toBeVisible();

    // Select first API (/status), create scenario, edit scenario, publish
    await statusApiRow.locator('button.api-select').click();
    await expect(page.getByRole('heading', { name: /Scenarios for GET \/status/i })).toBeVisible();

    const addScenarioForm = page.locator('section.form-panel', { hasText: 'Add scenario' });
    await addScenarioForm.getByLabel('Name').fill('Default 200');
    await addScenarioForm.getByLabel('Status code').fill('200');
    await addScenarioForm.getByLabel('Response JSON body').fill('{"ok": true, "service": "qa"}');
    await addScenarioForm.getByRole('button', { name: 'Save scenario' }).click();

    const scenarioItem = page.locator('.project-item', { hasText: 'Default 200' });
    await expect(scenarioItem).toBeVisible();

    // Edit scenario
    await scenarioItem.getByRole('button', { name: 'Edit' }).click();
    await scenarioItem.locator('form.inline-edit-form').getByLabel('Artificial delay (ms)').fill('25');
    await scenarioItem.locator('form.inline-edit-form').getByRole('button', { name: 'Save scenario' }).click();
    await expect(scenarioItem).toContainText('25 ms delay');

    // Open delete confirmation on /status scenario, then switch to /items -> verify no state leak
    await scenarioItem.getByRole('button', { name: 'Delete' }).click();
    await expect(scenarioItem.locator('.confirm-bar')).toBeVisible();

    await itemsApiRow.locator('button.api-select').click();
    await expect(page.getByRole('heading', { name: /Scenarios for POST \/items/i })).toBeVisible();
    await expect(page.locator('.confirm-bar')).toHaveCount(0);

    // Add scenario to /items and publish both APIs
    await addScenarioForm.getByLabel('Name').fill('Item Created');
    await addScenarioForm.getByLabel('Status code').fill('201');
    await addScenarioForm.getByLabel('Response JSON body').fill('{"created": true}');
    await addScenarioForm.getByRole('button', { name: 'Save scenario' }).click();
    await expect(page.locator('.project-item', { hasText: 'Item Created' })).toBeVisible();

    await statusApiRow.getByRole('button', { name: 'Publish' }).click();
    await expect(statusApiRow).toContainText('Published');
    await itemsApiRow.getByRole('button', { name: 'Publish' }).click();
    await expect(itemsApiRow).toContainText('Published');

    // --- Environments & Override ---
    await page.locator('aside.sidebar').getByRole('button', { name: 'Environments' }).click();
    await expect(page.getByRole('heading', { name: 'Environments', level: 1 })).toBeVisible();

    const newEnvForm = page.locator('section.form-panel', { hasText: 'New environment' });
    await newEnvForm.getByLabel('Name').fill('Staging');
    await newEnvForm.getByRole('button', { name: 'Create environment' }).click();

    const envItem = page.locator('.project-item', { hasText: 'Staging' });
    await expect(envItem).toBeVisible();
    await envItem.getByRole('button', { name: 'Rename' }).click();
    await envItem.locator('form.inline-edit-form').getByLabel('Environment name').fill('QA Staging');
    await envItem.locator('form.inline-edit-form').getByRole('button', { name: 'Save name' }).click();
    await expect(page.locator('.project-item', { hasText: 'QA Staging' })).toBeVisible();

    // Assign override on /status
    await page.locator('aside.sidebar').getByRole('button', { name: 'APIs' }).click();
    await statusApiRow.locator('button.api-select').click();
    const overridePanel = page
      .locator('section.form-panel')
      .filter({ has: page.getByRole('heading', { name: 'Environment override' }) });
    await overridePanel.getByLabel('Environment').selectOption({ label: 'QA Staging' });
    await overridePanel.getByLabel('Scenario').selectOption({ label: 'Default 200 (200)' });
    await overridePanel.getByRole('button', { name: 'Assign environment override' }).click();
    await expect(page.locator('.notice')).toContainText('Environment scenario override saved.');

    // Assign override on /items
    await itemsApiRow.locator('button.api-select').click();
    await overridePanel.getByLabel('Environment').selectOption('QA Staging');
    await overridePanel.getByLabel('Scenario').selectOption({ label: 'Item Created (201)' });
    await overridePanel.getByRole('button', { name: 'Assign environment override' }).click();
    await expect(page.locator('.notice')).toContainText('Environment scenario override saved.');

    // Return to /status for the first runtime test
    await statusApiRow.locator('button.api-select').click();

    // --- Runtime Tester ---
    const testerPanel = page.locator('section.form-panel', { hasText: 'Runtime endpoint tester' });

    // Invalid JSON headers validation
    await testerPanel.getByLabel('Request headers (JSON)').fill('{invalid-json');
    await testerPanel.getByRole('button', { name: 'Send test request' }).click();
    await expect(testerPanel.locator('.error[role="alert"]')).toContainText('Invalid JSON in Headers');

    // Check if mock runtime server (:4001) is running
    const runtimeHealth = await page.request.get('/runtime/health').catch(() => null);
    const runtimeAvailable = runtimeHealth !== null && runtimeHealth.ok();

    await testerPanel
      .getByLabel('Request headers (JSON)')
      .fill('{\n  "accept": "application/json"\n}');
    await testerPanel.getByLabel(/Environment/i).selectOption('QA Staging');

    const resultPanel = testerPanel.locator('.runtime-result');
    if (runtimeAvailable) {
      await testerPanel.getByRole('button', { name: 'Send test request' }).click();
      await expect(resultPanel).toBeVisible();
      await expect(resultPanel).toContainText('200');
      await expect(resultPanel.locator('.runtime-pre')).toContainText('"service": "qa"');

      // Valid POST /items
      await itemsApiRow.locator('button.api-select').click();
      await testerPanel.getByLabel('Request body (JSON)').fill('{"name": "widget"}');
      await testerPanel.getByRole('button', { name: 'Send test request' }).click();
      await expect(resultPanel).toContainText('201');
      await expect(resultPanel.locator('.runtime-pre')).toContainText('"created": true');

      // Nonexistent path (404 expected)
      tracker.setExpectedStatuses([404]);
      await testerPanel.getByLabel('Runtime path').fill('/does-not-exist');
      await testerPanel.getByRole('button', { name: 'Send test request' }).click();
      await expect(resultPanel).toContainText('404');
      tracker.setExpectedStatuses([]);
    } else {
      // Runtime server (:4001) is not running; verify UI handles 500 proxy error gracefully
      tracker.setExpectedStatuses([500]);
      await testerPanel.getByRole('button', { name: 'Send test request' }).click();
      await expect(resultPanel).toBeVisible();
      await expect(resultPanel).toContainText('500');
      tracker.setExpectedStatuses([]);
    }

    // --- Request History ---
    await page.locator('aside.sidebar').getByRole('button', { name: 'Request history' }).click();
    await expect(page.getByRole('heading', { name: 'Request history', level: 1 })).toBeVisible();

    if (runtimeAvailable) {
      await expect(page.locator('.pagination')).toContainText('3 requests');
      await page.getByLabel('Filter by HTTP method').selectOption('GET');
      await page.getByRole('button', { name: 'Apply' }).click();
      await expect(page.locator('.pagination')).toContainText('1 request');
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.locator('.pagination')).toContainText('3 requests');

      await page.locator('.project-item').first().getByRole('button', { name: 'Details' }).click();
      await expect(page.locator('.history-details')).toContainText('Redacted request headers');
    } else {
      await expect(page.locator('.pagination')).toContainText('0 requests');
      await page.getByLabel('Filter by HTTP method').selectOption('GET');
      await page.getByRole('button', { name: 'Apply' }).click();
      await expect(page.getByText('No request history')).toBeVisible();
      await page.getByRole('button', { name: 'Clear' }).click();
    }

    // --- Responsive Checks ---
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasOverflow, `Horizontal overflow at ${viewport.width}x${viewport.height}`).toBe(false);
    }

    // Mobile drawer check at 375x812
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('aside.sidebar.sidebar-open')).toBeVisible();
    await page
      .getByRole('button', { name: 'Close navigation' })
      .click({ position: { x: 320, y: 200 } });
    await expect(page.locator('aside.sidebar.sidebar-open')).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 800 });

    // --- Cleanup ONLY our temporary test project ---
    await page.locator('aside.sidebar').getByRole('button', { name: 'Overview' }).click();
    const cleanupProject = page.locator('.project-item', { hasText: updatedProjectName });
    await cleanupProject.getByRole('button', { name: 'Delete' }).click();
    await cleanupProject.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(cleanupProject).toHaveCount(0);
    projectDeleted = true;

    tracker.assertClean();
  });
});
