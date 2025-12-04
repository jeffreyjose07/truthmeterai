import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { AIEventCollector } from './collectors/AIEventCollector';
import type { CodeChangeCollector } from './collectors/CodeChangeCollector';
import type { TimeTracker } from './collectors/TimeTracker';
import type { GitAnalyzer } from './collectors/GitAnalyzer';
import type { PerformanceCollector } from './collectors/PerformanceCollector';
import type { CodeQualityAnalyzer } from './analyzers/CodeQualityAnalyzer';
import type { ProductivityAnalyzer } from './analyzers/ProductivityAnalyzer';
import type { PerformanceAnalyzer } from './analyzers/PerformanceAnalyzer';
import type { ROICalculator } from './calculators/ROICalculator';
import type { DashboardProvider } from './ui/DashboardProvider';
import type { StatusBarManager } from './ui/StatusBarManager';
import type { LocalStorage } from './storage/LocalStorage';
import { Logger } from './utils/Logger';
import { AllMetrics } from './types/metrics';
import { ReportGenerator } from './reporters/ReportGenerator';

/**
 * INDUSTRY BEST PRACTICES VERSION
 *
 * Fixes Based on VS Code Extension Research:
 * 1. ✅ No activation events (auto-activate on command)
 * 2. ✅ Lazy initialization (create only when needed)
 * 3. ✅ Proper subscription management (all in context.subscriptions)
 * 4. ✅ Cancellation token support
 * 5. ✅ Progressive loading (basic → advanced features)
 * 6. ✅ No heavy work during activation
 * 7. ✅ Dispose pattern for cleanup
 */

// Lazy-loaded singletons
let storage: LocalStorage | undefined;
let aiCollector: AIEventCollector | undefined;
let codeCollector: CodeChangeCollector | undefined;
let timeTracker: TimeTracker | undefined;
let perfCollector: PerformanceCollector | undefined;
let gitAnalyzer: GitAnalyzer | undefined;
let qualityAnalyzer: CodeQualityAnalyzer | undefined;
let productivityAnalyzer: ProductivityAnalyzer | undefined;
let perfAnalyzer: PerformanceAnalyzer | undefined;
let roiCalculator: ROICalculator | undefined;
let dashboard: DashboardProvider | undefined;
let statusBar: StatusBarManager | undefined;
let reportGenerator: ReportGenerator | undefined;

let analysisToken: vscode.CancellationTokenSource | undefined;
let logger: Logger;

/**
 * Activation: Ultra-lightweight
 * No heavy initialization - just register commands
 */
