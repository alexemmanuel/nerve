import React, { useState, useRef } from 'react';
import {
  Shield,
  Lock,
  Radio,
  Upload,
  Download,
  Terminal,
  FileJson,
  RefreshCw,
  CheckCircle2,
  Activity,
  Zap,
  HardDrive,
  Send,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  SignalingTransportMode,
  WebRtcConnectionState,
  P2PRoomPeer,
  InspectedJsonPayload,
} from '../hooks/useP2PEngine';
import { DerivedKeyMaterial } from '../utils/cryptoEngine';
import {
  StoredFileTransferManifest,
  StoredTerminalStreamLog,
} from '../utils/p2pStorage';

interface P2PWorkbenchPanelProps {
  roomId: string;
  onChangeRoomId: (room: string) => void;
  passphrase: string;
  onChangePassphrase: (secret: string) => void;
  transportMode: SignalingTransportMode;
  onChangeTransportMode: (mode: SignalingTransportMode) => void;
  peerId: string;
  rtcState: WebRtcConnectionState;
  signalingConnected: boolean;
  broadcastActive: boolean;
  roomPeers: P2PRoomPeer[];
  keyMaterial: DerivedKeyMaterial | null;
  latencyMs: number;
  throughputKbps: number;
  bufferedAmountBytes: number;
  iceRestartCount: number;
  fileTransfers: StoredFileTransferManifest[];
  terminalStreamLogs: StoredTerminalStreamLog[];
  inspectedPayloads: InspectedJsonPayload[];
  onInitiateHandshake: (iceRestart?: boolean) => void;
  onSendFile: (file: File) => Promise<void>;
  onSendTerminalStreamLine: (line: string, level?: 'stdout' | 'stderr' | 'system') => Promise<void>;
  onSendJsonPayload: (title: string, rawJson: string) => Promise<void>;
  onClearStreamLogs: () => void;
}

