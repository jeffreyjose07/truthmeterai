import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise<void>((resolve, reject) => {
        try {
            // Recursively find all test files
            const files = findTestFiles(testsRoot);

            // Add files to the test suite
            files.forEach((f: string) => mocha.addFile(f));

            // Run the mocha test
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}

function findTestFiles(dir: string): string[] {
    const results: string[] = [];

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results.push(...findTestFiles(filePath));
        } else if (file.endsWith('.test.js')) {
            results.push(filePath);
        }
    }

    return results;
}
