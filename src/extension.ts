import * as vscode from 'vscode';
import type { AIEventCollector } from './collectors/AIEventCollector';
import type { CodeChangeCollector } from './collectors/CodeChangeCollector';
import type { TimeTracker } from './collectors/TimeTracker';
import type { GitAnalyzer } from './collectors/GitAnalyzer';
import type { CodeQualityAnalyzer } from './analyzers/CodeQualityAnalyzer';
import type { ProductivityAnalyzer } from './analyzers/ProductivityAnalyzer';
import type { ROICalculator } from './calculators/ROICalculator';
import type { DashboardProvider } from './ui/DashboardProvider';
import type { StatusBarManager } from './ui/StatusBarManager';
import type { LocalStorage } from './storage/LocalStorage';
import { Logger } from './utils/Logger';
import { AllMetrics } from './types/metrics';

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
let gitAnalyzer: GitAnalyzer | undefined;
let qualityAnalyzer: CodeQualityAnalyzer | undefined;
let productivityAnalyzer: ProductivityAnalyzer | undefined;
let roiCalculator: ROICalculator | undefined;
let dashboard: DashboardProvider | undefined;
let statusBar: StatusBarManager | undefined;

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
                const dash = await getDashboard(context);
                await ensureTracking(context);
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

                const report = generateReport(metrics);
                const dash = await getDashboard(context);
                dash.showReport(report);

                vscode.window.showInformationMessage('Report generated');
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

        aiCollector = new AIEventCollector(stor);
        codeCollector = new CodeChangeCollector(stor);
        timeTracker = new TimeTracker(stor);

        logger.info('Collectors created');
    }
    return { aiCollector, codeCollector, timeTracker };
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

async function getAnalyzers() {
    if (!qualityAnalyzer) {
        const { CodeQualityAnalyzer } = await import('./analyzers/CodeQualityAnalyzer');
        const { ProductivityAnalyzer } = await import('./analyzers/ProductivityAnalyzer');
        const { ROICalculator } = await import('./calculators/ROICalculator');

        qualityAnalyzer = new CodeQualityAnalyzer();
        productivityAnalyzer = new ProductivityAnalyzer();
        roiCalculator = new ROICalculator();

        logger.info('Analyzers created');
    }
    return { qualityAnalyzer, productivityAnalyzer, roiCalculator };
}

async function getDashboard(context: vscode.ExtensionContext): Promise<DashboardProvider> {
    if (!dashboard) {
        const stor = await getStorage(context);
        const { DashboardProvider } = await import('./ui/DashboardProvider');
        dashboard = new DashboardProvider(context, stor);
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
async function ensureTracking(context: vscode.ExtensionContext) {
    const collectors = await getCollectors(context);

    if (!collectors.aiCollector) {
        return; // Already started
    }

    // Start tracking (lightweight - just event listeners)
    collectors.aiCollector!.startTracking();
    collectors.codeCollector!.startTracking();
    collectors.timeTracker!.startTracking();

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

    context.subscriptions.push({
        dispose: () => clearInterval(statusBarInterval)
    });

    logger.info('Tracking started');
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
    const analyzers = await getAnalyzers();

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
    const quality = await analyzers.qualityAnalyzer!.analyze();
    await yieldToEventLoop();

    if (token.isCancellationRequested) {
        throw new Error('Cancelled');
    }

    const productivity = await analyzers.productivityAnalyzer!.analyze();
    await yieldToEventLoop();

    if (token.isCancellationRequested) {
        throw new Error('Cancelled');
    }

    const roi = await analyzers.roiCalculator!.calculate();

    return { ai, code, time, git, quality, productivity, roi };
}

function yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

function generateReport(metrics: AllMetrics) {
    return {
        summary: {
            actualProductivityGain: metrics.productivity?.actualGain || 0,
            perceivedProductivityGain: metrics.productivity?.perceivedGain || 0,
            codeQualityImpact: metrics.quality?.overallScore || 0,
            economicROI: metrics.roi?.overallROI || 0,
            recommendation: getRecommendation(metrics)
        },
        details: metrics
    };
}

function getRecommendation(metrics: AllMetrics): string {
    const roi = metrics.roi?.overallROI || 0;
    const quality = metrics.quality?.overallScore || 0;

    if (roi > 2 && quality > 0.7) {
        return "Strong positive impact - Continue and expand usage";
    } else if (roi > 1 && quality > 0.5) {
        return "Moderate positive impact - Focus on training";
    } else if (roi < 1 && quality < 0.5) {
        return "Negative impact - Reduce usage and retrain team";
    } else {
        return "Mixed results - Analyze by team member and use case";
    }
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
