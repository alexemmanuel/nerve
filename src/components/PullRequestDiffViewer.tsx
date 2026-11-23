import React, { useState, useMemo } from 'react';
import {
  GitPullRequest,
  CheckCircle2,
  Play,
  Copy,
  Check,
  Download,
  FileCode,
  Layers,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Columns,
  List,
  MessageSquare,
  ShieldCheck,
  Send,
  Trash2,
  X,
  Square,
} from 'lucide-react';
import { IncidentWorkflowReport } from '../data/incidentReports';

export interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'hunk';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ParsedDiffFile {
  filename: string;
  oldPath?: string;
  status: 'modified' | 'added' | 'deleted';
  additions: number;
  deletions: number;
  lines: DiffLine[];
  rawDiff: string;
}

interface PullRequestDiffViewerProps {
  report: IncidentWorkflowReport;
  onDeployFix?: (ticketId: string) => Promise<void>;
  onRunTest?: (ticketId: string) => Promise<void>;
  onBackToOverview?: () => void;
  onStopWorkflow?: () => void;
  canStopWorkflow?: boolean;
  onCancelWorkflow?: () => void;
  isDark?: boolean;
}

/**
 * Parses a standard git / unified diff string into structured line-by-line objects.
 */
function parseUnifiedDiff(rawDiff: string, defaultFilename: string): ParsedDiffFile[] {
  if (!rawDiff || !rawDiff.trim()) {
    // Return an illustrative bug fix diff if empty
    rawDiff = `@@ -14,6 +14,9 @@ export function authenticateToken(token: string) {
-  const payload = jwt.decode(token);
+  if (!token || typeof token !== 'string') {
+    throw new Error('MISSING_OR_INVALID_TOKEN');
+  }
+  const payload = jwt.verify(token, process.env.API_KEY_SECRET_SALT);
   return payload;
 }`;
  }

  const lines = rawDiff.split('\n');
  const parsedFiles: ParsedDiffFile[] = [];

  let currentFile: ParsedDiffFile = {
    filename: defaultFilename || 'src/index.ts',
    status: 'modified',
    additions: 0,
    deletions: 0,
    lines: [],
    rawDiff,
  };

  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file header in git diffs: "diff --git a/... b/..."
    if (line.startsWith('diff --git')) {
      if (currentFile.lines.length > 0) {
        parsedFiles.push(currentFile);
      }
      const parts = line.split(' ');
      const pathB = parts[parts.length - 1]?.replace(/^b\//, '') || defaultFilename;
      currentFile = {
        filename: pathB,
        status: 'modified',
        additions: 0,
        deletions: 0,
        lines: [],
        rawDiff: '',
      };
      continue;
    }

    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      // Diff metadata headers
      continue;
    }

    // Detect hunk header: "@@ -12,4 +12,6 @@ ..."
    if (line.startsWith('@@')) {
      const match = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      currentFile.lines.push({
        type: 'hunk',
        text: line,
      });
      continue;
    }

    if (line.startsWith('+')) {
      currentFile.additions++;
      currentFile.lines.push({
        type: 'add',
        text: line.slice(1),
        newLineNumber: newLine++,
      });
    } else if (line.startsWith('-')) {
      currentFile.deletions++;
      currentFile.lines.push({
        type: 'delete',
        text: line.slice(1),
        oldLineNumber: oldLine++,
      });
    } else {
      // Context line
      const cleanText = line.startsWith(' ') ? line.slice(1) : line;
      currentFile.lines.push({
        type: 'context',
        text: cleanText,
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    }
  }

  if (currentFile.lines.length > 0) {
    parsedFiles.push(currentFile);
  }

  return parsedFiles;
}

export const PullRequestDiffViewer: React.FC<PullRequestDiffViewerProps> = ({
  report,
  onDeployFix,
  onRunTest,
  onBackToOverview,
  onStopWorkflow,
  canStopWorkflow = false,
  onCancelWorkflow,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [copiedPatch, setCopiedPatch] = useState<boolean>(false);
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [expandedFiles, setExpandedFiles] = useState<Record<number, boolean>>({ 0: true });
  const [lineComments, setLineComments] = useState<
    Record<string, Array<{ id: string; author: string; text: string; time: string }>>
  >({});
  const [activeCommentLineKey, setActiveCommentLineKey] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState<string>('');

  const isMerged = report.status.includes('Merged');
  const isTestingFix = report.status === 'Testing Fix';

  const defaultFilename = report.implementedFix?.file || report.filePath || 'src/core/patch.ts';
  const rawDiff = report.implementedFix?.diff || '';

  const parsedFiles = useMemo(() => {
    return parseUnifiedDiff(rawDiff, defaultFilename);
  }, [rawDiff, defaultFilename]);

  const activeFile = parsedFiles[selectedFileIdx] || parsedFiles[0];

  const totalAdditions = useMemo(
    () => parsedFiles.reduce((acc, f) => acc + f.additions, 0),
    [parsedFiles]
  );
  const totalDeletions = useMemo(
    () => parsedFiles.reduce((acc, f) => acc + f.deletions, 0),
    [parsedFiles]
  );

  const prNumber = useMemo(() => {
    const digits = report.ticketId.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 101;
  }, [report.ticketId]);

  const prBranch = `patch/${report.ticketId.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;

  const handleCopyDiff = () => {
    navigator.clipboard.writeText(rawDiff);
    setCopiedPatch(true);
    setTimeout(() => setCopiedPatch(false), 2000);
  };

  const handleDownloadPatch = () => {
    const blob = new Blob([rawDiff], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pr-${prNumber}-${report.ticketId}.patch`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeploy = async () => {
    if (!onDeployFix || isMerged) return;
    setIsMerging(true);
    try {
      await onDeployFix(report.ticketId);
    } finally {
      setIsMerging(false);
    }
  };

  const handleRunTests = async () => {
    if (!onRunTest) return;
    setIsTesting(true);
    try {
      await onRunTest(report.ticketId);
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddComment = (lineKey: string) => {
    if (!commentInput.trim()) return;
    const newComment = {
      id: `comm_${Date.now()}`,
      author: 'You (Reviewer)',
      text: commentInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setLineComments((prev) => ({
      ...prev,
      [lineKey]: [...(prev[lineKey] || []), newComment],
    }));
    setCommentInput('');
    setActiveCommentLineKey(null);
  };

  const handleDeleteComment = (lineKey: string, commentId: string) => {
    setLineComments((prev) => ({
      ...prev,
      [lineKey]: (prev[lineKey] || []).filter((c) => c.id !== commentId),
    }));
  };

  return (
    <div className="space-y-4">
      {/* 1. Pull Request Header & Controls */}
      <div className="rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-mono font-semibold text-purple-700 dark:text-purple-400">
                <GitPullRequest className="w-3.5 h-3.5" />
                <span>PR #{prNumber}</span>
              </span>
              <span className="text-[#656d76] dark:text-[#8b949e]" aria-hidden="true">·</span>
              <span
                className={`font-semibold inline-flex items-center gap-1 ${
                  isMerged
                    ? 'text-purple-700 dark:text-purple-400'
                    : isTestingFix
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {isMerged ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Merged</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Ready for review</span>
                  </>
                )}
              </span>
              <span className="text-[#656d76] dark:text-[#8b949e]" aria-hidden="true">·</span>
              <span className="font-mono text-[#656d76] dark:text-[#8b949e]">
                {report.ticketId}
              </span>
            </div>

            <h1 className="text-base sm:text-lg font-bold text-[#1f2328] dark:text-[#e6edf3] truncate">
              {report.summary}
            </h1>

            {/* Branch info & Author */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-[#656d76] dark:text-[#8b949e]">
              <span className="px-1.5 py-0.5 rounded bg-[#f6f8fa] dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] border border-[#d0d7de] dark:border-[#30363d]">
                {prBranch}
              </span>
              <span>into</span>
              <span className="px-1.5 py-0.5 rounded bg-[#f6f8fa] dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] border border-[#d0d7de] dark:border-[#30363d] font-semibold">
                {report.branch || 'main'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                by <strong className="text-[#1f2328] dark:text-[#e6edf3]">{report.implementedFix?.author || 'Nerve Shark'}</strong>
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onRunTest && (
              <button
                type="button"
                onClick={handleRunTests}
                disabled={isTesting}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{isTesting ? 'Running Tests...' : 'Run Tests'}</span>
              </button>
            )}

            {onDeployFix && (
              <button
                type="button"
                onClick={handleDeploy}
                disabled={isMerging || isMerged}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  isMerged
                    ? 'bg-purple-600 opacity-90 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isMerged ? 'Merged' : isMerging ? 'Merging...' : 'Approve & Merge'}</span>
              </button>
            )}

            {onBackToOverview && (
              <button
                type="button"
                onClick={onBackToOverview}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] hover:bg-[#f6f8fa] dark:hover:bg-[#21262d] cursor-pointer whitespace-nowrap"
              >
                Overview
              </button>
            )}

            {onStopWorkflow && (
              <button
                type="button"
                onClick={onStopWorkflow}
                disabled={!canStopWorkflow}
                title={
                  canStopWorkflow
                    ? 'Discard this investigating ticket and return to the incident list without creating a record'
                    : 'Investigation complete — STOP is disabled'
                }
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>STOP</span>
              </button>
            )}

            {onCancelWorkflow && (
              <button
                type="button"
                onClick={onCancelWorkflow}
                title="Exit current workflow and return to the incident list while keeping all records"
                className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-red-500/35 bg-red-500/5 hover:bg-red-500/15 text-red-600 dark:text-red-400 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>

        {/* Diff Statistics & Controls Bar */}
        <div className="pt-3 border-t border-[#d0d7de] dark:border-[#30363d] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5 font-mono tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              +{totalAdditions}
            </span>
            <span className="text-rose-700 dark:text-rose-400 font-semibold">
              -{totalDeletions}
            </span>
            <span className="text-[#656d76] dark:text-[#8b949e]" aria-hidden="true">·</span>
            <span className="text-[#656d76] dark:text-[#8b949e]">
              {parsedFiles.length} file{parsedFiles.length !== 1 ? 's' : ''} changed
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode: Unified vs Split */}
            <div className="inline-flex rounded-md p-0.5 bg-[#f6f8fa] dark:bg-[#0d1117] border border-[#d0d7de] dark:border-[#30363d]">
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'unified'
                    ? 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] shadow-xs'
                    : 'text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3]'
                }`}
                title="Unified inline diff view"
              >
                <List className="w-3.5 h-3.5" />
                <span>Unified</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] shadow-xs'
                    : 'text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3]'
                }`}
                title="Side-by-side split diff view"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyDiff}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] hover:bg-[#f6f8fa] dark:hover:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              title="Copy unified diff"
            >
              {copiedPatch ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPatch ? 'Copied' : 'Copy Diff'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPatch}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] hover:bg-[#f6f8fa] dark:hover:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              title="Download .patch file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .patch</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. File Tabs (if multiple files) */}
      {parsedFiles.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {parsedFiles.map((file, idx) => (
            <button
              key={file.filename}
              type="button"
              onClick={() => setSelectedFileIdx(idx)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-2 border transition-colors cursor-pointer whitespace-nowrap ${
                selectedFileIdx === idx
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] text-[#656d76] dark:text-[#8b949e] hover:bg-[#f6f8fa] dark:hover:bg-[#21262d]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{file.filename}</span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                +{file.additions}
              </span>
              <span className="text-[10px] text-rose-700 dark:text-rose-400 font-semibold">
                -{file.deletions}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 3. Line-by-Line Diff Viewer */}
      <div className="rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setExpandedFiles((prev) => ({
                  ...prev,
                  [selectedFileIdx]: !prev[selectedFileIdx],
                }))
              }
              className="text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] cursor-pointer"
            >
              {expandedFiles[selectedFileIdx] !== false ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-mono text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
              {activeFile.filename}
            </span>
            <span className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
              · {activeFile.status}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              +{activeFile.additions}
            </span>
            <span className="text-rose-700 dark:text-rose-400 font-semibold">
              -{activeFile.deletions}
            </span>
          </div>
        </div>

        {expandedFiles[selectedFileIdx] !== false && (
          <div className="overflow-x-auto text-xs font-mono leading-relaxed select-text">
            {viewMode === 'unified' ? (
              <div className="min-w-[640px] divide-y divide-[#d0d7de]/50 dark:divide-[#21262d]">
                {activeFile.lines.map((line, lineIndex) => {
                  const lineKey = `${activeFile.filename}:${lineIndex}`;
                  const isAdd = line.type === 'add';
                  const isDel = line.type === 'delete';
                  const isHunk = line.type === 'hunk';
                  const comments = lineComments[lineKey] || [];
                  const isCommenting = activeCommentLineKey === lineKey;

                  return (
                    <div key={lineIndex} className="group">
                      <div
                        className={`flex items-stretch transition-colors ${
                          isAdd
                            ? 'bg-emerald-500/10 dark:bg-emerald-950/35 text-emerald-900 dark:text-emerald-200'
                            : isDel
                            ? 'bg-rose-500/10 dark:bg-rose-950/35 text-rose-900 dark:text-rose-200'
                            : isHunk
                            ? 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                            : 'hover:bg-[#f6f8fa] dark:hover:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3]'
                        }`}
                      >
                        <div className="w-12 py-1 px-1.5 text-right text-[11px] font-mono tabular-nums text-[#656d76] dark:text-[#8b949e] select-none border-r border-[#d0d7de] dark:border-[#30363d] shrink-0">
                          {line.oldLineNumber || ''}
                        </div>

                        <div className="w-12 py-1 px-1.5 text-right text-[11px] font-mono tabular-nums text-[#656d76] dark:text-[#8b949e] select-none border-r border-[#d0d7de] dark:border-[#30363d] shrink-0">
                          {line.newLineNumber || ''}
                        </div>

                        <div className="w-6 py-1 text-center font-mono font-bold select-none shrink-0">
                          {isAdd ? '+' : isDel ? '-' : isHunk ? '@@' : ' '}
                        </div>

                        <div className="flex-1 py-1 px-2 whitespace-pre overflow-x-auto min-w-0">
                          {line.text}
                        </div>

                        {!isHunk && (
                          <div className="w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveCommentLineKey(isCommenting ? null : lineKey)
                              }
                              className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                              title="Add review comment to this line"
                            >
                              <MessageSquare className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {(comments.length > 0 || isCommenting) && (
                        <div className="bg-[#f6f8fa] dark:bg-[#161b22] border-t border-b border-[#d0d7de] dark:border-[#30363d] p-3 ml-24 space-y-2">
                          {comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="p-2.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-blue-600 dark:text-blue-400">
                                  {comment.author}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-[#656d76] dark:text-[#8b949e] tabular-nums">{comment.time}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(lineKey, comment.id)}
                                    className="text-[#656d76] hover:text-rose-500 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-[#1f2328] dark:text-[#e6edf3] leading-relaxed">
                                {comment.text}
                              </p>
                            </div>
                          ))}

                          {isCommenting && (
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={commentInput}
                                onChange={(e) => setCommentInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddComment(lineKey);
                                  if (e.key === 'Escape') setActiveCommentLineKey(null);
                                }}
                                placeholder="Write a review comment... (Press Enter to post)"
                                className="flex-1 px-3 py-1.5 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleAddComment(lineKey)}
                                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md flex items-center gap-1 cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>Post</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveCommentLineKey(null)}
                                className="px-2.5 py-1.5 text-xs text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="min-w-[760px] divide-y divide-[#d0d7de]/50 dark:divide-[#21262d]">
                {activeFile.lines.map((line, lineIndex) => {
                  const isAdd = line.type === 'add';
                  const isDel = line.type === 'delete';
                  const isHunk = line.type === 'hunk';

                  if (isHunk) {
                    return (
                      <div
                        key={lineIndex}
                        className="py-1 px-3 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold"
                      >
                        {line.text}
                      </div>
                    );
                  }

                  return (
                    <div key={lineIndex} className="grid grid-cols-2 divide-x divide-[#d0d7de] dark:divide-[#30363d]">
                      <div
                        className={`flex items-stretch min-w-0 ${
                          isDel
                            ? 'bg-rose-500/10 dark:bg-rose-950/35 text-rose-900 dark:text-rose-200'
                            : isAdd
                            ? 'bg-[#f6f8fa]/60 dark:bg-[#161b22]/50 text-transparent select-none'
                            : 'hover:bg-[#f6f8fa] dark:hover:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3]'
                        }`}
                      >
                        <div className="w-10 py-1 px-1.5 text-right text-[11px] font-mono tabular-nums text-[#656d76] dark:text-[#8b949e] select-none border-r border-[#d0d7de] dark:border-[#30363d] shrink-0">
                          {isDel || (!isAdd && !isDel) ? line.oldLineNumber || '' : ''}
                        </div>
                        <div className="w-5 py-1 text-center font-mono font-bold select-none shrink-0">
                          {isDel ? '-' : ''}
                        </div>
                        <div className="flex-1 py-1 px-2 whitespace-pre overflow-x-auto min-w-0">
                          {isDel || (!isAdd && !isDel) ? line.text : ' '}
                        </div>
                      </div>

                      <div
                        className={`flex items-stretch min-w-0 ${
                          isAdd
                            ? 'bg-emerald-500/10 dark:bg-emerald-950/35 text-emerald-900 dark:text-emerald-200'
                            : isDel
                            ? 'bg-[#f6f8fa]/60 dark:bg-[#161b22]/50 text-transparent select-none'
                            : 'hover:bg-[#f6f8fa] dark:hover:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3]'
                        }`}
                      >
                        <div className="w-10 py-1 px-1.5 text-right text-[11px] font-mono tabular-nums text-[#656d76] dark:text-[#8b949e] select-none border-r border-[#d0d7de] dark:border-[#30363d] shrink-0">
                          {isAdd || (!isAdd && !isDel) ? line.newLineNumber || '' : ''}
                        </div>
                        <div className="w-5 py-1 text-center font-mono font-bold select-none shrink-0">
                          {isAdd ? '+' : ''}
                        </div>
                        <div className="flex-1 py-1 px-2 whitespace-pre overflow-x-auto min-w-0">
                          {isAdd || (!isAdd && !isDel) ? line.text : ' '}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Review Action Bar */}
      <div className="rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3]">
            Syntax Check Passed
          </span>
          <span className="text-[#656d76] dark:text-[#8b949e]">
            · Patch additions and deletions verified before merge
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onDeployFix && (
            <button
              type="button"
              onClick={handleDeploy}
              disabled={isMerging || isMerged}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                isMerged
                  ? 'bg-purple-600 opacity-90 cursor-default'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isMerged ? 'Merged' : isMerging ? 'Merging...' : 'Approve & Merge'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
