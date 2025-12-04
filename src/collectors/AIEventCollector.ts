import * as vscode from 'vscode';
import { LocalStorage } from '../storage/LocalStorage';
import { AIEvent } from '../types/events';

/**
 * AIEventCollector - Tracks AI-generated code changes and usage patterns
 *
 * Features:
 * - Detects AI-generated code in editor changes
 * - Monitors external file changes (terminal/CLI writes)
 * - Tracks code churn and acceptance rates
 * - Provides performance metrics
 *
 * Optimizations:
 * 1. Circular buffer (fixed memory) - prevents unbounded growth
 * 2. Debounced event processing - reduces CPU usage
 * 3. Proper timer cleanup - prevents memory leaks
 * 4. Batched storage writes - reduces I/O operations
 * 5. WeakMap for document caching - automatic cleanup
 * 6. LRU file cache - bounded memory usage
 * 7. Per-document throttling - accurate rate limiting
 */
export class AIEventCollector {
    // Circular buffer for events (OPTIMIZATION 1)
    private events: (AIEvent | undefined)[];
    private eventIndex: number = 0;
    private readonly MAX_EVENTS = 1000;  // ~100KB max memory

    private currentSession: string;
    private lastSuggestion: AIEvent | null = null;

    // Timer management (OPTIMIZATION 3)
    private pendingTimers: Set<NodeJS.Timeout> = new Set();
    private debouncers: Map<string, NodeJS.Timeout> = new Map();

    // Batched writes (OPTIMIZATION 4)
    private writeQueue: Map<string, any[]> = new Map();
    private flushInterval?: NodeJS.Timeout;

    // Document cache (OPTIMIZATION 5)
    private documentMetrics: WeakMap<vscode.TextDocument, any> = new WeakMap();

    // Fix Time Tracking
    private lastAISuggestion: Map<string, number> = new Map();
    private totalFixTime: number = 0;

    // Throttling
    private lastStatusUpdate: number = 0;
    private lastChangeTime: number = 0;
    private lastChangeTimeByDocument: Map<string, number> = new Map();

    // File system watcher for external changes
    private fileWatcher?: vscode.FileSystemWatcher;
    private fileContentCache: Map<string, { content: string; timestamp: number; size: number }> = new Map();
    private fileChangeDebouncers: Map<string, NodeJS.Timeout> = new Map();

    // Directories to exclude from file watching (performance optimization)
    private readonly EXCLUDED_DIRECTORIES = ['node_modules', '.git', 'dist', 'build', 'out'];
    // Cache configuration
    private readonly CACHE_TTL = 30000; // 30 seconds
    private readonly FILE_CHANGE_DEBOUNCE = 1000; // 1 second debounce for file changes
    private readonly MAX_CACHE_SIZE = 50; // Maximum number of files to cache
    private readonly MAX_FILE_SIZE = 500000; // 500KB - skip files larger than this
    private readonly MAX_PATTERN_CHECK_SIZE = 10000; // Only check first 10KB for patterns
    private lastCacheCleanup: number = 0;
    private readonly CACHE_CLEANUP_INTERVAL = 60000; // Clean cache every minute

    // Throttling constants
    private readonly DEBOUNCE_DELAY = 300; // ms - wait after last keystroke
    private readonly THROTTLE_INTERVAL = 1000; // ms - max once per second per document
    private readonly STATUS_UPDATE_INTERVAL = 10000; // ms - update status bar every 10s
    private readonly MODIFICATION_CHECK_DELAY = 5000; // ms - check modifications after 5s
    private readonly FILE_WRITE_WAIT = 200; // ms - wait for file write to complete

    // AI detection thresholds
    private readonly MIN_INSERTION_SIZE = 30; // chars - minimum for AI detection
    private readonly MIN_MULTI_CHANGE_SIZE = 20; // chars - for multiple changes
    private readonly MIN_RAPID_TYPING_SIZE = 20; // chars - for rapid typing detection
    private readonly MIN_BLOCK_INSERTION = 40; // chars - single large block
    private readonly MIN_MULTILINE_SIZE = 25; // chars - multi-line additions
    private readonly MIN_RECENT_ACTIVITY_SIZE = 15; // chars - with recent AI activity
    private readonly DELETION_RATIO_THRESHOLD = 0.3; // 30% - max deletion ratio for AI
    private readonly RAPID_TYPING_WINDOW = 500; // ms - window for rapid typing

    // Region Tracking for True Fix Time
    private aiRegions: Map<string, Array<{
        startLine: number;
        endLine: number;
        timestamp: number;
        originalLength: number;
    }>> = new Map();

