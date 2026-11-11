import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  deriveRoomKey,
  encryptStringPayload,
  decryptStringPayload,
  encryptBinaryChunk,
  decryptBinaryChunk,
  EncryptedEnvelope,
  DerivedKeyMaterial,
} from '../utils/cryptoEngine';
import {
  StoredFileTransferManifest,
  StoredTerminalStreamLog,
  saveTransferManifestsToIdb,
  loadTransferManifestsFromIdb,
  saveStreamLogsToIdb,
  loadStreamLogsFromIdb,
} from '../utils/p2pStorage';
import { ChatMessage } from '../data/mockWorkspaceData';

export type SignalingTransportMode = 'socketio' | 'broadcast' | 'hybrid';
export type WebRtcConnectionState =
  | 'disconnected'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface P2PRoomPeer {
  peerId: string;
  handle: string;
  displayName: string;
  transport: 'socketio' | 'broadcast';
  joinedAt: string;
}

export interface P2PWirePacket {
  packetId: string;
  type:
    | 'ENCRYPTED_CHAT'
    | 'ENCRYPTED_REACTION'
    | 'FILE_META'
    | 'FILE_CHUNK'
    | 'TERMINAL_STREAM'
    | 'JSON_INSPECT_PAYLOAD'
    | 'PING'
    | 'PONG';
  senderId: string;
  senderHandle: string;
  senderName: string;
  roomId: string;
  timestamp: number;
  envelope?: EncryptedEnvelope;
  // For chunked binary transfers
  transferId?: string;
  chunkIndex?: number;
  totalChunks?: number;
  // For ping/pong latency measurement
  pingSentAt?: number;
}

export interface InspectedJsonPayload {
  id: string;
  senderHandle: string;
  title: string;
  rawJson: string;
  parsed: unknown;
  timestamp: string;
  byteSize: number;
  encrypted: boolean;
}

export const CHUNK_SIZE_BYTES = 16384; // Strict 16KB (16,384 bytes) file stream chunks
export const MAX_BUFFER_HIGH_WATERMARK = 262144; // 256KB bufferedAmount high-watermark threshold
export const BUFFER_LOW_WATERMARK = 65536; // 64KB bufferedAmountLowThreshold resume mark

export type DataChannelReadyState = 'connecting' | 'open' | 'closing' | 'closed';

export interface P2PDataChannelBackpressureMetrics {
  chunkSizeBytes: number;
  bufferedAmountBytes: number;
  highWatermarkBytes: number;
  lowWatermarkBytes: number;
  backpressurePaused: boolean;
  backpressureEventsCount: number;
  dataChannelState: DataChannelReadyState;
}

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface UseP2PEngineOptions {
  roomId: string;
  passphrase: string;
  localHandle: string;
  localDisplayName: string;
  transportMode: SignalingTransportMode;
  onIncomingChatMessage?: (peerHandle: string, msg: ChatMessage) => void;
  onIncomingReaction?: (peerHandle: string, messageId: string, emoji: string, senderHandle: string) => void;
}

