import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';

export class GitAnalyzer {
    private git: SimpleGit | null = null;

    async initialize(): Promise<boolean> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return false;
            }

            this.git = simpleGit(workspaceFolder.uri.fsPath);
            await this.git.status();
            return true;
        } catch (error) {
            console.error('Git not initialized:', error);
            return false;
        }
    }

    async analyze(): Promise<any> {
        if (!this.git) {
            await this.initialize();
        }

        if (!this.git) {
            return null;
        }

        try {
            const log = await this.git.log({ maxCount: 100 });
            const status = await this.git.status();

            return {
                recentCommits: log.total,
                uncommittedChanges: status.files.length,
                currentBranch: status.current,
                commitFrequency: this.calculateCommitFrequency(Array.from(log.all)),
                averageCommitSize: await this.calculateAverageCommitSize(Array.from(log.all)),
                churnRate: await this.calculateChurnRate()
            };
        } catch (error) {
            console.error('Error analyzing git:', error);
            return null;
        }
    }

    private async calculateChurnRate(): Promise<number> {
        if (!this.git) { return 0; }

        try {
            // Get numstat for last 14 days to detect "Code Churn" (rework)
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

            // git log --numstat --since="2023-..."
            const log = await this.git.raw([
                'log',
                '--numstat',
                `--since=${twoWeeksAgo.toISOString()}`,
                '--format=' // Suppress commit info, just show stats
            ]);

            let totalAdded = 0;
            let totalDeleted = 0;

            const lines = log.split('\n');
            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    const added = parseInt(parts[0], 10);
                    const deleted = parseInt(parts[1], 10);

                    if (!isNaN(added)) { totalAdded += added; }
                    if (!isNaN(deleted)) { totalDeleted += deleted; }
                }
            }

            // Churn Rate = Ratio of code deleted to total code changes
            // High deletion rate often implies rework/churn
            const totalChanges = totalAdded + totalDeleted;
            return totalChanges > 0 ? totalDeleted / totalChanges : 0;

        } catch (error) {
            console.error('Error calculating churn rate:', error);
            return 0;
        }
    }

    private calculateCommitFrequency(commits: any[]): number {
        if (commits.length < 2) {return 0;}

        const firstCommit = new Date(commits[commits.length - 1].date);
        const lastCommit = new Date(commits[0].date);

        const daysDiff = (lastCommit.getTime() - firstCommit.getTime()) / (1000 * 60 * 60 * 24);

        return daysDiff > 0 ? commits.length / daysDiff : 0;
    }

    private async calculateAverageCommitSize(commits: any[]): Promise<number> {
        if (!this.git || commits.length === 0) {return 0;}

        let totalChanges = 0;

        for (let i = 0; i < Math.min(10, commits.length); i++) {
            try {
                const diff = await this.git.diffSummary([`${commits[i].hash}^`, commits[i].hash]);
                totalChanges += diff.insertions + diff.deletions;
            } catch (error) {
                // Skip if diff fails
            }
        }

        return totalChanges / Math.min(10, commits.length);
    }

    async getChurnRate(): Promise<number> {
        if (!this.git) {
            return 0;
        }

        try {
            // Get files changed in last 14 days
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

            const log = await this.git.log({
                '--since': twoWeeksAgo.toISOString()
            });

            // Calculate churn based on files modified multiple times
            const fileChanges = new Map<string, number>();

            for (const commit of log.all) {
                const files = await this.git.show([commit.hash, '--name-only', '--format=']);
                for (const file of files.split('\n').filter(Boolean)) {
                    fileChanges.set(file, (fileChanges.get(file) || 0) + 1);
                }
            }

            // Files changed more than once indicate churn
            let churnFiles = 0;
            for (const count of fileChanges.values()) {
                if (count > 1) {
                    churnFiles++;
                }
            }

            return fileChanges.size > 0 ? churnFiles / fileChanges.size : 0;
        } catch (error) {
            console.error('Error calculating churn rate:', error);
            return 0;
        }
    }
}