    /**
     * Creates a new AIEventCollector instance
     * @param storage - LocalStorage instance for persisting events
     */
    constructor(private storage: LocalStorage) {
        this.currentSession = this.generateSessionId();
        this.events = new Array(this.MAX_EVENTS);
        this.startBatchWriter();
        this.loadHistory();
    }

    /**
     * Load historical events from storage to populate the circular buffer
     */
    private async loadHistory() {
        try {
            const savedEvents = await this.storage.get('ai_events');
            if (savedEvents && savedEvents.length > 0) {
                // Sort by timestamp to ensure correct order
                savedEvents.sort((a: any, b: any) => a.timestamp - b.timestamp);
                
                // Load into buffer (up to MAX_EVENTS)
                const startIdx = Math.max(0, savedEvents.length - this.MAX_EVENTS);
                for (let i = startIdx; i < savedEvents.length; i++) {
                    const event = savedEvents[i];
                    this.events[this.eventIndex] = event;
                    this.eventIndex = (this.eventIndex + 1) % this.MAX_EVENTS;
                }
            }
        } catch (error) {
            console.error('Failed to load AI event history:', error);
        }
    }

    /**
     * Starts tracking AI events from multiple sources:
     * - Editor text document changes
     * - File system changes (external writes)
     * - Inline suggestions
     * - Document saves
     */
    startTracking() {
        this.trackCascadeEvents();
        this.trackDocumentChangesDebounced();  // OPTIMIZED
        this.trackInlineSuggestions();
        this.trackFileSystemChanges();  // Track external file changes
        this.trackDocumentSaves();  // Update cache on saves
    }

    // OPTIMIZATION 2: Debounced document tracking
    private trackDocumentChangesDebounced() {
        vscode.workspace.onDidChangeTextDocument((event) => {
            const uri = event.document.uri.toString();

            // Skip non-file schemes
            if (event.document.uri.scheme !== 'file') { return; }

            // Clear existing debouncer
            const existing = this.debouncers.get(uri);
            if (existing) {
                clearTimeout(existing);
                this.pendingTimers.delete(existing);
            }

            // Debounce: wait after last keystroke
            const timer = setTimeout(() => {
                this.processDocumentChange(event);
                this.debouncers.delete(uri);
                this.pendingTimers.delete(timer);
            }, this.DEBOUNCE_DELAY);

            this.debouncers.set(uri, timer);
            this.pendingTimers.add(timer);
        });
    }

    private processDocumentChange(event: vscode.TextDocumentChangeEvent) {
        // Throttle: max once per second per document (per-document throttling)
        const uri = event.document.uri.toString();
        const now = Date.now();
        const lastChange = this.lastChangeTimeByDocument.get(uri) || 0;

        if (now - lastChange < this.THROTTLE_INTERVAL) {
            return;
        }

        this.lastChangeTimeByDocument.set(uri, now);
        this.lastChangeTime = now; // Keep global for backward compatibility

        if (this.isAIGenerated(event)) {
            this.lastAISuggestion.set(uri, now); // Track time of AI suggestion
            const changeSize = this.calculateChangeSize(event);

            const aiEvent: AIEvent = {
                timestamp: now,
                type: 'suggestion',
                sessionId: this.currentSession,
                fileType: event.document.languageId,
                suggestionLength: changeSize,
                acceptedLength: 0,
                modificationTime: 0,
                contextSize: event.document.lineCount,
                uri: uri
            };

            this.addEvent(aiEvent);  // Use circular buffer
            this.lastSuggestion = aiEvent;

            this.trackModifications(event.document.uri.toString(), aiEvent);

            // NEW: Track AI Region for True Fix Time
            const regions = this.aiRegions.get(uri) || [];
            // Prune old regions (> 1 hour)
            const freshRegions = regions.filter(r => now - r.timestamp < 3600000);
            
            event.contentChanges.forEach(change => {
                const lineCount = change.text.split('\n').length - 1;
                freshRegions.push({
                    startLine: change.range.start.line,
                    endLine: change.range.start.line + lineCount,
                    timestamp: now,
                    originalLength: change.text.length
                });
            });
            this.aiRegions.set(uri, freshRegions);

        } else {
            // Human edit - check if it's a "fix" for recent AI code
            const regions = this.aiRegions.get(uri);
            if (regions && regions.length > 0) {
                let isFix = false;
                
                // Check if any change overlaps with an AI region
                for (const change of event.contentChanges) {
                    const changeStart = change.range.start.line;
                    const changeEnd = change.range.end.line;

                    for (const region of regions) {
                        // Simple overlap check: (StartA <= EndB) and (EndA >= StartB)
                        if (changeStart <= region.endLine && changeEnd >= region.startLine) {
                            isFix = true;
                            
                            // Check for Churn (Significant Deletion)
                            if (change.text === '' && change.rangeLength > 0) {
                                const deletedRatio = change.rangeLength / region.originalLength;
                                if (deletedRatio > 0.5) {
                                    // >50% deleted = High Churn
                                    this.recordChurn(1.0); 
                                }
                            }
                            break;
                        }
                    }
                    if (isFix) {break;}
                }

                if (isFix) {
                    // Calculate time spent editing (delta since last change, capped at 10s to exclude idle time)
                    const timeDelta = Math.min(now - lastChange, 10000);
                    if (timeDelta > 0) {
                        this.totalFixTime += timeDelta;
                    }
                }
            }
            
            // Fallback: If no regions (legacy/cleared), use file-level heuristic
            else {
                const lastAITime = this.lastAISuggestion.get(uri);
                if (lastAITime && (now - lastAITime < 300000)) {
                    const timeDelta = Math.min(now - lastChange, 5000);
                    if (timeDelta > 0) {
                        this.totalFixTime += timeDelta;
                    }
                }
            }
        }
    }

