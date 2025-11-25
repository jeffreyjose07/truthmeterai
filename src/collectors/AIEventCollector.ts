import * as vscode from 'vscode';
import { LocalStorage } from '../storage/LocalStorage';
import { AIEvent } from '../types/events';

/**
 * OPTIMIZED VERSION of AIEventCollector
 *
 * Optimizations:
 * 1. Circular buffer (fixed memory)
 * 2. Debounced event processing
 * 3. Proper timer cleanup
 * 4. Batched storage writes
 * 5. WeakMap for document caching
 */
export class AIEventCollector {
    // Circular buffer for events (OPTIMIZATION 1)
    private events: (AIEvent | undefined)[];
    private eventIndex: number = 0;
    private readonly MAX_EVENTS = 1000;  // ~100KB max memory

    private currentSession: string;
    private lastSuggestion: any = null;

    // Timer management (OPTIMIZATION 3)
    private pendingTimers: Set<NodeJS.Timeout> = new Set();
    private debouncers: Map<string, NodeJS.Timeout> = new Map();

    // Batched writes (OPTIMIZATION 4)
    private writeQueue: Map<string, any[]> = new Map();
    private flushInterval?: NodeJS.Timeout;

    // Document cache (OPTIMIZATION 5)
    private documentMetrics: WeakMap<vscode.TextDocument, any> = new WeakMap();

    // Throttling
    private lastStatusUpdate: number = 0;
    private lastChangeTime: number = 0;

    constructor(private storage: LocalStorage) {
        this.currentSession = this.generateSessionId();
        this.events = new Array(this.MAX_EVENTS);
        this.startBatchWriter();
    }

    startTracking() {
        this.trackCascadeEvents();
        this.trackDocumentChangesDebounced();  // OPTIMIZED
        this.trackInlineSuggestions();
    }

    // OPTIMIZATION 2: Debounced document tracking
    private trackDocumentChangesDebounced() {
        vscode.workspace.onDidChangeTextDocument((event) => {
            const uri = event.document.uri.toString();

            // Skip non-file schemes
            if (event.document.uri.scheme !== 'file') {return;}

            // Clear existing debouncer
            const existing = this.debouncers.get(uri);
            if (existing) {
                clearTimeout(existing);
                this.pendingTimers.delete(existing);
            }

            // Debounce: wait 300ms after last keystroke
            const timer = setTimeout(() => {
                this.processDocumentChange(event);
                this.debouncers.delete(uri);
                this.pendingTimers.delete(timer);
            }, 300);

            this.debouncers.set(uri, timer);
            this.pendingTimers.add(timer);
        });
    }

    private processDocumentChange(event: vscode.TextDocumentChangeEvent) {
        // Throttle: max once per second per document
        const now = Date.now();
        if (now - this.lastChangeTime < 1000) {return;}
        this.lastChangeTime = now;

        if (this.isAIGenerated(event)) {
            const aiEvent: AIEvent = {
                timestamp: now,
                type: 'suggestion',
                sessionId: this.currentSession,
                fileType: event.document.languageId,
                suggestionLength: this.calculateChangeSize(event),
                acceptedLength: 0,
                modificationTime: 0,
                contextSize: event.document.lineCount
            };

            this.addEvent(aiEvent);  // Use circular buffer
            this.lastSuggestion = aiEvent;

            this.trackModifications(event.document.uri.toString(), aiEvent);
        }
    }

    private trackCascadeEvents() {
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) {return;}

            // Check cache first
            const cached = this.documentMetrics.get(editor.document);
            if (cached && Date.now() - cached.timestamp < 60000) {
                return; // Use cached result if < 1 minute old
            }

