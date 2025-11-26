import * as assert from 'assert';
import { ROICalculator } from '../../calculators/ROICalculator';

suite('ROICalculator Test Suite', () => {
    let calculator: ROICalculator;

    setup(() => {
        calculator = new ROICalculator();
    });

    test('should calculate ROI metrics', async () => {
        const result = await calculator.calculate();

        assert.ok(result);
        assert.ok(result.costBenefit);
        assert.ok(result.hiddenCosts);
        assert.ok(result.teamImpact);
        assert.strictEqual(typeof result.overallROI, 'number');
    });

    test('should calculate cost-benefit analysis', async () => {
        const result = await calculator.calculate();

        assert.strictEqual(typeof result.costBenefit.licenseCost, 'number');
        assert.strictEqual(typeof result.costBenefit.timeSaved, 'number');
        assert.strictEqual(typeof result.costBenefit.timeWasted, 'number');
        assert.strictEqual(typeof result.costBenefit.netValue, 'number');

        assert.ok(result.costBenefit.licenseCost > 0);
    });

    test('should account for hidden costs', async () => {
        const result = await calculator.calculate();

        assert.strictEqual(typeof result.hiddenCosts.technicalDebt, 'number');
        assert.strictEqual(typeof result.hiddenCosts.maintenanceBurden, 'number');
        assert.strictEqual(typeof result.hiddenCosts.knowledgeGaps, 'number');

        assert.ok(result.hiddenCosts.technicalDebt >= 0);
        assert.ok(result.hiddenCosts.maintenanceBurden >= 0);
        assert.ok(result.hiddenCosts.knowledgeGaps >= 0);
    });

    test('should calculate team impact', async () => {
        const result = await calculator.calculate();

        assert.strictEqual(typeof result.teamImpact.reviewTime, 'number');
        assert.strictEqual(typeof result.teamImpact.onboardingCost, 'number');
        assert.strictEqual(typeof result.teamImpact.collaborationFriction, 'number');

        assert.ok(result.teamImpact.reviewTime >= 0);
    });

    test('should calculate overall ROI', async () => {
        const result = await calculator.calculate();

        assert.strictEqual(typeof result.overallROI, 'number');
        // ROI can be negative
    });

    test('should calculate break-even days', async () => {
        const result = await calculator.calculate();

        assert.strictEqual(typeof result.breakEvenDays, 'number');
        assert.ok(result.breakEvenDays! >= 0 || result.breakEvenDays === Infinity);
    });

    test('should generate appropriate recommendations', async () => {
        const result = await calculator.calculate();

        assert.ok(result.recommendation);
        assert.strictEqual(typeof result.recommendation, 'string');
        assert.ok(result.recommendation.length > 0);
    });

    test('should recommend expansion for high ROI', async () => {
        const result = await calculator.calculate();

        // Test recommendation logic
        assert.ok(result.recommendation);

        if (result.overallROI! > 3) {
            assert.ok(result.recommendation!.includes('Expand') || result.recommendation!.includes('Strong'));
        }
    });

    test('should warn about negative ROI', async () => {
        const result = await calculator.calculate();

        if (result.overallROI! < 1) {
            assert.ok(
                result.recommendation!.includes('Negative') ||
                result.recommendation!.includes('Reduce') ||
                result.recommendation!.includes('Marginal')
            );
        }
    });

    test('should calculate net value in dollars', async () => {
        const result = await calculator.calculate();

        // Net value is time saved minus time wasted, converted to dollars
        assert.strictEqual(typeof result.costBenefit.netValue, 'number');
    });

    test('should handle infinity break-even correctly', async () => {
        const result = await calculator.calculate();

        // If ROI is negative or zero, break-even should be infinity
        if (result.overallROI! <= 0) {
            assert.strictEqual(result.breakEvenDays, Infinity);
        }
    });

    test('should show time wasted exceeds time saved', async () => {
        // Mock metrics where time wasted > time saved
        // netTimeSaved = timeSaved - timeWasted
        // So if netTimeSaved is negative, then timeWasted > timeSaved
        const mockMetrics = {
            netTimeSaved: -0.6 // Negative net time means wasted > saved
        };
        
        const result = await calculator.calculate(mockMetrics);

        // Based on research: time wasted (3.1h) > time saved (2.5h)
        assert.ok(result.costBenefit.timeWasted > result.costBenefit.timeSaved);
    });

    test('should account for all cost components', async () => {
        const result = await calculator.calculate();

        // Total costs should include hidden costs
        const totalHiddenCosts =
            result.hiddenCosts.technicalDebt +
            result.hiddenCosts.maintenanceBurden +
            result.hiddenCosts.knowledgeGaps;

        assert.ok(totalHiddenCosts > 0);
    });

    test('should provide specific recommendations based on metrics', async () => {
        const result = await calculator.calculate();

        const validRecommendations = [
            'Strong ROI',
            'Positive ROI',
            'Negative ROI',
            'Marginal ROI'
        ];

        const hasValidRecommendation = validRecommendations.some(rec =>
            result.recommendation!.includes(rec)
        );

        assert.ok(hasValidRecommendation);
    });
});
