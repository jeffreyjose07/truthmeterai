import * as assert from 'assert';
import { PerformanceAnalyzer } from '../../analyzers/PerformanceAnalyzer';
import { AIEvent, BuildEvent, TestEvent } from '../../types/events';

suite('Performance Metric Analyzer Test Suite', () => {
    let analyzer: PerformanceAnalyzer;

    setup(() => {
        analyzer = new PerformanceAnalyzer();
    });

    test('Calculates build stats correctly', () => {
        const buildEvents: BuildEvent[] = [
            { timestamp: Date.now() - 100000, type: 'build', status: 'success', duration: 5000, system: 'npm' },
            { timestamp: Date.now(), type: 'build', status: 'failure', duration: 2000, system: 'npm' }
        ];
        const aiEvents: AIEvent[] = [];

        const result = analyzer.analyze(buildEvents, aiEvents);

        assert.strictEqual(result.buildStats.successRate, 0.5, 'Success rate should be 50%');
        assert.strictEqual(result.buildStats.averageDuration, 3500, 'Avg duration should be 3500ms');
    });

    test('Calculates test stats correctly', () => {
        const testEvents: TestEvent[] = [
            { timestamp: Date.now(), type: 'test', status: 'success', duration: 1000, testCount: 10, passedCount: 10, failedCount: 0, system: 'jest' }
        ];
        const aiEvents: AIEvent[] = [];

        const result = analyzer.analyze(testEvents, aiEvents);

        assert.strictEqual(result.testStats.successRate, 1.0, 'Success rate should be 100%');
    });

    test('Correlates AI usage with Success', () => {
        const now = Date.now();
        
        // AI suggestion accepted 5 mins ago
        const aiEvents: AIEvent[] = [{
            timestamp: now - 5 * 60 * 1000,
            type: 'acceptance',
            sessionId: '1',
            fileType: 'ts',
            suggestionLength: 10,
            acceptedLength: 10,
            modificationTime: 0,
            contextSize: 100
        } as AIEvent];

        // Build success now
        const buildEvents: BuildEvent[] = [{
            timestamp: now,
            type: 'build',
            status: 'success',
            duration: 1000,
            system: 'npm'
        }];

        const result = analyzer.analyze(buildEvents, aiEvents);

        assert.strictEqual(result.buildStats.aiCorrelation, 1, 'Should have positive correlation (+1)');
    });

    test('Correlates AI usage with Failure', () => {
        const now = Date.now();
        
        // AI suggestion accepted 5 mins ago
        const aiEvents: AIEvent[] = [{
            timestamp: now - 5 * 60 * 1000,
            type: 'acceptance',
            sessionId: '1',
            fileType: 'ts',
            suggestionLength: 10,
            acceptedLength: 10,
            modificationTime: 0,
            contextSize: 100
        } as AIEvent];

        // Build failure now
        const buildEvents: BuildEvent[] = [{
            timestamp: now,
            type: 'build',
            status: 'failure',
            duration: 1000,
            system: 'npm'
        }];

        const result = analyzer.analyze(buildEvents, aiEvents);

        assert.strictEqual(result.buildStats.aiCorrelation, -1, 'Should have negative correlation (-1)');
    });

    test('Ignores old AI events', () => {
        const now = Date.now();
        
        // AI suggestion accepted 30 mins ago (outside 15 min window)
        const aiEvents: AIEvent[] = [{
            timestamp: now - 30 * 60 * 1000,
            type: 'acceptance',
            sessionId: '1',
            fileType: 'ts',
            suggestionLength: 10,
            acceptedLength: 10,
            modificationTime: 0,
            contextSize: 100
        } as AIEvent];

        // Build success now
        const buildEvents: BuildEvent[] = [{
            timestamp: now,
            type: 'build',
            status: 'success',
            duration: 1000,
            system: 'npm'
        }];

        const result = analyzer.analyze(buildEvents, aiEvents);

        assert.strictEqual(result.buildStats.aiCorrelation, 0, 'Should have no correlation (0)');
    });
});
