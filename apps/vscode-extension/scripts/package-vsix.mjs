import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extRoot, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8'));

const distEntry = path.join(extRoot, 'dist', 'extension.js');
if (!fs.existsSync(distEntry)) {
  throw new Error('dist/extension.js not found. Run "bun run build" in apps/vscode-extension first.');
}

const outDir = path.join(repoRoot, 'apps', 'web', 'public', 'downloads');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `mockflow-vscode-extension-${pkg.version}.vsix`);

const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockflow-vsix-'));
try {
  fs.mkdirSync(path.join(stageDir, 'dist'), { recursive: true });
  fs.copyFileSync(distEntry, path.join(stageDir, 'dist', 'extension.js'));

  const vsixManifest = {
    name: 'mockflow-vscode-extension',
    displayName: 'MockFlow',
    description:
      'Discover workspace APIs, configure mock scenarios, publish endpoints, and run live runtime checks from VS Code.',
    version: pkg.version,
    publisher: 'mockflow',
    license: 'MIT',
    engines: pkg.engines,
    categories: ['Other'],
    main: pkg.main,
    activationEvents: pkg.activationEvents,
    contributes: pkg.contributes,
  };

  fs.writeFileSync(
    path.join(stageDir, 'package.json'),
    JSON.stringify(vsixManifest, null, 2) + '\n',
    'utf8',
  );

  fs.writeFileSync(
    path.join(stageDir, 'README.md'),
    [
      '# MockFlow for VS Code',
      '',
      'Connects VS Code to your MockFlow control-plane (`http://localhost:4000`) and mock runtime (`http://localhost:4001`).',
      '',
      '## Features',
      '- **Projects & API Discovery** tree views in the Activity Bar',
      '- **Workspace API scanning** (`MockFlow: Scan Workspace for APIs`)',
      '- **Scenario & schema editing** (`MockFlow: Edit Endpoint & Scenarios`)',
      '- **Publish / Unpublish** and **Test Published Endpoint** commands',
      '',
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(path.join(stageDir, '.vscodeignore'), '*.map\n', 'utf8');

  const cmd = process.platform === 'win32' ? 'bun.exe' : 'bun';
  execFileSync(
    cmd,
    [
      'x',
      '@vscode/vsce',
      'package',
      '--no-dependencies',
      '--allow-missing-repository',
      '--skip-license',
      '-o',
      outFile,
    ],
    { cwd: stageDir, stdio: 'inherit' },
  );

  console.log(`Created VSIX: ${outFile}`);
} finally {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
