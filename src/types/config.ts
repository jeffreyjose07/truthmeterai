export interface ExtensionConfig {
    enableTracking: boolean;
    teamMode: boolean;
    developerHourlyRate: number;
}

export interface LicenseInfo {
    isLicensed: boolean;
    tier: 'free' | 'team' | 'enterprise';
    expiresAt?: Date;
}

export interface TeamMember {
    name: string;
    experience: string;
    aiUsage: number;
    impact: number;
    quality: number;
    recommendation: string;
}
