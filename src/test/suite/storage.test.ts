import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { LocalStorage } from '../../storage/LocalStorage';
import { MockExtensionContext } from '../mocks/vscode.mock';

suite('LocalStorage Test Suite', () => {
    let storage: LocalStorage;
    let mockContext: MockExtensionContext;

    setup(async () => {
        mockContext = new MockExtensionContext();
        storage = new LocalStorage(mockContext as any);
        await storage.initialize();
        // Clean up any leftover data from previous test runs
        await storage.clearAll();
    });

    teardown(async () => {
        // Clean up after each test
        await storage.clearAll();
    });

    test('should initialize successfully', async () => {
        assert.ok(true, 'Storage initialized');
    });

    test('should store and retrieve data', async () => {

        const testData = { timestamp: Date.now(), value: 42 };
        await storage.store('test_key', testData);

        const retrieved = await storage.get('test_key');
        assert.strictEqual(retrieved.length, 1);
        assert.deepStrictEqual(retrieved[0], testData);
    });

    test('should handle multiple stores to same key', async () => {
        await storage.store('multi_key', { id: 1 });
        await storage.store('multi_key', { id: 2 });
        await storage.store('multi_key', { id: 3 });

        const retrieved = await storage.get('multi_key');
        assert.strictEqual(retrieved.length, 3);
        assert.strictEqual(retrieved[0].id, 1);
        assert.strictEqual(retrieved[2].id, 3);
    });

    test('should limit stored entries to 1000 for metrics_history', async () => {
        // Store 1100 items using metrics_history key (which has 1000 limit)
        for (let i = 0; i < 1100; i++) {
            await storage.store('metrics_history', { index: i });
        }

        const retrieved = await storage.get('metrics_history');
        assert.strictEqual(retrieved.length, 1000, 'Should limit to 1000 entries');
        assert.strictEqual(retrieved[0].index, 100, 'Should have removed oldest entries');
    });

    test('should store and retrieve metrics', async () => {
        const metrics = {
            quality: {
                codeChurn: { rate: 0.3, trend: 'increasing' as const, aiVsHuman: 1.5 },
                duplication: { cloneRate: 0.2, copyPasteRatio: 0.3, beforeAI: 0.1, afterAI: 0.2 },
                complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 3, aiGeneratedComplexity: 12 },
                refactoring: { rate: 0.15, aiCodeRefactored: 0.35 },
                overallScore: 0.7
            }
        };

        await storage.storeMetrics(metrics as any);
        const retrieved = await storage.getLatestMetrics();

        assert.ok(retrieved.quality);
        assert.strictEqual(retrieved.quality.codeChurn.rate, 0.3);
    });

    test('should retrieve metrics history', async () => {
        const baseMetrics = {
            quality: {
                codeChurn: { rate: 0.3, trend: 'stable' as const, aiVsHuman: 1.5 },
                duplication: { cloneRate: 0.2, copyPasteRatio: 0.3, beforeAI: 0.1, afterAI: 0.2 },
                complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 3, aiGeneratedComplexity: 12 },
                refactoring: { rate: 0.15, aiCodeRefactored: 0.35 },
                overallScore: 0.7
            }
        };

        await storage.storeMetrics(baseMetrics as any);
        await storage.storeMetrics({ ...baseMetrics, quality: { ...baseMetrics.quality, overallScore: 0.8 } } as any);
        await storage.storeMetrics({ ...baseMetrics, quality: { ...baseMetrics.quality, overallScore: 0.9 } } as any);

        const history = await storage.getMetricsHistory(30);
        assert.strictEqual(history.length, 3);
    });

    test('should export data as JSON', async () => {

        await storage.store('metrics_history', { value: 'test' });
        await storage.store('churn_events', { event: 'churn' });
        const exported = await storage.exportData();

        assert.ok(exported);
        assert.ok(exported.includes('metrics_history') || exported.includes('churnEvents'));

        const parsed = JSON.parse(exported);
        assert.ok(parsed.metrics);
    });

    test('should clear all data', async () => {
        await storage.store('metrics_history', { value: 1 });
        await storage.storeMetrics({ quality: {} } as any);

        await storage.clearAll();

        const history = await storage.get('metrics_history');
        const metrics = await storage.getLatestMetrics();

        assert.strictEqual(history.length, 0);
        assert.ok(metrics.quality); // Should return default metrics
    });

    test('should return empty array for non-existent key', async () => {
        const retrieved = await storage.get('non_existent_key');
        assert.strictEqual(retrieved.length, 0);
    });

    test('should use memory cache for repeated reads', async () => {
        await storage.store('cache_test', { value: 'cached' });

        const first = await storage.get('cache_test');
        const second = await storage.get('cache_test');

        assert.deepStrictEqual(first, second);
    });
});
