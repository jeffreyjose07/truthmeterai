export interface AIEvent {
    timestamp: number;
    type: 'suggestion' | 'acceptance' | 'rejection' | 'modification';
    sessionId: string;
    fileType: string;
    suggestionLength: number;
    acceptedLength: number;
    modificationTime: number;
    contextSize: number;
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
