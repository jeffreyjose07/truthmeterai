import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('AI Metrics');
    }

    info(message: string) {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] INFO: ${message}`);
    }

    error(message: string, error?: any) {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ERROR: ${message}`);
        if (error) {
            this.outputChannel.appendLine(`Error details: ${JSON.stringify(error, null, 2)}`);
        }
    }

    warn(message: string) {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] WARN: ${message}`);
    }

    debug(message: string) {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] DEBUG: ${message}`);
    }

    show() {
        this.outputChannel.show();
    }

    dispose() {
        this.outputChannel.dispose();
    }
}
