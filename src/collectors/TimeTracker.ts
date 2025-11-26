import * as vscode from 'vscode';
import { LocalStorage } from '../storage/LocalStorage';

export class TimeTracker implements vscode.Disposable {
    private activeTime: number = 0;
    private lastActivity: number = Date.now();
    private isActive: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private disposables: vscode.Disposable[] = [];

    constructor(private storage: LocalStorage) {}

    startTracking() {
        // Track when user is actively coding
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.recordActivity();
            }),
            vscode.workspace.onDidChangeTextDocument(() => {
                this.recordActivity();
            }),
            vscode.window.onDidChangeWindowState((state) => {
                if (state.focused) {
                    this.recordActivity();
                } else {
                    this.recordInactivity();
                }
            })
        );

        // Update active time every second
        this.intervalId = setInterval(() => {
            this.updateActiveTime();
        }, 1000);
    }

    private recordActivity() {
        const now = Date.now();
        const timeSinceLastActivity = now - this.lastActivity;

        // If more than 5 minutes, it's a new session
        if (timeSinceLastActivity > 300000) {
            this.storage.store('time_sessions', {
                start: this.lastActivity,
                end: now,
                duration: this.activeTime
            });
            this.activeTime = 0;
        }

        this.isActive = true;
        this.lastActivity = now;
    }

    private recordInactivity() {
        this.isActive = false;
    }

    private updateActiveTime() {
        if (this.isActive) {
            const now = Date.now();
            const timeSinceLastActivity = now - this.lastActivity;

            // Only count as active if activity within last 60 seconds
            if (timeSinceLastActivity < 60000) {
                this.activeTime += 1000;
            } else {
                this.isActive = false;
            }
        }
    }

    async getMetrics() {
        const sessions = await this.storage.get('time_sessions') || [];

        const totalTime = sessions.reduce((sum: number, s: any) => sum + s.duration, 0);
        const totalSessions = sessions.length;

        return {
            totalActiveTime: totalTime / 1000 / 60, // minutes
            currentSessionTime: this.activeTime / 1000 / 60, // minutes
            totalSessions: totalSessions,
            averageSessionLength: totalSessions > 0 ? (totalTime / totalSessions) / 1000 / 60 : 0
        };
    }

    dispose() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
