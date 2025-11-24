/**
 * Mock VS Code API for unit testing
 */

export class MockExtensionContext {
    subscriptions: any[] = [];
    extensionPath = '/mock/extension/path';
    globalState = new MockMemento();
    workspaceState = new MockMemento();

    asAbsolutePath(relativePath: string): string {
        return `/mock/extension/path/${relativePath}`;
    }
}

export class MockMemento {
    private storage = new Map<string, any>();

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get(key: string, defaultValue?: any): any {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }

    async update(key: string, value: any): Promise<void> {
        this.storage.set(key, value);
    }

    keys(): readonly string[] {
        return Array.from(this.storage.keys());
    }
}

export class MockOutputChannel {
    private output: string[] = [];

    append(value: string): void {
        this.output.push(value);
    }

    appendLine(value: string): void {
        this.output.push(value + '\n');
    }

    show(): void {}
    hide(): void {}
    dispose(): void {}

    getOutput(): string {
        return this.output.join('');
    }
}

export class MockStatusBarItem {
    text = '';
    tooltip = '';
    command?: string;
    backgroundColor?: any;

    show(): void {}
    hide(): void {}
    dispose(): void {}
}

export class MockTextDocument {
    constructor(
        public uri: any,
        public languageId: string,
        public lineCount: number,
        private content: string
    ) {}

    getText(): string {
        return this.content;
    }

    lineAt(line: number): any {
        const lines = this.content.split('\n');
        return {
            text: lines[line] || '',
            lineNumber: line
        };
    }
}

export class MockUri {
    constructor(public fsPath: string, public scheme: string = 'file') {}

    toString(): string {
        return this.fsPath;
    }

    static file(path: string): MockUri {
        return new MockUri(path);
    }

    static parse(value: string): MockUri {
        return new MockUri(value);
    }
}

export class MockWebviewPanel {
    webview = new MockWebview();
    viewType: string;
    title: string;
    visible = true;

    constructor(viewType: string, title: string) {
        this.viewType = viewType;
        this.title = title;
    }

    reveal(): void {}
    dispose(): void {}

    onDidDispose(callback: () => void): any {
        return { dispose: () => {} };
    }
}

export class MockWebview {
    html = '';
    private messageHandlers: Array<(message: any) => void> = [];

    postMessage(message: any): void {
        // Simulate message posting
    }

    onDidReceiveMessage(handler: (message: any) => void): any {
        this.messageHandlers.push(handler);
        return { dispose: () => {} };
    }

    asWebviewUri(uri: any): any {
        return uri;
    }
}

export const mockVscode = {
    window: {
        createOutputChannel: (name: string) => new MockOutputChannel(),
        createStatusBarItem: () => new MockStatusBarItem(),
        showInformationMessage: (message: string, ...items: string[]) => Promise.resolve(items[0]),
        showWarningMessage: (message: string, ...items: string[]) => Promise.resolve(items[0]),
        showErrorMessage: (message: string, ...items: string[]) => Promise.resolve(items[0]),
        createWebviewPanel: (viewType: string, title: string) => new MockWebviewPanel(viewType, title),
        activeTextEditor: undefined,
        onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
        onDidChangeWindowState: () => ({ dispose: () => {} })
    },
    workspace: {
        workspaceFolders: [],
        onDidChangeTextDocument: () => ({ dispose: () => {} }),
        onDidSaveTextDocument: () => ({ dispose: () => {} }),
        openTextDocument: (uri: any) => Promise.resolve(new MockTextDocument(uri, 'typescript', 100, '')),
        findFiles: () => Promise.resolve([]),
        fs: {
            stat: (uri: any) => Promise.resolve({
                type: 1,
                ctime: Date.now() - 86400000,
                mtime: Date.now() - 3600000,
                size: 1000
            })
        }
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: () => Promise.resolve()
    },
    languages: {
        registerInlineCompletionItemProvider: () => ({ dispose: () => {} })
    },
    Uri: MockUri,
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    ViewColumn: {
        One: 1,
        Two: 2,
        Three: 3
    },
    Position: class {
        constructor(public line: number, public character: number) {}
    },
    WorkspaceEdit: class {
        insert() {}
    },
    ThemeColor: class {
        constructor(public id: string) {}
    }
};