export async function activate(context: vscode.ExtensionContext) {
    logger = new Logger();
    logger.info('AI Metrics activating (industry best practices)...');

    // FIX #1: No activation events needed
    // Starting from VS Code 1.74.0, commands auto-activate on first use

    // FIX #2: Lazy initialization
    // Don't create any objects until actually needed

    // FIX #3: All subscriptions added to context
    context.subscriptions.push(
        vscode.commands.registerCommand('aiMetrics.showDashboard', async () => {
            try {
                // Ensure tracking is started first
                await ensureTracking(context);
                
                const dash = await getDashboard(context);

                // Calculate and store fresh metrics before showing dashboard
                await calculateAndStoreMetrics(context);

                // Small delay to ensure metrics are stored
                await new Promise(resolve => setTimeout(resolve, 100));

                dash.show();
            } catch (error) {
                logger.error('Error showing dashboard', error);
                vscode.window.showErrorMessage('Failed to show dashboard');
            }
        }),

        vscode.commands.registerCommand('aiMetrics.generateReport', async () => {
            try {
                const cts = new vscode.CancellationTokenSource();
                context.subscriptions.push(cts);

                const metrics = await collectAllMetrics(context, cts.token);

                if (cts.token.isCancellationRequested) {
                    return;
                }

                // Generate HTML Content
                if (!reportGenerator) {
                    reportGenerator = new ReportGenerator(context.extensionPath);
                }
                
                const workspaceName = vscode.workspace.name || 'Project';
                const htmlContent = reportGenerator.generateHTML(metrics, workspaceName);

                // Prompt user to save
                const defaultUri = vscode.workspace.workspaceFolders 
                    ? vscode.Uri.file(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'AI_Impact_Report.html'))
                    : undefined;

                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: defaultUri,
                    filters: {
                        'HTML Files': ['html']
                    },
                    title: 'Save AI Impact Report'
                });

                if (saveUri) {
                    fs.writeFileSync(saveUri.fsPath, htmlContent);
                    
                    const action = await vscode.window.showInformationMessage(
                        `Report saved to ${path.basename(saveUri.fsPath)}`,
                        'Open Report',
                        'Open in Browser'
                    );

                    if (action === 'Open Report') {
                        const doc = await vscode.workspace.openTextDocument(saveUri);
                        await vscode.window.showTextDocument(doc);
                    } else if (action === 'Open in Browser') {
                        await vscode.env.openExternal(saveUri);
                    }
                }
            } catch (error) {
                logger.error('Error generating report', error);
                vscode.window.showErrorMessage('Failed to generate report');
            }
        }),

        vscode.commands.registerCommand('aiMetrics.startTracking', async () => {
            try {
                await ensureTracking(context);
                vscode.window.showInformationMessage('Tracking started');

                const bar = await getStatusBar(context);
                bar.show();
            } catch (error) {
                logger.error('Error starting tracking', error);
            }
        }),

        // FIX #4: Cancellation support
        vscode.commands.registerCommand('aiMetrics.stopAnalysis', () => {
            if (analysisToken) {
                analysisToken.cancel();
                analysisToken.dispose();
                analysisToken = undefined;
            }
        }),

        vscode.commands.registerCommand('aiMetrics.promptSatisfactionSurvey', async () => {
            const options = [
                { label: '😊 Great', description: '5 - Very Satisfied' },
                { label: '🙂 Good', description: '4 - Satisfied' },
                { label: '😐 Neutral', description: '3 - Neither Satisfied nor Dissatisfied' },
                { label: '🙁 Bad', description: '2 - Dissatisfied' },
                { label: '😞 Terrible', description: '1 - Very Dissatisfied' },
            ];
            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'How was your recent coding session experience with AI?',
                canPickMany: false
            });

            if (selection) {
                const stor = await getStorage(context);
                const rating = parseInt(selection.description.split(' ')[0], 10);
                stor.store('satisfaction_feedback', {
                    timestamp: Date.now(),
                    rating: rating,
                    label: selection.label
                });
                logger.info(`User satisfaction recorded: ${rating}`);
                vscode.window.showInformationMessage(`Thank you for your feedback: ${selection.label}`);
            }
        })
    );

    logger.info('AI Metrics activated (lightweight - no resources allocated)');

    // FIX #6: No welcome message during activation
    // Show it only after 5 seconds if user hasn't used it yet
    const welcomeTimer = setTimeout(() => {
        const config = vscode.workspace.getConfiguration('aiMetrics');
        if (config.get('enableTracking')) {
            vscode.window.showInformationMessage(
                'AI Metrics is ready',
                'Show Dashboard',
                'Dismiss'
            ).then(selection => {
                if (selection === 'Show Dashboard') {
                    vscode.commands.executeCommand('aiMetrics.showDashboard');
                }
            });
        }
    }, 5000);

    context.subscriptions.push({
        dispose: () => clearTimeout(welcomeTimer)
    });
}

/**
 * FIX #2: Lazy getters - create on demand
 */
async function getStorage(context: vscode.ExtensionContext): Promise<LocalStorage> {
    if (!storage) {
        const { LocalStorage } = await import('./storage/LocalStorage');
        storage = new LocalStorage(context);
        await storage.initialize();
        logger.info('Storage initialized');
    }
    return storage;
}

async function getCollectors(context: vscode.ExtensionContext) {
    if (!aiCollector) {
        const stor = await getStorage(context);
        const { AIEventCollector } = await import('./collectors/AIEventCollector');
        const { CodeChangeCollector } = await import('./collectors/CodeChangeCollector');
        const { TimeTracker } = await import('./collectors/TimeTracker');
        const { PerformanceCollector } = await import('./collectors/PerformanceCollector');

        aiCollector = new AIEventCollector(stor);
        codeCollector = new CodeChangeCollector(stor);
        timeTracker = new TimeTracker(stor);
        perfCollector = new PerformanceCollector();

        logger.info('Collectors created');
    }
    return { aiCollector, codeCollector, timeTracker, perfCollector };
}

async function getGitAnalyzer(): Promise<GitAnalyzer> {
    if (!gitAnalyzer) {
        const { GitAnalyzer } = await import('./collectors/GitAnalyzer');
        gitAnalyzer = new GitAnalyzer();
        await gitAnalyzer.initialize();
        logger.info('Git analyzer initialized');
    }
    return gitAnalyzer;
}

