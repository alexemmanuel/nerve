import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import {
  CheckCircle2,
  Activity,
  Layers,
  FileCode,
  Play,
  Webhook,
  Plus,
  GitPullRequest,
  Code2,
  Sparkles,
  Cpu,
  Bot,
  Zap,
} from 'lucide-react';
import { IncidentWorkflowReport } from '../data/incidentReports';
import { PullRequestDiffViewer } from './PullRequestDiffViewer';

interface IncidentWorkflowViewProps {
  reports: IncidentWorkflowReport[];
  selectedTicketId: string;
  onSelectTicket: (ticketId: string) => void;
  onRunTestForIncident?: (ticketId: string) => Promise<void>;
  onDeployFixForIncident?: (ticketId: string) => Promise<void>;
  onTriggerWebhook?: (eventType: 'issues' | 'pull_request', ticketId?: string) => Promise<void>;
  onOpenBugModal?: () => void;
  onBackToMessenger?: () => void;
  isDark?: boolean;
}

interface PipelineStepNode {
  index: number;
  id: string;
  label: string;
  sublabel: string;
  state: 'completed' | 'active' | 'pending';
}

interface AiTriageAnalysis {
  confidence: string;
  errorSignature: string;
  rootCauseAnalysis: string;
  suggestedPatchSnippet: string;
  blastRadiusScore: string;
}

