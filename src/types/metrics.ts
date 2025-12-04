export interface CodeQualityMetrics {
  codeChurn: {
    rate: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    aiVsHuman: number;
  };

  duplication: {
    cloneRate: number;
    copyPasteRatio: number;
    beforeAI: number;
    afterAI: number;
  };

  complexity: {
    cyclomaticComplexity: number;
    cognitiveLoad: number;
    nestingDepth: number;
    aiGeneratedComplexity: number;
  };

  refactoring: {
    rate: number;
    aiCodeRefactored: number;
  };

  overallScore: number;
}

export interface TrueProductivityMetrics {
  taskCompletion: {
    velocityChange: number;
    cycleTime: number;
    reworkRate: number;
  };

  flowEfficiency: {
    focusTime: number;
    activeCodingTime?: number;
    readingTime?: number;
    contextSwitches: number;
    waitTime: number;
  };

  valueDelivery: {
    featuresShipped: number;
    bugRate: number;
    customerImpact: number;
  };

  actualGain?: number;
  perceivedGain?: number;
  netTimeSaved?: number;
  satisfaction?: {
    average: number;
  };
  flowBlocks?: Array<{ start: number; end: number }>;
}

export interface DeveloperExperienceMetrics {
  cognitive: {
    mentalEffort: number;
    frustrationEvents: number;
    learningCurve: number;
  };

  trust: {
    verificationTime: number;
    overrideRate: number;
    confidenceScore: number;
  };

  satisfaction: {
    toolSatisfaction: number;
    wouldRecommend: boolean;
    perceivedValue: number;
  };
}

export interface EconomicMetrics {
  costBenefit: {
    licenseCost: number;
    timeSaved: number;
    timeWasted: number;
    netValue: number;
  };

  hiddenCosts: {
    technicalDebt: number;
    maintenanceBurden: number;
    knowledgeGaps: number;
  };

  teamImpact: {
    reviewTime: number;
    onboardingCost: number;
    collaborationFriction: number;
  };

  overallROI?: number;
  breakEvenDays?: number;
  recommendation?: string;
}

export interface PerformanceMetrics {
  buildStats: {
    successRate: number;
    averageDuration: number;
    buildsPerDay: number;
    aiCorrelation: number; // -1 to 1, correlation between AI usage and build success
  };
  testStats: {
    successRate: number;
    averageDuration: number;
    testsPerDay: number;
    aiCorrelation: number; // -1 to 1
  };
}

export interface AllMetrics {
  ai?: any;
  code?: any;
  time?: any;
  git?: any;
  quality?: CodeQualityMetrics;
  productivity?: TrueProductivityMetrics;
  roi?: EconomicMetrics;
  performance?: PerformanceMetrics;
}
