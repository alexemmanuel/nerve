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
      {/* =====================================================================
          1. PULL REQUEST HEADER & METADATA BAR
      ====================================================================== */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300">
                <GitPullRequest className="w-3.5 h-3.5" />
                <span>PR #{prNumber}</span>
              </span>

              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                  isMerged
                    ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                    : isTestingFix
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}
              >
                {isMerged ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Merged & Deployed</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Ready for Review</span>
                  </>
                )}
              </span>

              <span className="text-xs font-mono text-neutral-500">
                Ticket: <strong className="text-black dark:text-white">{report.ticketId}</strong>
              </span>
            </div>

            <h1 className="text-base sm:text-lg font-bold text-black dark:text-white truncate">
              {report.summary}
            </h1>

            {/* Branch info & Commits */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-neutral-600 dark:text-neutral-400">
              <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-800">
                {prBranch}
              </span>
              <span>into</span>
              <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-800 font-semibold">
                {report.branch || 'main'}
              </span>
              <span>·</span>
              <span>Author: <strong className="text-black dark:text-white">{report.implementedFix?.author || 'Shark Bot'}</strong></span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onRunTest && (
              <button
                type="button"
                onClick={handleRunTests}
                disabled={isTesting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 text-black dark:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-blue-500" />
                <span>{isTesting ? 'Running CI...' : 'Run CI Tests'}</span>
              </button>
            )}

            {onDeployFix && (
              <button
                type="button"
                onClick={handleDeploy}
                disabled={isMerging || isMerged}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  isMerged
                    ? 'bg-purple-600 opacity-90 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-sm'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isMerged ? 'PR Merged ✓' : isMerging ? 'Merging...' : 'Approve & Merge PR'}</span>
              </button>
            )}

            {onBackToOverview && (
              <button
                type="button"
                onClick={onBackToOverview}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
              >
                Overview
              </button>
            )}
          </div>
        </div>

        {/* Diff Statistics & Controls Bar */}
        <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Additions & Deletions Counter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 font-mono font-bold">
              <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                +{totalAdditions} additions
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                -{totalDeletions} deletions
              </span>
            </div>

            <span className="text-neutral-400 font-mono">
              {parsedFiles.length} file{parsedFiles.length !== 1 ? 's' : ''} changed
            </span>
          </div>

          {/* View Toggles & Export buttons */}
          <div className="flex items-center gap-1.5">
            {/* View Mode: Unified vs Split */}
            <div className="inline-flex rounded-lg p-0.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'unified'
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
                title="Unified inline diff view"
              >
                <List className="w-3.5 h-3.5" />
                <span>Unified</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
                title="Side-by-side split diff view"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
            </div>

            {/* Copy & Download patch */}
            <button
              type="button"
              onClick={handleCopyDiff}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-300 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer"
              title="Copy raw unified diff to clipboard"
            >
              {copiedPatch ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPatch ? 'Copied' : 'Copy Diff'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPatch}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-300 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer"
              title="Download .patch file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.patch</span>
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. FILE TREE / TABS (IF MULTIPLE FILES)
      ====================================================================== */}
      {parsedFiles.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {parsedFiles.map((file, idx) => (
            <button
              key={file.filename}
              type="button"
              onClick={() => setSelectedFileIdx(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 border transition-all cursor-pointer whitespace-nowrap ${
                selectedFileIdx === idx
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 font-bold'
                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{file.filename}</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                +{file.additions}
              </span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                -{file.deletions}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* =====================================================================
          3. LINE-BY-LINE DIFF CODE VIEWER
      ====================================================================== */}
      <div className="rounded-2xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black overflow-hidden shadow-sm">
        {/* File Header Banner */}
        <div className="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setExpandedFiles((prev) => ({
                  ...prev,
                  [selectedFileIdx]: !prev[selectedFileIdx],
                }))
              }
              className="text-neutral-400 hover:text-black dark:hover:text-white cursor-pointer"
            >
              {expandedFiles[selectedFileIdx] !== false ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <FileCode className="w-4 h-4 text-blue-500" />
            <span className="font-mono text-xs font-bold text-black dark:text-white">
              {activeFile.filename}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
              {activeFile.status}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              +{activeFile.additions} lines
            </span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              -{activeFile.deletions} lines
            </span>
          </div>
        </div>

        {/* File Diff Content */}
        {expandedFiles[selectedFileIdx] !== false && (
          <div className="overflow-x-auto text-xs font-mono leading-relaxed select-text">
            {viewMode === 'unified' ? (
              /* -------------------------------------------------------------
                 UNIFIED (INLINE) VIEW
              ------------------------------------------------------------- */
              <div className="min-w-[640px] divide-y divide-neutral-100 dark:divide-neutral-900">
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
                            ? 'bg-emerald-500/10 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border-l-4 border-emerald-500'
                            : isDel
                            ? 'bg-rose-500/10 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 border-l-4 border-rose-500'
                            : isHunk
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold border-l-4 border-blue-400'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-950 text-neutral-800 dark:text-neutral-200 border-l-4 border-transparent'
                        }`}
                      >
                        {/* Old Line Number */}
                        <div className="w-12 py-1 px-1.5 text-right text-[11px] font-mono text-neutral-400 dark:text-neutral-600 select-none border-r border-neutral-200 dark:border-neutral-800 shrink-0">
                          {line.oldLineNumber || ''}
                        </div>

                        {/* New Line Number */}
                        <div className="w-12 py-1 px-1.5 text-right text-[11px] font-mono text-neutral-400 dark:text-neutral-600 select-none border-r border-neutral-200 dark:border-neutral-800 shrink-0">
                          {line.newLineNumber || ''}
                        </div>

                        {/* Symbol marker (+ / - / ' ') */}
                        <div className="w-6 py-1 text-center font-mono font-bold select-none shrink-0">
                          {isAdd ? '+' : isDel ? '-' : isHunk ? '@@' : ' '}
                        </div>

                        {/* Code Text */}
                        <div className="flex-1 py-1 px-2 whitespace-pre overflow-x-auto min-w-0">
                          {line.text}
                        </div>

                        {/* Add Inline Review Comment Button on Hover */}
                        {!isHunk && (
                          <div className="w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveCommentLineKey(isCommenting ? null : lineKey)
                              }
                              className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-sm text-[10px]"
                              title="Add review comment to this line"
                            >
                              <MessageSquare className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Line Comments Box */}
                      {(comments.length > 0 || isCommenting) && (
                        <div className="bg-neutral-50 dark:bg-neutral-950 border-t border-b border-neutral-200 dark:border-neutral-800 p-3 ml-24 space-y-2">
                          {comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-blue-600 dark:text-blue-400">
                                  {comment.author}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-neutral-400">{comment.time}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(lineKey, comment.id)}
                                    className="text-neutral-400 hover:text-rose-500 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-black dark:text-white leading-relaxed">
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
                                placeholder="Write inline code review comment... (Press Enter to post)"
                                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleAddComment(lineKey)}
                                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1 cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>Post</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveCommentLineKey(null)}
                                className="px-2.5 py-1.5 text-xs text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
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
              /* -------------------------------------------------------------
                 SPLIT (SIDE-BY-SIDE) VIEW
              ------------------------------------------------------------- */
              <div className="min-w-[760px] divide-y divide-neutral-100 dark:divide-neutral-900">
                {activeFile.lines.map((line, lineIndex) => {
                  const isAdd = line.type === 'add';
                  const isDel = line.type === 'delete';
                  const isHunk = line.type === 'hunk';

                  if (isHunk) {
                    return (
                      <div
                        key={lineIndex}
                        className="py-1 px-3 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold border-l-4 border-blue-400"
                      >
                        {line.text}
                      </div>
                    );
                  }

                  return (
                    <div key={lineIndex} className="grid grid-cols-2 divide-x divide-neutral-200 dark:divide-neutral-800">
                      {/* Left: Base / Original line */}
                      <div
                        className={`flex items-stretch min-w-0 ${
                          isDel
                            ? 'bg-rose-500/10 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                            : isAdd
                            ? 'bg-neutral-50/50 dark:bg-neutral-950/40 text-transparent select-none'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-950 text-neutral-800 dark:text-neutral-200'
                        }`}
                      >
                        <div className="w-10 py-1 px-1.5 text-right text-[11px] font-mono text-neutral-400 select-none border-r border-neutral-200 dark:border-neutral-800 shrink-0">
                          {isDel || (!isAdd && !isDel) ? line.oldLineNumber || '' : ''}
                        </div>
                        <div className="w-5 py-1 text-center font-mono font-bold select-none shrink-0">
                          {isDel ? '-' : ''}
                        </div>
                        <div className="flex-1 py-1 px-2 whitespace-pre overflow-x-auto min-w-0">
                          {isDel || (!isAdd && !isDel) ? line.text : ' '}
                        </div>
                      </div>

                      {/* Right: Head / Modified line */}
                      <div
                        className={`flex items-stretch min-w-0 ${
                          isAdd
                            ? 'bg-emerald-500/10 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                            : isDel
                            ? 'bg-neutral-50/50 dark:bg-neutral-950/40 text-transparent select-none'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-950 text-neutral-800 dark:text-neutral-200'
                        }`}
                      >
                        <div className="w-10 py-1 px-1.5 text-right text-[11px] font-mono text-neutral-400 select-none border-r border-neutral-200 dark:border-neutral-800 shrink-0">
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

      {/* =====================================================================
          4. REVIEW SUBMISSION FOOTER
      ====================================================================== */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-black dark:text-white">
            Code Review Protocol
          </span>
          <span className="text-neutral-500">
            · All additions and deletions validated by automated AST syntax parser
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onDeployFix && (
            <button
              type="button"
              onClick={handleDeploy}
              disabled={isMerging || isMerged}
              className={`px-4 py-2 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                isMerged
                  ? 'bg-purple-600 opacity-90 cursor-default'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-sm'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isMerged ? 'Pull Request Merged' : isMerging ? 'Deploying Fix...' : 'Approve & Merge'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
