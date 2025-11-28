import * as vscode from 'vscode';
import { BuildEvent, TestEvent } from '../types/events';

export class PerformanceCollector {
    private events: (BuildEvent | TestEvent)[] = [];
    private readonly MAX_EVENTS = 1000;
    private disposables: vscode.Disposable[] = [];
    private taskStartTimes: Map<string, number> = new Map();

    constructor() {
        this.initialize();
    }

    private initialize() {
        this.disposables.push(
            vscode.tasks.onDidStartTask((e) => {
                const taskId = this.getTaskId(e.execution.task);
                this.taskStartTimes.set(taskId, Date.now());
            }),
            vscode.tasks.onDidEndTaskProcess((e) => {
                this.handleTaskEnd(e);
            })
        );
    }

    private getTaskId(task: vscode.Task): string {
        return task.name + (task.source ? `:${task.source}` : '');
    }

    private handleTaskEnd(e: vscode.TaskProcessEndEvent) {
        const task = e.execution.task;
        const taskId = this.getTaskId(task);
        const startTime = this.taskStartTimes.get(taskId);
        
        if (!startTime) {return;} // Should not happen if started while extension active

        const duration = Date.now() - startTime;
        this.taskStartTimes.delete(taskId);

        const exitCode = e.exitCode ?? 0; // Assume success if undefined, though it usually is set
        const status = exitCode === 0 ? 'success' : 'failure';
        const taskName = task.name.toLowerCase();
        const source = task.source.toLowerCase();

        // Heuristics to classify as Build or Test
        const isTest = taskName.includes('test') || source.includes('test') || task.group === vscode.TaskGroup.Test;
        const isBuild = taskName.includes('build') || source.includes('build') || task.group === vscode.TaskGroup.Build;

        if (isTest) {
            const event: TestEvent = {
                timestamp: Date.now(),
                type: 'test',
                status,
                duration,
                testCount: 0, // Cannot easily determine without parsing output
                passedCount: 0,
                failedCount: exitCode === 0 ? 0 : 1, // Binary success/fail for now
                system: task.source
            };
            this.addEvent(event);
        } else if (isBuild) {
            const event: BuildEvent = {
                timestamp: Date.now(),
                type: 'build',
                status,
                duration,
                system: task.source
            };
            this.addEvent(event);
        }
    }

    private addEvent(event: BuildEvent | TestEvent) {
        this.events.push(event);
        if (this.events.length > this.MAX_EVENTS) {
            this.events.shift();
        }
    }

    public getEvents(): (BuildEvent | TestEvent)[] {
        return [...this.events];
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.taskStartTimes.clear();
    }
}
