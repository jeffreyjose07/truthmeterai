import * as assert from 'assert';
import { ReportGenerator } from '../../reporters/ReportGenerator';
import { AllMetrics } from '../../types/metrics';

suite('ReportGenerator Test Suite', () => {
	test('generateHTML produces valid HTML with metrics', () => {
		const generator = new ReportGenerator();
		
        const mockMetrics: AllMetrics = {
            ai: { totalSuggestions: 100, acceptanceRate: 0.3 },
            code: { linesWritten: 500 },
            time: { totalActiveTime: 120 },
            quality: {
                codeChurn: { rate: 0.15, trend: 'stable', aiVsHuman: 1.2 },
                duplication: { cloneRate: 0.05, copyPasteRatio: 0.1, beforeAI: 0.04, afterAI: 0.05 },
                complexity: { cyclomaticComplexity: 10, cognitiveLoad: 5, nestingDepth: 2, aiGeneratedComplexity: 12 },
                refactoring: { rate: 0.1, aiCodeRefactored: 0.2 },
                overallScore: 0.85
            },
            productivity: {
                taskCompletion: { velocityChange: 0.2, cycleTime: 10, reworkRate: 0.1 },
                flowEfficiency: { focusTime: 4, contextSwitches: 5, waitTime: 0 },
                valueDelivery: { featuresShipped: 2, bugRate: 0.01, customerImpact: 0.8 },
                actualGain: 0.15,
                perceivedGain: 0.25,
                netTimeSaved: 2.5,
                satisfaction: { average: 4.5 }
            },
            roi: {
                costBenefit: { licenseCost: 20, timeSaved: 5, timeWasted: 2.5, netValue: 150 },
                hiddenCosts: { technicalDebt: 100, maintenanceBurden: 50, knowledgeGaps: 10 },
                teamImpact: { reviewTime: 1, onboardingCost: 0, collaborationFriction: 0 },
                overallROI: 1.5,
                breakEvenDays: 5,
                recommendation: 'Good job'
            },
            performance: {
                buildStats: { successRate: 0.9, averageDuration: 100, buildsPerDay: 10, aiCorrelation: 0.5 },
                testStats: { successRate: 0.95, averageDuration: 50, testsPerDay: 20, aiCorrelation: 0.2 }
            }
        };

        const html = generator.generateHTML(mockMetrics, 'Test Project');

        // Basic validation
        assert.ok(html.startsWith('<!DOCTYPE html>'), 'Report should start with doctype');
        assert.ok(html.includes('Test Project'), 'Report should include project name');
        assert.ok(html.includes('AI Impact Report'), 'Report should include title');
        
        // Check for metrics embedding
        assert.ok(html.includes('const DATA = {'), 'Report should embed data object');
        assert.ok(html.includes('"overallROI": 1.5'), 'Report should contain specific metric values');
        
        // Check for libraries
        assert.ok(html.includes('chart.js'), 'Report should include Chart.js');
	});

    test('generateHTML handles missing optional metrics gracefully', () => {
        const generator = new ReportGenerator();
        const emptyMetrics: AllMetrics = {
            // Other fields undefined
        };

        const html = generator.generateHTML(emptyMetrics, 'Empty Project');

        assert.ok(html.length > 0, 'Should generate HTML even with empty metrics');
        assert.ok(html.includes('Empty Project'), 'Should include project name');
    });
});
