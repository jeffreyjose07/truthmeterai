import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'aiMetrics.showDashboard';
    }

    show() {
        this.statusBarItem.text = '$(graph) AI Metrics';
        this.statusBarItem.tooltip = 'Click to view AI Metrics Dashboard';
        this.statusBarItem.show();
    }

    update(stats: any) {
        const { recentSuggestions, recentAcceptance } = stats;

        if (recentSuggestions > 0) {
            this.statusBarItem.text = `$(graph) AI: ${recentSuggestions} suggestions`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = '$(graph) AI Metrics';
            this.statusBarItem.backgroundColor = undefined;
        }
    }

    updateWithWarning(message: string) {
        this.statusBarItem.text = `$(alert) ${message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    dispose() {
        this.statusBarItem.dispose();
    }
}
