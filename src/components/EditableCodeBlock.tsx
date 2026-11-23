import React, { useState, useEffect } from 'react';
import { Copy, Check, Edit3 } from 'lucide-react';

interface EditableCodeBlockProps {
  code: string;
  language?: string;
  onSave: (nextCode: string) => void;
  codeColorClass?: string;
  leftFooterAction?: React.ReactNode;
}

export const EditableCodeBlock: React.FC<EditableCodeBlockProps> = ({
  code,
  language,
  onSave,
  codeColorClass = 'text-emerald-700 dark:text-emerald-400',
  leftFooterAction,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(code);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(code);
    }
  }, [code, isEditing]);

  const handleCopy = async () => {
    const textToCopy = isEditing ? draft : code;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSave = () => {
    onSave(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(code);
    setIsEditing(false);
  };

  const lineCount = Math.min(20, Math.max(3, (isEditing ? draft : code).split('\n').length + 1));

  return (
    <div className="my-1.5 space-y-1.5">
      <div className="rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] overflow-hidden">
        {language && (
          <div className="px-3 py-1 border-b border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] flex items-center justify-between text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
            <span>{language}</span>
            {isEditing && (
              <span className="text-blue-600 dark:text-blue-400 font-medium">Editing</span>
            )}
          </div>
        )}

        {isEditing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            rows={lineCount}
            spellCheck={false}
            aria-label="Edit code block"
            className="w-full p-3 text-xs font-mono leading-relaxed bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500 resize-y"
            autoFocus
          />
        ) : (
          <pre
            className={`p-3 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre ${codeColorClass}`}
          >
            {code}
          </pre>
        )}
      </div>

      {/* Copy & Edit controls placed at the bottom-right directly below the code block */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">{leftFooterAction}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="px-2 py-1 rounded-md text-[11px] font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#f6f8fa] dark:hover:bg-[#30363d] cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer whitespace-nowrap"
              >
                Save Code
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleCopy()}
                title="Copy code"
                aria-label="Copy code"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(code);
                  setIsEditing(true);
                }}
                title="Edit code"
                aria-label="Edit code"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface CodeSegment {
  type: 'text' | 'code';
  content: string;
  language?: string;
  codeBlockIndex?: number;
}

const FENCED_CODE_REGEX = /```([a-zA-Z0-9_+#.-]*)[ \t]*\r?\n([\s\S]*?)```/g;

function parseMessageSegments(text: string): CodeSegment[] {
  const segments: CodeSegment[] = [];
  let lastIndex = 0;
  let codeBlockIndex = 0;

  FENCED_CODE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCED_CODE_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'code',
      language: match[1] ? match[1].trim() : undefined,
      content: match[2].replace(/\n$/, ''),
      codeBlockIndex,
    });
    codeBlockIndex += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

function replaceFencedCodeBlock(text: string, targetIndex: number, nextCode: string): string {
  let currentIndex = 0;
  FENCED_CODE_REGEX.lastIndex = 0;
  return text.replace(FENCED_CODE_REGEX, (fullMatch, lang: string) => {
    const idx = currentIndex;
    currentIndex += 1;
    if (idx !== targetIndex) return fullMatch;
    const normalizedLang = lang ? lang.trim() : '';
    const cleanCode = nextCode.replace(/\r\n/g, '\n');
    return `\`\`\`${normalizedLang}\n${cleanCode}\n\`\`\``;
  });
}

interface MessageContentWithEditableCodeProps {
  text: string;
  onUpdateText: (nextText: string) => void;
  renderProse?: (prose: string) => React.ReactNode;
}

export const MessageContentWithEditableCode: React.FC<MessageContentWithEditableCodeProps> = ({
  text,
  onUpdateText,
  renderProse,
}) => {
  const segments = parseMessageSegments(text);
  const hasCodeBlocks = segments.some((seg) => seg.type === 'code');

  if (!hasCodeBlocks) {
    return (
      <p className="text-xs sm:text-sm text-[#1f2328] dark:text-[#e6edf3] leading-relaxed whitespace-pre-wrap">
        {renderProse ? renderProse(text) : text}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {segments.map((segment, index) => {
        if (segment.type === 'code') {
          const blockIdx = segment.codeBlockIndex ?? 0;
          return (
            <EditableCodeBlock
              key={`code-${blockIdx}-${index}`}
              code={segment.content}
              language={segment.language}
              onSave={(nextCode) => {
                const updatedText = replaceFencedCodeBlock(text, blockIdx, nextCode);
                onUpdateText(updatedText);
              }}
            />
          );
        }

        const trimmed = segment.content.trim();
        if (!trimmed) return null;

        return (
          <p
            key={`text-${index}`}
            className="text-xs sm:text-sm text-[#1f2328] dark:text-[#e6edf3] leading-relaxed whitespace-pre-wrap"
          >
            {renderProse ? renderProse(segment.content.trim()) : segment.content.trim()}
          </p>
        );
      })}
    </div>
  );
};
