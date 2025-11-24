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

export interface AllMetrics {
  ai?: any;
  code?: any;
  time?: any;
  git?: any;
  quality?: CodeQualityMetrics;
  productivity?: TrueProductivityMetrics;
  roi?: EconomicMetrics;
}
