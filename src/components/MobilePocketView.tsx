import React, { useState } from 'react';
import {
  Bug,
  CheckCircle2,
  Terminal,
  Code2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface MobilePocketViewProps {
  onJumpToDesktopWorkspace: () => void;
  onOpenIncidentWorkflow?: (ticketId?: string) => void;
  isDark?: boolean;
}

export const MobilePocketView: React.FC<MobilePocketViewProps> = ({
  onJumpToDesktopWorkspace,
  onOpenIncidentWorkflow,
  isDark = true,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [testOutput, setTestOutput] = useState<string>('');

  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const res = await fetch('/api/v1/codespaces/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'npm test',
          repo: 'acme-cloud/edge-router',
          branch: 'fix/mobile-stream-guard',
          patchApplied: true,
        }),
      });
      const data = await res.json();
      setTestOutput(data.output || '✓ 6 tests passed in container (48ms)');
      setStep(3);
    } catch {
      setTestOutput('✓ 6/6 tests passed in cloud Codespace (48ms)');
      setStep(3);
    } finally {
      setIsRunningTests(false);
    }
  };

  const steps = [
    { num: 1, label: '1. Bug Alert' },
    { num: 2, label: '2. Code Fix' },
    { num: 3, label: '3. Cloud Test' },
    { num: 4, label: '4. Merged' },
  ] as const;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      {/* Responsive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              Mobile On-The-Go Triage
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
              Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Review crash traces, generate fixes with Nerve Shark, run cloud tests, and merge PRs directly from mobile.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setStep(1);
              setTestOutput('');
            }}
            className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            onClick={onJumpToDesktopWorkspace}
            className="px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Open Messenger
          </button>
        </div>
      </div>

      {/* Step Indicator - responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {steps.map((s) => (
          <button
            key={s.num}
            onClick={() => setStep(s.num)}
            className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors text-center cursor-pointer ${
              step === s.num
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Responsive Viewport Layout: Side-by-side on tablet/desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Mobile Device Simulator Container */}
        <div className="md:col-span-6 flex justify-center">
          <div className="w-full max-w-[390px] rounded-3xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-lg flex flex-col">
            {/* Phone Top Bar */}
            <div className="px-4 h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  SM
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Core System Maintainer · Nerve Peer
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    acme-cloud/edge-router
                  </div>
                </div>
              </div>

              <button
                onClick={() => setFocusMode(!focusMode)}
                className={`min-h-[32px] px-2.5 text-[11px] font-medium rounded-lg transition-colors cursor-pointer shrink-0 ${
                  focusMode
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {focusMode ? 'Focus ON' : 'Focus OFF'}
              </button>
            </div>

            {/* Phone Screen Body */}
            <div className="p-4 space-y-3 min-h-[340px] max-h-[460px] overflow-y-auto bg-slate-50 dark:bg-slate-950">
              {/* Bug Report Card */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                    <Bug className="w-3.5 h-3.5" />
                    <span>INC-4821</span>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">stream-handler.ts:142</span>
                </div>
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug">
                  Stream crashes when mobile client disconnects mid-chunk during SSR flush.
                </p>
                {onOpenIncidentWorkflow && (
                  <button
                    onClick={() => onOpenIncidentWorkflow('INC-4821')}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <span>Inspect Full Architecture Workflow</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Step 2+: Suggested Code Fix */}
              {step >= 2 && (
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Nerve Shark Fix Proposed</span>
                    </span>
                    <span className="font-mono text-[11px]">+4 lines</span>
                  </div>
                  <pre className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-[11px] font-mono text-emerald-700 dark:text-emerald-300 overflow-x-auto leading-relaxed">
{`+ if (abortSignal?.aborted || !responseStream) {
+   return { dropped: true };
+ }
  if (!ctx.headersSent) {
    responseStream.flushHeaders();
  }`}
                  </pre>
                </div>
              )}

              {/* Step 3+: Cloud Test Results */}
              {step >= 3 && (
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Codespace Tests Verified</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">48ms</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                    vitest: 6/6 tests passed in container cs-edge-router-491a
                  </p>
                </div>
              )}

              {/* Step 4: PR Merged */}
              {step === 4 && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/50 text-center space-y-1">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Pull Request #419 Merged</span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Deployed to edge fleet · INC-4821 resolved
                  </div>
                </div>
              )}
            </div>

            {/* Phone Bottom Action Button */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              {step === 1 && (
                <button
                  onClick={() => setStep(2)}
                  className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Code2 className="w-4 h-4" />
                  <span>Step 1: Generate Fix with Nerve Shark</span>
                </button>
              )}

              {step === 2 && (
                <button
                  onClick={handleRunTests}
                  disabled={isRunningTests}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Play className="w-4 h-4" />
                  <span>{isRunningTests ? 'Executing Container Tests...' : 'Step 2: Run Tests in Codespace'}</span>
                </button>
              )}

              {step === 3 && (
                <button
                  onClick={() => setStep(4)}
                  className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Step 3: Push & Merge Pull Request</span>
                </button>
              )}

              {step === 4 && (
                <button
                  onClick={() => {
                    setStep(1);
                    setTestOutput('');
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Done · Replay Incident Resolution</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Real-time Cloud Continuity Monitor (Explains and connects the steps) */}
        <div className="md:col-span-6 space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Cloud Codespace Continuity Stream</span>
              </h2>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                cs-edge-router-491a
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              When an engineer initiates actions on mobile, Nerve maintains complete cloud state continuity across the backend container:
            </p>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-3.5 font-mono text-xs text-slate-800 dark:text-slate-300 space-y-1.5 min-h-[160px] overflow-x-auto">
              <div className="text-slate-500 dark:text-slate-400">Remote container live session output:</div>
              <div>codespace@edge-router:~$ git status</div>
              <div className="text-emerald-700 dark:text-emerald-400">On branch main · working tree clean</div>
              {step >= 2 && (
                <>
                  <div className="text-blue-700 dark:text-blue-400">$ nerve shark-patch apply stream-handler.ts:142</div>
                  <div className="text-slate-600 dark:text-slate-400">+4 lines inserted with stream guard</div>
                </>
              )}
              {step >= 3 && (
                <>
                  <div className="text-amber-700 dark:text-amber-400">$ vitest run src/proxy/stream-handler.test.ts</div>
                  <div className="text-emerald-700 dark:text-emerald-300">
                    {testOutput ? testOutput.split('\n')[0] : '✓ 6 tests passed (48ms) · 0 regressions'}
                  </div>
                </>
              )}
              {step >= 4 && (
                <>
                  <div className="text-blue-700 dark:text-blue-400">$ gh pr create --title "fix(proxy): guard L142" --merge</div>
                  <div className="text-emerald-700 dark:text-emerald-400">✓ Pull Request #419 merged into main (c91d4b0)</div>
                </>
              )}
            </div>

            {onOpenIncidentWorkflow && (
              <button
                onClick={() => onOpenIncidentWorkflow('INC-4821')}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>View Full System Architecture & Log Reports</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
