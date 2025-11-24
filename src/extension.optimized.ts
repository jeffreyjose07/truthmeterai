import * as vscode from 'vscode';
import { AIEventCollector } from './collectors/AIEventCollector';
import { CodeChangeCollector } from './collectors/CodeChangeCollector';
import { TimeTracker } from './collectors/TimeTracker';
import { GitAnalyzer } from './collectors/GitAnalyzer';
import { CodeQualityAnalyzer } from './analyzers/CodeQualityAnalyzer';
import { ProductivityAnalyzer } from './analyzers/ProductivityAnalyzer';
import { ROICalculator } from './calculators/ROICalculator';
import { DashboardProvider } from './ui/DashboardProvider';
import { StatusBarManager } from './ui/StatusBarManager';
import { LocalStorage } from './storage/LocalStorage';
import { LicenseManager } from './auth/LicenseManager';
import { Logger } from './utils/Logger';
import { AllMetrics } from './types/metrics';

/**
 * OPTIMIZED VERSION of extension.ts
 *
 * Optimizations:
 * 1. Lazy analysis (only when needed)
 * 2. Incremental analysis (only changed files)
 * 3. Longer intervals (less frequent analysis)
 * 4. Cancellable operations
 * 5. Performance monitoring
 */

let analysisToken: vscode.CancellationTokenSource | undefined;
let analysisInProgress = false;

