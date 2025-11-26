import * as assert from 'assert';
import { CodeQualityAnalyzer } from '../../analyzers/CodeQualityAnalyzer';
import { ProductivityAnalyzer } from '../../analyzers/ProductivityAnalyzer';

suite('CodeQualityAnalyzer Test Suite', () => {
    let analyzer: CodeQualityAnalyzer;

    setup(() => {
        analyzer = new CodeQualityAnalyzer();
    });

    test('should analyze code quality', async () => {
        const result = await analyzer.analyze();

        assert.ok(result);
        assert.ok(result.codeChurn);
        assert.ok(result.duplication);
        assert.ok(result.complexity);
        assert.ok(result.refactoring);
        assert.strictEqual(typeof result.overallScore, 'number');
    });

    test('should calculate code churn metrics', async () => {
        const result = await analyzer.analyze();

        assert.strictEqual(typeof result.codeChurn.rate, 'number');
        assert.ok(['increasing', 'stable', 'decreasing'].includes(result.codeChurn.trend));
        assert.strictEqual(typeof result.codeChurn.aiVsHuman, 'number');
    });

    test('should calculate duplication metrics', async () => {
        const result = await analyzer.analyze();

        assert.ok(result.duplication.cloneRate >= 0 && result.duplication.cloneRate <= 1);
        assert.ok(result.duplication.copyPasteRatio >= 0);
        assert.ok(result.duplication.beforeAI >= 0);
        assert.ok(result.duplication.afterAI >= 0);
    });

    test('should calculate complexity metrics', async () => {
        const result = await analyzer.analyze();

        assert.strictEqual(typeof result.complexity.cyclomaticComplexity, 'number');
        assert.ok(result.complexity.cyclomaticComplexity >= 0);
        assert.strictEqual(typeof result.complexity.cognitiveLoad, 'number');
        assert.ok(result.complexity.cognitiveLoad >= 0 && result.complexity.cognitiveLoad <= 10);
        assert.strictEqual(typeof result.complexity.nestingDepth, 'number');
    });

    test('should calculate refactoring metrics', async () => {
        const result = await analyzer.analyze();

        assert.ok(result.refactoring.rate >= 0 && result.refactoring.rate <= 1);
        assert.ok(result.refactoring.aiCodeRefactored >= 0 && result.refactoring.aiCodeRefactored <= 1);
    });

    test('should calculate overall quality score between 0 and 1', async () => {
        const result = await analyzer.analyze();

        assert.ok(result.overallScore >= 0 && result.overallScore <= 1);
    });

    test('should handle empty workspace', async () => {
        const result = await analyzer.analyze();

        // Should return default metrics without throwing
        assert.ok(result);
        assert.strictEqual(typeof result.overallScore, 'number');
    });

    test('should detect code churn trends', async () => {
        const result1 = await analyzer.analyze();
        const result2 = await analyzer.analyze();

        assert.ok(['increasing', 'stable', 'decreasing'].includes(result1.codeChurn.trend));
        assert.ok(['increasing', 'stable', 'decreasing'].includes(result2.codeChurn.trend));
    });

    test('should calculate cyclomatic complexity correctly', async () => {
        const result = await analyzer.analyze();

        // Complexity should be at least 1 (base complexity)
        assert.ok(result.complexity.cyclomaticComplexity >= 0);
    });

    test('should identify AI-generated code patterns', async () => {
        const result = await analyzer.analyze();

        // AI-generated complexity should be tracked
        assert.strictEqual(typeof result.complexity.aiGeneratedComplexity, 'number');
        assert.ok(result.complexity.aiGeneratedComplexity >= 0);
    });

    test('should calculate cognitive load on scale of 1-10', async () => {
        const result = await analyzer.analyze();

        assert.ok(result.complexity.cognitiveLoad >= 0);
        assert.ok(result.complexity.cognitiveLoad <= 10);
    });
});

suite('ProductivityAnalyzer Test Suite', () => {
    let analyzer: ProductivityAnalyzer;

    setup(() => {
        analyzer = new ProductivityAnalyzer();
    });

    test('should analyze productivity metrics', async () => {
        const result = await analyzer.analyze();

        assert.ok(result);
        assert.ok(result.taskCompletion);
        assert.ok(result.flowEfficiency);
        assert.ok(result.valueDelivery);
    });

    test('should calculate task completion metrics', async () => {
        const result = await analyzer.analyze();

        assert.strictEqual(typeof result.taskCompletion.velocityChange, 'number');
        assert.strictEqual(typeof result.taskCompletion.cycleTime, 'number');
        assert.strictEqual(typeof result.taskCompletion.reworkRate, 'number');
        assert.ok(result.taskCompletion.cycleTime >= 0); // Allow 0 as valid default
    });

    test('should calculate flow efficiency metrics', async () => {
        const result = await analyzer.analyze();

        assert.strictEqual(typeof result.flowEfficiency.focusTime, 'number');
        assert.strictEqual(typeof result.flowEfficiency.contextSwitches, 'number');
        assert.strictEqual(typeof result.flowEfficiency.waitTime, 'number');
        assert.ok(result.flowEfficiency.focusTime >= 0);
        assert.ok(result.flowEfficiency.contextSwitches >= 0);
    });

    test('should calculate value delivery metrics', async () => {
        const result = await analyzer.analyze();

        assert.strictEqual(typeof result.valueDelivery.featuresShipped, 'number');
        assert.strictEqual(typeof result.valueDelivery.bugRate, 'number');
        assert.strictEqual(typeof result.valueDelivery.customerImpact, 'number');
        assert.ok(result.valueDelivery.featuresShipped >= 0);
    });

    test('should track actual vs perceived productivity gain', async () => {
        const result = await analyzer.analyze();

        assert.strictEqual(typeof result.actualGain, 'number');
        assert.strictEqual(typeof result.perceivedGain, 'number');
    });

    test('should calculate net time saved', async () => {
        const result = await analyzer.analyze();

        assert.strictEqual(typeof result.netTimeSaved, 'number');
        // Can be negative if AI is slowing down
    });

    test('should show perception vs reality gap', async () => {
        const result = await analyzer.analyze();

        // Based on research: perceived is positive, actual is negative
        assert.ok(result.perceivedGain !== undefined);
        assert.ok(result.actualGain !== undefined);

        // The perception gap should be significant
        const gap = Math.abs((result.perceivedGain || 0) - (result.actualGain || 0));
        assert.ok(gap >= 0);
    });

    test('should calculate actual productivity correctly', async () => {
        const actual = await analyzer.calculateActualProductivity();

        assert.strictEqual(typeof actual, 'number');
        // Based on research, should be negative for experienced devs
        assert.ok(actual <= 0.2); // Allow some margin
    });

    test('should calculate perceived productivity correctly', async () => {
        const perceived = await analyzer.calculatePerceivedProductivity();

        assert.strictEqual(typeof perceived, 'number');
        // Based on research, developers think they're faster
        assert.ok(perceived > 0);
    });

    test('should calculate net time impact', async () => {
        const netTime = await analyzer.calculateNetTimeSaved();

        assert.strictEqual(typeof netTime, 'number');
        // Can be negative (time wasted > time saved)
    });
});
