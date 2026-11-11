import React from 'react';

export interface DetectedLanguage {
  id:
    | 'typescript'
    | 'javascript'
    | 'python'
    | 'go'
    | 'rust'
    | 'json'
    | 'shell'
    | 'css'
    | 'markdown'
    | 'code';
  label: string;
}

export function detectCodeLanguage(
  filePath?: string,
  explicitLanguage?: string
): DetectedLanguage {
  const lowerPath = (filePath || '').toLowerCase().trim();
  const lowerExplicit = (explicitLanguage || '').toLowerCase().trim();

  if (lowerPath.endsWith('.tsx') || lowerPath.endsWith('.ts') || lowerExplicit.includes('typescript')) {
    return { id: 'typescript', label: 'TypeScript' };
  }
  if (lowerPath.endsWith('.jsx') || lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || lowerExplicit.includes('javascript')) {
    return { id: 'javascript', label: 'JavaScript' };
  }
  if (lowerPath.endsWith('.py') || lowerExplicit.includes('python')) {
    return { id: 'python', label: 'Python' };
  }
  if (lowerPath.endsWith('.go') || lowerExplicit === 'go' || lowerExplicit === 'golang') {
    return { id: 'go', label: 'Go' };
  }
  if (lowerPath.endsWith('.rs') || lowerExplicit.includes('rust')) {
    return { id: 'rust', label: 'Rust' };
  }
  if (lowerPath.endsWith('.json') || lowerExplicit.includes('json')) {
    return { id: 'json', label: 'JSON' };
  }
  if (
    lowerPath.endsWith('.sh') ||
    lowerPath.endsWith('.bash') ||
    lowerPath.endsWith('.zsh') ||
    lowerExplicit.includes('shell') ||
    lowerExplicit.includes('bash')
  ) {
    return { id: 'shell', label: 'Shell' };
  }
  if (lowerPath.endsWith('.css') || lowerPath.endsWith('.scss') || lowerExplicit.includes('css')) {
    return { id: 'css', label: 'CSS' };
  }
  if (lowerPath.endsWith('.md') || lowerExplicit.includes('markdown')) {
    return { id: 'markdown', label: 'Markdown' };
  }
  return { id: 'typescript', label: explicitLanguage || 'TypeScript' };
}

const COMMON_KEYWORDS = new Set([
  // TS / JS
  'import',
  'export',
  'from',
  'const',
  'let',
  'var',
  'function',
  'async',
  'await',
  'return',
  'if',
  'else',
  'switch',
  'case',
  'default',
  'for',
  'while',
  'do',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'class',
  'extends',
  'implements',
  'interface',
  'type',
  'enum',
  'public',
  'private',
  'protected',
  'readonly',
  'static',
  'typeof',
  'instanceof',
  'in',
  'of',
  'as',
  'void',
  'delete',
  'yield',
  // Python
  'def',
  'elif',
  'except',
  'raise',
  'with',
  'pass',
  'lambda',
  'global',
  'nonlocal',
  'assert',
  'del',
  'and',
  'or',
  'not',
  'is',
  // Go / Rust
  'package',
  'func',
  'defer',
  'go',
  'select',
  'chan',
  'map',
  'struct',
  'fn',
  'pub',
  'mut',
  'impl',
  'trait',
  'where',
  'match',
  'use',
  'mod',
  'crate',
  ' unsafe',
  'loop',
  'move',
  'ref',
]);

const BUILTIN_TYPES_AND_GLOBALS = new Set([
  'string',
  'number',
  'boolean',
  'any',
  'unknown',
  'never',
  'object',
  'symbol',
  'bigint',
  'Promise',
  'Record',
  'Array',
  'ReadonlyArray',
  'Map',
  'Set',
  'Error',
  'TypeError',
  'Date',
  'RegExp',
  'Math',
  'JSON',
  'Object',
  'console',
  'window',
  'document',
  'navigator',
  'process',
  'Buffer',
  'React',
  // Python
  'int',
  'float',
  'str',
  'bool',
  'list',
  'dict',
  'tuple',
  'set',
  'self',
  'cls',
  'Exception',
  'RuntimeError',
  'ValueError',
  // Go / Rust
  'error',
  'context',
  'Context',
  'http',
  'fmt',
  'Result',
  'Option',
  'Some',
  'Ok',
  'Err',
  'Vec',
  'String',
  'Box',
  'Arc',
  'Mutex',
  'u8',
  'u16',
  'u32',
  'u64',
  'usize',
  'i32',
  'i64',
  'f32',
  'f64',
]);

