import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';
import { FixtureRepo, buildScenario } from '../fixtureRepo';

async function main(): Promise<void> {
    const repo = new FixtureRepo();
    buildScenario(repo);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truthmeter-vscode-user-'));
    try {
        const code = await runTests({
            // Test against the oldest supported VS Code by default; set VSCODE_VERSION=stable to test the latest.
            version: process.env.VSCODE_VERSION || '1.90.0',
            extensionDevelopmentPath: path.resolve(__dirname, '../../../'),
            extensionTestsPath: path.resolve(__dirname, './suite'),
            launchArgs: [repo.root, '--disable-extensions', '--disable-workspace-trust', `--user-data-dir=${userDataDir}`],
            extensionTestsEnv: { TRUTHMETER_FIXTURE: repo.root },
        });
        process.exitCode = code;
    } catch (err) {
        console.error('E2E tests failed:', err);
        process.exitCode = 1;
    } finally {
        repo.dispose();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

void main();
