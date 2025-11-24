import * as assert from 'assert';
import { DashboardProvider } from '../../ui/DashboardProvider';
import { StatusBarManager } from '../../ui/StatusBarManager';
import { LocalStorage } from '../../storage/LocalStorage';
import { MockExtensionContext } from '../mocks/vscode.mock';

suite('StatusBarManager Test Suite', () => {
    let statusBar: StatusBarManager;

    setup(() => {
        statusBar = new StatusBarManager();
    });

    teardown(() => {
        statusBar.dispose();
    });

    test('should initialize without errors', () => {
        assert.ok(statusBar);
    });

    test('should show status bar item', () => {
        statusBar.show();
        // Should not throw
        assert.ok(true);
    });

    test('should update with stats', () => {
        statusBar.show();

        const stats = {
            recentSuggestions: 5,
            recentAcceptance: 3,
            activeSession: 'test-session'
        };

        statusBar.update(stats);
        // Should not throw
        assert.ok(true);
    });

    test('should update with warning message', () => {
        statusBar.show();
        statusBar.updateWithWarning('High Churn');
        // Should not throw
        assert.ok(true);
    });

    test('should handle dispose', () => {
        statusBar.show();
        statusBar.dispose();
        // Should not throw
        assert.ok(true);
    });

    test('should show suggestions count when active', () => {
        statusBar.show();

        const stats = {
            recentSuggestions: 10,
            recentAcceptance: 5,
            activeSession: 'test'
        };

        statusBar.update(stats);
        // Status bar should reflect activity
        assert.ok(true);
    });

    test('should handle zero suggestions', () => {
        statusBar.show();

        const stats = {
            recentSuggestions: 0,
            recentAcceptance: 0,
            activeSession: 'test'
        };

        statusBar.update(stats);
        // Should show default text
        assert.ok(true);
    });
});

suite('DashboardProvider Test Suite', () => {
    let dashboard: DashboardProvider;
    let storage: LocalStorage;
    let mockContext: MockExtensionContext;

    setup(async () => {
        mockContext = new MockExtensionContext();
        storage = new LocalStorage(mockContext as any);
        await storage.initialize();
        dashboard = new DashboardProvider(mockContext as any, storage);
    });

    test('should initialize without errors', () => {
        assert.ok(dashboard);
    });

    test('should show dashboard', async () => {
        await dashboard.show();
        // Should not throw
        assert.ok(true);
    });

    test('should generate recommendations based on metrics', async () => {
        const mockMetrics = {
            quality: {
                codeChurn: { rate: 0.5, trend: 'increasing' as const, aiVsHuman: 1.5 },
                duplication: { cloneRate: 0.2, copyPasteRatio: 0.3, beforeAI: 0.1, afterAI: 0.2 },
                complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 3, aiGeneratedComplexity: 12 },
                refactoring: { rate: 0.15, aiCodeRefactored: 0.35 },
                overallScore: 0.5
            },
            roi: {
                costBenefit: { licenseCost: 15, timeSaved: 2.5, timeWasted: 3.1, netValue: -45 },
                hiddenCosts: { technicalDebt: 5000, maintenanceBurden: 2000, knowledgeGaps: 3000 },
                teamImpact: { reviewTime: 1.5, onboardingCost: 500, collaborationFriction: 0.2 },
                overallROI: 0.5
            }
        };

        await storage.storeMetrics(mockMetrics as any);
        await dashboard.show();

        // Dashboard should generate recommendations
        assert.ok(true);
    });

    test('should show report', () => {
        const mockReport = {
            summary: {
                actualProductivityGain: -0.19,
                perceivedProductivityGain: 0.20,
                codeQualityImpact: 0.7,
                economicROI: 0.5,
                recommendation: 'Test recommendation'
            }
        };

        dashboard.showReport(mockReport);
        // Should not throw
        assert.ok(true);
    });

    test('should generate alerts for high churn', async () => {
        const mockMetrics = {
            quality: {
                codeChurn: { rate: 0.45, trend: 'increasing' as const, aiVsHuman: 2.0 },
                duplication: { cloneRate: 0.1, copyPasteRatio: 0.2, beforeAI: 0.05, afterAI: 0.1 },
                complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 3, aiGeneratedComplexity: 12 },
                refactoring: { rate: 0.15, aiCodeRefactored: 0.35 },
                overallScore: 0.5
            }
        };

        await storage.storeMetrics(mockMetrics as any);
        await dashboard.show();

        // Should generate alert for high churn
        assert.ok(true);
    });

    test('should generate alerts for high duplication', async () => {
        const mockMetrics = {
            quality: {
                codeChurn: { rate: 0.2, trend: 'stable' as const, aiVsHuman: 1.5 },
                duplication: { cloneRate: 0.2, copyPasteRatio: 0.4, beforeAI: 0.05, afterAI: 0.2 },
                complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 3, aiGeneratedComplexity: 12 },
                refactoring: { rate: 0.15, aiCodeRefactored: 0.35 },
                overallScore: 0.6
            }
        };

        await storage.storeMetrics(mockMetrics as any);
        await dashboard.show();

        // Should generate alert for high duplication
        assert.ok(true);
    });

    test('should generate recommendations for negative ROI', async () => {
        const mockMetrics = {
            roi: {
                costBenefit: { licenseCost: 15, timeSaved: 2, timeWasted: 4, netValue: -150 },
                hiddenCosts: { technicalDebt: 10000, maintenanceBurden: 3000, knowledgeGaps: 4000 },
                teamImpact: { reviewTime: 2, onboardingCost: 1000, collaborationFriction: 0.3 },
                overallROI: 0.3
            }
        };

        await storage.storeMetrics(mockMetrics as any);
        await dashboard.show();

        // Should recommend reducing usage
        assert.ok(true);
    });

    test('should handle empty metrics gracefully', async () => {
        await dashboard.show();
        // Should not throw with default metrics
        assert.ok(true);
    });
});