export function useP2PEngine({
  roomId,
  passphrase,
  localHandle,
  localDisplayName,
  transportMode,
  onIncomingChatMessage,
  onIncomingReaction,
}: UseP2PEngineOptions) {
  const [peerId] = useState<string>(() => `peer_${Math.random().toString(36).slice(2, 10)}`);
  const [rtcState, setRtcState] = useState<WebRtcConnectionState>('disconnected');
  const [dataChannelState, setDataChannelState] = useState<DataChannelReadyState>('closed');
  const [signalingConnected, setSignalingConnected] = useState<boolean>(false);
  const [broadcastActive, setBroadcastActive] = useState<boolean>(false);
  const [roomPeers, setRoomPeers] = useState<P2PRoomPeer[]>([]);
  const [keyMaterial, setKeyMaterial] = useState<DerivedKeyMaterial | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [throughputKbps, setThroughputKbps] = useState<number>(0);
  const [bufferedAmountBytes, setBufferedAmountBytes] = useState<number>(0);
  const [backpressurePaused, setBackpressurePaused] = useState<boolean>(false);
  const [backpressureEventsCount, setBackpressureEventsCount] = useState<number>(0);
  const [iceRestartCount, setIceRestartCount] = useState<number>(0);

  // Chunked File Transfers & Terminal Stream Logs
  const [fileTransfers, setFileTransfers] = useState<StoredFileTransferManifest[]>([]);
  const [terminalStreamLogs, setTerminalStreamLogs] = useState<StoredTerminalStreamLog[]>([]);
  const [inspectedPayloads, setInspectedPayloads] = useState<InspectedJsonPayload[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const keyMaterialRef = useRef<DerivedKeyMaterial | null>(null);
  const incomingFileBuffersRef = useRef<
    Record<
      string,
      {
        meta: StoredFileTransferManifest;
        chunks: Uint8Array[];
        receivedCount: number;
        startedAt: number;
      }
    >
  >({});
  const seenPacketIdsRef = useRef<Set<string>>(new Set());

  const onIncomingChatRef = useRef(onIncomingChatMessage);
  const onIncomingReactionRef = useRef(onIncomingReaction);
  useEffect(() => {
    onIncomingChatRef.current = onIncomingChatMessage;
    onIncomingReactionRef.current = onIncomingReaction;
  }, [onIncomingChatMessage, onIncomingReaction]);

  // Load persisted manifests & terminal stream logs from IndexedDB on mount
  useEffect(() => {
    loadTransferManifestsFromIdb().then((items) => {
      if (items.length > 0) setFileTransfers(items);
    });
    loadStreamLogsFromIdb().then((logs) => {
      if (logs.length > 0) setTerminalStreamLogs(logs);
    });
  }, []);

  // Derive 256-bit AES-GCM CryptoKey via PBKDF2 (100,000 iterations) whenever roomId or passphrase changes
  useEffect(() => {
    let cancelled = false;
    deriveRoomKey(passphrase, roomId)
      .then((derived) => {
        if (!cancelled) {
          keyMaterialRef.current = derived;
          setKeyMaterial(derived);
        }
      })
      .catch((err) => {
        console.error('E2EE PBKDF2 key derivation error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [passphrase, roomId]);

  // Process incoming wire packets (from WebRTC DataChannel, BroadcastChannel fallback, or Socket.io E2EE relay)
  const handleWirePacket = useCallback(
    async (packet: P2PWirePacket) => {
      if (!packet || packet.senderId === peerId) return;
      if (seenPacketIdsRef.current.has(packet.packetId)) return;
      seenPacketIdsRef.current.add(packet.packetId);

      if (packet.type === 'PING') {
        const pongPacket: P2PWirePacket = {
          packetId: `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'PONG',
          senderId: peerId,
          senderHandle: localHandle,
          senderName: localDisplayName,
          roomId,
          timestamp: Date.now(),
          pingSentAt: packet.pingSentAt || packet.timestamp,
        };
        sendRawWirePacket(pongPacket);
        return;
      }

      if (packet.type === 'PONG' && packet.pingSentAt) {
        const rtt = Math.max(1, Date.now() - packet.pingSentAt);
        setLatencyMs(rtt);
        return;
      }

      const activeKey = keyMaterialRef.current;
      if (!activeKey || !packet.envelope) return;

      try {
        if (packet.type === 'ENCRYPTED_CHAT') {
          const decryptedJson = await decryptStringPayload(activeKey.key, packet.envelope);
          const chatObj = JSON.parse(decryptedJson) as ChatMessage;
          onIncomingChatRef.current?.(packet.senderHandle, {
            ...chatObj,
            senderRole: 'peer',
          });
        } else if (packet.type === 'ENCRYPTED_REACTION') {
          const decryptedJson = await decryptStringPayload(activeKey.key, packet.envelope);
          const reactionData = JSON.parse(decryptedJson) as {
            messageId: string;
            emoji: string;
            senderHandle: string;
          };
          onIncomingReactionRef.current?.(
            packet.senderHandle,
            reactionData.messageId,
            reactionData.emoji,
            reactionData.senderHandle
          );
        } else if (packet.type === 'TERMINAL_STREAM') {
          const decryptedText = await decryptStringPayload(activeKey.key, packet.envelope);
          const parsed = JSON.parse(decryptedText) as {
            line: string;
            level: 'stdout' | 'stderr' | 'system';
          };
          const newEntry: StoredTerminalStreamLog = {
            id: packet.packetId,
            senderHandle: packet.senderHandle,
            line: parsed.line,
            level: parsed.level || 'stdout',
            timestamp: new Date(packet.timestamp).toLocaleTimeString(),
            encrypted: true,
          };
          setTerminalStreamLogs((prev) => {
            const next = [...prev, newEntry].slice(-250);
            saveStreamLogsToIdb(next);
            return next;
          });
        } else if (packet.type === 'JSON_INSPECT_PAYLOAD') {
          const decryptedText = await decryptStringPayload(activeKey.key, packet.envelope);
          const parsedMeta = JSON.parse(decryptedText) as {
            title: string;
            rawJson: string;
          };
          let parsedObj: unknown = parsedMeta.rawJson;
          try {
            parsedObj = JSON.parse(parsedMeta.rawJson);
          } catch {
            // Keep raw
          }
          setInspectedPayloads((prev) => [
            {
              id: packet.packetId,
              senderHandle: packet.senderHandle,
              title: parsedMeta.title || 'Peer JSON Payload',
              rawJson: parsedMeta.rawJson,
              parsed: parsedObj,
              timestamp: new Date(packet.timestamp).toLocaleTimeString(),
              byteSize: new Blob([parsedMeta.rawJson]).size,
              encrypted: true,
            },
            ...prev,
          ]);
        } else if (packet.type === 'FILE_META') {
          const decryptedMetaStr = await decryptStringPayload(activeKey.key, packet.envelope);
          const metaObj = JSON.parse(decryptedMetaStr) as {
            transferId: string;
            fileName: string;
            fileSize: number;
            mimeType: string;
            totalChunks: number;
          };

          const manifest: StoredFileTransferManifest = {
            transferId: metaObj.transferId,
            fileName: metaObj.fileName,
            fileSize: metaObj.fileSize,
            mimeType: metaObj.mimeType || 'application/octet-stream',
            totalChunks: metaObj.totalChunks,
            receivedChunks: 0,
            senderHandle: packet.senderHandle,
            timestamp: new Date().toLocaleTimeString(),
            direction: 'inbound',
            status: 'streaming',
          };

          incomingFileBuffersRef.current[metaObj.transferId] = {
            meta: manifest,
            chunks: new Array(metaObj.totalChunks),
            receivedCount: 0,
            startedAt: performance.now(),
          };

          setFileTransfers((prev) => {
            const next = [manifest, ...prev.filter((m) => m.transferId !== manifest.transferId)];
            saveTransferManifestsToIdb(next);
            return next;
          });
        } else if (
          packet.type === 'FILE_CHUNK' &&
          packet.transferId !== undefined &&
          packet.chunkIndex !== undefined
        ) {
          const holder = incomingFileBuffersRef.current[packet.transferId];
          if (!holder) return;

          const decryptedChunk = await decryptBinaryChunk(activeKey.key, packet.envelope);
          holder.chunks[packet.chunkIndex] = decryptedChunk;
          holder.receivedCount += 1;

          const elapsedSec = Math.max(0.05, (performance.now() - holder.startedAt) / 1000);
          const bytesSoFar = holder.receivedCount * CHUNK_SIZE_BYTES;
          const kbps = Math.round((bytesSoFar * 8) / 1000 / elapsedSec);
          setThroughputKbps(kbps);

          const isComplete = holder.receivedCount >= holder.meta.totalChunks;
          let downloadUrl: string | undefined;

          if (isComplete) {
            const blob = new Blob(holder.chunks as unknown as BlobPart[], {
              type: holder.meta.mimeType || 'application/octet-stream',
            });
            downloadUrl = URL.createObjectURL(blob);
          }

          setFileTransfers((prev) => {
            const next = prev.map((item) =>
              item.transferId === packet.transferId
                ? {
                    ...item,
                    receivedChunks: holder.receivedCount,
                    status: isComplete ? ('completed' as const) : ('streaming' as const),
                    downloadUrl: downloadUrl || item.downloadUrl,
                    throughputKbps: kbps,
                  }
                : item
            );
            saveTransferManifestsToIdb(next);
            return next;
          });
        }
      } catch (err) {
        console.warn('Failed to decrypt or process E2EE packet (check shared room secret):', err);
      }
    },
    [peerId, localHandle, localDisplayName, roomId]
  );

  // Send raw wire packet over open WebRTC DataChannel, with automatic fallback to BroadcastChannel & Socket.io relay
  const sendRawWirePacket = useCallback((packet: P2PWirePacket) => {
    const serialized = JSON.stringify(packet);
    let sentViaDataChannel = false;

    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(serialized);
        setBufferedAmountBytes(dc.bufferedAmount);
        sentViaDataChannel = true;
      } catch {
        sentViaDataChannel = false;
      }
    }

    // Also broadcast on local BroadcastChannel so multi-tab testing works immediately with zero config
    if (broadcastRef.current) {
      try {
        broadcastRef.current.postMessage({
          kind: 'WIRE_PACKET',
          packet,
        });
      } catch {
        // Ignore closed channel
      }
    }

    // If WebRTC DataChannel isn't open yet, relay the E2EE encrypted envelope over Socket.io
    if (!sentViaDataChannel && socketRef.current?.connected) {
      socketRef.current.emit('p2p:encrypted-packet', packet);
    }
  }, []);

  // Monitor RTCDataChannel bufferedAmount and pause chunk transmission when exceeding high watermark
  const waitForDataChannelBackpressureDrain = useCallback(
    async (dc: RTCDataChannel): Promise<void> => {
      if (dc.readyState !== 'open') return;
      setBufferedAmountBytes(dc.bufferedAmount);
      if (dc.bufferedAmount <= MAX_BUFFER_HIGH_WATERMARK) {
        return;
      }

      setBackpressurePaused(true);
      setBackpressureEventsCount((c) => c + 1);

      await new Promise<void>((resolve) => {
        let settled = false;
        let pollTimer: ReturnType<typeof setInterval> | null = null;

        const finish = () => {
          if (settled) return;
          settled = true;
          if (pollTimer) clearInterval(pollTimer);
          dc.removeEventListener('bufferedamountlow', onLow);
          setBufferedAmountBytes(dc.bufferedAmount);
          setBackpressurePaused(false);
          resolve();
        };

        const onLow = () => {
          finish();
        };

        dc.bufferedAmountLowThreshold = BUFFER_LOW_WATERMARK;
        dc.addEventListener('bufferedamountlow', onLow);

        pollTimer = setInterval(() => {
          setBufferedAmountBytes(dc.bufferedAmount);
          if (dc.readyState !== 'open' || dc.bufferedAmount <= BUFFER_LOW_WATERMARK) {
            finish();
          }
        }, 12);
      });
    },
    []
  );

  // Setup WebRTC RTCPeerConnection + RTCDataChannel
  const createPeerConnection = useCallback(
    (targetPeerId?: string) => {
      if (peerConnRef.current) {
        try {
          peerConnRef.current.close();
        } catch {
          // Ignore
        }
      }

      const pc = new RTCPeerConnection(STUN_SERVERS);
      peerConnRef.current = pc;

      const attachDataChannelHandlers = (channel: RTCDataChannel) => {
        channel.binaryType = 'arraybuffer';
        channel.bufferedAmountLowThreshold = BUFFER_LOW_WATERMARK;
        setDataChannelState(channel.readyState as DataChannelReadyState);

        channel.onopen = () => {
          setRtcState('connected');
          setDataChannelState('open');
          setBufferedAmountBytes(channel.bufferedAmount);
          setBackpressurePaused(false);
        };
        channel.onclose = () => {
          setRtcState('disconnected');
          setDataChannelState('closed');
          setBackpressurePaused(false);
        };
        channel.onerror = () => {
          setRtcState('reconnecting');
          setDataChannelState(channel.readyState as DataChannelReadyState);
        };
        channel.onbufferedamountlow = () => {
          setBufferedAmountBytes(channel.bufferedAmount);
          setBackpressurePaused(false);
        };
        channel.onmessage = (event) => {
          try {
            const textPayload =
              typeof event.data === 'string'
                ? event.data
                : new TextDecoder().decode(event.data as ArrayBuffer);
            const parsed = JSON.parse(textPayload) as P2PWirePacket;
            handleWirePacket(parsed);
          } catch {
            // Ignore malformed frame
          }
        };
      };

      const dc = pc.createDataChannel('nerve-e2ee-dc', { ordered: true });
      dataChannelRef.current = dc;
      attachDataChannelHandlers(dc);

      pc.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        attachDataChannelHandlers(event.channel);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const payload = {
            roomId,
            fromPeerId: peerId,
            toPeerId: targetPeerId,
            candidate: event.candidate.toJSON(),
          };
          socketRef.current?.emit('webrtc:ice-candidate', payload);
          broadcastRef.current?.postMessage({ kind: 'WEBRTC_ICE', payload });
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          setRtcState('connected');
        } else if (st === 'connecting') {
          setRtcState('connecting');
        } else if (st === 'disconnected' || st === 'failed') {
          setRtcState('reconnecting');
        }
      };

      return pc;
    },
    [roomId, peerId, handleWirePacket]
  );

  // Trigger graceful ICE restart & WebRTC handshake
  const initiateWebRtcHandshake = useCallback(
    async (isIceRestart = false) => {
      try {
        setRtcState('connecting');
        if (isIceRestart) {
          setIceRestartCount((c) => c + 1);
        }
        const pc = createPeerConnection();
        const offer = await pc.createOffer({ iceRestart: isIceRestart });
        await pc.setLocalDescription(offer);

        const signalPayload = {
          roomId,
          fromPeerId: peerId,
          handle: localHandle,
          displayName: localDisplayName,
          sdp: pc.localDescription,
        };

        socketRef.current?.emit('webrtc:offer', signalPayload);
        broadcastRef.current?.postMessage({ kind: 'WEBRTC_OFFER', payload: signalPayload });
      } catch (err) {
        console.warn('WebRTC offer creation warning:', err);
        setRtcState('signaling');
      }
    },
    [createPeerConnection, roomId, peerId, localHandle, localDisplayName]
  );

  // Initialize Dual Signaling: Socket.io Server + Local BroadcastChannel Fallback
  useEffect(() => {
    const cleanRoom = roomId.trim() || 'global-dev-room';

    // 1. Local BroadcastChannel Fallback (Zero-config multi-tab P2P on same machine)
    let bc: BroadcastChannel | null = null;
    if (
      typeof window !== 'undefined' &&
      'BroadcastChannel' in window &&
      (transportMode === 'broadcast' || transportMode === 'hybrid')
    ) {
      bc = new BroadcastChannel(`nerve_p2p_room_${cleanRoom}`);
      broadcastRef.current = bc;
      setBroadcastActive(true);

      bc.onmessage = async (ev) => {
        const data = ev.data;
        if (!data) return;

        if (data.kind === 'PEER_ANNOUNCE' && data.peer?.peerId !== peerId) {
          setRoomPeers((prev) => {
            const exists = prev.some((p) => p.peerId === data.peer.peerId);
            if (exists) return prev;
            return [...prev, data.peer];
          });
          setRtcState((prev) => (prev === 'disconnected' ? 'connected' : prev));
          if (
            (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') &&
            peerId < data.peer.peerId
          ) {
            initiateWebRtcHandshake(false);
          }
        } else if (data.kind === 'WEBRTC_OFFER' && data.payload?.fromPeerId !== peerId) {
          try {
            const pc = createPeerConnection(data.payload.fromPeerId);
            await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            bc?.postMessage({
              kind: 'WEBRTC_ANSWER',
              payload: {
                roomId: cleanRoom,
                fromPeerId: peerId,
                toPeerId: data.payload.fromPeerId,
                sdp: pc.localDescription,
              },
            });
          } catch {
            // Ignore SDP glare
          }
        } else if (data.kind === 'WEBRTC_ANSWER' && data.payload?.fromPeerId !== peerId) {
          try {
            const pc = peerConnRef.current;
            if (pc && pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
              setRtcState('connected');
            }
          } catch {
            // Ignore
          }
        } else if (data.kind === 'WEBRTC_ICE' && data.payload?.fromPeerId !== peerId) {
          try {
            const pc = peerConnRef.current;
            if (pc && data.payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(data.payload.candidate));
            }
          } catch {
            // Ignore
          }
        } else if (data.kind === 'WIRE_PACKET' && data.packet) {
          handleWirePacket(data.packet);
        }
      };

      // Announce presence on BroadcastChannel
      bc.postMessage({
        kind: 'PEER_ANNOUNCE',
        peer: {
          peerId,
          handle: localHandle,
          displayName: localDisplayName,
          transport: 'broadcast',
          joinedAt: new Date().toLocaleTimeString(),
        } as P2PRoomPeer,
      });
    } else {
      setBroadcastActive(false);
    }

    // 2. Socket.io WebSocket Signaling Server
    let socket: Socket | null = null;
    if (transportMode === 'socketio' || transportMode === 'hybrid') {
      socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1500,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setSignalingConnected(true);
        setRtcState((prev) => (prev === 'disconnected' ? 'signaling' : prev));
        socket?.emit('room:join', {
          roomId: cleanRoom,
          peerId,
          handle: localHandle,
          displayName: localDisplayName,
        });
      });

      socket.on('disconnect', () => {
        setSignalingConnected(false);
      });

      socket.on('room:peers', (peersList: P2PRoomPeer[]) => {
        const others = (peersList || []).filter((p) => p.peerId !== peerId);
        setRoomPeers(others);
        if (others.length > 0) {
          setRtcState('connected');
          const shouldOffer = others.some((p) => peerId < p.peerId);
          if (
            shouldOffer &&
            (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open')
          ) {
            initiateWebRtcHandshake(false);
          }
        }
      });

      socket.on('webrtc:offer', async (payload: any) => {
        if (!payload || payload.fromPeerId === peerId) return;
        try {
          const pc = createPeerConnection(payload.fromPeerId);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket?.emit('webrtc:answer', {
            roomId: cleanRoom,
            fromPeerId: peerId,
            toPeerId: payload.fromPeerId,
            sdp: pc.localDescription,
          });
        } catch {
          // Ignore glare
        }
      });

      socket.on('webrtc:answer', async (payload: any) => {
        if (!payload || payload.fromPeerId === peerId) return;
        try {
          const pc = peerConnRef.current;
          if (pc && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            setRtcState('connected');
          }
        } catch {
          // Ignore
        }
      });

      socket.on('webrtc:ice-candidate', async (payload: any) => {
        if (!payload || payload.fromPeerId === peerId) return;
        try {
          const pc = peerConnRef.current;
          if (pc && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        } catch {
          // Ignore
        }
      });

      socket.on('p2p:encrypted-packet', (packet: P2PWirePacket) => {
        handleWirePacket(packet);
      });
    } else {
      setSignalingConnected(false);
    }

    return () => {
      if (bc) {
        bc.close();
        broadcastRef.current = null;
      }
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
      if (peerConnRef.current) {
        peerConnRef.current.close();
        peerConnRef.current = null;
      }
    };
  }, [
    roomId,
    transportMode,
    peerId,
    localHandle,
    localDisplayName,
    createPeerConnection,
    handleWirePacket,
    initiateWebRtcHandshake,
  ]);

  // Periodic Ping to measure live P2P round-trip latency
  useEffect(() => {
    const interval = setInterval(() => {
      if (signalingConnected || broadcastActive) {
        const pingPacket: P2PWirePacket = {
          packetId: `ping_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'PING',
          senderId: peerId,
          senderHandle: localHandle,
          senderName: localDisplayName,
          roomId,
          timestamp: Date.now(),
          pingSentAt: Date.now(),
        };
        sendRawWirePacket(pingPacket);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [signalingConnected, broadcastActive, peerId, localHandle, localDisplayName, roomId, sendRawWirePacket]);

  // 1. Send E2EE Chat Message
  const sendEncryptedChatMessage = useCallback(
    async (msg: ChatMessage): Promise<EncryptedEnvelope | null> => {
      const activeKey = keyMaterialRef.current;
      if (!activeKey) return null;

      const envelope = await encryptStringPayload(
        activeKey.key,
        JSON.stringify(msg),
        activeKey.saltBase64
      );

      const packet: P2PWirePacket = {
        packetId: `chat_${msg.id}_${Date.now()}`,
        type: 'ENCRYPTED_CHAT',
        senderId: peerId,
        senderHandle: localHandle,
        senderName: localDisplayName,
        roomId,
        timestamp: Date.now(),
        envelope,
      };

      sendRawWirePacket(packet);
      return envelope;
    },
    [peerId, localHandle, localDisplayName, roomId, sendRawWirePacket]
  );

  // 2. Send E2EE Reaction Toggle
  const sendEncryptedReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const activeKey = keyMaterialRef.current;
      if (!activeKey) return;

      const envelope = await encryptStringPayload(
        activeKey.key,
        JSON.stringify({ messageId, emoji, senderHandle: localHandle }),
        activeKey.saltBase64
      );

      const packet: P2PWirePacket = {
        packetId: `react_${messageId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'ENCRYPTED_REACTION',
        senderId: peerId,
        senderHandle: localHandle,
        senderName: localDisplayName,
        roomId,
        timestamp: Date.now(),
        envelope,
      };

      sendRawWirePacket(packet);
    },
    [peerId, localHandle, localDisplayName, roomId, sendRawWirePacket]
  );

  // 3. Chunked Binary File Streaming Pipeline (16KB blocks + RTCDataChannel Backpressure Control)
  const sendEncryptedFileTransfer = useCallback(
    async (file: File) => {
      const activeKey = keyMaterialRef.current;
      if (!activeKey) return;

      const transferId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const arrayBuffer = await file.arrayBuffer();
      const totalBytes = arrayBuffer.byteLength;
      const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE_BYTES));

      const localDownloadUrl = URL.createObjectURL(file);

      const initialManifest: StoredFileTransferManifest = {
        transferId,
        fileName: file.name,
        fileSize: totalBytes,
        mimeType: file.type || 'application/octet-stream',
        totalChunks,
        receivedChunks: 0,
        senderHandle: localHandle,
        timestamp: new Date().toLocaleTimeString(),
        direction: 'outbound',
        status: 'streaming',
        downloadUrl: localDownloadUrl,
      };

      setFileTransfers((prev) => {
        const next = [initialManifest, ...prev];
        saveTransferManifestsToIdb(next);
        return next;
      });

      // Encrypt and send File Metadata first
      const metaEnvelope = await encryptStringPayload(
        activeKey.key,
        JSON.stringify({
          transferId,
          fileName: file.name,
          fileSize: totalBytes,
          mimeType: file.type || 'application/octet-stream',
          totalChunks,
        }),
        activeKey.saltBase64
      );

      sendRawWirePacket({
        packetId: `meta_${transferId}`,
        type: 'FILE_META',
        senderId: peerId,
        senderHandle: localHandle,
        senderName: localDisplayName,
        roomId,
        timestamp: Date.now(),
        envelope: metaEnvelope,
      });

      const startedAt = performance.now();

      // Stream 16KB (16,384-byte) encrypted chunks over RTCDataChannel with bufferedAmount backpressure monitoring
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const dc = dataChannelRef.current;
        if (dc && dc.readyState === 'open') {
          await waitForDataChannelBackpressureDrain(dc);
        }

        const startOffset = chunkIndex * CHUNK_SIZE_BYTES;
        const endOffset = Math.min(totalBytes, startOffset + CHUNK_SIZE_BYTES);
        const slice = new Uint8Array(arrayBuffer.slice(startOffset, endOffset));

        const chunkEnvelope = await encryptBinaryChunk(
          activeKey.key,
          slice,
          activeKey.saltBase64
        );

        sendRawWirePacket({
          packetId: `chk_${transferId}_${chunkIndex}`,
          type: 'FILE_CHUNK',
          senderId: peerId,
          senderHandle: localHandle,
          senderName: localDisplayName,
          roomId,
          timestamp: Date.now(),
          transferId,
          chunkIndex,
          totalChunks,
          envelope: chunkEnvelope,
        });

        if (dc && dc.readyState === 'open') {
          setBufferedAmountBytes(dc.bufferedAmount);
        }

        const elapsedSec = Math.max(0.05, (performance.now() - startedAt) / 1000);
        const kbps = Math.round(((endOffset * 8) / 1000) / elapsedSec);
        setThroughputKbps(kbps);

        const completedCount = chunkIndex + 1;
        const isDone = completedCount >= totalChunks;

        setFileTransfers((prev) => {
          const next = prev.map((m) =>
            m.transferId === transferId
              ? {
                  ...m,
                  receivedChunks: completedCount,
                  status: isDone ? ('completed' as const) : ('streaming' as const),
                  throughputKbps: kbps,
                }
              : m
          );
          if (isDone) saveTransferManifestsToIdb(next);
          return next;
        });

        // Yield briefly every 4 chunks to keep UI 60fps responsive
        if (chunkIndex % 4 === 0) {
          await new Promise((r) => setTimeout(r, 4));
        }
      }
    },
    [
      peerId,
      localHandle,
      localDisplayName,
      roomId,
      sendRawWirePacket,
      waitForDataChannelBackpressureDrain,
    ]
  );

  // 4. Broadcast Encrypted Terminal Log Line across P2P DataChannel
  const sendEncryptedTerminalLog = useCallback(
    async (line: string, level: 'stdout' | 'stderr' | 'system' = 'stdout') => {
      const activeKey = keyMaterialRef.current;
      const entry: StoredTerminalStreamLog = {
        id: `tlog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        senderHandle: localHandle,
        line,
        level,
        timestamp: new Date().toLocaleTimeString(),
        encrypted: true,
      };

      setTerminalStreamLogs((prev) => {
        const next = [...prev, entry].slice(-250);
        saveStreamLogsToIdb(next);
        return next;
      });

      if (!activeKey) return;

      const envelope = await encryptStringPayload(
        activeKey.key,
        JSON.stringify({ line, level }),
        activeKey.saltBase64
      );

      sendRawWirePacket({
        packetId: entry.id,
        type: 'TERMINAL_STREAM',
        senderId: peerId,
        senderHandle: localHandle,
        senderName: localDisplayName,
        roomId,
        timestamp: Date.now(),
        envelope,
      });
    },
    [peerId, localHandle, localDisplayName, roomId, sendRawWirePacket]
  );

  // 5. Broadcast Encrypted JSON Payload for Peer Inspection
  const sendEncryptedJsonPayload = useCallback(
    async (title: string, rawJson: string) => {
      const activeKey = keyMaterialRef.current;
      let parsedObj: unknown = rawJson;
      try {
        parsedObj = JSON.parse(rawJson);
      } catch {
        // Keep string
      }

      const id = `json_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const item: InspectedJsonPayload = {
        id,
        senderHandle: localHandle,
        title: title || 'JSON Payload',
        rawJson,
        parsed: parsedObj,
        timestamp: new Date().toLocaleTimeString(),
        byteSize: new Blob([rawJson]).size,
        encrypted: true,
      };

      setInspectedPayloads((prev) => [item, ...prev]);

      if (!activeKey) return;
      const envelope = await encryptStringPayload(
        activeKey.key,
        JSON.stringify({ title: item.title, rawJson }),
        activeKey.saltBase64
      );

      sendRawWirePacket({
        packetId: id,
        type: 'JSON_INSPECT_PAYLOAD',
        senderId: peerId,
        senderHandle: localHandle,
        senderName: localDisplayName,
        roomId,
        timestamp: Date.now(),
        envelope,
      });
    },
    [peerId, localHandle, localDisplayName, roomId, sendRawWirePacket]
  );

  const clearTerminalStreamLogs = useCallback(() => {
    setTerminalStreamLogs([]);
    saveStreamLogsToIdb([]);
  }, []);

  return {
    peerId,
    rtcState,
    dataChannelState,
    signalingConnected,
    broadcastActive,
    roomPeers,
    keyMaterial,
    latencyMs,
    throughputKbps,
    bufferedAmountBytes,
    backpressurePaused,
    backpressureEventsCount,
    chunkSizeBytes: CHUNK_SIZE_BYTES,
    highWatermarkBytes: MAX_BUFFER_HIGH_WATERMARK,
    lowWatermarkBytes: BUFFER_LOW_WATERMARK,
    iceRestartCount,
    fileTransfers,
    terminalStreamLogs,
    inspectedPayloads,
    initiateWebRtcHandshake,
    sendEncryptedChatMessage,
    sendEncryptedReaction,
    sendEncryptedFileTransfer,
    sendEncryptedTerminalLog,
    sendEncryptedJsonPayload,
    clearTerminalStreamLogs,
  };
}

/**
 * P2PDataChannel hook (`useP2PDataChannel` / `P2PDataChannel`)
 * Establishes direct peer-to-peer WebRTC RTCDataChannels for chat and streams
 * 16KB (16,384-byte) encrypted file chunks with `bufferedAmount` backpressure monitoring.
 */
export function useP2PDataChannel(options: UseP2PEngineOptions) {
  return useP2PEngine(options);
}

export const P2PDataChannel = useP2PDataChannel;

