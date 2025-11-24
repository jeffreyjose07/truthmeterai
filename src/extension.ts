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

export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('AI Metrics Extension Activating...');

    // Initialize storage
    const storage = new LocalStorage(context);
    await storage.initialize();

    // Check license
    const licenseManager = new LicenseManager();
    const isLicensed = await licenseManager.checkLicense();

    if (!isLicensed) {
        vscode.window.showWarningMessage('AI Metrics: License validation failed. Running in free mode.');
    }

    // Initialize collectors
    const aiCollector = new AIEventCollector(storage);
    const codeCollector = new CodeChangeCollector(storage);
    const timeTracker = new TimeTracker(storage);
    const gitAnalyzer = new GitAnalyzer();

    // Initialize analyzers
    const qualityAnalyzer = new CodeQualityAnalyzer();
    const productivityAnalyzer = new ProductivityAnalyzer();
    const roiCalculator = new ROICalculator();

    // Initialize UI
    const dashboard = new DashboardProvider(context, storage);
    const statusBar = new StatusBarManager();

    // Start collection
    try {
        aiCollector.startTracking();
        codeCollector.startTracking();
        timeTracker.startTracking();
        await gitAnalyzer.initialize();

        logger.info('All collectors started successfully');
    } catch (error) {
        logger.error('Error starting collectors', error);
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('aiMetrics.showDashboard', () => {
            dashboard.show();
        }),

        vscode.commands.registerCommand('aiMetrics.generateReport', async () => {
            try {
                const metrics = await collectAllMetrics();
                const report = generateReport(metrics);
                dashboard.showReport(report);
                vscode.window.showInformationMessage('AI Metrics report generated successfully');
            } catch (error) {
                logger.error('Error generating report', error);
                vscode.window.showErrorMessage('Failed to generate AI Metrics report');
            }
        }),

        vscode.commands.registerCommand('aiMetrics.startTracking', () => {
            vscode.window.showInformationMessage('AI Metrics tracking is active');
            statusBar.show();
        })
    );

    // Update status bar
    statusBar.show();
    const statusBarInterval = setInterval(() => {
        try {
            const stats = aiCollector.getQuickStats();
            statusBar.update(stats);
        } catch (error) {
            logger.error('Error updating status bar', error);
        }
    }, 5000);

    // Periodic analysis
    const analysisInterval = setInterval(async () => {
        try {
            await runPeriodicAnalysis();
        } catch (error) {
            logger.error('Error in periodic analysis', error);
        }
    }, 60000); // Every minute

    // Collect all metrics from different sources
    async function collectAllMetrics(): Promise<AllMetrics> {
        try {
            return {
                ai: await aiCollector.getMetrics(),
                code: await codeCollector.getMetrics(),
                time: await timeTracker.getMetrics(),
                git: await gitAnalyzer.analyze(),
                quality: await qualityAnalyzer.analyze(),
                productivity: await productivityAnalyzer.analyze(),
                roi: await roiCalculator.calculate()
            };
        } catch (error) {
            logger.error('Error collecting metrics', error);
            throw error;
        }
    }

    // Run periodic analysis and show warnings if needed
    async function runPeriodicAnalysis() {
        const metrics = await collectAllMetrics();

        // Check for concerning patterns
        if (metrics.quality && metrics.quality.codeChurn.rate > 0.4) {
            const message = `High code churn detected: ${(metrics.quality.codeChurn.rate * 100).toFixed(1)}% of AI code is being rewritten`;
            vscode.window.showWarningMessage(message);
            statusBar.updateWithWarning('High Churn');
        }

        if (metrics.quality && metrics.quality.duplication.cloneRate > 0.15) {
            const message = `High code duplication: ${(metrics.quality.duplication.cloneRate * 100).toFixed(1)}% of code is duplicated`;
            vscode.window.showWarningMessage(message);
        }

        // Store metrics
        await storage.storeMetrics(metrics);
        logger.info('Periodic analysis completed and metrics stored');
    }

    // Generate a formatted report from metrics
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

    // Generate recommendation based on metrics
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

    // Cleanup on deactivation
    context.subscriptions.push({
        dispose: () => {
            clearInterval(statusBarInterval);
            clearInterval(analysisInterval);
            timeTracker.dispose();
            statusBar.dispose();
            logger.dispose();
        }
    });

    logger.info('AI Metrics Extension Activated Successfully');

    // Show welcome message
    vscode.window.showInformationMessage(
        'AI Metrics is now tracking your AI pair programming effectiveness',
        'Show Dashboard'
    ).then(selection => {
        if (selection === 'Show Dashboard') {
            vscode.commands.executeCommand('aiMetrics.showDashboard');
        }
    });
}

export function deactivate() {
    // Cleanup handled by subscriptions
}
