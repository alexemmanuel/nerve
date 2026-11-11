import React from 'react';

export type AnsiColorSchemeId =
  | 'vscode-dark'
  | 'monokai'
  | 'solarized'
  | 'dracula'
  | 'cyber-dark'
  | 'nord';

export interface AnsiColorSchemeOption {
  id: AnsiColorSchemeId;
  label: string;
  description: string;
  containerBgClass: string;
}

export const ANSI_COLOR_SCHEMES: AnsiColorSchemeOption[] = [
  {
    id: 'cyber-dark',
    label: 'Cyber Dark',
    description: 'Electric neon cyan, emerald, and hot pink high-contrast cyber terminal',
    containerBgClass: 'bg-white dark:bg-black',
  },
  {
    id: 'dracula',
    label: 'Dracula',
    description: 'Vibrant purple, pink, and neon green terminal palette',
    containerBgClass: 'bg-white dark:bg-black',
  },
  {
    id: 'monokai',
    label: 'Monokai',
    description: 'High-contrast warm magenta, lime, and amber syntax tones',
    containerBgClass: 'bg-white dark:bg-black',
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Arctic frost cyan, deep polar night slate, and aurora accents',
    containerBgClass: 'bg-white dark:bg-black',
  },
  {
    id: 'vscode-dark',
    label: 'VSCode Dark',
    description: 'Balanced modern IDE palette for ANSI output',
    containerBgClass: 'bg-white dark:bg-black',
  },
  {
    id: 'solarized',
    label: 'Solarized',
    description: 'Precision cyan, olive, and orange diagnostic contrast',
    containerBgClass: 'bg-white dark:bg-black',
  },
];

interface AnsiSegmentStyle {
  colorClass?: string;
  bold?: boolean;
}

interface SchemePalette {
  ansiMap: Record<number, string>;
  error: string;
  warning: string;
  prompt: string;
  success: string;
  defaultText: string;
}

