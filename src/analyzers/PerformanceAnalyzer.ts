import { PerformanceMetrics } from '../types/metrics';
import { BuildEvent, TestEvent, AIEvent } from '../types/events';

export class PerformanceAnalyzer {
    public analyze(
        perfEvents: (BuildEvent | TestEvent)[],
        aiEvents: AIEvent[]
    ): PerformanceMetrics {
        const builds = perfEvents.filter(e => e.type === 'build') as BuildEvent[];
        const tests = perfEvents.filter(e => e.type === 'test') as TestEvent[];

        return {
            buildStats: this.calculateStats(builds, aiEvents),
            testStats: this.calculateStats(tests, aiEvents)
        };
    }

    private calculateStats(
        events: (BuildEvent | TestEvent)[],
        aiEvents: AIEvent[]
    ) {
        if (events.length === 0) {
            return {
                successRate: 0,
                averageDuration: 0,
                buildsPerDay: 0,
                testsPerDay: 0,
                aiCorrelation: 0
            };
        }

        const successCount = events.filter(e => e.status === 'success').length;
        const totalDuration = events.reduce((sum, e) => sum + e.duration, 0);
        
        // Calculate items per day
        const oldest = events[0].timestamp;
        const newest = events[events.length - 1].timestamp;
        const days = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));

        return {
            successRate: successCount / events.length,
            averageDuration: totalDuration / events.length,
            buildsPerDay: events[0].type === 'build' ? events.length / days : 0,
            testsPerDay: events[0].type === 'test' ? events.length / days : 0,
            aiCorrelation: this.calculateCorrelation(events, aiEvents)
        };
    }

    private calculateCorrelation(
        outcomes: (BuildEvent | TestEvent)[],
        aiEvents: AIEvent[]
    ): number {
        // Simple correlation: 
        // Did AI usage in the last 15 mins lead to success or failure?
        // +1: AI used -> Success
        // -1: AI used -> Failure
        // 0: No AI used
        
        let correlationSum = 0;
        let correlatedEvents = 0;

        const LOOKBACK_MS = 15 * 60 * 1000; // 15 minutes

        for (const outcome of outcomes) {
            const recentAI = aiEvents.filter(ai => 
                ai.timestamp < outcome.timestamp && 
                ai.timestamp > (outcome.timestamp - LOOKBACK_MS) &&
                ai.type === 'acceptance' // Only count accepted suggestions
            );

            if (recentAI.length > 0) {
                correlatedEvents++;
                if (outcome.status === 'success') {
                    correlationSum += 1;
                } else {
                    correlationSum -= 1;
                }
            }
        }

        return correlatedEvents > 0 ? correlationSum / correlatedEvents : 0;
    }
}
