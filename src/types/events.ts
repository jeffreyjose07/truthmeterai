export interface AIEvent {
    timestamp: number;
    type: 'suggestion' | 'acceptance' | 'rejection' | 'modification';
    sessionId: string;
    fileType: string;
    suggestionLength: number;
    acceptedLength: number;
    modificationTime: number;
    contextSize: number;
    uri?: string;
}

export interface ChurnEvent {
    timestamp: number;
    type: 'churn';
    rate: number;
}

export interface UsageEvent {
    timestamp: number;
    markers: number;
    session: string;
}

export interface SuggestionEvent {
    timestamp: number;
    file: string;
    line: number;
    character: number;
}

export interface BuildEvent {
    timestamp: number;
    type: 'build';
    status: 'success' | 'failure';
    duration: number;
    system: string; // e.g., 'npm', 'maven', 'gradle'
}

export interface TestEvent {
    timestamp: number;
    type: 'test';
    status: 'success' | 'failure';
    duration: number;
    testCount: number;
    passedCount: number;
    failedCount: number;
    system: string;
}
