/* eslint-disable @typescript-eslint/no-var-requires */
import { mockVscode } from './mocks/vscode.mock';

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(this: any, path: string, ...args: any[]) {
    if (path === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, [path, ...args]);
};