const LITERAL_CONSTANTS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'None',
  'True',
  'False',
  'nil',
]);

const TOKEN_REGEX =
  /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|@[a-zA-Z_]\w*|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_]\w*\b|[{}()[\].,:;+-/*=<>!&|?~^%]+|\s+)/g;

export function renderSyntaxHighlightedLine(
  line: string,
  langId: DetectedLanguage['id'] = 'typescript'
): React.ReactNode {
  if (!line) return ' ';

  const trimmed = line.trimStart();
  if (
    trimmed.startsWith('//') ||
    (trimmed.startsWith('#') && langId !== 'rust') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*')
  ) {
    return (
      <span className="text-neutral-500 dark:text-neutral-400 italic">
        {line}
      </span>
    );
  }

  const tokens = line.match(TOKEN_REGEX);
  if (!tokens) return line;

  return tokens.map((token, idx) => {
    // 1. Whitespace
    if (/^\s+$/.test(token)) {
      return <React.Fragment key={idx}>{token}</React.Fragment>;
    }

    // 2. Trailing inline comments
    if (
      token.startsWith('//') ||
      token.startsWith('/*') ||
      (token.startsWith('#') && (langId === 'python' || langId === 'shell'))
    ) {
      return (
        <span key={idx} className="text-neutral-500 dark:text-neutral-400 italic">
          {token}
        </span>
      );
    }

    // 3. String / Template literals
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")) ||
      (token.startsWith('`') && token.endsWith('`'))
    ) {
      // In JSON, check if this string is a property key (followed by ':')
      const nextNonSpace = tokens.slice(idx + 1).find((t) => !/^\s+$/.test(t));
      if (langId === 'json' && nextNonSpace?.startsWith(':')) {
        return (
          <span key={idx} className="text-sky-700 dark:text-sky-400 font-semibold">
            {token}
          </span>
        );
      }
      return (
        <span key={idx} className="text-emerald-700 dark:text-emerald-400">
          {token}
        </span>
      );
    }

    // 4. Decorators / Annotations (@shark, @Injectable, etc.)
    if (token.startsWith('@')) {
      return (
        <span key={idx} className="text-rose-600 dark:text-rose-400 font-semibold">
          {token}
        </span>
      );
    }

    // 5. Numeric literals
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      return (
        <span key={idx} className="text-amber-600 dark:text-amber-400">
          {token}
        </span>
      );
    }

    // 6. Identifiers, Keywords, Types, Constants, Functions
    if (/^[a-zA-Z_]\w*$/.test(token)) {
      if (LITERAL_CONSTANTS.has(token)) {
        return (
          <span key={idx} className="text-amber-600 dark:text-amber-400 font-semibold">
            {token}
          </span>
        );
      }

      if (COMMON_KEYWORDS.has(token)) {
        return (
          <span key={idx} className="text-purple-700 dark:text-purple-400 font-semibold">
            {token}
          </span>
        );
      }

      if (BUILTIN_TYPES_AND_GLOBALS.has(token) || /^[A-Z][a-zA-Z0-9_]*$/.test(token)) {
        return (
          <span key={idx} className="text-sky-700 dark:text-sky-400">
            {token}
          </span>
        );
      }

      // Check if followed by '(' -> Function or method invocation
      const nextToken = tokens[idx + 1];
      if (nextToken && nextToken.startsWith('(')) {
        return (
          <span key={idx} className="text-blue-600 dark:text-blue-400">
            {token}
          </span>
        );
      }

      return <React.Fragment key={idx}>{token}</React.Fragment>;
    }

    // 7. Operators & punctuation
    return (
      <span key={idx} className="text-neutral-600 dark:text-neutral-400">
        {token}
      </span>
    );
  });
}
