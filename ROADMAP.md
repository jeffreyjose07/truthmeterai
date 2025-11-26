# TruthMeter AI Roadmap

Our development roadmap is driven by peer-reviewed research into developer productivity and the impact of AI coding assistants.

## Phase 1: Core Foundation (Current - v1.0.4)
**Goal:** Establish a reliable, privacy-first data collection baseline.

- [x] **Basic Event Tracking:** AI suggestions, code changes, time tracking.
- [x] **Memory Safety:** Circular buffers, disposable listeners, and resource cleanup (Completed in v1.0.4).
- [x] **Local Storage:** Secure, on-device metric storage.
- [x] **Initial ROI:** Basic calculation of Time Saved vs. License Cost.
- [x] **Dashboard:** Visualizing key metrics.

## Phase 2: Deep Code Analysis (Next)
**Goal:** Move beyond "changes" to "quality" using GitClear and SPACE research.

### 1. Advanced Code Churn Analysis
*Research Basis: GitClear 2024*
- [ ] **True Churn Detection:** Track code that is added and then removed/rewritten within < 2 weeks.
- [ ] **AI vs. Human Churn:** Differentiate between AI-generated churn and human refactoring.
- [ ] **"Guesswork" Metric:** High churn rates on AI code indicate the AI is "guessing" rather than "solving".

### 2. SPACE Framework Integration
*Research Basis: Microsoft/GitHub/UVic SPACE Framework*
- [ ] **S (Satisfaction):** Add a simple "How did this session feel?" micro-survey (optional).
- [ ] **P (Performance):** Correlate AI usage with successful build/test outcomes (if available).
- [ ] **A (Activity):** Refine "Active Coding Time" vs. "Idle/Thinking Time".
- [ ] **C (Communication):** (Future) Team-level aggregation (opt-in).
- [ ] **E (Efficiency):** Flow state tracking (interruption analysis).

### 3. "Inner Loop" Efficiency
*Research Basis: McKinsey Developer Productivity*
- [ ] **Context Switching:** Detect when a developer leaves the IDE or switches files rapidly (sign of confusion).
- [ ] **Fix Time:** Measure time spent *immediately after* accepting an AI suggestion. If > 2 minutes, the suggestion was likely poor.

## Phase 3: Intelligent Recommendations
**Goal:** Provide actionable advice, not just data.

- [ ] **Pattern Recognition:** "You reject 80% of suggestions in Python files. Consider disabling Copilot for Python."
- [ ] **Burnout Warnings:** "You've been coding for 4 hours without a break. Error rates usually rise after 3 hours."
- [ ] **Cost Optimization:** "Your ROI is negative this month. You might save money by switching to a different tier/tool."

## Phase 4: Team Insights (Enterprise)
**Goal:** Help teams understand AI adoption at scale (Opt-in only).

- [ ] **Aggregated Reports:** Anonymized team-level stats.
- [ ] **Tool Comparison:** Compare Copilot vs. Cursor vs. Cascade performance within a team.
- [ ] **Adoption Curve:** Identify who is struggling to adopt AI tools effectively.

## Contributing to the Roadmap
We welcome contributions! If you have ideas or research papers we should consider, please open an issue or pull request.
