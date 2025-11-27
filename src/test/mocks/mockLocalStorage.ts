import { MockMemento, MockExtensionContext } from './vscode.mock';
import { LocalStorage } from '../../storage/LocalStorage';

// A simple mock for LocalStorage that uses MockMemento internally
export class MockLocalStorage {
    // This will mock the internal globalState memento
    private memento = new MockMemento();

    constructor() {
        // You can make this mock more realistic if needed, e.g.,
        // by passing a mock context to the real LocalStorage if it were extended,
        // but for a standalone mock, this is sufficient.
    }

    async initialize(): Promise<void> {
        // Mocked initialization, no actual async work needed
    }

    // This mock will implement the specific methods that ProductivityAnalyzer uses from LocalStorage
    // For storing satisfaction_feedback
    async store(key: string, value: any): Promise<void> {
        let existingData = this.memento.get<any[]>(key) || [];
        if (!Array.isArray(existingData)) {
            existingData = [];
        }
        existingData.push(value);
        await this.memento.update(key, existingData);
    }

    async get(key: string): Promise<any[]> {
        return this.memento.get<any[]>(key) || [];
    }

    // Dummy implementations for methods not used by ProductivityAnalyzer in this context
    async storeMetrics(metrics: any): Promise<void> { /* no-op */ }
    async getLatestMetrics(): Promise<any> { return undefined; }
    async getMetricsHistory(days: number): Promise<any[]> { return []; }
    async exportData(): Promise<string> { return ''; }
    async clearAllData(): Promise<void> { /* no-op */ }
}