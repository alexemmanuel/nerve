// Client-side execution evaluator for Nerve Codespaces Terminal
// Ensures full functionality on Vercel, static hosting, offline environments, or serverless deployments

export interface TerminalExecutionResult {
  output: string;
  exitCode: number;
  telemetry: {
    cpuPercent: number;
    memoryMb: number;
  };
}

export function evaluateClientTerminalCommand(
  command: string,
  repo: string = 'acme-cloud/edge-router',
  branch: string = 'main',
  patchApplied: boolean = false
): TerminalExecutionResult {
  const rawCommand = String(command || '').trim();
  if (!rawCommand) {
    return {
      output: '',
      exitCode: 0,
      telemetry: { cpuPercent: 3, memoryMb: 248 },
    };
  }

  const evaluateSingleCommand = (singleCmd: string): { output: string; exitCode: number } => {
    const trimmed = singleCmd.trim();
    let output = '';
    let exitCode = 0;

    if (
      trimmed.startsWith('npm test') ||
      trimmed.startsWith('pnpm test') ||
      trimmed.startsWith('vitest')
    ) {
      if (patchApplied) {
        output = [
          `\x1b[36m> ${repo}@2.4.0 test\x1b[0m`,
          `\x1b[36m> vitest run src/proxy/stream-handler.test.ts\x1b[0m`,
          ``,
          ` \x1b[1;32mPASS\x1b[0m src/proxy/stream-handler.test.ts (6 tests) \x1b[32m48ms\x1b[0m`,
          `   \x1b[32m✓\x1b[0m initializes edge stream frame headers (7ms)`,
          `   \x1b[32m✓\x1b[0m guards against aborted socket before flushHeaders on L142 (14ms)`,
          `   \x1b[32m✓\x1b[0m releases backpressure lock on mid-chunk disconnect (11ms)`,
          `   \x1b[32m✓\x1b[0m propagates telemetry span on graceful close (16ms)`,
          ``,
          `\x1b[1;32mTest Files  1 passed (1)\x1b[0m`,
          `\x1b[1;32m     Tests  6 passed (6)\x1b[0m`,
          `\x1b[90m  Duration  312ms (transform 44ms, setup 0ms, collect 68ms, tests 48ms)\x1b[0m`,
        ].join('\n');
        exitCode = 0;
      } else {
        output = [
          `\x1b[36m> ${repo}@2.4.0 test\x1b[0m`,
          `\x1b[36m> vitest run src/proxy/stream-handler.test.ts\x1b[0m`,
          `\x1b[33mWARN\x1b[0m Unpatched stream handler detected on branch '${branch}'`,
          ``,
          ` \x1b[1;31mFAIL\x1b[0m src/proxy/stream-handler.test.ts (6 tests | \x1b[1;31m1 failed\x1b[0m) 52ms`,
          `   \x1b[32m✓\x1b[0m initializes edge stream frame headers (8ms)`,
          `   \x1b[1;31m× guards against aborted socket before flushHeaders on L142 (19ms)\x1b[0m`,
          `     \x1b[31m→ TypeError: Cannot read properties of undefined (reading 'flushHeaders')\x1b[0m`,
          `     \x1b[90m  at StreamHandler.pipeChunk (src/proxy/stream-handler.ts:142:19)\x1b[0m`,
          ``,
          `\x1b[1;31mTest Files  1 failed (1)\x1b[0m`,
          `\x1b[1;31m     Tests  1 failed\x1b[0m | \x1b[32m5 passed\x1b[0m (6)`,
        ].join('\n');
        exitCode = 1;
      }
    } else if (trimmed.startsWith('npm run build') || trimmed.startsWith('tsc')) {
      output = [
        `\x1b[36m> ${repo}@2.4.0 build\x1b[0m`,
        `\x1b[36m> tsc --noEmit && vite build\x1b[0m`,
        `\x1b[33mWARN\x1b[0m Bundle chunk inspection: edge-runtime worker target enabled`,
        `\x1b[32m✓\x1b[0m 42 modules transformed.`,
        `\x1b[1;32mSUCCESS\x1b[0m Built target in \x1b[32m640ms\x1b[0m (0 errors, 1 warning)`,
      ].join('\n');
      exitCode = 0;
    } else if (trimmed.startsWith('git status') || trimmed.startsWith('git log')) {
      output = [
        `\x1b[36mOn branch ${branch}\x1b[0m`,
        patchApplied
          ? `\x1b[32mChanges staged for commit:\x1b[0m\n  \x1b[32mmodified:   src/proxy/stream-handler.ts\x1b[0m`
          : `\x1b[33mWARN: Working tree clean (unpatched state on ${repo})\x1b[0m`,
        `\x1b[90mLatest commit: HEAD -> ${branch}\x1b[0m`,
      ].join('\n');
      exitCode = 0;
    } else if (trimmed.startsWith('git diff')) {
      output = patchApplied
        ? [
            `\x1b[36mdiff --git a/src/proxy/stream-handler.ts b/src/proxy/stream-handler.ts\x1b[0m`,
            `\x1b[90mindex 8f4e2a1..c91d4b0 100644\x1b[0m`,
            `--- a/src/proxy/stream-handler.ts`,
            `+++ b/src/proxy/stream-handler.ts`,
            `\x1b[36m@@ -139,7 +139,10 @@ export async function pipeChunk(ctx: EdgeStreamContext, chunk: Uint8Array) {\x1b[0m`,
            `   const { responseStream, abortSignal } = ctx;`,
            `\x1b[31m-  if (!ctx.headersSent) {\x1b[0m`,
            `\x1b[31m-    responseStream.flushHeaders();\x1b[0m`,
            `\x1b[32m+  if (abortSignal?.aborted || !responseStream || responseStream.destroyed) {\x1b[0m`,
            `\x1b[32m+    return { dropped: true, reason: 'CLIENT_SOCKET_CLOSED' };\x1b[0m`,
            `\x1b[32m+  }\x1b[0m`,
            `\x1b[32m+  if (!ctx.headersSent && typeof responseStream.flushHeaders === 'function') {\x1b[0m`,
            `\x1b[32m+    responseStream.flushHeaders();\x1b[0m`,
            `     ctx.headersSent = true;`,
            `   }`,
          ].join('\n')
        : `\x1b[33mWARN: No unstaged changes in working tree (${branch}). Apply patch to view diff.\x1b[0m`;
      exitCode = 0;
    } else if (trimmed.startsWith('gh pr create')) {
      output = [
        `\x1b[36mCreating pull request for ${branch} into main in ${repo}\x1b[0m`,
        `\x1b[1;32m✓ Pull request #419 created: https://github.com/${repo}/pull/419\x1b[0m`,
        `\x1b[32m✓ Linked incident ticket auto-tagged for closure on merge\x1b[0m`,
        `\x1b[33m⚠ GitHub Actions workflow 'Edge Runtime CI' triggered (queued -> running)\x1b[0m`,
      ].join('\n');
      exitCode = 0;
    } else if (trimmed.startsWith('git branch')) {
      output = [
        `* \x1b[32m${branch}\x1b[0m`,
        `  main`,
        patchApplied ? `  fix/shark-patch` : '',
      ]
        .filter(Boolean)
        .join('\n');
      exitCode = 0;
    } else if (trimmed === 'ls' || trimmed.startsWith('ls ') || trimmed === 'dir') {
      output = [
        `\x1b[34msrc/\x1b[0m  \x1b[34mtests/\x1b[0m  package.json  README.md  tsconfig.json  vite.config.ts`,
      ].join('\n');
      exitCode = 0;
    } else if (trimmed === 'help') {
      output = [
        `\x1b[36mNerve Cloud Container Environment — Built-in Commands:\x1b[0m`,
        `  \x1b[32mnpm test\x1b[0m            Run test suite (vitest)`,
        `  \x1b[32mnpm run build\x1b[0m       Execute TypeScript check & bundler build`,
        `  \x1b[32mgit status\x1b[0m          Inspect repository staging status`,
        `  \x1b[32mgit diff\x1b[0m            View uncommitted changes or applied patch diff`,
        `  \x1b[32mgh pr create\x1b[0m        Open GitHub pull request and trigger CI`,
        `  \x1b[32mgit branch\x1b[0m          List local repository branches`,
        `  \x1b[32mls\x1b[0m                  List files in workspace root`,
        `  \x1b[32mclear\x1b[0m               Clear terminal session logs`,
      ].join('\n');
      exitCode = 0;
    } else if (trimmed === 'node -v' || trimmed === 'node --version') {
      output = `v20.18.0`;
      exitCode = 0;
    } else if (trimmed === 'whoami') {
      output = `codespace`;
      exitCode = 0;
    } else {
      const shortId = Math.random().toString(36).substring(2, 8);
      output = [
        `\x1b[36mcodespace@${repo.split('/')[1] || 'dev'}:${branch}$ ${trimmed}\x1b[0m`,
        `\x1b[32m✓ Executed command in container [cs-${shortId}] · exit 0\x1b[0m`,
      ].join('\n');
      exitCode = 0;
    }

    return { output, exitCode };
  };

  const chainedParts = rawCommand
    .split('&&')
    .map((s) => s.trim())
    .filter(Boolean);

  const outputs: string[] = [];
  let finalExitCode = 0;

  for (const part of chainedParts) {
    const { output, exitCode } = evaluateSingleCommand(part);
    outputs.push(output);
    if (exitCode !== 0) {
      finalExitCode = exitCode;
      break;
    }
  }

  const isHeavy =
    rawCommand.includes('npm test') ||
    rawCommand.includes('npm run build') ||
    rawCommand.includes('vitest');

  return {
    output: outputs.join('\n\n'),
    exitCode: finalExitCode,
    telemetry: {
      cpuPercent: isHeavy ? Math.floor(Math.random() * 30 + 55) : Math.floor(Math.random() * 8 + 4),
      memoryMb: isHeavy ? Math.floor(Math.random() * 90 + 380) : Math.floor(Math.random() * 20 + 240),
    },
  };
}