async function getAnalyzers(context: vscode.ExtensionContext) {
    if (!qualityAnalyzer) {
        const stor = await getStorage(context); // Get storage instance
        const { CodeQualityAnalyzer } = await import('./analyzers/CodeQualityAnalyzer');
        const { ProductivityAnalyzer } = await import('./analyzers/ProductivityAnalyzer');
        const { PerformanceAnalyzer } = await import('./analyzers/PerformanceAnalyzer');
        const { ROICalculator } = await import('./calculators/ROICalculator');

        qualityAnalyzer = new CodeQualityAnalyzer();
        productivityAnalyzer = new ProductivityAnalyzer(stor); // Pass storage to ProductivityAnalyzer
        perfAnalyzer = new PerformanceAnalyzer();
        roiCalculator = new ROICalculator();

        logger.info('Analyzers created');
    }
    return { qualityAnalyzer, productivityAnalyzer, perfAnalyzer, roiCalculator };
}

async function getDashboard(context: vscode.ExtensionContext): Promise<DashboardProvider> {
    if (!dashboard) {
        const stor = await getStorage(context);
        const collectors = await getCollectors(context); // Get collectors here
        const { DashboardProvider } = await import('./ui/DashboardProvider');
        dashboard = new DashboardProvider(context, stor, collectors.aiCollector!, collectors.timeTracker!);

        // Set refresh callback to recalculate metrics
        dashboard.setRefreshCallback(async () => {
            await calculateAndStoreMetrics(context);
        });

        logger.info('Dashboard created');
    }
    return dashboard;
}

async function getStatusBar(context: vscode.ExtensionContext): Promise<StatusBarManager> {
    if (!statusBar) {
        const { StatusBarManager } = await import('./ui/StatusBarManager');
        statusBar = new StatusBarManager();
        context.subscriptions.push(statusBar);
        logger.info('Status bar created');
    }
    return statusBar;
}

/**
 * FIX #5: Progressive loading
 * Start tracking only when needed
 */
// Track if we've already started tracking to avoid duplicate initialization
let trackingStarted = false;

async function ensureTracking(context: vscode.ExtensionContext) {
    // Avoid starting tracking multiple times
    if (trackingStarted) {
        logger.info('Tracking already started, skipping re-initialization');
        return;
    }

    logger.info('Starting tracking for the first time...');
    const collectors = await getCollectors(context);

    if (!collectors.aiCollector || !collectors.codeCollector || !collectors.timeTracker) {
        logger.error('Collectors not initialized properly');
        return;
    }

    // Start tracking (lightweight - just event listeners)
    collectors.aiCollector.startTracking();
    collectors.codeCollector.startTracking();
    collectors.timeTracker.startTracking();
    // Performance collector starts automatically in constructor but needs disposal

    trackingStarted = true;
    logger.info('Tracking started successfully!');

    // Git analyzer is expensive - delay it
    setTimeout(async () => {
        try {
            await getGitAnalyzer();
        } catch (error) {
            logger.error('Git analyzer failed to initialize', error);
        }
    }, 10000); // 10 seconds after first use

    // Start periodic updates (only for status bar)
    const statusBarInterval = setInterval(async () => {
        try {
            const bar = await getStatusBar(context);
            const stats = collectors.aiCollector!.getQuickStats();
            bar.update(stats);
        } catch (error) {
            logger.error('Error updating status bar', error);
        }
    }, 15000); // Every 15 seconds

    // Start periodic metrics calculation and storage
    const metricsInterval = setInterval(async () => {
        try {
            await calculateAndStoreMetrics(context);
        } catch (error) {
            logger.error('Error calculating metrics', error);
        }
    }, 60000); // Every 60 seconds

    context.subscriptions.push({
        dispose: () => {
            clearInterval(statusBarInterval);
            clearInterval(metricsInterval);
        }
    });

    logger.info('Tracking started');
}

/**
 * Calculate and store metrics periodically
 */
