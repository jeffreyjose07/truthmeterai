import { EconomicMetrics } from '../types/metrics';

export class ROICalculator {
    private readonly DEVELOPER_HOURLY_RATE = 75;
    private readonly AI_TOOL_MONTHLY_COST = 15;

    async calculate(productivityMetrics?: any): Promise<EconomicMetrics> {
        // Use netTimeSaved from productivity metrics if available
        const netTimeSaved = productivityMetrics?.netTimeSaved || 0;
        
        // Split netTimeSaved into saved/wasted for reporting (simplified)
        // If net is positive, we saved time. If negative, we wasted time.
        const timeSaved = netTimeSaved > 0 ? netTimeSaved : 0;
        const timeWasted = netTimeSaved < 0 ? Math.abs(netTimeSaved) : 0;

        const dollarValue = netTimeSaved * this.DEVELOPER_HOURLY_RATE;
        const monthlyCost = this.AI_TOOL_MONTHLY_COST;
        
        // ROI = (Value - Cost) / Cost
        // Value is projected monthly value based on this week's saving rate (x4)
        const monthlyValue = dollarValue * 4; 
        
        // Avoid division by zero
        let roi = 0;
        if (monthlyCost > 0) {
            // If we have no saved time, don't show -100% ROI (which implies loss),
            // instead show 0% (neutral/pending) until we have data.
            if (monthlyValue === 0) {
                roi = 0;
            } else {
                roi = (monthlyValue - monthlyCost) / monthlyCost;
            }
        }

        const hiddenCosts = await this.calculateHiddenCosts();
        const teamImpact = await this.calculateTeamImpact();

        return {
            costBenefit: {
                licenseCost: monthlyCost,
                timeSaved: timeSaved,
                timeWasted: timeWasted,
                netValue: dollarValue
            },
            hiddenCosts,
            teamImpact,
            overallROI: roi,
            breakEvenDays: this.calculateBreakEven(monthlyValue, monthlyCost),
            recommendation: this.generateRecommendation(roi, hiddenCosts)
        };
    }

    private async calculateTimeSaved(): Promise<number> {
        return 2.5; // Hours per week
    }

    private async calculateTimeWasted(): Promise<number> {
        return 3.1; // Hours per week - MORE than saved!
    }

    private async calculateHiddenCosts(): Promise<any> {
        return {
            technicalDebt: 5000,
            maintenanceBurden: 2000,
            knowledgeGaps: 3000
        };
    }

    private async calculateTeamImpact(): Promise<any> {
        return {
            reviewTime: 1.5,
            onboardingCost: 500,
            collaborationFriction: 0.2
        };
    }

    private calculateBreakEven(monthlyValue: number, monthlyCost: number): number {
        if (monthlyValue <= 0) {return Infinity;}
        return (monthlyCost / (monthlyValue / 30));
    }

    private generateRecommendation(roi: number, hiddenCosts: any): string {
        const totalHiddenCosts = Object.values(hiddenCosts).reduce((a: any, b: any) => a + b, 0) as number;

        if (roi > 3 && totalHiddenCosts < 5000) {
            return "Strong ROI - Expand usage with monitoring";
        } else if (roi > 1.5) {
            return "Positive ROI - Continue with caution";
        } else if (roi < 1) {
            return "Negative ROI - Reduce usage and focus on training";
        } else {
            return "Marginal ROI - Optimize usage patterns";
        }
    }
}