export const IncidentWorkflowView: React.FC<IncidentWorkflowViewProps> = ({
  reports,
  selectedTicketId,
  onSelectTicket,
  onRunTestForIncident,
  onDeployFixForIncident,
  onTriggerWebhook,
  onOpenBugModal,
  onBackToMessenger,
  isDark = true,
}) => {
  const [activeSubView, setActiveSubView] = useState<'overview' | 'pr_diff'>('overview');
  const [isRunningAction, setIsRunningAction] = useState<boolean>(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
  const [aiTriageState, setAiTriageState] = useState<Record<string, AiTriageAnalysis>>({});
  const [selectedLogLineNumber, setSelectedLogLineNumber] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const activeReport =
    reports.find((r) => r.ticketId === selectedTicketId) || reports[0];

  const isMerged = activeReport ? activeReport.status.includes('Merged') : false;
  const isTesting = activeReport ? activeReport.status === 'Testing Fix' : false;

  const currentAiAnalysis = activeReport ? aiTriageState[activeReport.ticketId] : null;

  const pipelineSteps: PipelineStepNode[] = activeReport
    ? [
        {
          index: 0,
          id: 'reported',
          label: '1. Bug Reported',
          sublabel: `${activeReport.ticketId} (${activeReport.filePath.split('/').pop()}:L${activeReport.lineNumber})`,
          state: 'completed',
        },
        {
          index: 1,
          id: 'architecture',
          label: '2. Profiled',
          sublabel: activeReport.architectureBreakdown.runtime.split('/')[0].trim(),
          state: isMerged || isTesting ? 'completed' : 'active',
        },
        {
          index: 2,
          id: 'shark_test',
          label: '3. Shark Fix & Test',
          sublabel: isMerged ? 'Tests Passed' : isTesting ? 'Running Suite' : 'Patch Ready',
          state: isMerged ? 'completed' : isTesting ? 'active' : 'pending',
        },
        {
          index: 3,
          id: 'merged',
          label: '4. PR Merged',
          sublabel: isMerged ? 'Deployed' : 'Awaiting Merge',
          state: isMerged ? 'completed' : 'pending',
        },
      ]
    : [];

  // D3.js Step-by-Step Pipeline Visualization
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !activeReport) return;

    const width = 760;
    const height = 110;
    const marginX = 90;
    const usableWidth = width - marginX * 2;
    const stepSpacing = usableWidth / (pipelineSteps.length - 1);
    const centerY = 42;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const trackBg = isDark ? '#262626' : '#e5e5e5';
    const completeColor = '#10b981';
    const activeColor = '#3b82f6';
    const pendingBg = isDark ? '#000000' : '#ffffff';
    const pendingStroke = isDark ? '#525252' : '#a3a3a3';
    const textPrimary = isDark ? '#ffffff' : '#000000';
    const textSecondary = isDark ? '#d4d4d4' : '#262626';

    const linksData = pipelineSteps.slice(0, -1).map((step, i) => ({
      x1: marginX + i * stepSpacing,
      x2: marginX + (i + 1) * stepSpacing,
      completed: pipelineSteps[i + 1].state !== 'pending',
    }));

    svg
      .selectAll('line.pipeline-link-bg')
      .data(linksData)
      .enter()
      .append('line')
      .attr('class', 'pipeline-link-bg')
      .attr('x1', (d) => d.x1)
      .attr('y1', centerY)
      .attr('x2', (d) => d.x2)
      .attr('y2', centerY)
      .attr('stroke', trackBg)
      .attr('stroke-width', 4)
      .attr('stroke-linecap', 'round');

    svg
      .selectAll('line.pipeline-link-progress')
      .data(linksData)
      .enter()
      .append('line')
      .attr('class', 'pipeline-link-progress')
      .attr('x1', (d) => d.x1)
      .attr('y1', centerY)
      .attr('x2', (d) => (d.completed ? d.x2 : d.x1))
      .attr('y2', centerY)
      .attr('stroke', completeColor)
      .attr('stroke-width', 4)
      .attr('stroke-linecap', 'round');

    const nodeGroups = svg
      .selectAll('g.pipeline-node')
      .data(pipelineSteps)
      .enter()
      .append('g')
      .attr('class', 'pipeline-node')
      .attr('transform', (d) => `translate(${marginX + d.index * stepSpacing}, ${centerY})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        setSelectedStepIndex(d.index);
      });

    nodeGroups
      .append('circle')
      .attr('r', (d) => (d.state === 'active' ? 20 : d.state === 'completed' ? 18 : 15))
      .attr('fill', (d) =>
        d.state === 'completed'
          ? 'rgba(16, 185, 129, 0.16)'
          : d.state === 'active'
          ? 'rgba(59, 130, 246, 0.20)'
          : 'transparent'
      );

    nodeGroups
      .append('circle')
      .attr('r', 13)
      .attr('fill', (d) =>
        d.state === 'completed'
          ? completeColor
          : d.state === 'active'
          ? activeColor
          : pendingBg
      )
      .attr('stroke', (d) =>
        d.state === 'completed'
          ? completeColor
          : d.state === 'active'
          ? activeColor
          : pendingStroke
      )
      .attr('stroke-width', 2.5);

    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', (d) => (d.state === 'pending' ? textSecondary : '#ffffff'))
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .text((d) => (d.state === 'completed' ? '✓' : String(d.index + 1)));

    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 34)
      .attr('fill', textPrimary)
      .attr('font-family', 'Plus Jakarta Sans, sans-serif')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .text((d) => d.label);

    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 50)
      .attr('fill', (d) =>
        d.state === 'completed'
          ? completeColor
          : d.state === 'active'
          ? activeColor
          : textSecondary
      )
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .text((d) => d.sublabel);
  }, [activeReport, isDark, isMerged, isTesting]);

  const handleTest = async () => {
    if (!onRunTestForIncident || !activeReport) return;
    setIsRunningAction(true);
    try {
      await onRunTestForIncident(activeReport.ticketId);
    } finally {
      setIsRunningAction(false);
    }
  };

  const handleDeploy = async () => {
    if (!onDeployFixForIncident || !activeReport) return;
    setIsRunningAction(true);
    try {
      await onDeployFixForIncident(activeReport.ticketId);
    } finally {
      setIsRunningAction(false);
    }
  };

  const handleRunAiTriageAnalysis = async () => {
    if (!activeReport) return;
    setIsAnalyzingAi(true);
    try {
      // Simulate calling server-side AI Actions failure log analyzer (Gemini-3.8-Flash)
      await new Promise((r) => setTimeout(r, 1400));
      const mockAiAnalysis: AiTriageAnalysis = {
        confidence: '98.4%',
        errorSignature: `ERR_UNCAUGHT_STREAM_EXCEPTION (${activeReport.filePath}:${activeReport.lineNumber})`,
        rootCauseAnalysis: `GitHub Actions CI runner detected unhandled exception in ${activeReport.architectureBreakdown.serviceLayer}. The stream socket dropped during chunked transmission without null-guarding the connection context.`,
        suggestedPatchSnippet: activeReport.implementedFix.diff || `@@ -${activeReport.lineNumber},2 +${activeReport.lineNumber},4 @@\n+ if (!context || !context.active) return;\n+ try { await flushStreamBuffer(); } catch(e) { console.error(e); }\n`,
        blastRadiusScore: 'Low (Isolated to active socket transport)',
      };
      setAiTriageState((prev) => ({
        ...prev,
        [activeReport.ticketId]: mockAiAnalysis,
      }));
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  if (!activeReport) {
    return (
      <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            No Active Incidents
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Report a `/bug` or trigger a GitHub issue webhook to initialize the pipeline.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {onOpenBugModal && (
              <button
                onClick={onOpenBugModal}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Report /bug</span>
              </button>
            )}
            {onTriggerWebhook && (
              <button
                onClick={() => onTriggerWebhook('issues')}
                className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Webhook className="w-3.5 h-3.5" />
                <span>Trigger Issue Webhook</span>
              </button>
            )}
            {onBackToMessenger && (
              <button
                onClick={onBackToMessenger}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
              >
                Workspace
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Compact Header, Sub-view Switcher & Live Webhook Triggers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="font-bold text-slate-900 dark:text-slate-100">Incidents</span>
            <span className="text-slate-400">/</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              {activeReport.repo}
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600 dark:text-slate-300">{activeReport.ticketId}</span>
          </div>

          {/* Sub-view Navigation Tabs */}
          <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveSubView('overview')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubView === 'overview'
                  ? 'bg-white dark:bg-black text-slate-900 dark:text-slate-100 shadow-sm border border-slate-300 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              <span>Triage & Architecture</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('pr_diff')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubView === 'pr_diff'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              <span>Pull Request Diff</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold">
                Review
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onTriggerWebhook && (
            <>
              <button
                onClick={() => onTriggerWebhook('issues')}
                className="px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Webhook className="w-3 h-3" />
                <span>Issue Webhook</span>
              </button>
              <button
                onClick={() => onTriggerWebhook('pull_request', activeReport.ticketId)}
                className="px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Webhook className="w-3 h-3" />
                <span>PR Merge Webhook</span>
              </button>
            </>
          )}
          {onBackToMessenger && (
            <button
              onClick={onBackToMessenger}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              Workspace
            </button>
          )}
        </div>
      </div>

      {activeSubView === 'pr_diff' ? (
        <PullRequestDiffViewer
          report={activeReport}
          onDeployFix={onDeployFixForIncident}
          onRunTest={onRunTestForIncident}
          onBackToOverview={() => setActiveSubView('overview')}
          isDark={isDark}
        />
      ) : (
        <>
          {/* D3.js Step-by-Step Pipeline Visualization */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pipeline · {activeReport.ticketId}
              </span>
              <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                {activeReport.status}
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              <svg
                ref={svgRef}
                className="w-full min-w-[540px] h-[110px] select-none"
              />
            </div>

            {selectedStepIndex !== null && pipelineSteps[selectedStepIndex] && (
              <div className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span>
                  {pipelineSteps[selectedStepIndex].label} — {pipelineSteps[selectedStepIndex].sublabel}
                </span>
                <button
                  onClick={() => setSelectedStepIndex(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Main Grid: Left Queue + Right Details */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Queue
                </span>
                <span className="font-mono text-slate-400">{reports.length}</span>
              </div>

              <div className="space-y-2">
                {reports.map((report) => {
                  const isSelected = report.ticketId === activeReport.ticketId;
                  const sectionName = report.filePath.split('/').pop() || report.filePath;

                  return (
                    <button
                      key={report.ticketId}
                      onClick={() => onSelectTicket(report.ticketId)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100 truncate">
                          {(report.repo.split('/')[1] || report.repo)}/{sectionName}:L{report.lineNumber}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                            report.status.includes('Merged')
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1">
                        {report.summary}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Architecture, AI Triage Engine, Diff & Logs */}
            <div className="lg:col-span-8 space-y-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                        {activeReport.ticketId}
                      </span>
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        {activeReport.repo}#{activeReport.branch}
                      </span>
                    </div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {activeReport.summary}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTest}
                      disabled={isRunningAction}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>Test</span>
                    </button>
                    <button
                      onClick={handleDeploy}
                      disabled={isRunningAction || isMerged}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{isMerged ? 'Merged' : 'Merge PR'}</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-red-200 dark:border-slate-800 bg-red-50/70 dark:bg-slate-950 p-2.5 font-mono text-xs text-red-700 dark:text-red-300 overflow-x-auto space-y-0.5">
                  {activeReport.stackTrace
                    .split('\n')
                    .filter((l) => l.trim().length > 0)
                    .map((traceLine, idx) => {
                      const lineNum = idx + 1;
                      return (
                        <div
                          key={lineNum}
                          className="flex items-start gap-2.5 leading-relaxed"
                        >
                          <span className="w-7 pr-2 text-right select-none tabular-nums shrink-0 border-r border-red-300/60 dark:border-slate-800 text-red-500/80 dark:text-slate-500 text-[11px]">
                            {lineNum}
                          </span>
                          <span className="min-w-0 flex-1 break-all">{traceLine}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* =================================================================
                  AUTOMATED AI ACTIONS FAILURE LOG TRIAGE ENGINE
              ================================================================= */}
              <div className="border border-blue-200 dark:border-blue-900/60 rounded-xl bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/10 p-4 space-y-3 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200 dark:border-blue-900/50 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Automated AI Actions Failure Log Triage Engine
                        </h3>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-600 text-white font-semibold">
                          Gemini-3.8
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Analyzes GitHub Actions failure logs & stack traces to synthesize verified code fixes before human review.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunAiTriageAnalysis}
                    disabled={isAnalyzingAi}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-300" />
                    <span>{isAnalyzingAi ? 'Analyzing CI Logs...' : 'Run AI Triage Analysis'}</span>
                  </button>
                </div>

                {currentAiAnalysis ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-950">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Diagnosis Confidence
                        </span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {currentAiAnalysis.confidence}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-950">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Error Signature
                        </span>
                        <span className="font-mono font-semibold text-red-600 dark:text-red-400 truncate block text-[11px]">
                          {currentAiAnalysis.errorSignature}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-950">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Blast Radius
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 text-[11px] truncate block">
                          {currentAiAnalysis.blastRadiusScore}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-950 space-y-1.5">
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" />
                        <span>AI Root-Cause Reasoning</span>
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {currentAiAnalysis.rootCauseAnalysis}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Suggested Pre-Review Fix Diff</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveSubView('pr_diff')}
                          className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          View in PR Diff →
                        </button>
                      </div>
                      <pre className="rounded border border-emerald-300 dark:border-emerald-800/60 bg-white dark:bg-slate-950 p-2 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 overflow-x-auto">
                        {currentAiAnalysis.suggestedPatchSnippet}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
                    <p>Click <strong className="text-slate-700 dark:text-slate-200">Run AI Triage Analysis</strong> to parse GitHub Actions logs and synthesize a pre-review code fix.</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Architecture</span>
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Layer</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {activeReport.architectureBreakdown.serviceLayer}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Runtime</span>
                      <span className="font-mono text-slate-900 dark:text-slate-100">
                        {activeReport.architectureBreakdown.runtime}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Root Cause</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {activeReport.architectureBreakdown.rootCause}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Shark Patch</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-mono">
                        {activeReport.implementedFix.file}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveSubView('pr_diff')}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <GitPullRequest className="w-3 h-3" />
                        <span>Review Diff →</span>
                      </button>
                    </div>
                  </div>
                  <pre className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 overflow-x-auto leading-relaxed">
                    {activeReport.implementedFix.diff}
                  </pre>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Logs</span>
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {activeReport.systemLogsReport.length}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {activeReport.systemLogsReport.map((log, index) => {
                    const lineNumber = index + 1;
                    const isSelected = selectedLogLineNumber === lineNumber;
                    return (
                      <div
                        key={lineNumber}
                        data-line-number={lineNumber}
                        onClick={() =>
                          setSelectedLogLineNumber((prev) =>
                            prev === lineNumber ? null : lineNumber
                          )
                        }
                        className={`p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/80 dark:bg-blue-950/40'
                            : log.level === 'ERROR'
                            ? 'bg-red-50/30 dark:bg-red-950/15 hover:bg-red-50/60 dark:hover:bg-red-950/25'
                            : 'bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900/70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            title={`Log entry line ${lineNumber}`}
                            className={`w-8 pr-2 text-right font-mono text-[11px] select-none tabular-nums shrink-0 border-r ${
                              isSelected
                                ? 'text-blue-600 dark:text-blue-400 border-blue-400 font-bold'
                                : log.level === 'ERROR'
                                ? 'text-red-600 dark:text-red-400 border-red-300 dark:border-red-900 font-semibold'
                                : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {lineNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                              log.level === 'SUCCESS'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : log.level === 'ERROR'
                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {log.level}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono shrink-0">
                            {log.event}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400 truncate">
                            {log.details}
                          </span>
                        </div>
                        <span className="text-slate-400 font-mono text-[11px] shrink-0 pl-10 sm:pl-0">
                          {log.time}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
