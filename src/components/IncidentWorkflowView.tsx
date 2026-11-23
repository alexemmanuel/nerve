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
  PenLine,
  Zap,
  X,
  ArrowRight,
  ArrowLeft,
  Clock,
  Square,
  Trash2,
} from 'lucide-react';
import { IncidentWorkflowReport } from '../data/incidentReports';
import { PullRequestDiffViewer } from './PullRequestDiffViewer';

interface IncidentWorkflowViewProps {
  reports: IncidentWorkflowReport[];
  selectedTicketId: string;
  onSelectTicket: (ticketId: string) => void;
  onCancelWorkflow?: () => void;
  onDiscardIncident?: (ticketId: string) => void;
  onDeleteIncident?: (ticketId: string) => void;
  onDeleteActivityLog?: (ticketId: string, logIndex: number) => void;
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
  onCancelWorkflow,
  onDiscardIncident,
  onDeleteIncident,
  onDeleteActivityLog,
  onRunTestForIncident,
  onDeployFixForIncident,
  onTriggerWebhook,
  onOpenBugModal,
  onBackToMessenger,
  isDark = true,
}) => {
  const [activeSubView, setActiveSubView] = useState<'overview' | 'pr_diff'>('overview');
  const [showAllRecordedTab, setShowAllRecordedTab] = useState<boolean>(false);
  const [isRunningAction, setIsRunningAction] = useState<boolean>(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
  const [aiTriageState, setAiTriageState] = useState<Record<string, AiTriageAnalysis>>({});
  const [selectedLogLineNumber, setSelectedLogLineNumber] = useState<number | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (reports.length === 0 && showAllRecordedTab) {
      setShowAllRecordedTab(false);
    }
  }, [reports.length, showAllRecordedTab]);

  const activeReport = selectedTicketId
    ? reports.find((r) => r.ticketId === selectedTicketId)
    : undefined;

  const isInvestigating = activeReport ? activeReport.status === 'Investigating' : false;
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
    if (!svgEl || !activeReport || activeSubView !== 'overview') return;

    const width = 760;
    const height = 110;
    const marginX = 90;
    const usableWidth = width - marginX * 2;
    const stepSpacing = usableWidth / (pipelineSteps.length - 1);
    const centerY = 42;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const trackBg = isDark ? '#30363d' : '#d0d7de';
    const completeColor = '#10b981';
    const activeColor = '#2563eb';
    const pendingBg = isDark ? '#0d1117' : '#ffffff';
    const pendingStroke = isDark ? '#484f58' : '#8c959f';
    const textPrimary = isDark ? '#e6edf3' : '#1f2328';
    const textSecondary = isDark ? '#8b949e' : '#656d76';

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
      .attr('stroke-width', 3.5)
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
      .attr('stroke-width', 3.5)
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
      .attr('r', (d) => (d.state === 'active' ? 19 : d.state === 'completed' ? 17 : 15))
      .attr('fill', (d) =>
        d.state === 'completed'
          ? 'rgba(16, 185, 129, 0.14)'
          : d.state === 'active'
          ? 'rgba(37, 99, 235, 0.16)'
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
      .attr('stroke-width', 2);

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
      .attr('font-weight', '600')
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
  }, [activeReport, isDark, isMerged, isTesting, activeSubView]);

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

  const handleCancelCurrentWorkflow = () => {
    if (analysisAbortRef.current) {
      analysisAbortRef.current.abort();
      analysisAbortRef.current = null;
    }
    setIsAnalyzingAi(false);
    setIsRunningAction(false);
    setActiveSubView('overview');
    setShowAllRecordedTab(false);
    setSelectedStepIndex(null);
    setSelectedLogLineNumber(null);
    if (onCancelWorkflow) {
      onCancelWorkflow();
    } else {
      onSelectTicket('');
    }
  };

  const handleStopAndDiscardWorkflow = () => {
    if (!activeReport || activeReport.status !== 'Investigating') return;
    if (analysisAbortRef.current) {
      analysisAbortRef.current.abort();
      analysisAbortRef.current = null;
    }
    const ticketToDiscard = activeReport.ticketId;
    setIsAnalyzingAi(false);
    setIsRunningAction(false);
    setActiveSubView('overview');
    setShowAllRecordedTab(false);
    setSelectedStepIndex(null);
    setSelectedLogLineNumber(null);
    setAiTriageState((prev) => {
      const next = { ...prev };
      delete next[ticketToDiscard];
      return next;
    });
    if (onDiscardIncident) {
      onDiscardIncident(ticketToDiscard);
    } else if (onCancelWorkflow) {
      onCancelWorkflow();
    } else {
      onSelectTicket('');
    }
  };

  const handleRunAiTriageAnalysis = async () => {
    if (!activeReport) return;
    if (analysisAbortRef.current) {
      analysisAbortRef.current.abort();
    }
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setIsAnalyzingAi(true);
    try {
      const targetTicketId = activeReport.ticketId;
      let summaryText = '';
      let patchSnippet = '';
      try {
        const res = await fetch('/api/v1/ai/collaborate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            prompt: `Analyze incident ${activeReport.ticketId} (${activeReport.summary}) in ${activeReport.repo}#${activeReport.branch}/${activeReport.filePath}:L${activeReport.lineNumber}. Explain the root cause from the stack trace and suggest a concrete fix.`,
            mode: 'code',
            surface: 'incidents',
            repo: activeReport.repo,
            branch: activeReport.branch,
            filePath: activeReport.filePath,
            codeSnippet: activeReport.stackTrace,
            incidentTicket: {
              ticketId: activeReport.ticketId,
              summary: activeReport.summary,
              filePath: activeReport.filePath,
              lineNumber: activeReport.lineNumber,
            },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          summaryText = String(data?.summary || '').trim();
          patchSnippet = String(data?.suggestedPatch || '').trim();
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }

      if (controller.signal.aborted) return;

      const firstTraceLine =
        activeReport.stackTrace
          .split('\n')
          .map((l) => l.trim())
          .find(Boolean) || activeReport.summary;

      const analysis: AiTriageAnalysis = {
        confidence: summaryText ? 'Verified via Nerve Shark' : 'Log Summary',
        errorSignature: `${firstTraceLine.slice(0, 72)} (${activeReport.filePath}:${activeReport.lineNumber})`,
        rootCauseAnalysis:
          summaryText ||
          `Reported issue "${activeReport.summary}" at ${activeReport.repo}/${activeReport.filePath}:L${activeReport.lineNumber}. ${activeReport.architectureBreakdown.rootCause}.`,
        suggestedPatchSnippet:
          patchSnippet ||
          activeReport.implementedFix.diff ||
          `@@ -${activeReport.lineNumber},2 +${activeReport.lineNumber},4 @@\n+ // Validate inputs and guard ${activeReport.filePath}:L${activeReport.lineNumber}\n`,
        blastRadiusScore: activeReport.architectureBreakdown.blastRadius || activeReport.filePath,
      };
      setAiTriageState((prev) => ({
        ...prev,
        [targetTicketId]: analysis,
      }));
    } finally {
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null;
      }
      setIsAnalyzingAi(false);
    }
  };

  if (!activeReport) {
    if (showAllRecordedTab && reports.length > 0) {
      return (
        <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d0d7de] dark:border-[#30363d] pb-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAllRecordedTab(false)}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onOpenBugModal && (
                <button
                  type="button"
                  onClick={onOpenBugModal}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Issue</span>
                </button>
              )}
              {onBackToMessenger && (
                <button
                  type="button"
                  onClick={onBackToMessenger}
                  className="px-2.5 py-1.5 text-xs font-medium text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] rounded-md cursor-pointer transition-colors whitespace-nowrap"
                >
                  Workspace
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                <Activity className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>All Recorded Incident Entries</span>
              </div>
            </div>
            <div className="divide-y divide-[#d0d7de] dark:divide-[#30363d]">
              {reports.map((report) => (
                <div
                  key={report.ticketId}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#f6f8fa] dark:hover:bg-[#0d1117]/60 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {report.ticketId}
                      </span>
                      <span className="text-[#656d76] dark:text-[#8b949e]" aria-hidden="true">·</span>
                      <span className="text-[#1f2328] dark:text-[#e6edf3] truncate">
                        {report.repo}/{report.filePath}:L{report.lineNumber}
                      </span>
                      <span className="text-[#656d76] dark:text-[#8b949e]" aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${
                          report.status.includes('Merged')
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {report.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#1f2328] dark:text-[#e6edf3] font-medium">
                      {report.summary}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#656d76] dark:text-[#8b949e] font-mono">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {report.timestamp}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllRecordedTab(false);
                        onSelectTicket(report.ticketId);
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteIncident && (
                      <button
                        type="button"
                        onClick={() => onDeleteIncident(report.ticketId)}
                        title={`Delete recorded entry ${report.ticketId}`}
                        aria-label={`Delete recorded entry ${report.ticketId}`}
                        className="p-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] text-[#656d76] dark:text-[#8b949e] hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 bg-white dark:bg-[#0d1117] cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const latestReport = reports[0];

    return (
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="rounded-xl border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] p-6 sm:p-8 text-center space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-base font-bold text-[#1f2328] dark:text-[#e6edf3]">
              {reports.length > 0 ? 'Incident Workflow Ready' : 'No open incidents'}
            </h1>
            <p className="text-xs text-[#656d76] dark:text-[#8b949e] leading-relaxed max-w-md mx-auto">
              {reports.length > 0
                ? 'Start a new issue, trigger a GitHub issue webhook, or continue a recorded incident entry below.'
                : 'Create a new issue or trigger a GitHub issue webhook to track incidents, inspect logs, and review fixes.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {onOpenBugModal && (
              <button
                type="button"
                onClick={onOpenBugModal}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Issue</span>
              </button>
            )}
            {onTriggerWebhook && (
              <button
                type="button"
                onClick={() => onTriggerWebhook('issues')}
                className="px-3.5 py-2 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Webhook className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Trigger Issue Webhook</span>
              </button>
            )}
            {onBackToMessenger && (
              <button
                type="button"
                onClick={onBackToMessenger}
                className="px-3.5 py-2 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-white dark:bg-[#0d1117] hover:bg-[#f6f8fa] dark:hover:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] rounded-md cursor-pointer transition-colors whitespace-nowrap"
              >
                Back to Workspace
              </button>
            )}
          </div>
        </div>

        {/* Recorded Incident Entries: only the latest entry stays visible here; View All opens all entries in a dedicated tab */}
        {latestReport && (
          <div className="rounded-xl border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                <Activity className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Recorded Incident Entries</span>
              </div>
              {reports.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAllRecordedTab(true)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 cursor-pointer transition-colors whitespace-nowrap"
                >
                  View All
                </button>
              )}
            </div>
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#f6f8fa] dark:hover:bg-[#0d1117]/60 transition-colors">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="font-bold text-red-600 dark:text-red-400">
                    {latestReport.ticketId}
                  </span>
                  <span className="text-[#656d76] dark:text-[#8b949e]" aria-hidden="true">·</span>
                  <span className="text-[#1f2328] dark:text-[#e6edf3] truncate">
                    {latestReport.repo}/{latestReport.filePath}:L{latestReport.lineNumber}
                  </span>
                  <span className="text-[#656d76] dark:text-[#8b949e]" aria-hidden="true">·</span>
                  <span
                    className={`font-semibold ${
                      latestReport.status.includes('Merged')
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {latestReport.status}
                  </span>
                </div>
                <p className="text-xs text-[#1f2328] dark:text-[#e6edf3] font-medium">
                  {latestReport.summary}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#656d76] dark:text-[#8b949e] font-mono">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {latestReport.timestamp}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectTicket(latestReport.ticketId)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {onDeleteIncident && (
                  <button
                    type="button"
                    onClick={() => onDeleteIncident(latestReport.ticketId)}
                    title={`Delete recorded entry ${latestReport.ticketId}`}
                    aria-label={`Delete recorded entry ${latestReport.ticketId}`}
                    className="p-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] text-[#656d76] dark:text-[#8b949e] hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 bg-white dark:bg-[#0d1117] cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      {/* Header, Sub-view Switcher & Workflow Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-[#d0d7de] dark:border-[#30363d] pb-3.5">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-mono min-w-0">
            <span className="font-bold text-[#1f2328] dark:text-[#e6edf3] shrink-0">Incidents</span>
            <span className="text-[#656d76] dark:text-[#8b949e] shrink-0">/</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold truncate max-w-[200px]">
              {activeReport.repo}
            </span>
            <span className="text-[#656d76] dark:text-[#8b949e] shrink-0">/</span>
            <span className="text-[#656d76] dark:text-[#8b949e] shrink-0">{activeReport.ticketId}</span>
          </div>

          {/* Sub-view Navigation Tabs */}
          <div className="inline-flex rounded-md p-0.5 bg-[#f6f8fa] dark:bg-[#161b22] border border-[#d0d7de] dark:border-[#30363d]">
            <button
              type="button"
              onClick={() => setActiveSubView('overview')}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeSubView === 'overview'
                  ? 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] shadow-xs'
                  : 'text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('pr_diff')}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeSubView === 'pr_diff'
                  ? 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] shadow-xs'
                  : 'text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3]'
              }`}
            >
              <GitPullRequest className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Pull Request Diff</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenBugModal && (
            <button
              type="button"
              onClick={onOpenBugModal}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Issue</span>
            </button>
          )}
          {onTriggerWebhook && (
            <>
              <button
                type="button"
                onClick={() => onTriggerWebhook('issues')}
                className="px-2.5 py-1.5 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Webhook className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Issue Webhook</span>
              </button>
              <button
                type="button"
                onClick={() => onTriggerWebhook('pull_request', activeReport.ticketId)}
                className="px-2.5 py-1.5 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Webhook className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>PR Merge Webhook</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleStopAndDiscardWorkflow}
            disabled={!isInvestigating}
            title={
              isInvestigating
                ? 'Discard this investigating ticket and return to the incident list without creating a record'
                : 'Investigation complete — STOP is disabled'
            }
            className="px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-500/10 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>STOP</span>
          </button>
          <button
            type="button"
            onClick={handleCancelCurrentWorkflow}
            title="Exit current workflow and return to the incident list while keeping all recorded entries"
            className="px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/15 border border-red-500/35 rounded-md flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
          {onBackToMessenger && (
            <button
              type="button"
              onClick={onBackToMessenger}
              className="px-2.5 py-1.5 text-xs font-medium text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] rounded-md cursor-pointer transition-colors whitespace-nowrap"
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
          onStopWorkflow={handleStopAndDiscardWorkflow}
          canStopWorkflow={isInvestigating}
          onCancelWorkflow={handleCancelCurrentWorkflow}
          isDark={isDark}
        />
      ) : (
        <>
          {/* D3.js Step-by-Step Pipeline Visualization */}
          <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#161b22] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                Resolution Pipeline · <span className="font-mono text-[#656d76] dark:text-[#8b949e]">{activeReport.ticketId}</span>
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
              <div className="text-xs font-mono text-[#656d76] dark:text-[#8b949e] bg-[#f6f8fa] dark:bg-[#0d1117] px-3 py-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] flex items-center justify-between">
                <span>
                  {pipelineSteps[selectedStepIndex].label} — {pipelineSteps[selectedStepIndex].sublabel}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedStepIndex(null)}
                  className="text-[#656d76] hover:text-[#1f2328] dark:hover:text-[#e6edf3] cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Main Grid: Left Queue + Right Details */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-4 border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#161b22] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-[#d0d7de] dark:border-[#30363d] pb-2">
                <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  Open Queue
                </span>
              </div>

              <div className="space-y-2">
                {reports.map((report) => {
                  const isSelected = report.ticketId === activeReport.ticketId;
                  const sectionName = report.filePath.split('/').pop() || report.filePath;

                  return (
                    <button
                      type="button"
                      key={report.ticketId}
                      onClick={() => onSelectTicket(report.ticketId)}
                      className={`w-full text-left p-3 rounded-md border transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                          : 'border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] hover:bg-[#eaeef2] dark:hover:bg-[#21262d]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold font-mono text-[#1f2328] dark:text-[#e6edf3] truncate">
                          {(report.repo.split('/')[1] || report.repo)}/{sectionName}:L{report.lineNumber}
                        </span>
                        <span
                          className={`text-[11px] font-medium shrink-0 ${
                            report.status.includes('Merged')
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>

                      <div className="text-xs text-[#656d76] dark:text-[#8b949e] line-clamp-1">
                        {report.summary}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Issue Summary, Nerve Shark Analysis, Architecture & Logs */}
            <div className="lg:col-span-8 space-y-5">
              <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#161b22] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#656d76] dark:text-[#8b949e]">
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {activeReport.ticketId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {activeReport.repo}#{activeReport.branch}
                      </span>
                    </div>
                    <h2 className="text-sm font-bold text-[#1f2328] dark:text-[#e6edf3]">
                      {activeReport.summary}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={isRunningAction}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Run Tests</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeploy}
                      disabled={isRunningAction || isMerged}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isMerged ? 'Merged' : 'Merge PR'}</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-[#0d1117] p-3 font-mono text-xs text-red-700 dark:text-red-300 overflow-x-auto space-y-0.5">
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
                          <span className="w-7 pr-2 text-right select-none tabular-nums shrink-0 border-r border-red-300/60 dark:border-[#30363d] text-red-500/80 dark:text-[#8b949e] text-[11px]">
                            {lineNum}
                          </span>
                          <span className="min-w-0 flex-1 break-all">{traceLine}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Nerve Shark Failure Log Analysis */}
              <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#161b22] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d0d7de] dark:border-[#30363d] pb-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-bold text-[#1f2328] dark:text-[#e6edf3]">
                        Nerve Shark Log Analysis
                      </h3>
                      <span className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
                        · gemini-4-hydrogen
                      </span>
                    </div>
                    <p className="text-xs text-[#656d76] dark:text-[#8b949e]">
                      Inspects CI failure logs and stack traces to suggest a fix before review.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isAnalyzingAi && (
                      <button
                        type="button"
                        onClick={() => {
                          analysisAbortRef.current?.abort();
                          analysisAbortRef.current = null;
                          setIsAnalyzingAi(false);
                        }}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] text-[#656d76] dark:text-[#8b949e] hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Stop</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleRunAiTriageAnalysis}
                      disabled={isAnalyzingAi}
                      className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      <span>{isAnalyzingAi ? 'Analyzing Logs...' : 'Analyze Failure Logs'}</span>
                    </button>
                  </div>
                </div>

                {currentAiAnalysis ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117]">
                        <span className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e] block mb-0.5">
                          Confidence
                        </span>
                        <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                          {currentAiAnalysis.confidence}
                        </span>
                      </div>
                      <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117]">
                        <span className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e] block mb-0.5">
                          Error Signature
                        </span>
                        <span className="font-mono font-semibold text-red-600 dark:text-red-400 truncate block text-[11px]">
                          {currentAiAnalysis.errorSignature}
                        </span>
                      </div>
                      <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117]">
                        <span className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e] block mb-0.5">
                          Impact Scope
                        </span>
                        <span className="font-medium text-[#1f2328] dark:text-[#e6edf3] text-[11px] truncate block">
                          {currentAiAnalysis.blastRadiusScore}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] space-y-1">
                      <span className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Root Cause Summary</span>
                      </span>
                      <p className="text-xs text-[#656d76] dark:text-[#8b949e] leading-relaxed">
                        {currentAiAnalysis.rootCauseAnalysis}
                      </p>
                    </div>

                    <div className="p-3 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-[#0d1117] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Suggested Patch</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveSubView('pr_diff')}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          Open Pull Request Diff →
                        </button>
                      </div>
                      <pre className="rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] p-2.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 overflow-x-auto">
                        {currentAiAnalysis.suggestedPatchSnippet}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <p className="py-3 text-xs text-[#656d76] dark:text-[#8b949e]">
                    Select <strong className="text-[#1f2328] dark:text-[#e6edf3]">Analyze Failure Logs</strong> to inspect this stack trace and generate a suggested code patch.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#161b22] p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5 border-b border-[#d0d7de] dark:border-[#30363d] pb-2">
                    <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Architecture Context</span>
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <span className="text-[#656d76] dark:text-[#8b949e] block">Service Layer</span>
                      <span className="font-medium text-[#1f2328] dark:text-[#e6edf3]">
                        {activeReport.architectureBreakdown.serviceLayer}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#656d76] dark:text-[#8b949e] block">Runtime</span>
                      <span className="font-mono text-[#1f2328] dark:text-[#e6edf3]">
                        {activeReport.architectureBreakdown.runtime}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#656d76] dark:text-[#8b949e] block">Root Cause</span>
                      <span className="font-medium text-[#1f2328] dark:text-[#e6edf3]">
                        {activeReport.architectureBreakdown.rootCause}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#161b22] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-[#d0d7de] dark:border-[#30363d] pb-2">
                    <h3 className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Proposed Patch</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveSubView('pr_diff')}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <GitPullRequest className="w-3.5 h-3.5" />
                      <span>Review Diff</span>
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e] truncate">
                    {activeReport.implementedFix.file}
                  </div>
                  <pre className="rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] p-2.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 overflow-x-auto leading-relaxed">
                    {activeReport.implementedFix.diff}
                  </pre>
                </div>
              </div>

              <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#161b22] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d0d7de] dark:border-[#30363d] pb-2.5">
                  <h3 className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Activity Logs</span>
                  </h3>
                </div>

                {activeReport.systemLogsReport.length === 0 ? (
                  <p className="py-3 text-xs text-[#656d76] dark:text-[#8b949e]">
                    No activity logs recorded for this ticket.
                  </p>
                ) : (
                  <div className="divide-y divide-[#d0d7de] dark:divide-[#30363d] rounded-md border border-[#d0d7de] dark:border-[#30363d] overflow-hidden">
                    {activeReport.systemLogsReport.map((log, index) => {
                      const lineNumber = index + 1;
                      const isSelected = selectedLogLineNumber === lineNumber;
                      return (
                        <div
                          key={`${log.event}-${index}`}
                          data-line-number={lineNumber}
                          onClick={() =>
                            setSelectedLogLineNumber((prev) =>
                              prev === lineNumber ? null : lineNumber
                            )
                          }
                          className={`px-3 py-2.5 flex items-start gap-3 text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50/80 dark:bg-blue-950/30'
                              : log.level === 'ERROR'
                              ? 'bg-red-50/40 dark:bg-red-950/15 hover:bg-red-50/70 dark:hover:bg-red-950/25'
                              : 'bg-white dark:bg-[#0d1117] hover:bg-[#f6f8fa] dark:hover:bg-[#161b22]'
                          }`}
                        >
                          <span
                            title={`Log entry line ${lineNumber}`}
                            className={`w-7 pt-0.5 pr-2 text-right font-mono text-[11px] select-none tabular-nums shrink-0 border-r ${
                              isSelected
                                ? 'text-blue-600 dark:text-blue-400 border-blue-400 font-bold'
                                : log.level === 'ERROR'
                                ? 'text-red-600 dark:text-red-400 border-red-300 dark:border-red-900 font-semibold'
                                : 'text-[#656d76] dark:text-[#8b949e] border-[#d0d7de] dark:border-[#30363d]'
                            }`}
                          >
                            {lineNumber}
                          </span>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <span
                                  className={`font-mono text-[11px] font-bold shrink-0 ${
                                    log.level === 'SUCCESS'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : log.level === 'ERROR'
                                      ? 'text-red-600 dark:text-red-400'
                                      : log.level === 'WARN'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-blue-600 dark:text-blue-400'
                                  }`}
                                >
                                  {log.level}
                                </span>
                                <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3] font-mono break-all">
                                  {log.event}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[#656d76] dark:text-[#8b949e] font-mono tabular-nums text-[11px]">
                                  {log.time}
                                </span>
                                {onDeleteActivityLog && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (selectedLogLineNumber === lineNumber) {
                                        setSelectedLogLineNumber(null);
                                      }
                                      onDeleteActivityLog(activeReport.ticketId, index);
                                    }}
                                    title="Delete this log entry"
                                    aria-label={`Delete activity log line ${lineNumber}`}
                                    className="p-1 rounded text-[#656d76] dark:text-[#8b949e] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-[#656d76] dark:text-[#8b949e] leading-relaxed break-words">
                              {log.details}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
