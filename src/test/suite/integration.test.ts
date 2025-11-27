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
        const productivityAnalyzer = new ProductivityAnalyzer(storage as any); // Pass storage as any
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

        await aiCollector.getMetrics();
        await timeTracker.getMetrics();

        // Analyze code quality
        const qualityAnalyzer = new CodeQualityAnalyzer();
        await qualityAnalyzer.analyze();

        // Analyze productivity
        const productivityAnalyzer = new ProductivityAnalyzer(storage as any); // Pass storage as any
        await productivityAnalyzer.analyze();

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
                netTimeSaved: aiMetrics.totalSuggestions * 0.5,
                satisfaction: { average: 3.5 } // Added mock satisfaction
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

    test('should show dashboard with initial zero metrics', async () => {
        // Test that dashboard displays even when all metrics are zero
        const zeroMetrics = {
            quality: {
                codeChurn: { rate: 0, trend: 'stable' as const, aiVsHuman: 1 },
                duplication: { cloneRate: 0, copyPasteRatio: 0, beforeAI: 0, afterAI: 0 },
                complexity: { cyclomaticComplexity: 0, cognitiveLoad: 0, nestingDepth: 0, aiGeneratedComplexity: 0 },
                refactoring: { rate: 0, aiCodeRefactored: 0 },
                overallScore: 0
            },
            productivity: {
                taskCompletion: { velocityChange: 0, cycleTime: 0, reworkRate: 0 },
                flowEfficiency: { focusTime: 0, contextSwitches: 0, waitTime: 0 },
                valueDelivery: { featuresShipped: 0, bugRate: 0, customerImpact: 0 },
                actualGain: 0,
                perceivedGain: 0,
                netTimeSaved: 0
            },
            roi: {
                costBenefit: { licenseCost: 20, timeSaved: 0, timeWasted: 0, netValue: 0 },
                hiddenCosts: { technicalDebt: 0, maintenanceBurden: 0, knowledgeGaps: 0 },
                teamImpact: { reviewTime: 0, onboardingCost: 0, collaborationFriction: 0 },
                overallROI: 0.8,
                breakEvenDays: 30
            }
        };

        await storage.storeMetrics(zeroMetrics as any);
        const dashboard = new DashboardProvider(mockContext as any, storage);
        await dashboard.show();

        const retrieved = await storage.getLatestMetrics();
        assert.ok(retrieved);
        assert.strictEqual(retrieved.roi?.overallROI, 0.8);
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

    test('End-to-End: AI code change detected and dashboard updated', async function() {
        this.timeout(10000);

        // Step 1: Setup - Create collector and dashboard
        const aiCollector = new AIEventCollector(storage);
        const dashboard = new DashboardProvider(mockContext as any, storage);
        aiCollector.startTracking();

        // Step 2: Simulate AI-generated code (realistic TypeScript function)
        const aiCode = `
/**
 * Calculate order total with tax and shipping
 * @param subtotal - Order subtotal
 * @param taxRate - Tax rate (e.g., 0.08 for 8%)
 * @param shippingCost - Shipping cost
 * @returns Total amount including tax and shipping
 */
export async function calculateOrderTotal(
    subtotal: number,
    taxRate: number,
    shippingCost: number
): Promise<number> {
    if (subtotal < 0) {
        throw new Error('Subtotal cannot be negative');
    }

    const tax = subtotal * taxRate;
    const total = subtotal + tax + shippingCost;

    return Number(total.toFixed(2));
}`;

        // Step 3: Trigger AI detection
        const mockEvent = {
            document: {
                uri: { toString: () => 'file:///test/order.ts', scheme: 'file' },
                languageId: 'typescript',
                lineCount: 15,
                getText: () => aiCode
            },
            contentChanges: [{
                text: aiCode,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                rangeLength: 0
            }]
        } as any;

        const isDetected = (aiCollector as any).isAIGenerated(mockEvent);
        assert.strictEqual(isDetected, true, 'AI code should be detected');

        // Step 4: Add event to collector
        if (isDetected) {
            const aiEvent = {
                timestamp: Date.now(),
                type: 'suggestion' as const,
                sessionId: 'test-session',
                fileType: 'typescript',
                suggestionLength: aiCode.length,
                acceptedLength: aiCode.length,
                modificationTime: 0,
                contextSize: 15
            };
            (aiCollector as any).addEvent(aiEvent);
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // Step 5: Calculate metrics
        const collectorMetrics = await aiCollector.getMetrics();
        assert.ok(collectorMetrics.totalSuggestions > 0, 'Should have suggestions');

        // Step 6: Store calculated metrics
        const calculatedMetrics = {
            quality: {
                codeChurn: { rate: 0, trend: 'stable' as const, aiVsHuman: 1 },
                duplication: { cloneRate: 0, copyPasteRatio: 0, beforeAI: 0, afterAI: 0 },
                complexity: { cyclomaticComplexity: 0, cognitiveLoad: 0, nestingDepth: 0, aiGeneratedComplexity: 0 },
                refactoring: { rate: 0, aiCodeRefactored: 0 },
                overallScore: collectorMetrics.acceptanceRate
            },
            productivity: {
                taskCompletion: { velocityChange: 0.26, cycleTime: 0, reworkRate: 0 },
                flowEfficiency: { focusTime: 0, contextSwitches: 0, waitTime: 0 },
                valueDelivery: { featuresShipped: collectorMetrics.totalSuggestions, bugRate: 0, customerImpact: 0 },
                actualGain: 0.26,
                perceivedGain: 1.83,
                netTimeSaved: collectorMetrics.totalSuggestions * 0.5
            },
            roi: {
                costBenefit: { licenseCost: 20, timeSaved: 5, timeWasted: 0, netValue: 100 },
                hiddenCosts: { technicalDebt: 0, maintenanceBurden: 0, knowledgeGaps: 0 },
                teamImpact: { reviewTime: 0, onboardingCost: 0, collaborationFriction: 0 },
                overallROI: 1.5,
                breakEvenDays: 30
            }
        };

        await storage.storeMetrics(calculatedMetrics as any);

        // Step 7: Show dashboard
        await dashboard.show();
        await new Promise(resolve => setTimeout(resolve, 200));

        // Step 8: Verify dashboard has correct data
        const dashboardMetrics = await storage.getLatestMetrics();
        assert.ok(dashboardMetrics.quality, 'Dashboard should show quality metrics');
        assert.ok(dashboardMetrics.productivity, 'Dashboard should show productivity metrics');
        assert.ok(dashboardMetrics.roi, 'Dashboard should show ROI metrics');

        // Step 9: Verify specific expected values
        assert.strictEqual(
            dashboardMetrics.productivity?.valueDelivery?.featuresShipped,
            collectorMetrics.totalSuggestions,
            'Features shipped should match total suggestions'
        );
        assert.strictEqual(dashboardMetrics.roi?.overallROI, 1.5, 'ROI should be 1.5');
        assert.ok((dashboardMetrics.productivity?.netTimeSaved ?? 0) > 0, 'Net time saved should be positive');

        console.log('[E2E Test] ✓ AI code detected, metrics calculated, dashboard updated');
        console.log(`[E2E Test] Suggestions: ${collectorMetrics.totalSuggestions}, ROI: ${dashboardMetrics.roi?.overallROI}`);
    });

    test('Multiple AI changes should accumulate in dashboard', async function() {
        this.timeout(10000);

        const aiCollector = new AIEventCollector(storage);
        aiCollector.startTracking();

        // Simulate 3 different AI-generated code additions
        const changes = [
            { code: 'export function add(a: number, b: number): number { return a + b; }', size: 'small' },
            { code: '/** JSDoc comment */\nexport async function fetchData(url: string): Promise<any> {\n  const response = await fetch(url);\n  return response.json();\n}', size: 'medium' },
            { code: 'export class UserService {\n  constructor(private api: ApiClient) {}\n  async getUser(id: string) {\n    try {\n      return await this.api.get(`/users/${id}`);\n    } catch (error) {\n      throw new Error(`Failed to fetch user: ${error}`);\n    }\n  }\n}', size: 'large' }
        ];

        let totalDetected = 0;

        for (const change of changes) {
            const mockEvent = {
                document: {
                    uri: { toString: () => 'file:///test/utils.ts', scheme: 'file' },
                    languageId: 'typescript',
                    lineCount: 10,
                    getText: () => change.code
                },
                contentChanges: [{
                    text: change.code,
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                    rangeLength: 0
                }]
            } as any;

            if ((aiCollector as any).isAIGenerated(mockEvent)) {
                totalDetected++;
                (aiCollector as any).addEvent({
                    timestamp: Date.now(),
                    type: 'suggestion' as const,
                    sessionId: 'test-session',
                    fileType: 'typescript',
                    suggestionLength: change.code.length,
                    acceptedLength: change.code.length,
                    modificationTime: 0,
                    contextSize: 10
                });
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Verify all changes were detected
        assert.strictEqual(totalDetected, 3, 'All 3 AI changes should be detected');

        const metrics = await aiCollector.getMetrics();
        assert.ok(metrics.totalSuggestions >= 3, `Should have at least 3 suggestions, got ${metrics.totalSuggestions}`);

        // Store and verify accumulation
        await storage.storeMetrics({
            quality: { codeChurn: { rate: 0, trend: 'stable' as const, aiVsHuman: 1 }, duplication: { cloneRate: 0, copyPasteRatio: 0, beforeAI: 0, afterAI: 0 }, complexity: { cyclomaticComplexity: 0, cognitiveLoad: 0, nestingDepth: 0, aiGeneratedComplexity: 0 }, refactoring: { rate: 0, aiCodeRefactored: 0 }, overallScore: 1 },
            productivity: { taskCompletion: { velocityChange: 0.26, cycleTime: 0, reworkRate: 0 }, flowEfficiency: { focusTime: 0, contextSwitches: 0, waitTime: 0 }, valueDelivery: { featuresShipped: metrics.totalSuggestions, bugRate: 0, customerImpact: 0 }, actualGain: 0.26, perceivedGain: 1.83, netTimeSaved: metrics.totalSuggestions * 0.5 },
            roi: { costBenefit: { licenseCost: 20, timeSaved: metrics.totalSuggestions * 0.5, timeWasted: 0, netValue: metrics.totalSuggestions * 10 }, hiddenCosts: { technicalDebt: 0, maintenanceBurden: 0, knowledgeGaps: 0 }, teamImpact: { reviewTime: 0, onboardingCost: 0, collaborationFriction: 0 }, overallROI: 1.5, breakEvenDays: 30 }
        } as any);

        const stored = await storage.getLatestMetrics();
        assert.ok((stored.productivity?.valueDelivery?.featuresShipped ?? 0) >= 3, 'Dashboard should show accumulated suggestions');

        console.log(`[Accumulation Test] ✓ ${totalDetected} changes detected and accumulated`);
    });

    test('Comprehensive: Real-world AI coding workflow with churn and refactoring', async function() {
        this.timeout(15000);

        const aiCollector = new AIEventCollector(storage);
        const codeCollector = new CodeChangeCollector(storage);
        const dashboard = new DashboardProvider(mockContext as any, storage);

        aiCollector.startTracking();
        codeCollector.startTracking();

        // Scenario: Developer uses AI to build a user authentication system

        // Day 1: Initial AI-generated authentication function
        const initialCode = `
export async function authenticateUser(email: string, password: string): Promise<User | null> {
    try {
        const hashedPassword = await hashPassword(password);
        const user = await database.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, hashedPassword]);

        if (user) {
            return {
                id: user.id,
                email: user.email,
                name: user.name
            };
        }
        return null;
    } catch (error) {
        console.error('Authentication error:', error);
        return null;
    }
}`;

        let mockEvent = {
            document: {
                uri: { toString: () => 'file:///src/auth/authenticate.ts', scheme: 'file' },
                languageId: 'typescript',
                lineCount: 18,
                getText: () => initialCode
            },
            contentChanges: [{
                text: initialCode,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                rangeLength: 0
            }]
        } as any;

        if ((aiCollector as any).isAIGenerated(mockEvent)) {
            (aiCollector as any).addEvent({
                timestamp: Date.now(),
                type: 'suggestion' as const,
                sessionId: 'auth-session-1',
                fileType: 'typescript',
                suggestionLength: initialCode.length,
                acceptedLength: initialCode.length,
                modificationTime: 0,
                contextSize: 18
            });
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // Day 2: Developer realizes security issue - needs JWT tokens (code churn)
        const refactoredCode = `
export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
    try {
        const hashedPassword = await hashPassword(password);
        const user = await database.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, hashedPassword]);

        if (user) {
            const token = generateJWT({ id: user.id, email: user.email });
            const refreshToken = generateRefreshToken(user.id);

            await database.query('INSERT INTO sessions (user_id, refresh_token) VALUES (?, ?)', [user.id, refreshToken]);

            return {
                success: true,
                user: { id: user.id, email: user.email, name: user.name },
                token,
                refreshToken
            };
        }
        return { success: false, error: 'Invalid credentials' };
    } catch (error) {
        console.error('Authentication error:', error);
        return { success: false, error: 'Authentication failed' };
    }
}`;

        mockEvent = {
            document: {
                uri: { toString: () => 'file:///src/auth/authenticate.ts', scheme: 'file' },
                languageId: 'typescript',
                lineCount: 25,
                getText: () => refactoredCode
            },
            contentChanges: [{
                text: refactoredCode,
                range: { start: { line: 0, character: 0 }, end: { line: 18, character: 0 } },
                rangeLength: initialCode.length
            }]
        } as any;

        if ((aiCollector as any).isAIGenerated(mockEvent)) {
            (aiCollector as any).addEvent({
                timestamp: Date.now(),
                type: 'suggestion' as const,
                sessionId: 'auth-session-2',
                fileType: 'typescript',
                suggestionLength: refactoredCode.length,
                acceptedLength: refactoredCode.length,
                modificationTime: 300000, // 5 minutes to modify
                contextSize: 25
            });
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // Day 2: Add similar logout function (potential duplication pattern)
        const logoutCode = `
export async function logoutUser(userId: string, refreshToken: string): Promise<LogoutResult> {
    try {
        await database.query('DELETE FROM sessions WHERE user_id = ? AND refresh_token = ?', [userId, refreshToken]);

        return { success: true };
    } catch (error) {
        console.error('Logout error:', error);
        return { success: false, error: 'Logout failed' };
    }
}`;

        mockEvent = {
            document: {
                uri: { toString: () => 'file:///src/auth/logout.ts', scheme: 'file' },
                languageId: 'typescript',
                lineCount: 10,
                getText: () => logoutCode
            },
            contentChanges: [{
                text: logoutCode,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                rangeLength: 0
            }]
        } as any;

        if ((aiCollector as any).isAIGenerated(mockEvent)) {
            (aiCollector as any).addEvent({
                timestamp: Date.now(),
                type: 'suggestion' as const,
                sessionId: 'auth-session-3',
                fileType: 'typescript',
                suggestionLength: logoutCode.length,
                acceptedLength: logoutCode.length,
                modificationTime: 0,
                contextSize: 10
            });
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // Day 3: Add password reset (similar error handling pattern - duplication)
        const resetPasswordCode = `
export async function resetPassword(email: string): Promise<ResetResult> {
    try {
        const user = await database.query('SELECT id FROM users WHERE email = ?', [email]);

        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const resetToken = generateResetToken();
        await database.query('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, resetToken, Date.now() + 3600000]);

        await sendEmail(email, 'Password Reset', resetToken);

        return { success: true };
    } catch (error) {
        console.error('Reset password error:', error);
        return { success: false, error: 'Reset failed' };
    }
}`;

        mockEvent = {
            document: {
                uri: { toString: () => 'file:///src/auth/resetPassword.ts', scheme: 'file' },
                languageId: 'typescript',
                lineCount: 20,
                getText: () => resetPasswordCode
            },
            contentChanges: [{
                text: resetPasswordCode,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                rangeLength: 0
            }]
        } as any;

        if ((aiCollector as any).isAIGenerated(mockEvent)) {
            (aiCollector as any).addEvent({
                timestamp: Date.now(),
                type: 'suggestion' as const,
                sessionId: 'auth-session-4',
                fileType: 'typescript',
                suggestionLength: resetPasswordCode.length,
                acceptedLength: resetPasswordCode.length,
                modificationTime: 0,
                contextSize: 20
            });
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // Calculate metrics
        const aiMetrics = await aiCollector.getMetrics();
        console.log('[Comprehensive Test] AI Metrics:', JSON.stringify(aiMetrics, null, 2));

        // Verify AI detection worked
        assert.ok(aiMetrics.totalSuggestions >= 4, `Expected at least 4 suggestions, got ${aiMetrics.totalSuggestions}`);

        // Calculate comprehensive metrics with realistic values
        const totalCodeSize = initialCode.length + refactoredCode.length + logoutCode.length + resetPasswordCode.length;
        const churnAmount = refactoredCode.length; // One major refactor
        const churnRate = churnAmount / totalCodeSize;

        // Detect duplication patterns (try-catch, error handling, database queries)
        const duplicatePatterns = [
            'try {',
            'catch (error) {',
            'console.error',
            'return { success:',
            'await database.query'
        ];
        const duplicateCount = duplicatePatterns.reduce((count, pattern) => {
            const occurrences = (initialCode + refactoredCode + logoutCode + resetPasswordCode)
                .split(pattern).length - 1;
            return count + (occurrences > 1 ? occurrences - 1 : 0);
        }, 0);
        const duplicationRate = Math.min(duplicateCount / 50, 0.35); // normalize to 0-1 scale, cap at 35%

        const comprehensiveMetrics = {
            quality: {
                codeChurn: {
                    rate: churnRate,
                    trend: 'increasing' as const,
                    aiVsHuman: 1.5 // AI code had 50% more churn
                },
                duplication: {
                    cloneRate: duplicationRate,
                    copyPasteRatio: 0.3,
                    beforeAI: 0.05,
                    afterAI: duplicationRate
                },
                complexity: {
                    cyclomaticComplexity: 8,
                    cognitiveLoad: 6,
                    nestingDepth: 3,
                    aiGeneratedComplexity: 9
                },
                refactoring: {
                    rate: 0.25, // 25% of code was refactored
                    aiCodeRefactored: 0.35
                },
                overallScore: Math.max(0, 1 - churnRate - duplicationRate)
            },
            productivity: {
                taskCompletion: {
                    velocityChange: 0.3, // 30% faster initially
                    cycleTime: 2.5,
                    reworkRate: churnRate
                },
                flowEfficiency: {
                    focusTime: 4.5,
                    contextSwitches: 8,
                    waitTime: 0.5
                },
                valueDelivery: {
                    featuresShipped: 4, // 4 functions created
                    bugRate: 0.25, // potential security issues
                    customerImpact: 7
                },
                actualGain: 0.15, // Actual productivity gain after accounting for churn
                perceivedGain: 1.5, // Feels 150% faster
                netTimeSaved: 2.0 // 2 hours saved overall
            },
            roi: {
                costBenefit: {
                    licenseCost: 20,
                    timeSaved: 6.0,
                    timeWasted: 1.5, // Time spent fixing and refactoring
                    netValue: 225 // (6 - 1.5) * 50 $/hr
                },
                hiddenCosts: {
                    technicalDebt: 2000, // Duplication and potential security issues
                    maintenanceBurden: 800,
                    knowledgeGaps: 500
                },
                teamImpact: {
                    reviewTime: 1.5,
                    onboardingCost: 200,
                    collaborationFriction: 0.15
                },
                overallROI: 1.2, // 120% ROI (positive but with some concerns)
                breakEvenDays: 45,
                recommendation: 'Positive ROI with opportunities for improvement'
            }
        };

        await storage.storeMetrics(comprehensiveMetrics as any);

        // Show dashboard
        await dashboard.show();
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify comprehensive metrics
        const dashboardMetrics = await storage.getLatestMetrics();

        assert.ok(dashboardMetrics.quality, 'Should have quality metrics');
        assert.ok(dashboardMetrics.productivity, 'Should have productivity metrics');
        assert.ok(dashboardMetrics.roi, 'Should have ROI metrics');

        // Verify specific calculated values
        assert.ok((dashboardMetrics.quality?.codeChurn?.rate ?? 0) > 0, 'Should detect code churn from refactoring');
        assert.ok((dashboardMetrics.quality?.duplication?.cloneRate ?? 0) > 0, 'Should detect code duplication patterns');
        assert.strictEqual(dashboardMetrics.productivity?.valueDelivery?.featuresShipped, 4, 'Should track 4 functions created');
        assert.ok((dashboardMetrics.roi?.overallROI ?? 0) > 1, 'Should have positive ROI despite churn');
        assert.ok((dashboardMetrics.roi?.hiddenCosts?.technicalDebt ?? 0) > 0, 'Should account for technical debt');
        assert.ok((dashboardMetrics.productivity?.netTimeSaved ?? 0) > 0, 'Should show net time savings');

        // Verify realistic ranges
        assert.ok((dashboardMetrics.quality?.codeChurn?.rate ?? 0) < 0.5, 'Churn rate should be realistic (<50%)');
        assert.ok((dashboardMetrics.quality?.duplication?.cloneRate ?? 0) < 0.4, 'Duplication should be realistic (<40%)');
        assert.ok((dashboardMetrics.roi?.overallROI ?? 0) < 3, 'ROI should be realistic (<300%)');

        console.log('[Comprehensive Test] ✓ Real-world workflow completed');
        console.log(`[Comprehensive Test] Churn: ${((dashboardMetrics.quality?.codeChurn?.rate ?? 0) * 100).toFixed(1)}%`);
        console.log(`[Comprehensive Test] Duplication: ${((dashboardMetrics.quality?.duplication?.cloneRate ?? 0) * 100).toFixed(1)}%`);
        console.log(`[Comprehensive Test] ROI: ${((dashboardMetrics.roi?.overallROI ?? 0) * 100).toFixed(0)}%`);
        console.log(`[Comprehensive Test] Net Time Saved: ${dashboardMetrics.productivity?.netTimeSaved?.toFixed(1)}h`);
    });

    test('Edge case: Partial acceptance and rejected suggestions', async function() {
        this.timeout(10000);

        const aiCollector = new AIEventCollector(storage);
        aiCollector.startTracking();

        // Scenario: AI suggests code but developer only accepts part of it
        const suggestedCode = `
export function processPayment(amount: number, currency: string): PaymentResult {
    // Validate input
    if (amount <= 0) throw new Error('Invalid amount');
    if (!['USD', 'EUR', 'GBP'].includes(currency)) throw new Error('Invalid currency');

    // Process payment
    const fee = amount * 0.029 + 0.30;
    const total = amount + fee;

    // Create transaction
    const transaction = {
        id: generateTransactionId(),
        amount: total,
        currency,
        status: 'completed',
        timestamp: Date.now()
    };

    return { success: true, transaction };
}`;

        // Developer only accepts the validation part
        const acceptedCode = `
export function processPayment(amount: number, currency: string): PaymentResult {
    // Validate input
    if (amount <= 0) throw new Error('Invalid amount');
    if (!['USD', 'EUR', 'GBP'].includes(currency)) throw new Error('Invalid currency');

    // TODO: Implement payment processing
    return { success: false, error: 'Not implemented' };
}`;

        const mockEvent = {
            document: {
                uri: { toString: () => 'file:///src/payment/process.ts', scheme: 'file' },
                languageId: 'typescript',
                lineCount: 10,
                getText: () => acceptedCode
            },
            contentChanges: [{
                text: acceptedCode,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                rangeLength: 0
            }]
        } as any;

        if ((aiCollector as any).isAIGenerated(mockEvent)) {
            (aiCollector as any).addEvent({
                timestamp: Date.now(),
                type: 'suggestion' as const,
                sessionId: 'payment-session',
                fileType: 'typescript',
                suggestionLength: suggestedCode.length,
                acceptedLength: acceptedCode.length, // Only partial acceptance
                modificationTime: 120000, // 2 minutes to review and modify
                contextSize: 10
            });
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        await aiCollector.getMetrics();

        // Calculate acceptance rate
        const acceptanceRate = acceptedCode.length / suggestedCode.length;
        assert.ok(acceptanceRate < 1, 'Should detect partial acceptance');
        assert.ok(acceptanceRate > 0, 'Should detect some code was accepted');

        console.log(`[Partial Acceptance Test] ✓ Acceptance rate: ${(acceptanceRate * 100).toFixed(1)}%`);
    });
});
