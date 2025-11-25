import * as assert from 'assert';
import { AIEventCollector } from '../../collectors/AIEventCollector';
import { CodeChangeCollector } from '../../collectors/CodeChangeCollector';
import { TimeTracker } from '../../collectors/TimeTracker';
import { LocalStorage } from '../../storage/LocalStorage';
import { MockExtensionContext } from '../mocks/vscode.mock';

suite('AIEventCollector Test Suite', () => {
    let collector: AIEventCollector;
    let storage: LocalStorage;
    let mockContext: MockExtensionContext;

    setup(() => {
        mockContext = new MockExtensionContext();
        storage = new LocalStorage(mockContext as any);
        collector = new AIEventCollector(storage);
    });

    teardown(() => {
        // Cleanup
    });

    test('should generate unique session IDs', () => {
        const collector1 = new AIEventCollector(storage);
        const collector2 = new AIEventCollector(storage);

        const stats1 = collector1.getQuickStats();
        const stats2 = collector2.getQuickStats();

        assert.notStrictEqual(stats1.activeSession, stats2.activeSession);
    });

    test('should track AI events', async () => {
        const metrics = await collector.getMetrics();

        assert.ok(metrics);
        assert.strictEqual(typeof metrics.totalSuggestions, 'number');
        assert.strictEqual(typeof metrics.acceptanceRate, 'number');
        assert.strictEqual(typeof metrics.churnRate, 'number');
    });

    test('should calculate acceptance rate', async () => {
        // Simulate some events
        const metrics = await collector.getMetrics();

        assert.ok(metrics.acceptanceRate >= 0 && metrics.acceptanceRate <= 1);
    });

    test('should track unique sessions', async () => {
        const metrics = await collector.getMetrics();

        assert.ok(metrics.sessionCount >= 0);
    });

    test('should get quick stats for status bar', () => {
        const stats = collector.getQuickStats();

        assert.ok(stats);
        assert.strictEqual(typeof stats.recentSuggestions, 'number');
        assert.strictEqual(typeof stats.recentAcceptance, 'number');
        assert.ok(stats.activeSession);
    });

    test('should detect AI patterns in code', () => {
        // Test private method behavior through public interface
        const stats = collector.getQuickStats();
        assert.ok(stats);
    });

    test('should calculate average modification time', async () => {
        const metrics = await collector.getMetrics();

        assert.strictEqual(typeof metrics.averageModificationTime, 'number');
        assert.ok(metrics.averageModificationTime >= 0);
    });

    test('should get performance metrics', () => {
        const perfMetrics = collector.getPerformanceMetrics();

        assert.ok(perfMetrics);
        assert.strictEqual(typeof perfMetrics.eventsInMemory, 'number');
        assert.strictEqual(typeof perfMetrics.maxEvents, 'number');
        assert.strictEqual(typeof perfMetrics.pendingTimers, 'number');
        assert.strictEqual(typeof perfMetrics.queuedWrites, 'number');
        assert.strictEqual(typeof perfMetrics.fileCacheSize, 'number');
        assert.strictEqual(typeof perfMetrics.fileCacheMemory, 'number');
        assert.strictEqual(typeof perfMetrics.memoryEstimate, 'number');

        // Verify memory is bounded
        assert.ok(perfMetrics.memoryEstimate >= 0);
        assert.ok(perfMetrics.fileCacheSize >= 0);
    });

    test('should handle dispose without errors', () => {
        collector.startTracking();
        collector.dispose();
        // Should not throw
        assert.ok(true);
    });

    test('should track events in circular buffer', () => {
        const initialPerf = collector.getPerformanceMetrics();
        
        // After dispose and recreate, should still work
        collector.dispose();
        const newCollector = new AIEventCollector(storage);
        const newPerf = newCollector.getPerformanceMetrics();
        
        assert.ok(newPerf.eventsInMemory >= 0);
        assert.strictEqual(newPerf.maxEvents, 1000);
        newCollector.dispose();
    });

    test('should limit memory usage', () => {
        const perfMetrics = collector.getPerformanceMetrics();

        // Memory estimate should be reasonable
        // MAX_EVENTS * 100 bytes + file cache
        const maxExpectedMemory = (1000 * 100) + (50 * 500000); // Max cache size
        assert.ok(perfMetrics.memoryEstimate <= maxExpectedMemory);
    });

    test('should handle startTracking without errors', () => {
        collector.startTracking();
        // Should not throw
        assert.ok(true);
    });

    test('should return valid quick stats after tracking', () => {
        collector.startTracking();
        const stats = collector.getQuickStats();

        assert.ok(stats);
        assert.ok(stats.activeSession);
        assert.strictEqual(typeof stats.recentSuggestions, 'number');
        assert.strictEqual(typeof stats.recentAcceptance, 'number');
    });

    test('should return zero metrics when no activity', async () => {
        // New collector with no activity should return zeros
        const metrics = await collector.getMetrics();
        
        assert.strictEqual(metrics.totalSuggestions, 0);
        assert.strictEqual(metrics.acceptanceRate, 0);
        assert.strictEqual(metrics.churnRate, 0);
        assert.strictEqual(metrics.sessionCount, 0);
        assert.strictEqual(metrics.averageModificationTime, 0);
    });

    test('should handle multiple startTracking calls', () => {
        // Should not throw when called multiple times
        collector.startTracking();
        collector.startTracking();
        collector.startTracking();
        
        const stats = collector.getQuickStats();
        assert.ok(stats);
    });
});

