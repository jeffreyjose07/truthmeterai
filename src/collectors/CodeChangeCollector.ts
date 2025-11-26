import * as vscode from 'vscode';
import { LocalStorage } from '../storage/LocalStorage';

export class CodeChangeCollector {
    private disposables: vscode.Disposable[] = [];
    private changeBuffer: any[] = [];
    private saveBuffer: any[] = [];
    private flushTimer: NodeJS.Timeout | undefined;
    private readonly FLUSH_INTERVAL = 30000; // 30 seconds
    private readonly MAX_BUFFER_SIZE = 100;

    constructor(private storage: LocalStorage) {}

    startTracking() {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                this.recordChange(event);
            }),
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.recordSave(document);
            })
        );
    }

    private recordChange(event: vscode.TextDocumentChangeEvent) {
        // Ignore changes to output window or logs
        if (event.document.uri.scheme === 'output' || event.document.uri.scheme === 'log') {
            return;
        }

        const change = {
            timestamp: Date.now(),
            uri: event.document.uri.toString(),
            languageId: event.document.languageId,
            changeCount: event.contentChanges.length,
            totalChars: event.contentChanges.reduce((sum, c) => sum + c.text.length, 0)
        };

        this.changeBuffer.push(change);
        this.checkFlush();
    }

    private recordSave(document: vscode.TextDocument) {
        const save = {
            timestamp: Date.now(),
            uri: document.uri.toString(),
            languageId: document.languageId,
            lineCount: document.lineCount
        };

        this.saveBuffer.push(save);
        this.checkFlush();
    }

    private checkFlush() {
        if (this.changeBuffer.length >= this.MAX_BUFFER_SIZE || this.saveBuffer.length >= this.MAX_BUFFER_SIZE) {
            this.flush();
        } else if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
        }
    }

    private async flush() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }

        if (this.changeBuffer.length > 0) {
            const changes = [...this.changeBuffer];
            this.changeBuffer = [];
            // Store efficiently - maybe aggregated or just batched
            await Promise.all(changes.map(c => this.storage.store('code_changes', c)));
        }

        if (this.saveBuffer.length > 0) {
            const saves = [...this.saveBuffer];
            this.saveBuffer = [];
            await Promise.all(saves.map(s => this.storage.store('code_saves', s)));
        }
    }

    async getMetrics() {
        // Combine stored data with unsaved buffer data for real-time accuracy
        const changes = (await this.storage.get('code_changes') || []).concat(this.changeBuffer);
        const saves = (await this.storage.get('code_saves') || []).concat(this.saveBuffer);

        return {
            totalChanges: changes.length,
            totalSaves: saves.length,
            changesPerSave: saves.length > 0 ? changes.length / saves.length : 0,
            mostEditedLanguage: this.getMostEditedLanguage(changes)
        };
    }

    private getMostEditedLanguage(changes: any[]): string {
        const languageCounts = new Map<string, number>();

        // Optimize: Sample last 1000 changes if array is huge
        const sample = changes.length > 1000 ? changes.slice(-1000) : changes;

        for (const change of sample) {
            const count = languageCounts.get(change.languageId) || 0;
            languageCounts.set(change.languageId, count + 1);
        }

        let maxLanguage = '';
        let maxCount = 0;

        for (const [lang, count] of languageCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                maxLanguage = lang;
            }
        }

        return maxLanguage;
    }

    dispose() {
        this.flush(); // Flush remaining data
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }
    }
}