    private trackCascadeEvents() {
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) { return; }

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
        // Register inline completion provider to track when suggestions are shown
        // Note: Disposable is intentionally not stored as it's managed by VS Code lifecycle
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**/*' },
            {
                provideInlineCompletionItems: async (document, position) => {
                    this.recordSuggestionShown(document, position);
                    return undefined;
                }
            }
        );
    }

    /**
     * Track document saves to update file cache
     */
    private trackDocumentSaves() {
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.uri.scheme === 'file' && !document.isUntitled) {
                try {
                    const content = document.getText();
                    // Skip very large files
                    if (content.length > this.MAX_FILE_SIZE) { return; }

                    this.updateFileCache(
                        document.uri.toString(),
                        content,
                        Date.now()
                    );
                } catch (error) {
                    // Ignore errors
                }
            }
        });
    }

    // OPTIMIZATION 1: Add to circular buffer
    private addEvent(event: AIEvent) {
        this.events[this.eventIndex] = event;
        this.eventIndex = (this.eventIndex + 1) % this.MAX_EVENTS;

        // Persist suggestions to storage
        if (event.type === 'suggestion') {
            this.queueWrite('ai_events', event);
        }

        // Throttled status update
        if (Date.now() - this.lastStatusUpdate > this.STATUS_UPDATE_INTERVAL) {
            this.lastStatusUpdate = Date.now();
            // Signal status bar update needed
        }
    }

    // Get recent events (filter circular buffer) - OPTIMIZED
    private getRecentEvents(minutes: number = 5): AIEvent[] {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        const result: AIEvent[] = [];

        // Iterate through circular buffer more efficiently
        const startIdx = this.eventIndex;
        const totalEvents = this.events.length;

        // Check events in reverse order (newest first)
        for (let i = 0; i < totalEvents; i++) {
            const idx = (startIdx - 1 - i + totalEvents) % totalEvents;
            const event = this.events[idx];
            if (event === undefined) { continue; }
            if (event.timestamp <= cutoff) { break; } // Events are ordered, can early exit
            result.push(event);
        }

        return result.reverse(); // Return in chronological order
    }

    /**
     * Determines if a document change was likely generated by AI
     * Uses multiple heuristics to detect AI-generated code patterns
     * @param event - The document change event to analyze
     * @returns true if the change appears to be AI-generated
     */
    private isAIGenerated(event: vscode.TextDocumentChangeEvent): boolean {
        const changes = event.contentChanges;
        if (changes.length === 0) { return false; }

        // Calculate total change size
        const totalInserted = changes.reduce((sum, change) => sum + change.text.length, 0);
        const totalDeleted = changes.reduce((sum, change) => sum + change.rangeLength, 0);

        // Heuristic 1: Large insertions with minimal deletion
        // AI often adds code without deleting much
        if (totalInserted > this.MIN_INSERTION_SIZE &&
            totalDeleted < totalInserted * this.DELETION_RATIO_THRESHOLD) {
            return true;
        }

        // Heuristic 2: Multiple changes in quick succession (AI streaming)
        if (changes.length > 1 && totalInserted > this.MIN_MULTI_CHANGE_SIZE) {
            return true;
        }

        // Heuristic 3: Check if change contains complete code structures
        const changeText = changes.map(c => c.text).join('\n');
        if (this.detectAIPatterns(changeText)) {
            return true;
        }

        // Heuristic 4: Recent AI activity context
        if (this.checkRecentAIActivity() && totalInserted > this.MIN_RECENT_ACTIVITY_SIZE) {
            return true;
        }

        // Heuristic 5: Rapid typing pattern (AI generates faster than humans)
        const now = Date.now();
        if (now - this.lastChangeTime < this.RAPID_TYPING_WINDOW &&
            totalInserted > this.MIN_RAPID_TYPING_SIZE) {
            return true;
        }

        // Heuristic 6: Single large block insertion (common with AI)
        if (changes.length === 1 && totalInserted > this.MIN_BLOCK_INSERTION && totalDeleted === 0) {
            return true;
        }

        // Heuristic 7: Multi-line additions (AI often adds complete blocks)
        const hasMultipleLines = changeText.split('\n').length > 2;
        if (hasMultipleLines && totalInserted > this.MIN_MULTILINE_SIZE) {
            return true;
        }

        return false;
    }

    /**
     * Detects AI-generated code patterns using regex matching
     * Checks for common AI code structures (functions, classes, error handling, etc.)
     * @param text - The text to analyze
     * @returns true if AI patterns are detected
     */
    private detectAIPatterns(text: string): boolean {
        if (!text || text.trim().length === 0) { return false; }

        // Limit regex checks for performance - use smaller sample for faster processing
        const sampleText = text.length > this.MAX_PATTERN_CHECK_SIZE
            ? text.substring(0, this.MAX_PATTERN_CHECK_SIZE)
            : text;

        // Pre-compiled patterns for better performance (lazy initialization)
        // More realistic AI-generated code patterns (based on actual Claude/Copilot/Cursor output)
        const patterns = [
            // Complete function/class definitions with body (AI writes full structures)
            // More lenient - matches any function/class/interface/type definition
            /^(?:\s*\/\/.*\n)?\s*(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s+)?\(|interface|type|enum)\s+\w+[\s\S]{10,}/m,

            // Multiple imports or exports (AI often adds several at once)
            /^(?:import|export)\s+.*\n(?:(?:import|export)\s+.*\n){1,}/m,

            // JSDoc comments with parameters/returns (AI adds documentation)
            /\/\*\*[\s\S]*?(?:@param|@returns?|@throws?|@description)[\s\S]*?\*\//,

            // Error handling patterns (AI adds try-catch/error handling)
            /try\s*\{[\s\S]{5,}?\}\s*catch\s*\(/,

            // Multiple variable declarations in sequence
            /(?:const|let|var)\s+\w+\s*[:=][\s\S]{3,}?;\s*(?:const|let|var)\s+\w+\s*[:=]/,

            // TypeScript type annotations (AI adds types) - more lenient
            /:\s*(?:string|number|boolean|any|void|Promise|Array|Record|Map|Set|Readonly|Partial|Required|object|unknown)\s*[=;,)]/,

            // Complete object/array literals with multiple properties
            /\{\s*(?:\w+\s*[:=][\s\S]*?,?\s*){2,}\s*\}/,

            // Arrow functions with bodies (AI writes complete functions) - more lenient
            /(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{[\s\S]{5,}/,

            // Switch statements (AI generates complete switch cases)
            /switch\s*\([^)]+\)\s*\{[\s\S]{10,}/,

            // Multiple consecutive method calls or chaining
            /\.\w+\([^)]*\)\s*\.\w+\([^)]*\)/,

            // Complete if-else or if-else-if chains
            /if\s*\([^)]+\)\s*\{[\s\S]{5,}?\}\s*(?:else\s+if|else)/,

            // Destructuring with multiple properties
            /(?:const|let|var)\s*\{[\s\S]{10,}?\}\s*=/,

            // Template literals with expressions (AI uses modern syntax)
            /`[\s\S]*?\$\{[\s\S]*?\}[\s\S]*?`/,

            // Return statements with complex expressions (AI generates complete returns)
            /return\s+(?:[\w.]+\(|\[|\{|`)/,

            // await with async operations (AI uses async/await patterns)
            /await\s+[\w.]+\(/,

            // Multiple lines of code (AI generates blocks, not single lines)
            /\n.*\n.*\n/,

            // Comments followed by code (AI often adds explanatory comments)
            /\/\/.*\n\s*(?:const|let|var|function|class|if|for|while|return)/,

            // Object method definitions (AI writes complete methods)
            /\w+\s*\([^)]*\)\s*\{[\s\S]{5,}?\}/,

            // Array methods (AI uses modern array methods)
            /\.(?:map|filter|reduce|forEach|find|some|every)\s*\(/
        ];

        // Early exit optimization - return as soon as first pattern matches
        for (const pattern of patterns) {
            if (pattern.test(sampleText)) {
                return true;
            }
        }
        return false;
    }

    private detectAIMarkers(document: vscode.TextDocument): Array<{ line: number; content: string }> {
        const markers: Array<{ line: number; content: string }> = [];
        const text = document.getText();

        // Limit to first 500 lines for performance (reduced from 1000)
        const lines = text.split('\n').slice(0, 500);

        // Early exit if document is too large
        if (text.length > this.MAX_FILE_SIZE) {
            return markers; // Skip very large files
        }

        // Limit markers to avoid memory issues
        const MAX_MARKERS = 50;
        for (let i = 0; i < lines.length && markers.length < MAX_MARKERS; i++) {
            if (this.isLikelyAIGenerated(lines[i])) {
                markers.push({ line: i, content: lines[i] });
            }
        }

        return markers;
    }

    private isLikelyAIGenerated(line: string): boolean {
        // More realistic patterns that match actual AI output
        const trimmed = line.trim();

        // Skip empty lines and very short lines
        if (trimmed.length < 8) { return false; }

        // Pattern 1: JSDoc comments (AI often adds documentation)
        if (/\/\*\*[\s\S]*?\*\//.test(trimmed)) { return true; }

        // Pattern 2: Type annotations in comments (AI adds type hints)
        if (/\/\/\s*(?:@param|@returns?|@type|@description)/.test(trimmed)) { return true; }

        // Pattern 3: Complete function signatures with types (more lenient)
        if (/^(?:export\s+)?(?:async\s+)?(?:function|const\s+\w+\s*=\s*(?:async\s+)?\(|class|interface|type)/.test(trimmed)) { return true; }

        // Pattern 4: Multiple imports/exports (AI adds several at once)
        if (/^(?:import|export)\s+.*from/.test(trimmed)) { return true; }

        // Pattern 5: Error handling patterns
        if (/^\s*(?:try|catch|finally|throw\s+new)/.test(trimmed)) { return true; }

        // Pattern 6: TypeScript type annotations
        if (/:\s*(?:string|number|boolean|any|void|Promise|Array|Record|Map|Set)/.test(trimmed)) { return true; }

        // Pattern 7: Arrow functions
        if (/=>\s*\{/.test(trimmed)) { return true; }

        // Pattern 8: Async/await patterns
        if (/^\s*(?:await|async)/.test(trimmed)) { return true; }

        // Pattern 9: Destructuring
        if (/^\s*(?:const|let|var)\s*\{/.test(trimmed)) { return true; }

        // Pattern 10: Template literals
        if (/`[\s\S]*?\$\{/.test(trimmed)) { return true; }

        return false;
    }

    /**
     * Track modifications to AI-generated code after a delay
     * This helps detect code churn (how much AI code was modified after acceptance)
     */
    private trackModifications(uri: string, event: AIEvent) {
        const timer = setTimeout(async () => {
            try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
                const currentText = doc.getText();
                const modifications = this.calculateModifications(currentText, event);

                if (modifications > 0) {
                    event.modificationTime = Date.now() - event.timestamp;
                    // Accepted length is the original minus modifications
                    event.acceptedLength = Math.max(0, event.suggestionLength - modifications);

                    const churnRate = modifications / event.suggestionLength;
                    this.recordChurn(churnRate);
                }
            } catch (error) {
                // Document might be closed or inaccessible - ignore
            } finally {
                this.pendingTimers.delete(timer);
            }
        }, this.MODIFICATION_CHECK_DELAY);

        this.pendingTimers.add(timer);
    }

    /**
     * Calculate how much the code was modified after AI suggestion
     * This is a simplified heuristic - in reality, we'd need diff algorithms
     */
    private calculateModifications(currentText: string, originalEvent: AIEvent): number {
        // Simplified: compare text length difference
        // Note: This is a heuristic and may not be 100% accurate
        // A proper implementation would use diff algorithms
        const lengthDiff = Math.abs(currentText.length - originalEvent.contextSize);
        return lengthDiff;
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
        // Check for AI activity in the last ~10 seconds
        const recentEvents = this.getRecentEvents(0.17); // ~10 seconds
        return recentEvents.length > 0;
    }

    private recordAIUsage(markers: Array<{ line: number; content: string }>) {
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

    /**
     * Gets raw events from the circular buffer (chronological order)
     * @param limit - Optional limit on number of events to return
     */
    public getRawEvents(limit?: number): AIEvent[] {
        const events = this.getRecentEvents(60 * 24); // Get all from last 24h
        return limit ? events.slice(-limit) : events;
    }

    /**
     * Gets aggregated metrics about AI usage
     * @returns Promise resolving to metrics object
     */
    async getMetrics() {
        const events = this.getRecentEvents(1440); // Last 24 hours (was 60 mins)
        const totalSuggestions = events.filter(e => e.type === 'suggestion').length;
        const acceptedSuggestions = events.filter(e => e.acceptedLength > 0).length;

        // Calculate per-language stats
        const languageStats: Record<string, { suggestions: number, accepted: number, acceptanceRate: number }> = {};
        const fileStats: Record<string, { suggestions: number, churn: number }> = {};
        
        for (const event of events) {
            if (event.type !== 'suggestion') { continue; }
            
            const lang = event.fileType || 'unknown';
            if (!languageStats[lang]) {
                languageStats[lang] = { suggestions: 0, accepted: 0, acceptanceRate: 0 };
            }
            
            languageStats[lang].suggestions++;
            if (event.acceptedLength > 0) {
                languageStats[lang].accepted++;
            }

            // File Stats
            const uri = event.uri || 'unknown';
            if (!fileStats[uri]) {
                fileStats[uri] = { suggestions: 0, churn: 0 };
            }
            fileStats[uri].suggestions++;
        }

        // Add churn data to file stats (if available in churn events)
        // This is a simplified mapping; ideally churn events should link back to files
        // For now, we'll calculate churn based on modificationTime events in the same file
        for (const uri in fileStats) {
            const fileEvents = events.filter(e => e.uri === uri && e.modificationTime > 0);
            if (fileEvents.length > 0) {
                // Average modification time as a proxy for churn intensity? 
                // Better: Use the 'churn' type events if they have URIs, but they don't currently.
                // Let's use modification events.
                const totalMod = fileEvents.reduce((sum, e) => sum + e.modificationTime, 0);
                // Normalize churn score (0-1) based on mod time (e.g. > 5 mins = 1.0)
                fileStats[uri].churn = Math.min(totalMod / 300000, 1);
            }
        }

        // Calculate rates
        for (const lang in languageStats) {
            const stats = languageStats[lang];
            stats.acceptanceRate = stats.suggestions > 0 ? stats.accepted / stats.suggestions : 0;
        }

        return {
            totalSuggestions,
            acceptanceRate: totalSuggestions > 0 ? acceptedSuggestions / totalSuggestions : 0,
            averageModificationTime: this.calculateAverageModificationTime(events),
            churnRate: await this.calculateChurnRate(),
            sessionCount: this.getUniqueSessionCount(events),
            totalFixTime: this.totalFixTime,
            languageStats,
            fileStats
        };
    }

    private calculateAverageModificationTime(events: AIEvent[]): number {
        const modifications = events.filter(e => e.modificationTime > 0);
        if (modifications.length === 0) { return 0; }

        const total = modifications.reduce((sum, e) => sum + e.modificationTime, 0);
        return total / modifications.length;
    }

    private async calculateChurnRate(): Promise<number> {
        const churnEvents = await this.storage.get('churn_events') || [];
        if (churnEvents.length === 0) { return 0; }

        const totalRate = churnEvents.reduce((sum: number, e: any) => sum + e.rate, 0);
        return totalRate / churnEvents.length;
    }

    private getUniqueSessionCount(events: AIEvent[]): number {
        const sessions = new Set(events.map(e => e.sessionId));
        return sessions.size;
    }

    /**
     * Gets quick stats for status bar display
     * @returns Quick stats object with recent activity
     */
    getQuickStats() {
        const recentEvents = this.getRecentEvents(5);

        return {
            recentSuggestions: recentEvents.filter(e => e.type === 'suggestion').length,
            recentAcceptance: recentEvents.filter(e => e.acceptedLength > 0).length,
            activeSession: this.currentSession
        };
    }

    /**
     * Disposes of all resources and cleans up timers, watchers, and caches
     * Should be called when the collector is no longer needed
     */
    dispose() {
        // Clear all pending timers
        this.pendingTimers.forEach(timer => clearTimeout(timer));
        this.pendingTimers.clear();

        // Clear debouncers
        this.debouncers.forEach(timer => clearTimeout(timer));
        this.debouncers.clear();

        // Clear file change debouncers
        this.fileChangeDebouncers.forEach(timer => clearTimeout(timer));
        this.fileChangeDebouncers.clear();

        // Dispose file watcher
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }

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

        // Clear cache
        this.fileContentCache.clear();

        // Clear per-document throttling
        this.lastChangeTimeByDocument.clear();
    }

    /**
     * Gets performance metrics for monitoring and debugging
     * @returns Performance metrics including memory usage and cache statistics
     */
    getPerformanceMetrics() {
        let eventCount = 0;
        for (const e of this.events) {
            if (e !== undefined) { eventCount++; }
        }

        const cacheSize = Array.from(this.fileContentCache.values())
            .reduce((sum, entry) => sum + (entry.size || 0), 0);

        return {
            eventsInMemory: eventCount,
            maxEvents: this.MAX_EVENTS,
            pendingTimers: this.pendingTimers.size,
            queuedWrites: Array.from(this.writeQueue.values())
                .reduce((sum, arr) => sum + arr.length, 0),
            fileCacheSize: this.fileContentCache.size,
            fileCacheMemory: cacheSize,
            memoryEstimate: (this.MAX_EVENTS * 100) + cacheSize // bytes
        };
    }

    /**
     * Track file system changes to detect external file modifications
     * (e.g., when AI writes directly to files via terminal/CLI)
     * OPTIMIZED: Excludes large directories to reduce file watcher overhead
     */
    private trackFileSystemChanges() {
        // Only watch if we have a workspace folder
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        try {
            // Watch for file changes in workspace, but exclude large directories
            // This reduces file watcher overhead significantly
            const pattern = new vscode.RelativePattern(
                vscode.workspace.workspaceFolders[0],
                '**/*.{ts,tsx,js,jsx,py,java,cpp,c,cs,go,rs,rb,php,swift,kt}'
            );

            this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

            // Track file changes with debouncing
            this.fileWatcher.onDidChange(async (uri) => {
                await this.debounceFileChange(uri, false);
            });

            // Also track file creation (new files from AI)
            this.fileWatcher.onDidCreate(async (uri) => {
                await this.debounceFileChange(uri, true);
            });

            // Initialize cache with currently open documents
            this.initializeFileCache();
        } catch (error) {
            // If file watcher creation fails, continue without it
            // Editor-based tracking will still work
        }
    }

    /**
     * Debounce file change events to avoid multiple triggers
     */
    private async debounceFileChange(uri: vscode.Uri, isNewFile: boolean) {
        const uriString = uri.toString();

        // Clear existing debouncer
        const existing = this.fileChangeDebouncers.get(uriString);
        if (existing) {
            clearTimeout(existing);
            this.pendingTimers.delete(existing);
        }

        // Create new debounced handler
        const timer = setTimeout(async () => {
            await this.handleExternalFileChange(uri, isNewFile);
            this.fileChangeDebouncers.delete(uriString);
            this.pendingTimers.delete(timer);
        }, this.FILE_CHANGE_DEBOUNCE);

        this.fileChangeDebouncers.set(uriString, timer);
        this.pendingTimers.add(timer);
    }

    /**
     * Initialize file cache with currently open documents
     * OPTIMIZED: Limits cache size and skips large files
     */
    private async initializeFileCache() {
        let count = 0;
        for (const document of vscode.workspace.textDocuments) {
            if (count >= this.MAX_CACHE_SIZE) { break; } // Limit initial cache size

            if (document.uri.scheme === 'file' && !document.isUntitled) {
                try {
                    const content = document.getText();
                    if (content.length > this.MAX_FILE_SIZE) { continue; } // Skip large files

                    this.fileContentCache.set(document.uri.toString(), {
                        content,
                        timestamp: Date.now(),
                        size: content.length
                    });
                    count++;
                } catch (error) {
                    // Ignore errors during initialization
                }
            }
        }
    }

    /**
     * Cleanup old cache entries efficiently
     */
    private cleanupFileCache(now: number) {
        const toDelete: string[] = [];
        for (const [key, value] of this.fileContentCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                toDelete.push(key);
            }
        }
        toDelete.forEach(key => this.fileContentCache.delete(key));
    }

    /**
     * Update file cache with LRU eviction when cache is full
     */
    private updateFileCache(uriString: string, content: string, timestamp: number) {
        // Remove if already exists (will re-add with new timestamp)
        if (this.fileContentCache.has(uriString)) {
            this.fileContentCache.delete(uriString);
        }

        // If cache is full, remove oldest entry (LRU)
        if (this.fileContentCache.size >= this.MAX_CACHE_SIZE) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;

            for (const [key, value] of this.fileContentCache.entries()) {
                if (value.timestamp < oldestTime) {
                    oldestTime = value.timestamp;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                this.fileContentCache.delete(oldestKey);
            }
        }

        // Add new entry
        this.fileContentCache.set(uriString, {
            content,
            timestamp,
            size: content.length
        });
    }

    /**
     * Handle external file changes (from file system, not editor)
     */
    private async handleExternalFileChange(uri: vscode.Uri, isNewFile: boolean = false) {
        try {
            // Skip if file is currently open in editor (will be handled by onDidChangeTextDocument)
            const openDocument = vscode.workspace.textDocuments.find(
                doc => doc.uri.toString() === uri.toString()
            );

            if (openDocument) {
                // File is open, skip to avoid double-counting
                return;
            }

            // Wait a bit for file write to complete (especially for large files)
            await new Promise(resolve => setTimeout(resolve, this.FILE_WRITE_WAIT));

            // Skip very large files to avoid memory issues
            const uriString = uri.toString();
            if (this.EXCLUDED_DIRECTORIES.some(dir => uriString.includes(dir))) {
                return; // Skip excluded directories for performance
            }

            // Read file content with size limit
            const fileContent = await vscode.workspace.fs.readFile(uri);
            if (fileContent.length > this.MAX_FILE_SIZE) {
                // File too large, skip to avoid memory issues
                return;
            }
            const newContent = Buffer.from(fileContent).toString('utf-8');

            // Check cache for previous content (uriString already defined above)
            const cached = this.fileContentCache.get(uriString);

            // Periodic cache cleanup (throttled to avoid performance impact)
            const now = Date.now();
            if (now - this.lastCacheCleanup > this.CACHE_CLEANUP_INTERVAL) {
                this.cleanupFileCache(now);
                this.lastCacheCleanup = now;
            }

            // Handle new files or file modifications
            if (isNewFile) {
                // New file created - check if it looks like AI-generated code
                if (newContent.length > 50 && this.detectAIPatterns(newContent)) {
                    const aiEvent: AIEvent = {
                        timestamp: Date.now(),
                        type: 'suggestion',
                        sessionId: this.currentSession,
                        fileType: this.getFileType(uri),
                        suggestionLength: newContent.length,
                        acceptedLength: 0,
                        modificationTime: 0,
                        contextSize: newContent.split('\n').length,
                        uri: uriString
                    };

                    this.addEvent(aiEvent);
                    this.lastSuggestion = aiEvent;
                }
            } else if (cached && cached.content !== newContent) {
                // File was modified externally
                const oldLength = cached.content.length;
                const newLength = newContent.length;
                const changeSize = Math.abs(newLength - oldLength);

                // Check if the change looks like AI-generated code
                if (changeSize > 20) {
                    // For better detection, compare the entire new content or significant portions
                    // If file grew significantly, check the new portion
                    let textToCheck = newContent;
                    if (newLength > oldLength && newLength > 100) {
                        // Check the last portion that was likely added
                        const likelyAddedPortion = newContent.substring(Math.max(0, oldLength - 50));
                        textToCheck = likelyAddedPortion;
                    }

                    // Also check if the entire file has AI patterns
                    const hasAIPatterns = this.detectAIPatterns(textToCheck) ||
                        (changeSize > 50 && this.detectAIPatterns(newContent));

                    if (hasAIPatterns || changeSize > 100) {
                        // Record as AI event
                        const aiEvent: AIEvent = {
                            timestamp: Date.now(),
                            type: 'suggestion',
                            sessionId: this.currentSession,
                            fileType: this.getFileType(uri),
                            suggestionLength: changeSize,
                            acceptedLength: 0,
                            modificationTime: 0,
                            contextSize: newContent.split('\n').length,
                            uri: uriString
                        };

                        this.addEvent(aiEvent);
                        this.lastSuggestion = aiEvent;
                    }
                }
            }

            // Update cache with size limit (LRU eviction)
            this.updateFileCache(uriString, newContent, now);

        } catch (error) {
            // File might be deleted or inaccessible - remove from cache
            const uriString = uri.toString();
            this.fileContentCache.delete(uriString);
            // Silently ignore errors to prevent disrupting user workflow
        }
    }

    /**
     * Get file type from URI
     */
    private getFileType(uri: vscode.Uri): string {
        const ext = uri.path.split('.').pop()?.toLowerCase() || '';
        const typeMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescriptreact',
            'js': 'javascript',
            'jsx': 'javascriptreact',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'rb': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kt': 'kotlin'
        };
        return typeMap[ext] || ext;
    }
}
