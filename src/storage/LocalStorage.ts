import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AllMetrics } from '../types/metrics';

export class LocalStorage {
    private context: vscode.ExtensionContext;
    private memCache: Map<string, any> = new Map();
    private storageDir: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.storageDir = context.globalStorageUri.fsPath;
    }

    async initialize(): Promise<void> {
        // Initialize storage system - create storage directory if it doesn't exist
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
        console.log('LocalStorage initialized at:', this.storageDir);
    }

    async store(key: string, value: any): Promise<void> {
        // Use file storage for large data (metrics_history), memory for small data
        if (key === 'metrics_history') {
            return this.storeToFile(key, value);
        }

        // Store small data in VS Code's global state
        const existingData = this.context.globalState.get<any[]>(key) || [];
        existingData.push(value);

        // Keep only last 100 entries for non-metrics data
        if (existingData.length > 100) {
            existingData.shift();
        }

        await this.context.globalState.update(key, existingData);
        this.memCache.set(key, existingData);
    }

    async get(key: string): Promise<any[]> {
        // Use file storage for large data
        if (key === 'metrics_history') {
            return this.getFromFile(key);
        }

        // Try mem cache first
        if (this.memCache.has(key)) {
            return this.memCache.get(key);
        }

        // Fallback to global state
        const data = this.context.globalState.get<any[]>(key) || [];
        this.memCache.set(key, data);
        return data;
    }

    private async storeToFile(key: string, value: any): Promise<void> {
        const filePath = path.join(this.storageDir, `${key}.json`);

        // Read existing data
        let existingData: any[] = [];
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                existingData = JSON.parse(content);
            } catch (error) {
                console.error(`Error reading ${key} from file:`, error);
                existingData = [];
            }
        }

        // Append new value
        existingData.push(value);

        // Keep only last 1000 entries
        if (existingData.length > 1000) {
            existingData = existingData.slice(-1000);
        }

        // Write back to file
        try {
            fs.writeFileSync(filePath, JSON.stringify(existingData), 'utf8');
            this.memCache.set(key, existingData);
        } catch (error) {
            console.error(`Error writing ${key} to file:`, error);
        }
    }

    private async getFromFile(key: string): Promise<any[]> {
        // Try mem cache first
        if (this.memCache.has(key)) {
            return this.memCache.get(key);
        }

        const filePath = path.join(this.storageDir, `${key}.json`);

        if (!fs.existsSync(filePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            this.memCache.set(key, data);
            return data;
        } catch (error) {
            console.error(`Error reading ${key} from file:`, error);
            return [];
        }
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
        // Clear globalState
        await this.context.globalState.update('latest_metrics', null);

        // Clear file storage
        const filePath = path.join(this.storageDir, 'metrics_history.json');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Clear memory cache
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