const SCHEME_PALETTES: Record<AnsiColorSchemeId, SchemePalette> = {
  'vscode-dark': {
    ansiMap: {
      30: 'text-neutral-700 dark:text-neutral-300',
      31: 'text-red-600 dark:text-red-400',
      32: 'text-emerald-600 dark:text-emerald-400',
      33: 'text-amber-600 dark:text-amber-400',
      34: 'text-blue-600 dark:text-blue-400',
      35: 'text-purple-600 dark:text-purple-400',
      36: 'text-sky-600 dark:text-sky-400',
      37: 'text-neutral-800 dark:text-neutral-200',
      90: 'text-neutral-500 dark:text-neutral-400',
      91: 'text-red-500 dark:text-red-400',
      92: 'text-emerald-500 dark:text-emerald-400',
      93: 'text-amber-500 dark:text-amber-300',
      94: 'text-blue-500 dark:text-blue-400',
      95: 'text-purple-500 dark:text-purple-400',
      96: 'text-sky-500 dark:text-sky-400',
    },
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    prompt: 'text-blue-600 dark:text-blue-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    defaultText: 'text-neutral-800 dark:text-neutral-200',
  },
  monokai: {
    ansiMap: {
      30: 'text-stone-700 dark:text-stone-300',
      31: 'text-rose-600 dark:text-rose-400',
      32: 'text-lime-600 dark:text-lime-400',
      33: 'text-orange-600 dark:text-amber-300',
      34: 'text-indigo-600 dark:text-indigo-300',
      35: 'text-fuchsia-600 dark:text-fuchsia-400',
      36: 'text-cyan-600 dark:text-cyan-300',
      37: 'text-stone-800 dark:text-stone-100',
      90: 'text-stone-500 dark:text-stone-400',
      91: 'text-rose-500 dark:text-rose-400',
      92: 'text-lime-500 dark:text-lime-300',
      93: 'text-yellow-600 dark:text-yellow-300',
      94: 'text-indigo-500 dark:text-indigo-300',
      95: 'text-fuchsia-500 dark:text-fuchsia-300',
      96: 'text-cyan-500 dark:text-cyan-300',
    },
    error: 'text-rose-600 dark:text-rose-400',
    warning: 'text-orange-600 dark:text-amber-300',
    prompt: 'text-fuchsia-600 dark:text-fuchsia-400',
    success: 'text-lime-600 dark:text-lime-400',
    defaultText: 'text-stone-800 dark:text-stone-100',
  },
  solarized: {
    ansiMap: {
      30: 'text-slate-700 dark:text-slate-300',
      31: 'text-red-700 dark:text-red-400',
      32: 'text-teal-700 dark:text-teal-400',
      33: 'text-yellow-700 dark:text-yellow-400',
      34: 'text-sky-700 dark:text-sky-400',
      35: 'text-violet-700 dark:text-violet-400',
      36: 'text-cyan-700 dark:text-cyan-400',
      37: 'text-slate-800 dark:text-slate-200',
      90: 'text-slate-500 dark:text-slate-400',
      91: 'text-orange-600 dark:text-orange-400',
      92: 'text-teal-600 dark:text-teal-300',
      93: 'text-yellow-600 dark:text-yellow-300',
      94: 'text-sky-600 dark:text-sky-300',
      95: 'text-violet-600 dark:text-violet-300',
      96: 'text-cyan-600 dark:text-cyan-300',
    },
    error: 'text-red-700 dark:text-red-400',
    warning: 'text-yellow-700 dark:text-yellow-400',
    prompt: 'text-cyan-700 dark:text-cyan-400',
    success: 'text-teal-700 dark:text-teal-400',
    defaultText: 'text-slate-800 dark:text-slate-200',
  },
  dracula: {
    ansiMap: {
      30: 'text-zinc-700 dark:text-zinc-300',
      31: 'text-pink-600 dark:text-pink-400',
      32: 'text-green-600 dark:text-green-400',
      33: 'text-yellow-600 dark:text-yellow-300',
      34: 'text-purple-600 dark:text-purple-400',
      35: 'text-fuchsia-600 dark:text-pink-400',
      36: 'text-cyan-600 dark:text-cyan-300',
      37: 'text-zinc-800 dark:text-zinc-100',
      90: 'text-zinc-500 dark:text-zinc-400',
      91: 'text-pink-500 dark:text-pink-400',
      92: 'text-green-500 dark:text-green-300',
      93: 'text-yellow-500 dark:text-yellow-200',
      94: 'text-purple-500 dark:text-purple-300',
      95: 'text-fuchsia-500 dark:text-pink-300',
      96: 'text-cyan-500 dark:text-cyan-200',
    },
    error: 'text-pink-600 dark:text-pink-400',
    warning: 'text-yellow-600 dark:text-yellow-300',
    prompt: 'text-purple-600 dark:text-purple-400',
    success: 'text-green-600 dark:text-green-400',
    defaultText: 'text-zinc-800 dark:text-zinc-100',
  },
  'cyber-dark': {
    ansiMap: {
      30: 'text-neutral-700 dark:text-neutral-400',
      31: 'text-rose-500 dark:text-rose-400',
      32: 'text-emerald-400 dark:text-emerald-300',
      33: 'text-amber-400 dark:text-amber-300',
      34: 'text-cyan-500 dark:text-cyan-400',
      35: 'text-fuchsia-500 dark:text-fuchsia-400',
      36: 'text-teal-400 dark:text-teal-300',
      37: 'text-white dark:text-white',
      90: 'text-neutral-500 dark:text-neutral-400',
      91: 'text-red-400 dark:text-red-300',
      92: 'text-emerald-300 dark:text-emerald-200',
      93: 'text-yellow-300 dark:text-yellow-200',
      94: 'text-cyan-400 dark:text-cyan-300',
      95: 'text-pink-400 dark:text-pink-300',
      96: 'text-teal-300 dark:text-teal-200',
    },
    error: 'text-rose-500 dark:text-rose-400',
    warning: 'text-amber-400 dark:text-amber-300',
    prompt: 'text-cyan-400 dark:text-cyan-300',
    success: 'text-emerald-400 dark:text-emerald-300',
    defaultText: 'text-neutral-900 dark:text-neutral-100',
  },
  nord: {
    ansiMap: {
      30: 'text-slate-600 dark:text-slate-400',
      31: 'text-red-500 dark:text-red-400',
      32: 'text-teal-500 dark:text-teal-300',
      33: 'text-amber-500 dark:text-amber-300',
      34: 'text-sky-600 dark:text-sky-400',
      35: 'text-indigo-500 dark:text-indigo-300',
      36: 'text-cyan-600 dark:text-cyan-300',
      37: 'text-slate-800 dark:text-slate-100',
      90: 'text-slate-400 dark:text-slate-500',
      91: 'text-red-400 dark:text-red-300',
      92: 'text-teal-400 dark:text-teal-200',
      93: 'text-yellow-400 dark:text-yellow-200',
      94: 'text-sky-400 dark:text-sky-300',
      95: 'text-indigo-400 dark:text-indigo-200',
      96: 'text-cyan-400 dark:text-cyan-200',
    },
    error: 'text-red-500 dark:text-red-400',
    warning: 'text-amber-500 dark:text-amber-300',
    prompt: 'text-sky-500 dark:text-sky-400',
    success: 'text-teal-500 dark:text-teal-300',
    defaultText: 'text-slate-800 dark:text-slate-100',
  },
};

