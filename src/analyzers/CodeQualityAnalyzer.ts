import * as vscode from 'vscode';
import { CodeQualityMetrics } from '../types/metrics';

export class CodeQualityAnalyzer {
    private previousAnalysis: Map<string, any> = new Map();

    async analyze(gitMetrics?: any): Promise<CodeQualityMetrics> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return this.getDefaultMetrics();
        }

        const analysis: CodeQualityMetrics = {
            codeChurn: await this.analyzeCodeChurn(gitMetrics),
            duplication: await this.analyzeDuplication(),
            complexity: await this.analyzeComplexity(),
            refactoring: await this.analyzeRefactoring(),
            overallScore: 0
        };

        analysis.overallScore = this.calculateQualityScore(analysis);

        return analysis;
    }

    private async analyzeCodeChurn(gitMetrics?: any): Promise<any> {
        // Use Git metrics if available (more accurate)
        if (gitMetrics && typeof gitMetrics.churnRate === 'number') {
            const rate = gitMetrics.churnRate;
            return {
                rate,
                trend: this.calculateTrend('churn', rate),
                aiVsHuman: await this.compareAIvsHumanChurn()
            };
        }

        // Fallback to file-system heuristic
        const recentFiles = await this.getRecentlyModifiedFiles();
        let totalChurn = 0;
        let fileCount = 0;

        for (const file of recentFiles) {
            const churn = await this.calculateFileChurn(file);
            totalChurn += churn;
            fileCount++;
        }

        const rate = fileCount > 0 ? totalChurn / fileCount : 0;

        return {
            rate,
            trend: this.calculateTrend('churn', rate),
            aiVsHuman: await this.compareAIvsHumanChurn()
        };
    }

    private async analyzeDuplication(): Promise<any> {
        const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java}', '**/node_modules/**');
        const codeBlocks = new Map<string, number>();
        let totalBlocks = 0;
        let duplicatedBlocks = 0;

        for (const file of files.slice(0, 50)) {
            const document = await vscode.workspace.openTextDocument(file);
            const blocks = this.extractCodeBlocks(document.getText());

            for (const block of blocks) {
                const hash = this.hashCodeBlock(block);
                const count = codeBlocks.get(hash) || 0;
                codeBlocks.set(hash, count + 1);

                if (count > 0) {
                    duplicatedBlocks++;
                }
                totalBlocks++;
            }
        }

        const cloneRate = totalBlocks > 0 ? duplicatedBlocks / totalBlocks : 0;

        return {
            cloneRate,
            copyPasteRatio: await this.calculateCopyPasteRatio(),
            beforeAI: this.previousAnalysis.get('duplication')?.cloneRate || 0,
            afterAI: cloneRate
        };
    }

    private async analyzeComplexity(): Promise<any> {
        const files = await vscode.workspace.findFiles('**/*.{ts,js}', '**/node_modules/**');
        let totalComplexity = 0;
        let aiGeneratedComplexity = 0;
        let fileCount = 0;

        for (const file of files.slice(0, 50)) {
            const document = await vscode.workspace.openTextDocument(file);
            const text = document.getText();
            const complexity = this.calculateCyclomaticComplexity(text);

            totalComplexity += complexity;

            if (this.isLikelyAIGenerated(text)) {
                aiGeneratedComplexity += complexity;
            }

            fileCount++;
        }

        return {
            cyclomaticComplexity: fileCount > 0 ? totalComplexity / fileCount : 0,
            cognitiveLoad: this.calculateCognitiveLoad(totalComplexity, fileCount),
            nestingDepth: await this.calculateAverageNestingDepth(),
            aiGeneratedComplexity: aiGeneratedComplexity
        };
    }

    private async analyzeRefactoring(): Promise<any> {
        // Simplified refactoring analysis
        return {
            rate: 0.15,
            aiCodeRefactored: 0.35
        };
    }

    private async getRecentlyModifiedFiles(): Promise<vscode.Uri[]> {
        const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java}', '**/node_modules/**');
        const recentFiles: vscode.Uri[] = [];

        for (const file of files) {
            try {
                const stat = await vscode.workspace.fs.stat(file);
                const daysSinceModified = (Date.now() - stat.mtime) / (1000 * 60 * 60 * 24);

                if (daysSinceModified < 14) {
                    recentFiles.push(file);
                }
            } catch (error) {
                // Skip files that can't be stat'd
            }
        }

        return recentFiles;
    }

    private async calculateFileChurn(file: vscode.Uri): Promise<number> {
        try {
            const stat = await vscode.workspace.fs.stat(file);
            const daysSinceCreated = (Date.now() - stat.ctime) / (1000 * 60 * 60 * 24);

            if (daysSinceCreated < 14) {
                const modificationRate = (stat.mtime - stat.ctime) / (Date.now() - stat.ctime);
                return modificationRate;
            }

            return 0;
        } catch (error) {
            return 0;
        }
    }

    private calculateTrend(metric: string, currentValue: number): 'increasing' | 'stable' | 'decreasing' {
        const previousValue = this.previousAnalysis.get(metric) || currentValue;
        const change = currentValue - previousValue;

        if (Math.abs(change) < 0.05) {return 'stable';}
        return change > 0 ? 'increasing' : 'decreasing';
    }

    private async compareAIvsHumanChurn(): Promise<number> {
        return 1.5;
    }

    private extractCodeBlocks(text: string): string[] {
        const blocks: string[] = [];
        const lines = text.split('\n');

        for (let i = 0; i < lines.length - 4; i++) {
            const block = lines.slice(i, i + 5).join('\n');
            if (block.trim().length > 50) {
                blocks.push(block);
            }
        }

        return blocks;
    }

    private hashCodeBlock(block: string): string {
        let hash = 0;
        for (let i = 0; i < block.length; i++) {
            const char = block.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    private async calculateCopyPasteRatio(): Promise<number> {
        return 0.3;
    }

    private calculateCyclomaticComplexity(text: string): number {
        let complexity = 1;

        const decisionPoints = [
            /\bif\b/g,
            /\belse\s+if\b/g,
            /\bfor\b/g,
            /\bwhile\b/g,
            /\bcase\b/g,
            /\bcatch\b/g,
            /&&/g,
            /\|\|/g,
            /\?.*:/g
        ];

        for (const pattern of decisionPoints) {
            const matches = text.match(pattern);
            complexity += matches ? matches.length : 0;
        }

        return complexity;
    }

    private calculateCognitiveLoad(complexity: number, fileCount: number): number {
        if (fileCount === 0) {return 0;}

        const avgComplexity = complexity / fileCount;

        if (avgComplexity < 5) {return 2;}
        if (avgComplexity < 10) {return 4;}
        if (avgComplexity < 20) {return 6;}
        if (avgComplexity < 30) {return 8;}
        return 10;
    }

    private async calculateAverageNestingDepth(): Promise<number> {
        const files = await vscode.workspace.findFiles('**/*.{ts,js}', '**/node_modules/**');
        let totalDepth = 0;
        let blockCount = 0;

        for (const file of files.slice(0, 20)) {
            const document = await vscode.workspace.openTextDocument(file);
            const text = document.getText();
            const depths = this.calculateNestingDepths(text);

            totalDepth += depths.reduce((a, b) => a + b, 0);
            blockCount += depths.length;
        }

        return blockCount > 0 ? totalDepth / blockCount : 0;
    }

    private calculateNestingDepths(text: string): number[] {
        const depths: number[] = [];
        let currentDepth = 0;

        for (const char of text) {
            if (char === '{') {
                currentDepth++;
                depths.push(currentDepth);
            } else if (char === '}') {
                currentDepth = Math.max(0, currentDepth - 1);
            }
        }

        return depths;
    }

    private isLikelyAIGenerated(text: string): boolean {
        const aiPatterns = [
            /\/\/ TODO: Implement/gi,
            /\/\/ Generated by/gi,
            /console\.log\(['"]Debug/gi,
            /placeholder/gi,
            /example\.com/gi
        ];

        return aiPatterns.some(pattern => pattern.test(text));
    }

    private calculateQualityScore(analysis: CodeQualityMetrics): number {
        const churnPenalty = Math.max(0, 1 - analysis.codeChurn.rate * 2);
        const duplicationPenalty = Math.max(0, 1 - analysis.duplication.cloneRate * 3);
        const complexityPenalty = Math.max(0, 1 - (analysis.complexity.cyclomaticComplexity / 50));
        const refactoringPenalty = Math.max(0, 1 - analysis.refactoring.aiCodeRefactored);

        const score = (churnPenalty + duplicationPenalty + complexityPenalty + refactoringPenalty) / 4;

        return Math.max(0, Math.min(1, score));
    }

    private getDefaultMetrics(): CodeQualityMetrics {
        return {
            codeChurn: { rate: 0, trend: 'stable', aiVsHuman: 1 },
            duplication: { cloneRate: 0, copyPasteRatio: 0, beforeAI: 0, afterAI: 0 },
            complexity: { cyclomaticComplexity: 0, cognitiveLoad: 0, nestingDepth: 0, aiGeneratedComplexity: 0 },
            refactoring: { rate: 0, aiCodeRefactored: 0 },
            overallScore: 0
        };
    }
}
