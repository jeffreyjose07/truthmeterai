import { EconomicMetrics } from '../types/metrics';

export class ROICalculator {
    private readonly DEVELOPER_HOURLY_RATE = 75;
    private readonly AI_TOOL_MONTHLY_COST = 15;

    async calculate(): Promise<EconomicMetrics> {
        const timeSaved = await this.calculateTimeSaved();
        const timeWasted = await this.calculateTimeWasted();
        const netTimeSaved = timeSaved - timeWasted;

        const dollarValue = netTimeSaved * this.DEVELOPER_HOURLY_RATE;
        const monthlyCost = this.AI_TOOL_MONTHLY_COST;
        const monthlyValue = dollarValue * 160; // Assuming 160 work hours/month

        const roi = monthlyValue / monthlyCost;

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