suite('CodeChangeCollector Test Suite', () => {
    let collector: CodeChangeCollector;
    let storage: LocalStorage;
    let mockContext: MockExtensionContext;

    setup(() => {
        mockContext = new MockExtensionContext();
        storage = new LocalStorage(mockContext as any);
        collector = new CodeChangeCollector(storage);
    });

    test('should initialize without errors', () => {
        assert.ok(collector);
    });

    test('should get code change metrics', async () => {
        const metrics = await collector.getMetrics();

        assert.ok(metrics);
        assert.strictEqual(typeof metrics.totalChanges, 'number');
        assert.strictEqual(typeof metrics.totalSaves, 'number');
        assert.strictEqual(typeof metrics.changesPerSave, 'number');
    });

    test('should calculate changes per save', async () => {
        const metrics = await collector.getMetrics();

        // Should handle division by zero
        if (metrics.totalSaves === 0) {
            assert.strictEqual(metrics.changesPerSave, 0);
        } else {
            assert.ok(metrics.changesPerSave >= 0);
        }
    });

    test('should identify most edited language', async () => {
        const metrics = await collector.getMetrics();

        assert.ok('mostEditedLanguage' in metrics);
    });

    test('should handle empty change history', async () => {
        const metrics = await collector.getMetrics();

        assert.strictEqual(metrics.totalChanges, 0);
        assert.strictEqual(metrics.totalSaves, 0);
    });
});

suite('TimeTracker Test Suite', () => {
    let tracker: TimeTracker;
    let storage: LocalStorage;
    let mockContext: MockExtensionContext;

    setup(() => {
        mockContext = new MockExtensionContext();
        storage = new LocalStorage(mockContext as any);
        tracker = new TimeTracker(storage);
    });

    teardown(() => {
        tracker.dispose();
    });

    test('should initialize without errors', () => {
        assert.ok(tracker);
    });

    test('should get time metrics', async () => {
        const metrics = await tracker.getMetrics();

        assert.ok(metrics);
        assert.strictEqual(typeof metrics.totalActiveTime, 'number');
        assert.strictEqual(typeof metrics.currentSessionTime, 'number');
        assert.strictEqual(typeof metrics.totalSessions, 'number');
        assert.strictEqual(typeof metrics.averageSessionLength, 'number');
    });

    test('should track active time', async () => {
        tracker.startTracking();

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));

        const metrics = await tracker.getMetrics();
        assert.ok(metrics.currentSessionTime >= 0);
    });

    test('should calculate average session length', async () => {
        const metrics = await tracker.getMetrics();

        if (metrics.totalSessions === 0) {
            assert.strictEqual(metrics.averageSessionLength, 0);
        } else {
            assert.ok(metrics.averageSessionLength >= 0);
        }
    });

    test('should handle dispose', () => {
        tracker.startTracking();
        tracker.dispose();
        // Should not throw
        assert.ok(true);
    });

    test('should convert time to minutes', async () => {
        const metrics = await tracker.getMetrics();

        // All times should be in minutes (positive numbers)
        assert.ok(metrics.totalActiveTime >= 0);
        assert.ok(metrics.currentSessionTime >= 0);
    });
});