export const P2PWorkbenchPanel: React.FC<P2PWorkbenchPanelProps> = ({
  roomId,
  onChangeRoomId,
  passphrase,
  onChangePassphrase,
  transportMode,
  onChangeTransportMode,
  peerId,
  rtcState,
  signalingConnected,
  broadcastActive,
  roomPeers,
  keyMaterial,
  latencyMs,
  throughputKbps,
  bufferedAmountBytes,
  iceRestartCount,
  fileTransfers,
  terminalStreamLogs,
  inspectedPayloads,
  onInitiateHandshake,
  onSendFile,
  onSendTerminalStreamLine,
  onSendJsonPayload,
  onClearStreamLogs,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'files' | 'stream' | 'inspector'>('files');
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [streamInput, setStreamInput] = useState<string>('');
  const [streamLevel, setStreamLevel] = useState<'stdout' | 'stderr' | 'system'>('stdout');
  const [jsonTitle, setJsonTitle] = useState<string>('telemetry.snapshot');
  const [jsonInput, setJsonInput] = useState<string>(
    '{\n  "service": "edge-router",\n  "encryption": "AES-GCM-256",\n  "pbkdf2Iterations": 100000,\n  "chunkSize": 16384\n}'
  );
  const [jsonError, setJsonError] = useState<string>('');
  const [copiedFingerprint, setCopiedFingerprint] = useState<boolean>(false);
  const [expandedJsonIds, setExpandedJsonIds] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onSendFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStreamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = streamInput.trim();
    if (!clean) return;
    setStreamInput('');
    await onSendTerminalStreamLine(clean, streamLevel);
  };

  const handleJsonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJsonError('');
    try {
      JSON.parse(jsonInput);
    } catch (err: any) {
      setJsonError(err?.message || 'Invalid JSON syntax');
      return;
    }
    await onSendJsonPayload(jsonTitle.trim() || 'JSON Payload', jsonInput);
  };

  const handleCopyFingerprint = () => {
    if (!keyMaterial?.fingerprint) return;
    navigator.clipboard.writeText(keyMaterial.fingerprint);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-3 sm:px-5 py-3 space-y-3">
      {/* Row 1: Dual Signaling Bar + E2EE Key Derivation Status + Telemetry Gauges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-semibold">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>AES-GCM 256 · PBKDF2 (100k)</span>
          </div>

          {keyMaterial && (
            <button
              type="button"
              onClick={handleCopyFingerprint}
              title="Copy derived AES-256 key SHA-256 fingerprint"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-[11px] font-mono text-black/80 dark:text-white/80 hover:border-blue-500 cursor-pointer"
            >
              <Shield className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span>Key FP: {keyMaterial.fingerprint}</span>
              {copiedFingerprint ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3 opacity-60" />
              )}
            </button>
          )}

          {/* Dual Signaling Status Badges */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span
              className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                signalingConnected
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-neutral-200 dark:border-neutral-800 text-black/50 dark:text-white/50'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>Socket.io: {signalingConnected ? 'ONLINE' : 'STANDBY'}</span>
            </span>

            <span
              className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                broadcastActive
                  ? 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : 'border-neutral-200 dark:border-neutral-800 text-black/50 dark:text-white/50'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>BroadcastChannel: {broadcastActive ? 'ACTIVE' : 'OFF'}</span>
            </span>
          </div>
        </div>

        {/* Live Latency, Throughput & Backpressure Buffer Gauges */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-black dark:text-white">
            State: <strong className="uppercase text-blue-600 dark:text-blue-400">{rtcState}</strong>
          </span>
          <span className="px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-black dark:text-white tabular-nums">
            RTT: <strong>{latencyMs > 0 ? `${latencyMs}ms` : '<1ms'}</strong>
          </span>
          <span className="px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-black dark:text-white tabular-nums">
            Throughput: <strong>{throughputKbps} kbps</strong>
          </span>
          <span className="px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-black dark:text-white tabular-nums">
            Buffer: <strong>{formatBytes(bufferedAmountBytes)}</strong>
          </span>
          <button
            type="button"
            onClick={() => onInitiateHandshake(true)}
            title="Trigger WebRTC ICE Restart & Handshake Re-negotiation"
            className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 hover:border-blue-500 text-black dark:text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>ICE Restart ({iceRestartCount})</span>
          </button>
        </div>
      </div>

      {/* Row 2: Room ID, Shared Passphrase (PBKDF2), and Signaling Transport Mode Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-black/70 dark:text-white/70 shrink-0">
            Room:
          </span>
          <input
            type="text"
            value={roomId}
            onChange={(e) => onChangeRoomId(e.target.value)}
            placeholder="room-id"
            className="w-full px-2.5 py-1 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-black/70 dark:text-white/70 shrink-0">
            E2EE Secret:
          </span>
          <div className="relative flex-1 flex items-center">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => onChangePassphrase(e.target.value)}
              placeholder="Shared PBKDF2 passphrase..."
              className="w-full pl-2.5 pr-7 py-1 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((p) => !p)}
              className="absolute right-2 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white cursor-pointer"
              aria-label="Toggle passphrase visibility"
            >
              {showPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-1.5">
          <span className="text-[11px] font-mono text-black/70 dark:text-white/70">
            Signaling:
          </span>
          <div className="inline-flex rounded-lg border border-neutral-300 dark:border-neutral-800 p-0.5 bg-white dark:bg-black text-[11px] font-mono">
            {(['hybrid', 'socketio', 'broadcast'] as SignalingTransportMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeTransportMode(mode)}
                className={`px-2 py-0.5 rounded-md cursor-pointer capitalize ${
                  transportMode === mode
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-black/70 dark:text-white/70'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Sub-navigation for Chunked File Streaming, Terminal Log Streamer, and JSON Payload Inspector */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('files')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer border ${
              activeSubTab === 'files'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-black text-black dark:text-white border-neutral-200 dark:border-neutral-800'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>16KB Chunked File Stream ({fileTransfers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('stream')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer border ${
              activeSubTab === 'stream'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-black text-black dark:text-white border-neutral-200 dark:border-neutral-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>P2P Log Streamer ({terminalStreamLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('inspector')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer border ${
              activeSubTab === 'inspector'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-black text-black dark:text-white border-neutral-200 dark:border-neutral-800'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>JSON Inspector ({inspectedPayloads.length})</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-black/60 dark:text-white/60">
          Node ID: <span className="text-black dark:text-white font-semibold">{peerId}</span> · Room Peers: {roomPeers.length}
        </div>
      </div>

      {/* Sub-Tab 1: 16KB Chunked Binary File Streaming Pipeline */}
      {activeSubTab === 'files' && (
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-black/80 dark:text-white/80">
              Direct P2P binary streaming (16KB blocks · AES-GCM-256 encrypted · RTCDataChannel backpressure control)
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                id="p2p-binary-file-input"
              />
              <label
                htmlFor="p2p-binary-file-input"
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Stream Encrypted File (16KB Chunks)</span>
              </label>
            </div>
          </div>

          {fileTransfers.length === 0 ? (
            <div className="text-xs text-black/50 dark:text-white/50 font-mono py-2">
              No active or cached file transfers in IndexedDB. Select any file (bundle, log, image, archive) to stream over E2EE DataChannel.
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {fileTransfers.map((item) => {
                const pct =
                  item.totalChunks > 0
                    ? Math.min(100, Math.round((item.receivedChunks / item.totalChunks) * 100))
                    : 100;
                return (
                  <div
                    key={item.transferId}
                    className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex flex-col gap-1.5 text-xs font-mono"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            item.direction === 'outbound'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {item.direction}
                        </span>
                        <span className="font-semibold text-black dark:text-white truncate">
                          {item.fileName}
                        </span>
                        <span className="text-black/60 dark:text-white/60">
                          ({formatBytes(item.fileSize)} · {item.receivedChunks}/{item.totalChunks} chunks)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-black/70 dark:text-white/70">
                          {pct}%
                        </span>
                        {item.downloadUrl && (
                          <a
                            href={item.downloadUrl}
                            download={item.fileName}
                            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-sans font-medium flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Save Blob</span>
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-150"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 2: P2P Live Terminal Log Streamer */}
      {activeSubTab === 'stream' && (
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black space-y-2.5">
          <form onSubmit={handleStreamSubmit} className="flex items-center gap-2">
            <select
              value={streamLevel}
              onChange={(e) =>
                setStreamLevel(e.target.value as 'stdout' | 'stderr' | 'system')
              }
              className="px-2 py-1 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white"
            >
              <option value="stdout">stdout</option>
              <option value="stderr">stderr</option>
              <option value="system">system</option>
            </select>
            <input
              type="text"
              value={streamInput}
              onChange={(e) => setStreamInput(e.target.value)}
              placeholder="Pipe live console/stdout log line across E2EE DataChannel..."
              className="flex-1 px-2.5 py-1 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Pipe Log</span>
            </button>
            {terminalStreamLogs.length > 0 && (
              <button
                type="button"
                onClick={onClearStreamLogs}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-black/60 dark:text-white/60 hover:text-red-500 cursor-pointer"
                title="Clear persisted stream logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <div className="max-h-36 overflow-y-auto font-mono text-[11px] space-y-1 p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            {terminalStreamLogs.length === 0 ? (
              <div className="text-black/50 dark:text-white/50">
                No remote terminal logs streamed yet. Pipe a stdout/stderr line above or run a Codespace command.
              </div>
            ) : (
              terminalStreamLogs.map((log, index) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-black/40 dark:text-white/40 select-none tabular-nums w-6 text-right">
                    {index + 1}
                  </span>
                  <span className="text-black/50 dark:text-white/50 shrink-0">
                    [{log.timestamp}]
                  </span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                    @{log.senderHandle}
                  </span>
                  <span
                    className={
                      log.level === 'stderr'
                        ? 'text-red-600 dark:text-red-400'
                        : log.level === 'system'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-black dark:text-white'
                    }
                  >
                    {log.line}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Encrypted JSON Payload Inspector */}
      {activeSubTab === 'inspector' && (
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black space-y-2.5">
          <form onSubmit={handleJsonSubmit} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                value={jsonTitle}
                onChange={(e) => setJsonTitle(e.target.value)}
                placeholder="Payload title (e.g. state.snapshot)"
                className="px-2.5 py-1 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white"
              />
              <button
                type="submit"
                className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>Encrypt & Broadcast JSON</span>
              </button>
            </div>
            <textarea
              rows={3}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="w-full p-2 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none"
            />
            {jsonError && (
              <div className="text-xs text-red-600 dark:text-red-400 font-mono">{jsonError}</div>
            )}
          </form>

          {inspectedPayloads.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
              {inspectedPayloads.map((item) => {
                const isExpanded = expandedJsonIds[item.id] ?? true;
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-2 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedJsonIds((p) => ({ ...p, [item.id]: !isExpanded }))
                        }
                        className="flex items-center gap-1.5 font-semibold text-black dark:text-white cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                        <span>{item.title}</span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400">
                          @{item.senderHandle}
                        </span>
                      </button>
                      <span className="text-[10px] text-black/60 dark:text-white/60">
                        {item.byteSize} B · {item.timestamp} · AES-GCM-256
                      </span>
                    </div>
                    {isExpanded && (
                      <pre className="p-2 rounded bg-neutral-100 dark:bg-neutral-950 text-[11px] text-emerald-700 dark:text-emerald-400 overflow-x-auto">
                        {typeof item.parsed === 'object'
                          ? JSON.stringify(item.parsed, null, 2)
                          : item.rawJson}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
