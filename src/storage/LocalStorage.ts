import * as vscode from 'vscode';
import { AllMetrics } from '../types/metrics';

export class LocalStorage {
    private context: vscode.ExtensionContext;
    private memCache: Map<string, any> = new Map();

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async initialize(): Promise<void> {
        // Initialize storage system
        console.log('LocalStorage initialized');
    }

    async store(key: string, value: any): Promise<void> {
        // Store in VS Code's global state
        const existingData = this.context.globalState.get<any[]>(key) || [];
        existingData.push(value);

        // Keep only last 1000 entries to prevent excessive growth
        if (existingData.length > 1000) {
            existingData.shift();
        }

        await this.context.globalState.update(key, existingData);
        this.memCache.set(key, existingData);
    }

    async get(key: string): Promise<any[]> {
        // Try mem cache first
        if (this.memCache.has(key)) {
            return this.memCache.get(key);
        }

        // Fallback to global state
        const data = this.context.globalState.get<any[]>(key) || [];
        this.memCache.set(key, data);
        return data;
    }

    async storeMetrics(metrics: AllMetrics): Promise<void> {
        const timestamp = Date.now();
        const metricsWithTimestamp = {
            ...metrics,
            timestamp
        };

        await this.store('metrics_history', metricsWithTimestamp);
        await this.context.globalState.update('latest_metrics', metricsWithTimestamp);
    }

    async getLatestMetrics(): Promise<AllMetrics> {
        const metrics = this.context.globalState.get<AllMetrics>('latest_metrics');
        return metrics || {
            quality: {
                codeChurn: { rate: 0, trend: 'stable', aiVsHuman: 1 },
                duplication: { cloneRate: 0, copyPasteRatio: 0, beforeAI: 0, afterAI: 0 },
                complexity: { cyclomaticComplexity: 0, cognitiveLoad: 0, nestingDepth: 0, aiGeneratedComplexity: 0 },
                refactoring: { rate: 0, aiCodeRefactored: 0 },
                overallScore: 0
            }
        };
    }

    async getMetricsHistory(days: number = 30): Promise<AllMetrics[]> {
        const history = await this.get('metrics_history');
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

        return history.filter((m: any) => m.timestamp > cutoffTime);
    }

    async clearAll(): Promise<void> {
        await this.context.globalState.update('metrics_history', []);
        await this.context.globalState.update('latest_metrics', null);
        this.memCache.clear();
    }

    async exportData(): Promise<string> {
        const allData = {
            metrics: await this.get('metrics_history'),
            churnEvents: await this.get('churn_events'),
            aiUsage: await this.get('ai_usage'),
            suggestionShown: await this.get('suggestion_shown')
        };

        return JSON.stringify(allData, null, 2);
    }
}
