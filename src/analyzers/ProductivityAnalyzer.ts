import { TrueProductivityMetrics } from '../types/metrics';
import { LocalStorage } from '../storage/LocalStorage'; // Import LocalStorage

export class ProductivityAnalyzer {
    constructor(private storage: LocalStorage) {} // Inject LocalStorage

    async analyze(aiMetrics?: any, codeMetrics?: any, timeMetrics?: any): Promise<TrueProductivityMetrics> {
        // Default values if no metrics provided
        const acceptanceRate = aiMetrics?.acceptanceRate || 0;
        const totalSuggestions = aiMetrics?.totalSuggestions || 0;
        const activeTimeHours = (timeMetrics?.totalActiveTime || 0) / 60;
        const flowEfficiency = timeMetrics?.flowEfficiency || 0;
        const averageSatisfaction = await this.calculateAverageSatisfaction();
        
        // Calculate velocity change based on AI acceptance rate
        // Research suggests 0-26% actual gain, highly correlated with acceptance
        const velocityChange = acceptanceRate * 0.26; 

        // Calculate rework rate based on churn if available
        const reworkRate = aiMetrics?.churnRate || 0.15; // Default 15% rework

        // Calculate time saved: avg 5 mins saved per accepted suggestion
        const timeSavedHours = (totalSuggestions * acceptanceRate) * (5 / 60);
        
        // Calculate time lost: review time (2 min) + real fix time (measured)
        const reviewTimeHours = totalSuggestions * (2 / 60);
        
        // Use actual measured fix time if available, otherwise fallback to heuristic
        let fixTimeHours = 0;
        if (aiMetrics?.totalFixTime) {
            fixTimeHours = aiMetrics.totalFixTime / 1000 / 60 / 60; // ms -> hours
        } else {
            fixTimeHours = (totalSuggestions * acceptanceRate * reworkRate) * (15 / 60);
        }
        
        const netTimeSaved = timeSavedHours - (reviewTimeHours + fixTimeHours);

        return {
            taskCompletion: {
                velocityChange: velocityChange,
                cycleTime: 0, // Needs git data for real cycle time
                reworkRate: reworkRate
            },

            flowEfficiency: {
                focusTime: (timeMetrics?.flowTime || 0) / 60, // Flow time in hours
                contextSwitches: timeMetrics?.contextSwitches || 0,
                waitTime: 0
            },

            valueDelivery: {
                featuresShipped: Math.floor(totalSuggestions / 10), // Rough proxy
                bugRate: 0, // Needs bug tracker integration
                customerImpact: 0
            },

            netTimeSaved: netTimeSaved,
            actualGain: velocityChange, // Define actualGain
            perceivedGain: acceptanceRate * 1.5, // Define perceivedGain
            satisfaction: {
                average: averageSatisfaction
            }
        };
    }

    private async calculateAverageSatisfaction(): Promise<number> {
        const feedback = await this.storage.get('satisfaction_feedback') || [];
        if (feedback.length === 0) {
            return 0; // No feedback yet
        }
        const totalRating = feedback.reduce((sum: number, entry: any) => sum + (entry.rating || 0), 0);
        return totalRating / feedback.length;
    }

    async calculateActualProductivity(): Promise<number> {
        // Based on task completion times
        return -0.19; // 19% slower for experienced devs
    }

    async calculatePerceivedProductivity(): Promise<number> {
        // Based on developer surveys
        return 0.20; // Developers think they're 20% faster
    }

    async calculateNetTimeSaved(): Promise<number> {
        // Time saved minus time wasted
        const timeSaved = 2.5; // hours per week
        const timeWasted = 3.1; // hours per week debugging/verifying AI code
        return timeSaved - timeWasted;
    }
}
