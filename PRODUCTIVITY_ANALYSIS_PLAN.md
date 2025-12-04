# TruthMeterAI: State of the Art Productivity Analysis Plan

## 1. Critique of Current Implementation

### Strengths
*   **"Net Time" Concept:** The attempt to calculate `Time Saved - (Review + Fix Time)` is excellent and aligns with the "Productivity Paradox" research (where AI creates cleanup work).
*   **Code Quality Focus:** Tracking **Code Churn** and **Duplication** is crucial. Research (e.g., GitClear 2024) shows AI assistants often increase code churn and copy-paste behavior.
*   **Dashboard Foundation:** The existing Chart.js implementation provides a solid base for visualization.

### Weaknesses & Gaps
*   **Heuristic Over-reliance:** Many calculations (e.g., `velocityChange = acceptance * 0.26`, `fixTime = 15 mins`) are hardcoded "magic numbers". These need to be replaced with empirical measurements or user-configurable baselines.
*   **Missing "Lead Time":** The tool lacks deep Git integration to measure **Lead Time for Changes** (commit to deploy) or **Cycle Time** (first commit to merge), which are standard DORA metrics.
*   **Metric Isolation:** Metrics are presented individually. SOTA frameworks like **SPACE** emphasize the *interplay* (e.g., High Activity + Low Satisfaction = Burnout).
*   **Reporting:** No ability to share findings with stakeholders (Management/Team Leads).

## 2. State of the Art (SOTA) Research Summary (2025)

*   **DORA Metrics:** The gold standard. AI should improve *Lead Time* and *Deployment Frequency* without hurting *Change Failure Rate*.
*   **SPACE Framework:**
    *   **S**atisfaction: Dev happiness/trust.
    *   **P**erformance: Build times, reliability.
    *   **A**ctivity: Commit volume, coding time.
    *   **C**ommunication: PR review speed (AI should speed this up).
    *   **E**fficiency: Flow state, uninterrupted time.
*   **The "Integration Paradox":** Research shows that while individual coding speed increases (~55%), system-level productivity can drop due to "Code Churn" (rewriting AI guesses) and "Cognitive Load" (debugging complex AI code).
*   **Key Metric:** **"Prompt-to-Commit Success Rate"** - The % of AI suggestions that survive into the main branch without significant modification.

## 3. Implementation Plan

### Phase 1: Report Generation (Immediate Priority)
*   **Goal:** Allow users to export a professional "AI Impact Report" for stakeholders.
*   **Action:** Create `src/reporters/ReportGenerator.ts`.
*   **Features:**
    *   **Executive Summary:** High-level ROI and "Net Time" impact.
    *   **SPACE Matrix:** A 2x2 grid showing the balance of metrics.
    *   **Formats:** 
        *   `Markdown`: For simple sharing/archiving.
        *   `HTML`: A standalone file with embedded charts (using the existing dashboard logic).
    *   **Delivery:** Save to project root or prompt for save location.

### Phase 2: Metric Refinement (Accuracy)
*   **Goal:** Replace heuristics with real measurement.
*   **Action:** Update `TimeTracker` and `GitAnalyzer`.
*   **Features:**
    *   **True Fix Time:** Track the exact time spent editing a file *immediately after* an AI insertion event.
    *   **Short-term Churn:** Identify code added by AI that is deleted/modified within < 2 weeks.
    *   **Flow State Tracker:** Visualize "Deep Work" blocks (periods > 15m without context switching) vs. "Fragmented Time".

### Phase 3: UI/UX & Visualization "Command Center"
*   **Goal:** "World's Best" Visual Data Experience.
*   **Action:** Overhaul `DashboardProvider.ts`.
*   **Features:**
    *   **Heatmaps:** Visual overlay of "AI Hotspots" vs. "Bug Hotspots" in the file explorer.
    *   **Interactive Timeline:** A zoomable timeline showing [Code Session] -> [AI Suggestion] -> [Review] -> [Commit].
    *   **Comparison Mode:** "AI Projects" vs. "Non-AI Projects" (if historical data exists).
    *   **Team View:** (Future) Aggregated metrics for team leads.

## 4. Immediate "To-Dos" (Next Steps)
1.  [x] Create `ReportGenerator` class skeleton.
2.  [x] Define `ReportData` interface extracting from `AllMetrics`.
3.  [x] Implement `generateHTML()` method (prioritized over Markdown).
4.  [x] Add "Generate Report" command to VS Code palette.
5.  [x] Implement "True Fix Time" measurement in `AIEventCollector`.
6.  [x] Implement "Short-term Churn" detection in `AIEventCollector`.
8.  [x] Implement "Heatmaps" in `DashboardProvider`.
9.  [x] Implement "Comparison Mode" in `DashboardProvider`.
10. [ ] Implement "Team View" in `DashboardProvider`.