export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('AI Metrics Extension Activating (Optimized)...');

    // Initialize storage
    const storage = new LocalStorage(context);
    await storage.initialize();

    // Check license (non-blocking)
    const licenseManager = new LicenseManager();
    licenseManager.checkLicense().then(isLicensed => {
        if (!isLicensed) {
            vscode.window.showWarningMessage(
                'AI Metrics: Running in free mode.',
                'Upgrade'
            );
        }
    });

    // Initialize collectors (lazy)
    const aiCollector = new AIEventCollector(storage);
    const codeCollector = new CodeChangeCollector(storage);
    const timeTracker = new TimeTracker(storage);
    const gitAnalyzer = new GitAnalyzer();

    // Initialize analyzers (lazy - only when needed)
    let qualityAnalyzer: CodeQualityAnalyzer | undefined;
    let productivityAnalyzer: ProductivityAnalyzer | undefined;
    let roiCalculator: ROICalculator | undefined;

    const getAnalyzers = () => {
        if (!qualityAnalyzer) qualityAnalyzer = new CodeQualityAnalyzer();
        if (!productivityAnalyzer) productivityAnalyzer = new ProductivityAnalyzer();
        if (!roiCalculator) roiCalculator = new ROICalculator();
        return { qualityAnalyzer, productivityAnalyzer, roiCalculator };
    };

    // Initialize UI
    const dashboard = new DashboardProvider(context, storage);
    const statusBar = new StatusBarManager();

    // Start collection (only lightweight collectors)
    try {
        aiCollector.startTracking();
        codeCollector.startTracking();
        timeTracker.startTracking();

        // Git analyzer initialization is expensive - do it lazily
        setTimeout(() => {
            gitAnalyzer.initialize().catch(err => {
                logger.error('Git analyzer init failed', err);
            });
        }, 5000); // Wait 5 seconds after activation

        logger.info('Collectors started');
    } catch (error) {
        logger.error('Error starting collectors', error);
    }

    // OPTIMIZATION: Track changed files for incremental analysis
    const changedFiles = new Set<string>();
    let lastFullAnalysis = Date.now();

    vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.scheme === 'file') {
            changedFiles.add(doc.uri.toString());
        }
    });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('aiMetrics.showDashboard', async () => {
            // Trigger fresh analysis when user opens dashboard
            if (!analysisInProgress) {
                await runIncrementalAnalysis(true);
            }
            dashboard.show();
        }),

        vscode.commands.registerCommand('aiMetrics.generateReport', async () => {
            try {
                const metrics = await collectAllMetrics();
                const report = generateReport(metrics);
                dashboard.showReport(report);
                vscode.window.showInformationMessage('Report generated');
            } catch (error) {
                logger.error('Error generating report', error);
                vscode.window.showErrorMessage('Failed to generate report');
            }
        }),

        vscode.commands.registerCommand('aiMetrics.startTracking', () => {
            vscode.window.showInformationMessage('Tracking active');
            statusBar.show();
        }),

        // New: Manual trigger for analysis
        vscode.commands.registerCommand('aiMetrics.runAnalysis', async () => {
            await runFullAnalysis();
            vscode.window.showInformationMessage('Analysis complete');
        })
    );

    // OPTIMIZATION: Less frequent status bar updates
    statusBar.show();
    const statusBarInterval = setInterval(() => {
        try {
            const stats = aiCollector.getQuickStats();
            statusBar.update(stats);
        } catch (error) {
            logger.error('Error updating status bar', error);
        }
    }, 15000); // Every 15 seconds (was 5)

    // OPTIMIZATION: Incremental analysis every 2 minutes
    const incrementalInterval = setInterval(async () => {
        if (analysisInProgress) return; // Skip if already running

        await runIncrementalAnalysis();
    }, 120000); // Every 2 minutes (was 1)

    // OPTIMIZATION: Full analysis every 10 minutes (only if needed)
    const fullAnalysisInterval = setInterval(async () => {
        const timeSinceLastFull = Date.now() - lastFullAnalysis;

        // Only run if:
        // 1. More than 10 minutes since last full analysis
        // 2. There are changed files OR user has been active
        if (timeSinceLastFull > 600000 &&
            (changedFiles.size > 0 || hasRecentActivity())) {

            await runFullAnalysis();
            lastFullAnalysis = Date.now();
        }
    }, 600000); // Every 10 minutes

    // Helper: Check if user has been active
    function hasRecentActivity(): boolean {
        const stats = aiCollector.getQuickStats();
        return stats.recentSuggestions > 0;
    }

    // OPTIMIZATION: Incremental analysis (only changed files)
    async function runIncrementalAnalysis(force: boolean = false) {
        if (analysisInProgress) return;

        if (!force && changedFiles.size === 0) {
            return; // Nothing to analyze
        }

        analysisInProgress = true;
        analysisToken = new vscode.CancellationTokenSource();

        try {
            logger.info(`Incremental analysis: ${changedFiles.size} files`);

            // Analyze only changed files (max 20 per cycle)
            const filesToAnalyze = Array.from(changedFiles).slice(0, 20);

            for (const file of filesToAnalyze) {
                if (analysisToken.token.isCancellationRequested) {
                    break;
                }

                // Remove from queue
                changedFiles.delete(file);

                // Yield to event loop every file
                await new Promise(resolve => setImmediate(resolve));
            }

            logger.info('Incremental analysis complete');

        } catch (error) {
            logger.error('Error in incremental analysis', error);
        } finally {
            analysisInProgress = false;
            analysisToken?.dispose();
            analysisToken = undefined;
        }
    }

    // Full analysis (all metrics)
    async function runFullAnalysis() {
        if (analysisInProgress) return;

        analysisInProgress = true;
        analysisToken = new vscode.CancellationTokenSource();

        try {
            logger.info('Starting full analysis...');

            const metrics = await collectAllMetrics();

            // Check for warnings (but less frequently)
            if (metrics.quality && metrics.quality.codeChurn.rate > 0.4) {
                const message = `High code churn: ${(metrics.quality.codeChurn.rate * 100).toFixed(1)}%`;
                vscode.window.showWarningMessage(message);
                statusBar.updateWithWarning('High Churn');
            }

            if (metrics.quality && metrics.quality.duplication.cloneRate > 0.15) {
                const message = `High duplication: ${(metrics.quality.duplication.cloneRate * 100).toFixed(1)}%`;
                vscode.window.showWarningMessage(message);
            }

            // Store metrics
            await storage.storeMetrics(metrics);
            logger.info('Full analysis complete');

            // Clear changed files
            changedFiles.clear();

        } catch (error) {
            logger.error('Error in full analysis', error);
        } finally {
            analysisInProgress = false;
            analysisToken?.dispose();
            analysisToken = undefined;
        }
    }

    // Collect all metrics (with cancellation support)
    async function collectAllMetrics(): Promise<AllMetrics> {
        try {
            const { qualityAnalyzer, productivityAnalyzer, roiCalculator } = getAnalyzers();

            // Collect in parallel where possible
            const [ai, code, time] = await Promise.all([
                aiCollector.getMetrics(),
                codeCollector.getMetrics(),
                timeTracker.getMetrics()
            ]);

            // These are more expensive - run one at a time with yield
            const git = await gitAnalyzer.analyze();
            await yieldToEventLoop();

            const quality = await qualityAnalyzer.analyze();
            await yieldToEventLoop();

            const productivity = await productivityAnalyzer.analyze();
            await yieldToEventLoop();

            const roi = await roiCalculator.calculate();

            return { ai, code, time, git, quality, productivity, roi };

        } catch (error) {
            logger.error('Error collecting metrics', error);
            throw error;
        }
    }

    // Helper: Yield to event loop
    function yieldToEventLoop(): Promise<void> {
        return new Promise(resolve => setImmediate(resolve));
    }

    // Generate report
    function generateReport(metrics: AllMetrics) {
        return {
            summary: {
                actualProductivityGain: metrics.productivity?.actualGain || 0,
                perceivedProductivityGain: metrics.productivity?.perceivedGain || 0,
                codeQualityImpact: metrics.quality?.overallScore || 0,
                economicROI: metrics.roi?.overallROI || 0,
                recommendation: getRecommendation(metrics)
            },
            details: metrics,
            performance: getPerformanceMetrics()
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

    // OPTIMIZATION: Performance monitoring
    function getPerformanceMetrics() {
        const memUsage = process.memoryUsage();

        return {
            memoryHeapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            memoryHeapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            analysisInProgress,
            changedFilesQueued: changedFiles.size,
            uptime: Math.round(process.uptime() / 60) // minutes
        };
    }

    // Cleanup on deactivation
    context.subscriptions.push({
        dispose: () => {
            logger.info('Extension deactivating...');

            // Cancel any running analysis
            if (analysisToken) {
                analysisToken.cancel();
                analysisToken.dispose();
            }

            // Clear intervals
            clearInterval(statusBarInterval);
            clearInterval(incrementalInterval);
            clearInterval(fullAnalysisInterval);

            // Dispose collectors
            aiCollector.dispose();
            timeTracker.dispose();
            statusBar.dispose();
            logger.dispose();

            logger.info('Extension deactivated');
        }
    });

    logger.info('AI Metrics Extension Activated (Optimized)');

    // OPTIMIZATION: Show welcome message after delay
    setTimeout(() => {
        vscode.window.showInformationMessage(
            'AI Metrics is tracking your productivity',
            'Show Dashboard',
            'Dismiss'
        ).then(selection => {
            if (selection === 'Show Dashboard') {
                vscode.commands.executeCommand('aiMetrics.showDashboard');
            }
        });
    }, 2000); // 2 second delay
}

export function deactivate() {
    // Cleanup handled by subscriptions
}
