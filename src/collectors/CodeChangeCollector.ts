import * as vscode from 'vscode';
import { LocalStorage } from '../storage/LocalStorage';

export class CodeChangeCollector {
    private changes: any[] = [];

    constructor(private storage: LocalStorage) {}

    startTracking() {
        vscode.workspace.onDidChangeTextDocument((event) => {
            this.recordChange(event);
        });

        vscode.workspace.onDidSaveTextDocument((document) => {
            this.recordSave(document);
        });
    }

    private recordChange(event: vscode.TextDocumentChangeEvent) {
        const change = {
            timestamp: Date.now(),
            uri: event.document.uri.toString(),
            languageId: event.document.languageId,
            changeCount: event.contentChanges.length,
            totalChars: event.contentChanges.reduce((sum, c) => sum + c.text.length, 0)
        };

        this.changes.push(change);
        this.storage.store('code_changes', change);
    }

    private recordSave(document: vscode.TextDocument) {
        const save = {
            timestamp: Date.now(),
            uri: document.uri.toString(),
            languageId: document.languageId,
            lineCount: document.lineCount
        };

        this.storage.store('code_saves', save);
    }

    async getMetrics() {
        const changes = await this.storage.get('code_changes') || [];
        const saves = await this.storage.get('code_saves') || [];

        return {
            totalChanges: changes.length,
            totalSaves: saves.length,
            changesPerSave: saves.length > 0 ? changes.length / saves.length : 0,
            mostEditedLanguage: this.getMostEditedLanguage(changes)
        };
    }

    private getMostEditedLanguage(changes: any[]): string {
        const languageCounts = new Map<string, number>();

        for (const change of changes) {
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
}
