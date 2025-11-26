import * as vscode from 'vscode';
import { LocalStorage } from '../storage/LocalStorage';

export class TimeTracker implements vscode.Disposable {
    private activeTime: number = 0;
    private flowTime: number = 0; // Time spent in "flow" state (current session)
    private currentStreak: number = 0; // Continuous active time
    private isFlowing: boolean = false; // Are we currently in flow?
    private contextSwitches: number = 0; // Track file switching
    private lastActivity: number = Date.now();
    private isActive: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private disposables: vscode.Disposable[] = [];

    constructor(private storage: LocalStorage) {}

    startTracking() {
        // Track when user is actively coding
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.contextSwitches++;
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
                duration: this.activeTime,
                flowDuration: this.flowTime,
                contextSwitches: this.contextSwitches
            });
            this.activeTime = 0;
            this.flowTime = 0;
            this.currentStreak = 0;
            this.isFlowing = false;
            this.contextSwitches = 0;
        }

        this.isActive = true;
        this.lastActivity = now;
    }

    private recordInactivity() {
        this.isActive = false;
        // Don't break flow immediately on window blur, but `updateActiveTime` will handle it
    }

    private updateActiveTime() {
        if (this.isActive) {
            const now = Date.now();
            const timeSinceLastActivity = now - this.lastActivity;

            // Only count as active if activity within last 60 seconds
            if (timeSinceLastActivity < 60000) {
                this.activeTime += 1000;
                this.currentStreak += 1000;

                // Flow state detection: > 15 minutes of continuous activity
                // (SPACE Framework - Efficiency)
                if (!this.isFlowing && this.currentStreak >= 900000) {
                    this.isFlowing = true;
                    this.flowTime += this.currentStreak; // Add the buildup time
                } else if (this.isFlowing) {
                    this.flowTime += 1000;
                }

            } else {
                this.isActive = false;
                this.currentStreak = 0;
                this.isFlowing = false;
            }
        } else {
            this.currentStreak = 0;
            this.isFlowing = false;
        }
    }

    async getMetrics() {
        const sessions = await this.storage.get('time_sessions') || [];

        const totalTime = sessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
        const totalFlow = sessions.reduce((sum: number, s: any) => sum + (s.flowDuration || 0), 0);
        const totalSwitches = sessions.reduce((sum: number, s: any) => sum + (s.contextSwitches || 0), 0);
        const totalSessions = sessions.length;

        const currentTotalTime = totalTime + this.activeTime;
        const currentTotalFlow = totalFlow + this.flowTime;
        const currentTotalSwitches = totalSwitches + this.contextSwitches;

        return {
            totalActiveTime: currentTotalTime / 1000 / 60, // minutes
            flowTime: currentTotalFlow / 1000 / 60, // minutes
            flowEfficiency: currentTotalTime > 0 ? currentTotalFlow / currentTotalTime : 0,
            contextSwitches: currentTotalSwitches,
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
