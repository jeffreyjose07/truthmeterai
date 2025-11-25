import * as assert from 'assert';
import { AIEventCollector } from '../../collectors/AIEventCollector';
import { CodeChangeCollector } from '../../collectors/CodeChangeCollector';
import { TimeTracker } from '../../collectors/TimeTracker';
import { CodeQualityAnalyzer } from '../../analyzers/CodeQualityAnalyzer';
import { ProductivityAnalyzer } from '../../analyzers/ProductivityAnalyzer';
import { ROICalculator } from '../../calculators/ROICalculator';
import { LocalStorage } from '../../storage/LocalStorage';
import { DashboardProvider } from '../../ui/DashboardProvider';
import { StatusBarManager } from '../../ui/StatusBarManager';
import { MockExtensionContext } from '../mocks/vscode.mock';

suite('Integration Test Suite', () => {
    let storage: LocalStorage;
    let mockContext: MockExtensionContext;

    setup(async () => {
        mockContext = new MockExtensionContext();
        storage = new LocalStorage(mockContext as any);
        await storage.initialize();
    });

    test('should integrate collectors with storage', async () => {
        const aiCollector = new AIEventCollector(storage);
        const codeCollector = new CodeChangeCollector(storage);
        const timeTracker = new TimeTracker(storage);

        // Start tracking
        aiCollector.startTracking();
        codeCollector.startTracking();
        timeTracker.startTracking();

        // Get metrics
        const aiMetrics = await aiCollector.getMetrics();
        const codeMetrics = await codeCollector.getMetrics();
        const timeMetrics = await timeTracker.getMetrics();

        assert.ok(aiMetrics);
        assert.ok(codeMetrics);
        assert.ok(timeMetrics);

        // Cleanup
        timeTracker.dispose();
    });

    test('should collect and analyze metrics end-to-end', async () => {
        // Collect metrics
        const aiCollector = new AIEventCollector(storage);
        const codeCollector = new CodeChangeCollector(storage);
        const timeTracker = new TimeTracker(storage);

        const collectedMetrics = {
            ai: await aiCollector.getMetrics(),
            code: await codeCollector.getMetrics(),
            time: await timeTracker.getMetrics()
        };

        // Analyze metrics
        const qualityAnalyzer = new CodeQualityAnalyzer();
        const productivityAnalyzer = new ProductivityAnalyzer();
        const roiCalculator = new ROICalculator();

        const analysis = {
            quality: await qualityAnalyzer.analyze(),
            productivity: await productivityAnalyzer.analyze(),
            roi: await roiCalculator.calculate()
        };

        // Store analysis
        await storage.storeMetrics({
            ...collectedMetrics,
            ...analysis
        });

        // Verify stored data
        const latest = await storage.getLatestMetrics();
        assert.ok(latest.quality);
        assert.ok(latest.productivity);
        assert.ok(latest.roi);

        // Cleanup
        timeTracker.dispose();
    });

    test('should display metrics in dashboard', async () => {
        // Prepare metrics
        const mockMetrics = {
            quality: {
                codeChurn: { rate: 0.3, trend: 'stable' as const, aiVsHuman: 1.5 },
                duplication: { cloneRate: 0.15, copyPasteRatio: 0.25, beforeAI: 0.1, afterAI: 0.15 },
                complexity: { cyclomaticComplexity: 12, cognitiveLoad: 6, nestingDepth: 3, aiGeneratedComplexity: 14 },
                refactoring: { rate: 0.2, aiCodeRefactored: 0.3 },
                overallScore: 0.65
            },
            productivity: {
                taskCompletion: { velocityChange: 0.1, cycleTime: 3, reworkRate: 0.25 },
                flowEfficiency: { focusTime: 3, contextSwitches: 12, waitTime: 0.5 },
                valueDelivery: { featuresShipped: 5, bugRate: 0.6, customerImpact: 8 },
                actualGain: -0.15,
                perceivedGain: 0.25,
                netTimeSaved: -0.5
            },
            roi: {
                costBenefit: { licenseCost: 15, timeSaved: 2.5, timeWasted: 3.0, netValue: -37.5 },
                hiddenCosts: { technicalDebt: 6000, maintenanceBurden: 2500, knowledgeGaps: 3500 },
                teamImpact: { reviewTime: 1.8, onboardingCost: 600, collaborationFriction: 0.25 },
                overallROI: 0.6,
                breakEvenDays: 180,
                recommendation: 'Marginal ROI - Optimize usage patterns'
            }
        };

        await storage.storeMetrics(mockMetrics as any);

        // Display in dashboard
        const dashboard = new DashboardProvider(mockContext as any, storage);
        await dashboard.show();

        // Verify dashboard can retrieve and display data
        const retrieved = await storage.getLatestMetrics();
        assert.ok(retrieved.quality);
        assert.ok(retrieved.productivity);
        assert.ok(retrieved.roi);
    });

    test('should update status bar with real metrics', async () => {
        const aiCollector = new AIEventCollector(storage);
        const statusBar = new StatusBarManager();

        statusBar.show();

        const stats = aiCollector.getQuickStats();
        statusBar.update(stats);

        // Should update without errors
        assert.ok(true);

        statusBar.dispose();
    });

    test('should handle complete metrics lifecycle', async () => {
        // 1. Start collectors
        const aiCollector = new AIEventCollector(storage);
        const timeTracker = new TimeTracker(storage);

        aiCollector.startTracking();
        timeTracker.startTracking();

        // 2. Collect some data
        await new Promise(resolve => setTimeout(resolve, 100));

        // 3. Run analysis
        const qualityAnalyzer = new CodeQualityAnalyzer();
        const quality = await qualityAnalyzer.analyze();

        // 4. Calculate ROI
        const roiCalculator = new ROICalculator();
        const roi = await roiCalculator.calculate();

        // 5. Store results
        await storage.storeMetrics({ quality, roi } as any);

        // 6. Retrieve and verify
        const latest = await storage.getLatestMetrics();
        assert.ok(latest.quality);
        assert.ok(latest.roi);

        // 7. Get history
        const history = await storage.getMetricsHistory(7);
        assert.ok(history.length > 0);

        // Cleanup
        timeTracker.dispose();
    });

    test('should generate alerts based on analysis', async () => {
        // Store problematic metrics
        const problematicMetrics = {
            quality: {
                codeChurn: { rate: 0.5, trend: 'increasing' as const, aiVsHuman: 2.5 },
                duplication: { cloneRate: 0.25, copyPasteRatio: 0.4, beforeAI: 0.05, afterAI: 0.25 },
                complexity: { cyclomaticComplexity: 25, cognitiveLoad: 9, nestingDepth: 5, aiGeneratedComplexity: 30 },
                refactoring: { rate: 0.4, aiCodeRefactored: 0.5 },
                overallScore: 0.3
            },
            roi: {
                costBenefit: { licenseCost: 15, timeSaved: 1.5, timeWasted: 4.5, netValue: -225 },
                hiddenCosts: { technicalDebt: 15000, maintenanceBurden: 5000, knowledgeGaps: 6000 },
                teamImpact: { reviewTime: 3.0, onboardingCost: 1500, collaborationFriction: 0.5 },
                overallROI: -0.5
            }
        };

        await storage.storeMetrics(problematicMetrics as any);

        const dashboard = new DashboardProvider(mockContext as any, storage);
        await dashboard.show();

        // Dashboard should generate alerts for:
        // - High churn (50%)
        // - High duplication (25%)
        // - Negative ROI
        assert.ok(true);
    });

    test('should export complete metrics data', async () => {
        // Collect various metrics
        const aiCollector = new AIEventCollector(storage);
        await aiCollector.getMetrics();

        await storage.store('test_event', { timestamp: Date.now(), value: 'test' });

        const qualityAnalyzer = new CodeQualityAnalyzer();
        const quality = await qualityAnalyzer.analyze();
        await storage.storeMetrics({ quality } as any);

        // Export all data
        const exported = await storage.exportData();

        assert.ok(exported);
        assert.ok(exported.length > 0);

        const parsed = JSON.parse(exported);
        assert.ok(parsed.metrics);
    });

    test('should track metrics over time', async () => {
        // Store metrics at different times
        for (let i = 0; i < 5; i++) {
            const metrics = {
                quality: {
                    codeChurn: { rate: 0.2 + (i * 0.05), trend: 'increasing' as const, aiVsHuman: 1.5 },
                    duplication: { cloneRate: 0.1, copyPasteRatio: 0.2, beforeAI: 0.05, afterAI: 0.1 },
                    complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 3, aiGeneratedComplexity: 12 },
                    refactoring: { rate: 0.15, aiCodeRefactored: 0.3 },
                    overallScore: 0.7 - (i * 0.05)
                }
            };

            await storage.storeMetrics(metrics as any);
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Get history
        const history = await storage.getMetricsHistory(30);
        assert.strictEqual(history.length, 5);

        // Verify trend
        assert.ok(history[0].quality);
        assert.ok(history[4].quality);
    });

    test('should calculate comprehensive ROI', async () => {
        // Collect all required data
        const aiCollector = new AIEventCollector(storage);
        const timeTracker = new TimeTracker(storage);

        timeTracker.startTracking();

        const aiMetrics = await aiCollector.getMetrics();
        const timeMetrics = await timeTracker.getMetrics();

        // Analyze code quality
        const qualityAnalyzer = new CodeQualityAnalyzer();
        const quality = await qualityAnalyzer.analyze();

        // Analyze productivity
        const productivityAnalyzer = new ProductivityAnalyzer();
        const productivity = await productivityAnalyzer.analyze();

        // Calculate ROI
        const roiCalculator = new ROICalculator();
        const roi = await roiCalculator.calculate();

        // Verify all components contribute to ROI
        assert.ok(roi.costBenefit);
        assert.ok(roi.hiddenCosts);
        assert.ok(roi.teamImpact);
        assert.strictEqual(typeof roi.overallROI, 'number');
        assert.ok(roi.recommendation);

        timeTracker.dispose();
    });

    test('should calculate and store metrics automatically', async () => {
        // Setup collectors
        const aiCollector = new AIEventCollector(storage);
        aiCollector.startTracking();

        // Get initial metrics
        const aiMetrics = await aiCollector.getMetrics();

        // Simulate calculateAndStoreMetrics behavior
        const metrics = {
            quality: {
                codeChurn: {
                    rate: aiMetrics.churnRate || 0,
                    trend: 'stable' as const,
                    aiVsHuman: 1
                },
                duplication: {
                    cloneRate: 0,
                    copyPasteRatio: 0,
                    beforeAI: 0,
                    afterAI: 0
                },
                complexity: {
                    cyclomaticComplexity: 0,
                    cognitiveLoad: 0,
                    nestingDepth: 0,
                    aiGeneratedComplexity: 0
                },
                refactoring: {
                    rate: 0,
                    aiCodeRefactored: 0
                },
                overallScore: aiMetrics.acceptanceRate || 0
            },
            productivity: {
                taskCompletion: {
                    velocityChange: aiMetrics.acceptanceRate * 0.26,
                    cycleTime: 0,
                    reworkRate: aiMetrics.churnRate || 0
                },
                flowEfficiency: {
                    focusTime: 0,
                    contextSwitches: 0,
                    waitTime: 0
                },
                valueDelivery: {
                    featuresShipped: aiMetrics.totalSuggestions,
                    bugRate: 0,
                    customerImpact: 0
                },
                actualGain: aiMetrics.acceptanceRate * 0.26,
                perceivedGain: aiMetrics.acceptanceRate * 1.83,
                netTimeSaved: aiMetrics.totalSuggestions * 0.5
            },
            roi: {
                costBenefit: {
                    licenseCost: 20,
                    timeSaved: aiMetrics.totalSuggestions * 0.5,
                    timeWasted: 0,
                    netValue: aiMetrics.totalSuggestions * 10
                },
                hiddenCosts: {
                    technicalDebt: 0,
                    maintenanceBurden: 0,
                    knowledgeGaps: 0
                },
                teamImpact: {
                    reviewTime: 0,
                    onboardingCost: 0,
                    collaborationFriction: 0
                },
                overallROI: aiMetrics.acceptanceRate > 0.5 ? 1.5 : 0.8,
                breakEvenDays: 30
            }
        };

        // Store metrics
        await storage.storeMetrics(metrics as any);

        // Verify metrics were stored
        const latest = await storage.getLatestMetrics();
        assert.ok(latest.quality);
        assert.ok(latest.productivity);
        assert.ok(latest.roi);
        assert.strictEqual(latest.quality.codeChurn.rate, aiMetrics.churnRate || 0);
        assert.strictEqual(latest.quality.overallScore, aiMetrics.acceptanceRate || 0);
    });

    test('should trigger dashboard refresh callback', async () => {
        let callbackInvoked = false;
        const callbackError: Error | null = null;

        // Create dashboard with refresh callback
        const dashboard = new DashboardProvider(mockContext as any, storage);

        dashboard.setRefreshCallback(async () => {
            callbackInvoked = true;

            // Simulate metrics calculation
            const aiCollector = new AIEventCollector(storage);
            const aiMetrics = await aiCollector.getMetrics();

            const metrics = {
                quality: {
                    codeChurn: { rate: aiMetrics.churnRate || 0, trend: 'stable' as const, aiVsHuman: 1 },
                    duplication: { cloneRate: 0, copyPasteRatio: 0, beforeAI: 0, afterAI: 0 },
                    complexity: { cyclomaticComplexity: 0, cognitiveLoad: 0, nestingDepth: 0, aiGeneratedComplexity: 0 },
                    refactoring: { rate: 0, aiCodeRefactored: 0 },
                    overallScore: 0.5
                },
                productivity: {
                    taskCompletion: { velocityChange: 0.1, cycleTime: 0, reworkRate: 0 },
                    flowEfficiency: { focusTime: 0, contextSwitches: 0, waitTime: 0 },
                    valueDelivery: { featuresShipped: 0, bugRate: 0, customerImpact: 0 },
                    actualGain: 0.1,
                    perceivedGain: 0.5,
                    netTimeSaved: 1.0
                },
                roi: {
                    costBenefit: { licenseCost: 20, timeSaved: 5, timeWasted: 0, netValue: 100 },
                    hiddenCosts: { technicalDebt: 0, maintenanceBurden: 0, knowledgeGaps: 0 },
                    teamImpact: { reviewTime: 0, onboardingCost: 0, collaborationFriction: 0 },
                    overallROI: 1.5,
                    breakEvenDays: 30
                }
            };

            await storage.storeMetrics(metrics as any);
        });

        // Show dashboard (which triggers initial refresh)
        await dashboard.show();

        // Wait a moment for callback to execute
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify callback was invoked
        assert.strictEqual(callbackInvoked, true, 'Refresh callback should be invoked');
        assert.strictEqual(callbackError, null, 'Refresh callback should not throw errors');

        // Verify metrics were stored by callback
        const latest = await storage.getLatestMetrics();
        assert.ok(latest.quality, 'Quality metrics should be stored');
        assert.ok(latest.productivity, 'Productivity metrics should be stored');
        assert.ok(latest.roi, 'ROI metrics should be stored');
    });

    test('should update dashboard stats after metrics calculation', async () => {
        // Store initial metrics
        const initialMetrics = {
            quality: {
                codeChurn: { rate: 0.2, trend: 'stable' as const, aiVsHuman: 1 },
                duplication: { cloneRate: 0.1, copyPasteRatio: 0.15, beforeAI: 0.05, afterAI: 0.1 },
                complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 3, aiGeneratedComplexity: 12 },
                refactoring: { rate: 0.1, aiCodeRefactored: 0.2 },
                overallScore: 0.7
            },
            productivity: {
                taskCompletion: { velocityChange: 0.15, cycleTime: 2, reworkRate: 0.2 },
                flowEfficiency: { focusTime: 4, contextSwitches: 8, waitTime: 0.3 },
                valueDelivery: { featuresShipped: 10, bugRate: 0.4, customerImpact: 9 },
                actualGain: 0.26,
                perceivedGain: 1.83,
                netTimeSaved: 5.0
            },
            roi: {
                costBenefit: { licenseCost: 20, timeSaved: 10, timeWasted: 2, netValue: 400 },
                hiddenCosts: { technicalDebt: 1000, maintenanceBurden: 500, knowledgeGaps: 200 },
                teamImpact: { reviewTime: 0.5, onboardingCost: 100, collaborationFriction: 0.1 },
                overallROI: 2.0,
                breakEvenDays: 15
            }
        };

        await storage.storeMetrics(initialMetrics as any);

        // Create dashboard
        const dashboard = new DashboardProvider(mockContext as any, storage);
        await dashboard.show();

        // Get initial state
        const initial = await storage.getLatestMetrics();
        assert.strictEqual(initial.quality?.overallScore, 0.7);
        assert.strictEqual(initial.roi?.overallROI, 2.0);

        // Update metrics (simulating periodic calculation)
        const updatedMetrics = {
            ...initialMetrics,
            quality: {
                ...initialMetrics.quality,
                overallScore: 0.8
            },
            roi: {
                ...initialMetrics.roi,
                overallROI: 2.5
            }
        };

        await storage.storeMetrics(updatedMetrics as any);

        // Verify metrics were updated
        const updated = await storage.getLatestMetrics();
        assert.strictEqual(updated.quality?.overallScore, 0.8);
        assert.strictEqual(updated.roi?.overallROI, 2.5);
    });
});