function classifyLineFallbackColor(line: string, palette: SchemePalette): string {
  const trimmed = line.trim();
  if (!trimmed) return palette.success;

  // Error patterns -> Red/Scheme Error
  if (
    /(?:\bFAIL\b|\bERROR\b|\bERR!\b|TypeError:|ReferenceError:|SyntaxError:|Exception|\b1 failed\b|×|✗|^-\s)/i.test(
      trimmed
    )
  ) {
    return palette.error;
  }

  // Warning patterns -> Yellow/Amber
  if (/(?:\bWARN\b|\bWARNING\b|deprecated|⚠|\bqueued\b|\bpending\b)/i.test(trimmed)) {
    return palette.warning;
  }

  // Prompt or metadata lines -> Blue/Cyan
  if (/^(?:codespace@|> |diff --git|@@ |\+\+\+ |--- )/i.test(trimmed)) {
    return palette.prompt;
  }

  // Success patterns -> Green
  if (
    /(?:\bPASS\b|\bpassed\b|\bSUCCESS\b|✓|✔|Pull request #\d+ created|\bexit 0\b|^\+\s|\[.*Ready\])/i.test(
      trimmed
    )
  ) {
    return palette.success;
  }

  return palette.defaultText;
}

function resolveThemeColorClass(
  rawClass: string,
  themeMode?: 'dark' | 'light'
): string {
  if (!themeMode) return rawClass;
  const tokens = rawClass.trim().split(/\s+/);
  if (themeMode === 'dark') {
    const darkTokens = tokens
      .filter((t) => t.startsWith('dark:'))
      .map((t) => t.replace(/^dark:/, ''));
    return darkTokens.length > 0 ? darkTokens.join(' ') : rawClass;
  }
  const lightTokens = tokens.filter((t) => !t.startsWith('dark:'));
  return lightTokens.length > 0 ? lightTokens.join(' ') : rawClass;
}

function highlightSearchQuery(
  text: string,
  searchKeyword?: string,
  themeMode?: 'dark' | 'light'
): React.ReactNode {
  if (!searchKeyword || !searchKeyword.trim()) return text;
  const cleanQuery = searchKeyword.trim();
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) return text;

  const markClass =
    themeMode === 'dark'
      ? 'bg-yellow-500/40 text-white px-0.5 rounded font-semibold'
      : themeMode === 'light'
      ? 'bg-yellow-300 text-black px-0.5 rounded font-semibold'
      : 'bg-yellow-300 dark:bg-yellow-500/40 text-black dark:text-white px-0.5 rounded font-semibold';

  return parts.map((chunk, i) =>
    chunk.toLowerCase() === cleanQuery.toLowerCase() ? (
      <mark key={i} className={markClass}>
        {chunk}
      </mark>
    ) : (
      chunk
    )
  );
}

/**
 * Parses ANSI SGR escape sequences (e.g. \x1b[31m, \x1b[1;32m, \x1b[0m) and
 * falls back to semantic CLI highlighting using the selected ANSI color scheme
 * (VSCode Dark, Monokai, Solarized, or Dracula) and optional independent terminal theme.
 */
export function renderAnsiFormattedLog(
  logBlock: string,
  schemeId: AnsiColorSchemeId = 'vscode-dark',
  searchKeyword?: string,
  themeMode?: 'dark' | 'light'
): React.ReactNode {
  const palette = SCHEME_PALETTES[schemeId] || SCHEME_PALETTES['vscode-dark'];
  const lines = logBlock.split('\n');

  return lines.map((line, lineIdx) => {
    const hasAnsi = /\x1b\[[0-9;]*m/.test(line);

    if (!hasAnsi) {
      const fallbackClass = resolveThemeColorClass(
        classifyLineFallbackColor(line, palette),
        themeMode
      );
      return (
        <div key={lineIdx} className={`${fallbackClass} whitespace-pre-wrap leading-relaxed`}>
          {line ? highlightSearchQuery(line, searchKeyword, themeMode) : ' '}
        </div>
      );
    }

    const parts = line.split(/(\x1b\[[0-9;]*m)/g);
    let currentStyle: AnsiSegmentStyle = {};
    const renderedSpans: React.ReactNode[] = [];

    parts.forEach((part, idx) => {
      if (!part) return;
      const ansiMatch = part.match(/^\x1b\[([0-9;]*)m$/);
      if (ansiMatch) {
        const rawCodes = ansiMatch[1]
          ? ansiMatch[1].split(';').map((n) => parseInt(n, 10))
          : [0];
        for (const code of rawCodes) {
          if (code === 0 || Number.isNaN(code)) {
            currentStyle = {};
          } else if (code === 1) {
            currentStyle = { ...currentStyle, bold: true };
          } else if (code === 22) {
            currentStyle = { ...currentStyle, bold: false };
          } else if (palette.ansiMap[code]) {
            currentStyle = {
              ...currentStyle,
              colorClass: resolveThemeColorClass(palette.ansiMap[code], themeMode),
            };
          }
        }
        return;
      }

      const colorClass =
        currentStyle.colorClass ||
        resolveThemeColorClass(classifyLineFallbackColor(part, palette), themeMode);
      const boldClass = currentStyle.bold ? 'font-bold' : '';
      renderedSpans.push(
        <span key={idx} className={`${colorClass} ${boldClass}`.trim()}>
          {highlightSearchQuery(part, searchKeyword, themeMode)}
        </span>
      );
    });

    return (
      <div key={lineIdx} className="whitespace-pre-wrap leading-relaxed">
        {renderedSpans.length > 0 ? renderedSpans : ' '}
      </div>
    );
  });
}