            const aiMarkers = this.detectAIMarkers(editor.document);
            if (aiMarkers.length > 0) {
                this.recordAIUsage(aiMarkers);

                // Cache result
                this.documentMetrics.set(editor.document, {
                    timestamp: Date.now(),
                    markers: aiMarkers
                });
            }
        });
    }

    private trackInlineSuggestions() {
        const disposable = vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**/*' },
            {
                provideInlineCompletionItems: async (document, position, context, token) => {
                    this.recordSuggestionShown(document, position);
                    return undefined;
                }
            }
        );
    }

    // OPTIMIZATION 1: Add to circular buffer
    private addEvent(event: AIEvent) {
        this.events[this.eventIndex] = event;
        this.eventIndex = (this.eventIndex + 1) % this.MAX_EVENTS;

        // Throttled status update
        if (Date.now() - this.lastStatusUpdate > 10000) {
            this.lastStatusUpdate = Date.now();
            // Signal status bar update needed
        }
    }

    // Get recent events (filter circular buffer)
    private getRecentEvents(minutes: number = 5): AIEvent[] {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.events.filter((e): e is AIEvent =>
            e !== undefined && e.timestamp > cutoff
        );
    }

    private isAIGenerated(event: vscode.TextDocumentChangeEvent): boolean {
        const changeText = event.contentChanges[0]?.text || '';

        // Quick checks first (cheapest operations)
        if (changeText.length > 100) {return true;}
        if (this.checkRecentAIActivity()) {return true;}

        // Expensive pattern matching last
        return this.detectAIPatterns(changeText);
    }

    private detectAIPatterns(text: string): boolean {
        // Limit regex checks for performance
        if (text.length > 1000) {
            text = text.substring(0, 1000);
        }

        const patterns = [
            /\/\/ TODO: Implement/gi,
            /function\s+\w+\([^)]*\)\s*{\s*\/\/ Implementation/gi,
            /catch\s*\([^)]+\)\s*{\s*console\.error/gi,
            /^\s*(import|const|let|var)\s+/gm
        ];

        return patterns.some(pattern => pattern.test(text));
    }

    private detectAIMarkers(document: vscode.TextDocument): any[] {
        const markers = [];
        const text = document.getText();

        // Limit to first 1000 lines for performance
        const lines = text.split('\n').slice(0, 1000);

        for (let i = 0; i < lines.length; i++) {
            if (this.isLikelyAIGenerated(lines[i])) {
                markers.push({ line: i, content: lines[i] });
            }
        }

        return markers;
    }

    private isLikelyAIGenerated(line: string): boolean {
        return line.includes('// Generated by') ||
               line.includes('// AI:') ||
               line.includes('TODO: Implement') ||
               (line.match(/^\s*\/\//g) !== null && line.length > 80);
    }

    // OPTIMIZATION 3: Track timers for cleanup
    private trackModifications(uri: string, event: AIEvent) {
        const timer = setTimeout(() => {
            vscode.workspace.openTextDocument(vscode.Uri.parse(uri)).then(doc => {
                const currentText = doc.getText();
                const modifications = this.detectModifications(currentText, event);

                if (modifications > 0) {
                    event.modificationTime = Date.now() - event.timestamp;
                    event.acceptedLength = event.suggestionLength - modifications;

                    const churnRate = modifications / event.suggestionLength;
                    this.recordChurn(churnRate);
                }

                this.pendingTimers.delete(timer);
            }, () => {
                // Document might be closed (error callback)
                this.pendingTimers.delete(timer);
            });
        }, 5000);

        this.pendingTimers.add(timer);
    }

    private detectModifications(currentText: string, originalEvent: AIEvent): number {
        return Math.abs(currentText.length - originalEvent.suggestionLength);
    }

    // OPTIMIZATION 4: Queue writes instead of immediate
    private recordChurn(rate: number) {
        const churnEvent = {
            timestamp: Date.now(),
            type: 'churn' as const,
            rate: rate
        };

        this.queueWrite('churn_events', churnEvent);
    }

    private queueWrite(key: string, value: any) {
        const queue = this.writeQueue.get(key) || [];
        queue.push(value);
        this.writeQueue.set(key, queue);
    }

    // OPTIMIZATION 4: Batched storage writes
    private startBatchWriter() {
        this.flushInterval = setInterval(async () => {
            for (const [key, values] of this.writeQueue) {
                if (values.length > 0) {
                    // Write all batched items at once
                    for (const value of values) {
                        await this.storage.store(key, value);
                    }
                    this.writeQueue.set(key, []);
                }
            }
        }, 5000); // Flush every 5 seconds

        this.pendingTimers.add(this.flushInterval);
    }

    private calculateChangeSize(event: vscode.TextDocumentChangeEvent): number {
        return event.contentChanges.reduce((sum, change) => {
            return sum + change.text.length;
        }, 0);
    }

    private checkRecentAIActivity(): boolean {
        const recentThreshold = Date.now() - 10000;
        const recentEvents = this.getRecentEvents(0.17); // ~10 seconds
        return recentEvents.length > 0;
    }

    private recordAIUsage(markers: any[]) {
        this.queueWrite('ai_usage', {
            timestamp: Date.now(),
            markers: markers.length,
            session: this.currentSession
        });
    }

    private recordSuggestionShown(document: vscode.TextDocument, position: vscode.Position) {
        this.queueWrite('suggestion_shown', {
            timestamp: Date.now(),
            file: document.fileName,
            line: position.line,
            character: position.character
        });
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async getMetrics() {
        const events = this.getRecentEvents(60); // Last hour
        const totalSuggestions = events.filter(e => e.type === 'suggestion').length;
        const acceptedSuggestions = events.filter(e => e.acceptedLength > 0).length;

        return {
            totalSuggestions,
            acceptanceRate: totalSuggestions > 0 ? acceptedSuggestions / totalSuggestions : 0,
            averageModificationTime: this.calculateAverageModificationTime(events),
            churnRate: await this.calculateChurnRate(),
            sessionCount: this.getUniqueSessionCount(events)
        };
    }

    private calculateAverageModificationTime(events: AIEvent[]): number {
        const modifications = events.filter(e => e.modificationTime > 0);
        if (modifications.length === 0) {return 0;}

        const total = modifications.reduce((sum, e) => sum + e.modificationTime, 0);
        return total / modifications.length;
    }

    private async calculateChurnRate(): Promise<number> {
        const churnEvents = await this.storage.get('churn_events') || [];
        if (churnEvents.length === 0) {return 0;}

        const totalRate = churnEvents.reduce((sum: number, e: any) => sum + e.rate, 0);
        return totalRate / churnEvents.length;
    }

    private getUniqueSessionCount(events: AIEvent[]): number {
        const sessions = new Set(events.map(e => e.sessionId));
        return sessions.size;
    }

    getQuickStats() {
        const recentEvents = this.getRecentEvents(5);

        return {
            recentSuggestions: recentEvents.filter(e => e.type === 'suggestion').length,
            recentAcceptance: recentEvents.filter(e => e.acceptedLength > 0).length,
            activeSession: this.currentSession
        };
    }

    // OPTIMIZATION 3: Proper cleanup
    dispose() {
        // Clear all pending timers
        this.pendingTimers.forEach(timer => clearTimeout(timer));
        this.pendingTimers.clear();

        // Clear debouncers
        this.debouncers.forEach(timer => clearTimeout(timer));
        this.debouncers.clear();

        // Flush remaining writes
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }

        // Final flush
        for (const [key, values] of this.writeQueue) {
            values.forEach(value => {
                this.storage.store(key, value);
            });
        }
        this.writeQueue.clear();
    }

    // Performance monitoring
    getPerformanceMetrics() {
        return {
            eventsInMemory: this.events.filter(e => e !== undefined).length,
            maxEvents: this.MAX_EVENTS,
            pendingTimers: this.pendingTimers.size,
            queuedWrites: Array.from(this.writeQueue.values())
                .reduce((sum, arr) => sum + arr.length, 0),
            memoryEstimate: this.MAX_EVENTS * 100 // bytes
        };
    }
}