async function calculateAndStoreMetrics(context: vscode.ExtensionContext): Promise<void> {
    try {
        const stor = await getStorage(context);
        const collectors = await getCollectors(context);
        const analyzers = await getAnalyzers(context); // Pass context here

        // 1. Collect raw data from collectors
        const [aiMetrics, codeMetrics, timeMetrics] = await Promise.all([
            collectors.aiCollector!.getMetrics(),
            collectors.codeCollector!.getMetrics(),
            collectors.timeTracker!.getMetrics()
        ]);

        const perfEvents = collectors.perfCollector!.getEvents();
        const rawAIEvents = collectors.aiCollector!.getRawEvents();

        logger.info(`Raw metrics collected: Suggestions=${aiMetrics.totalSuggestions}, ActiveTime=${timeMetrics.totalActiveTime}`);

        // 2. Run analysis using the raw data
        // Note: Git analysis is skipped here for speed as it can be slow
        
        const qualityMetrics = await analyzers.qualityAnalyzer!.analyze(undefined, aiMetrics);
        const productivityMetrics = await analyzers.productivityAnalyzer!.analyze(aiMetrics, codeMetrics, timeMetrics);
        const perfMetrics = analyzers.perfAnalyzer!.analyze(perfEvents, rawAIEvents);
        
        // Pass productivity metrics to ROI calculator
        const roiMetrics = await analyzers.roiCalculator!.calculate(productivityMetrics); 

        // 3. Construct the full metrics object
        const metrics: AllMetrics & { timestamp: number } = {
            timestamp: Date.now(),
            ai: aiMetrics,
            code: codeMetrics,
            time: timeMetrics,
            quality: qualityMetrics,
            productivity: productivityMetrics,
            performance: perfMetrics,
            roi: roiMetrics
        };

        // 4. Store the result
        await stor.storeMetrics(metrics);
        logger.info(`Full metrics calculated and stored. ROI=${metrics.roi?.overallROI}`);
        
    } catch (error) {
        logger.error('Error in calculateAndStoreMetrics', error);
        throw error;
    }
}

/**
 * FIX #4: Cancellation token support
 */
async function collectAllMetrics(
    context: vscode.ExtensionContext,
    token: vscode.CancellationToken
): Promise<AllMetrics> {
    if (token.isCancellationRequested) {
        throw new Error('Cancelled');
    }

    const collectors = await getCollectors(context);
    const analyzers = await getAnalyzers(context); // Pass context here

    // Collect basic metrics (fast)
    const [ai, code, time] = await Promise.all([
        collectors.aiCollector!.getMetrics(),
        collectors.codeCollector!.getMetrics(),
        collectors.timeTracker!.getMetrics()
    ]);

    if (token.isCancellationRequested) {
        throw new Error('Cancelled');
    }

    // Git analysis (slow - allow cancellation)
    const git = await getGitAnalyzer().then(g => g.analyze());

    if (token.isCancellationRequested) {
        throw new Error('Cancelled');
    }

    // Heavy analysis (allow cancellation between steps)
    const quality = await analyzers.qualityAnalyzer!.analyze(git, ai);
    await yieldToEventLoop();

    if (token.isCancellationRequested) {
        throw new Error('Cancelled');
    }

    const productivity = await analyzers.productivityAnalyzer!.analyze();
    await yieldToEventLoop();

    if (token.isCancellationRequested) {
        throw new Error('Cancelled');
    }

    const perfEvents = collectors.perfCollector!.getEvents();
    const rawAIEvents = collectors.aiCollector!.getRawEvents();
    const performance = analyzers.perfAnalyzer!.analyze(perfEvents, rawAIEvents);

    const roi = await analyzers.roiCalculator!.calculate();

    return { ai, code, time, git, quality, productivity, performance, roi };
}

function yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

/**
 * FIX #7: Proper cleanup
 */
export function deactivate() {
    logger.info('Deactivating...');

    // Cancel any running analysis
    if (analysisToken) {
        analysisToken.cancel();
        analysisToken.dispose();
    }

    // Dispose all collectors
    (aiCollector as any)?.dispose?.();
    (codeCollector as any)?.dispose?.();
    (timeTracker as any)?.dispose?.();
    (perfCollector as any)?.dispose?.();

    // Dispose UI
    statusBar?.dispose();
    (dashboard as any)?.dispose?.();

    logger.dispose();

    // Clear references for GC
    storage = undefined;
    aiCollector = undefined;
    codeCollector = undefined;
    timeTracker = undefined;
    gitAnalyzer = undefined;
    qualityAnalyzer = undefined;
    productivityAnalyzer = undefined;
    roiCalculator = undefined;
    dashboard = undefined;
    statusBar = undefined;

    logger.info('Deactivated');
}
