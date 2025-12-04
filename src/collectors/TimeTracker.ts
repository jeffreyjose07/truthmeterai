import * as vscode from 'vscode';
import { LocalStorage } from '../storage/LocalStorage';

export class TimeTracker implements vscode.Disposable {
    private activeTime: number = 0;
    private flowTime: number = 0; // Time spent in "flow" state (current session)
    private typingTime: number = 0; // Time spent actively typing
    private readingTime: number = 0; // Time spent reading/reviewing (active but not typing)
    private currentStreak: number = 0; // Continuous active time
    private isFlowing: boolean = false; // Are we currently in flow?
    private contextSwitches: number = 0; // Track file switching
    private lastActivity: number = Date.now();
    private lastKeystrokeTime: number = 0; // Last time user typed
    private isActive: boolean = false;
    
    // Flow State Tracking
    private flowStartTimestamp: number = 0;
    private currentFlowBlocks: Array<{ start: number; end: number }> = [];

    private intervalId: NodeJS.Timeout | null = null;
    private disposables: vscode.Disposable[] = [];

    constructor(private storage: LocalStorage) {}

    startTracking() {
        // Track when user is actively coding
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.contextSwitches++;
                this.recordActivity('focus');
            }),
            vscode.workspace.onDidChangeTextDocument(() => {
                this.recordActivity('typing');
            }),
            vscode.window.onDidChangeWindowState((state) => {
                if (state.focused) {
                    this.recordActivity('focus');
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

    private recordActivity(type: 'typing' | 'focus' = 'focus') {
        const now = Date.now();
        const timeSinceLastActivity = now - this.lastActivity;

        // If more than 5 minutes, it's a new session
        if (timeSinceLastActivity > 300000) {
            this.storage.store('time_sessions', {
                start: this.lastActivity,
                end: now,
                duration: this.activeTime,
                flowDuration: this.flowTime,
                typingDuration: this.typingTime,
                readingDuration: this.readingTime,
                contextSwitches: this.contextSwitches,
                flowBlocks: this.currentFlowBlocks // Store flow blocks
            });
            this.activeTime = 0;
            this.flowTime = 0;
            this.typingTime = 0;
            this.readingTime = 0;
            this.currentStreak = 0;
            this.isFlowing = false;
            this.contextSwitches = 0;
            this.currentFlowBlocks = [];
        }

        if (type === 'typing') {
            this.lastKeystrokeTime = now;
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

                // Distinguish Typing vs Reading
                // If last keystroke was < 5 seconds ago, consider it "Typing"
                // Otherwise, if active, consider it "Reading/Thinking"
                if (now - this.lastKeystrokeTime < 5000) {
                    this.typingTime += 1000;
                } else {
                    this.readingTime += 1000;
                }

                // Burnout warning: > 3 hours continuous streak (Phase 3 Feature)
                if (this.currentStreak === 10800000) { // 3 hours
                    const config = vscode.workspace.getConfiguration('aiMetrics');
                    if (config.get('enableBurnoutWarnings')) {
                        vscode.window.showWarningMessage(
                            "⚠️ Health Alert: You've been coding for 3 hours straight. Research shows error rates increase significantly after this point. Consider taking a break."
                        );
                    }
                }

                // Flow state detection: > 15 minutes of continuous activity
                // (SPACE Framework - Efficiency)
                if (!this.isFlowing && this.currentStreak >= 900000) {
                    this.isFlowing = true;
                    this.flowStartTimestamp = now - this.currentStreak; // Start time was 15 mins ago
                    this.flowTime += this.currentStreak; // Add the buildup time
                } else if (this.isFlowing) {
                    this.flowTime += 1000;
                }

            } else {
                // End flow if active
                if (this.isFlowing) {
                    this.currentFlowBlocks.push({
                        start: this.flowStartTimestamp,
                        end: Date.now() // Use current time as end
                    });
                }
                
                this.isActive = false;
                this.currentStreak = 0;
                this.isFlowing = false;
            }
        } else {
            // End flow if active
            if (this.isFlowing) {
                this.currentFlowBlocks.push({
                    start: this.flowStartTimestamp,
                    end: Date.now()
                });
            }
            this.currentStreak = 0;
            this.isFlowing = false;
        }
    }

    async getMetrics() {
        const sessions = await this.storage.get('time_sessions') || [];

        const totalTime = sessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
        const totalFlow = sessions.reduce((sum: number, s: any) => sum + (s.flowDuration || 0), 0);
        const totalTyping = sessions.reduce((sum: number, s: any) => sum + (s.typingDuration || 0), 0);
        const totalReading = sessions.reduce((sum: number, s: any) => sum + (s.readingDuration || 0), 0);
        const totalSwitches = sessions.reduce((sum: number, s: any) => sum + (s.contextSwitches || 0), 0);
        const totalSessions = sessions.length;

        const currentTotalTime = totalTime + this.activeTime;
        const currentTotalFlow = totalFlow + this.flowTime;
        const currentTotalTyping = totalTyping + this.typingTime;
        const currentTotalReading = totalReading + this.readingTime;
        const currentTotalSwitches = totalSwitches + this.contextSwitches;

        // Combine stored flow blocks with current session's flow blocks
        let allFlowBlocks = sessions.flatMap((s: any) => s.flowBlocks || []);
        
        // Add current session's finished flow blocks
        allFlowBlocks = allFlowBlocks.concat(this.currentFlowBlocks);

        // Add active flow block if currently flowing
        if (this.isFlowing) {
            allFlowBlocks.push({
                start: this.flowStartTimestamp,
                end: Date.now()
            });
        } 
        // NEW: Show current session as "Focus" even if not yet 15 mins (Flow)
        else if (this.currentStreak > 1000) { // Only if > 1 second
            allFlowBlocks.push({
                start: Date.now() - this.currentStreak,
                end: Date.now(),
                type: 'focus' // Distinguish from deep flow
            });
        }

        return {
            totalActiveTime: currentTotalTime / 1000 / 60, // minutes
            flowTime: currentTotalFlow / 1000 / 60, // minutes
            typingTime: currentTotalTyping / 1000 / 60, // minutes
            readingTime: currentTotalReading / 1000 / 60, // minutes
            flowEfficiency: currentTotalTime > 0 ? currentTotalFlow / currentTotalTime : 0,
            contextSwitches: currentTotalSwitches,
            currentSessionTime: this.activeTime / 1000 / 60, // minutes
            totalSessions: totalSessions,
            averageSessionLength: totalSessions > 0 ? (totalTime / totalSessions) / 1000 / 60 : 0,
            flowBlocks: allFlowBlocks
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
