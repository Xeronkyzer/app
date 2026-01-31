import { io, Socket } from 'socket.io-client';
import pako from 'pako';

// Configuration - use localhost for dev
const SIGNALING_SERVER = 'http://localhost:3001';

type SignalData = {
    type: 'offer' | 'answer' | 'ice-candidate';
    sdp?: string;
    candidate?: RTCIceCandidateInit;
};

export class WebRTCManager {
    peerConnection: RTCPeerConnection;
    dataChannel: RTCDataChannel | null = null;
    socket: Socket | null = null;
    roomCode: string = '';
    isHost: boolean = false;
    private pendingCandidates: RTCIceCandidateInit[] = [];

    onStatusChange: (status: string) => void;
    onProgress: (progress: number, status: string) => void;
    onFileReceived: (file: Blob, name: string) => void;
    onRoomCreated: (code: string) => void;

    private receiveBuffer: ArrayBuffer[] = [];
    private receivedSize = 0;
    private expectedSize = 0;
    private expectedName = '';
    private expectedType = '';

    constructor(
        onStatusChange: (status: string) => void,
        onProgress: (progress: number, status: string) => void,
        onFileReceived: (file: Blob, name: string) => void,
        onRoomCreated: (code: string) => void = () => { }
    ) {
        this.onStatusChange = onStatusChange;
        this.onProgress = onProgress;
        this.onFileReceived = onFileReceived;
        this.onRoomCreated = onRoomCreated;

        // Create peer connection with ICE servers for NAT traversal
        // For localhost testing (same machine), STUN is sufficient
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            // Allow all candidate types including host candidates (needed for localhost)
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        });

        // Connection state monitoring
        this.peerConnection.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.onStatusChange('connected');
            } else if (this.peerConnection.connectionState === 'failed') {
                this.onStatusChange('failed');
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[WebRTC] ICE connection state:', this.peerConnection.iceConnectionState);
            // If ICE fails, notify the user
            if (this.peerConnection.iceConnectionState === 'failed') {
                console.error('[WebRTC] ICE connection failed - may need TURN server');
            }
        };

        this.peerConnection.onicegatheringstatechange = () => {
            console.log('[WebRTC] ICE gathering state:', this.peerConnection.iceGatheringState);
        };

        // Handle incoming data channel (for non-host)
        this.peerConnection.ondatachannel = (event) => {
            console.log('[WebRTC] Received data channel');
            this.setupDataChannel(event.channel);
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const candidateType = event.candidate.type || 'unknown';
                console.log('[WebRTC] New ICE candidate:', candidateType, event.candidate.candidate?.substring(0, 50) + '...');
                if (this.socket && this.roomCode) {
                    this.socket.emit('signal', {
                        roomCode: this.roomCode,
                        data: { type: 'ice-candidate', candidate: event.candidate.toJSON() }
                    });
                }
            } else {
                console.log('[WebRTC] ICE candidate gathering complete');
            }
        };
    }

    // ============================================
    // SOCKET CONNECTION
    // ============================================

    connectSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket?.connected) {
                console.log('[Socket] Already connected');
                resolve();
                return;
            }

            console.log('[Socket] Connecting to signaling server:', SIGNALING_SERVER);

            this.socket = io(SIGNALING_SERVER, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 3
            });

            // Connection timeout
            const timeout = setTimeout(() => {
                console.error('[Socket] Connection timeout');
                this.onStatusChange('error');
                reject(new Error('Socket connection timeout'));
            }, 15000);

            this.socket.on('connect', () => {
                clearTimeout(timeout);
                console.log('[Socket] Connected to signaling server, socket id:', this.socket?.id);
                resolve();
            });

            this.socket.on('disconnect', (reason) => {
                console.log('[Socket] Disconnected:', reason);
                if (reason === 'io server disconnect') {
                    // Server disconnected, try reconnect
                    this.socket?.connect();
                }
            });

            this.socket.on('signal', async (data: SignalData) => {
                console.log('[Socket] Received signal:', data.type);
                try {
                    if (data.type === 'offer') {
                        // Guest receives offer from host
                        await this.peerConnection.setRemoteDescription(
                            new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
                        );

                        // Add any pending candidates
                        for (const candidate of this.pendingCandidates) {
                            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                        this.pendingCandidates = [];

                        // Create and send answer
                        const answer = await this.peerConnection.createAnswer();
                        await this.peerConnection.setLocalDescription(answer);

                        this.socket!.emit('signal', {
                            roomCode: this.roomCode,
                            data: { type: 'answer', sdp: answer.sdp }
                        });
                        console.log('[Socket] Sent answer');

                    } else if (data.type === 'answer') {
                        // Host receives answer from guest
                        await this.peerConnection.setRemoteDescription(
                            new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
                        );
                        console.log('[Socket] Answer processed');

                        // Add any pending candidates
                        for (const candidate of this.pendingCandidates) {
                            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                        this.pendingCandidates = [];

                    } else if (data.type === 'ice-candidate' && data.candidate) {
                        // Queue candidate if remote description not set yet
                        if (this.peerConnection.remoteDescription) {
                            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                        } else {
                            this.pendingCandidates.push(data.candidate);
                        }
                    }
                } catch (e) {
                    console.error('[Socket] Signal handling error:', e);
                }
            });

            this.socket.on('guest-joined', async () => {
                console.log('[Socket] Guest joined room');

                // Host creates data channel and offer
                this.dataChannel = this.peerConnection.createDataChannel('file-transfer', {
                    ordered: true
                });
                this.setupDataChannel(this.dataChannel);

                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);

                this.socket!.emit('signal', {
                    roomCode: this.roomCode,
                    data: { type: 'offer', sdp: offer.sdp }
                });
                console.log('[Socket] Sent offer to guest');
                this.onStatusChange('connecting');
            });

            this.socket.on('peer-disconnected', () => {
                console.log('[Socket] Peer disconnected');
                this.onStatusChange('disconnected');
            });

            this.socket.on('connect_error', (err) => {
                console.error('[Socket] Connection error:', err);
                this.onStatusChange('error');
            });
        });
    }

    // ============================================
    // ROOM CODE CONNECTION
    // ============================================

    async createRoom(): Promise<string> {
        // If room already created, return existing code
        if (this.roomCode) {
            console.log('[Room] Already created, returning existing:', this.roomCode);
            return this.roomCode;
        }

        await this.connectSocket();
        this.isHost = true;

        return new Promise((resolve) => {
            this.socket!.emit('create-room', (response: { roomCode: string }) => {
                this.roomCode = response.roomCode;
                console.log('[Room] Created:', response.roomCode);
                this.onRoomCreated(response.roomCode);
                this.onStatusChange('waiting');
                resolve(response.roomCode);
            });
        });
    }

    async joinRoom(code: string): Promise<boolean> {
        console.log('[Room] Attempting to join room:', code);
        await this.connectSocket();
        this.isHost = false;
        this.roomCode = code;

        return new Promise((resolve) => {
            // Timeout for join response
            const timeout = setTimeout(() => {
                console.error('[Room] Join timeout - no response from server');
                this.onStatusChange('error');
                resolve(false);
            }, 10000);

            console.log('[Room] Emitting join-room event for code:', code);
            this.socket!.emit('join-room', code, (response: { error?: string; success?: boolean }) => {
                clearTimeout(timeout);
                console.log('[Room] join-room response:', response);
                if (response.error) {
                    console.error('[Room] Join error:', response.error);
                    this.onStatusChange('error');
                    resolve(false);
                } else {
                    console.log('[Room] Successfully joined:', code);
                    this.onStatusChange('connecting');
                    resolve(true);
                }
            });
        });
    }

    // ============================================
    // QR-BASED CONNECTION (direct, no server)
    // ============================================

    async createOffer(): Promise<string> {
        this.dataChannel = this.peerConnection.createDataChannel('file-transfer', {
            ordered: true
        });
        this.setupDataChannel(this.dataChannel);

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        await this.waitForIceGathering();

        return this.compressSDP({
            type: 'offer',
            sdp: this.peerConnection.localDescription!.sdp
        });
    }

    async handleOffer(compressedOffer: string): Promise<string> {
        const data = this.decompressSDP(compressedOffer);
        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
        );

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        await this.waitForIceGathering();

        return this.compressSDP({
            type: 'answer',
            sdp: this.peerConnection.localDescription!.sdp
        });
    }

    async handleAnswer(compressedAnswer: string) {
        const data = this.decompressSDP(compressedAnswer);
        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
        );
    }

    private async waitForIceGathering(): Promise<void> {
        if (this.peerConnection.iceGatheringState === 'complete') return;

        return new Promise((resolve) => {
            const timeout = setTimeout(resolve, 3000);

            const checkIce = () => {
                if (this.peerConnection.iceGatheringState === 'complete') {
                    clearTimeout(timeout);
                    this.peerConnection.removeEventListener('icegatheringstatechange', checkIce);
                    resolve();
                }
            };
            this.peerConnection.addEventListener('icegatheringstatechange', checkIce);
        });
    }

    // ============================================
    // DATA CHANNEL & FILE TRANSFER
    // ============================================

    setupDataChannel(channel: RTCDataChannel) {
        this.dataChannel = channel;
        this.dataChannel.binaryType = 'arraybuffer';

        this.dataChannel.onopen = () => {
            console.log('[DataChannel] Opened!');
            this.onStatusChange('connected');
        };

        this.dataChannel.onclose = () => {
            console.log('[DataChannel] Closed');
            this.onStatusChange('disconnected');
        };

        this.dataChannel.onerror = (err) => {
            console.error('[DataChannel] Error:', err);
        };

        this.dataChannel.onmessage = (event) => {
            this.handleDataMessage(event.data);
        };
    }

    async sendFile(file: File) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.error('[Transfer] Data channel not ready');
            return;
        }

        console.log('[Transfer] Sending file:', file.name, file.size);

        // Send Metadata
        const metadata = JSON.stringify({
            type: 'metadata',
            name: file.name,
            size: file.size,
            mime: file.type
        });
        this.dataChannel.send(metadata);

        // Send Chunks
        const chunkSize = 16384;
        let offset = 0;

        const sendNextChunk = () => {
            if (offset >= file.size) {
                this.onProgress(100, 'completed');
                console.log('[Transfer] Complete');
                return;
            }

            const slice = file.slice(offset, offset + chunkSize);
            const reader = new FileReader();

            reader.onload = (e) => {
                if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

                this.dataChannel.send(e.target!.result as ArrayBuffer);
                offset += chunkSize;

                const progress = Math.min(100, (offset / file.size) * 100);
                this.onProgress(progress, 'sending');

                // Flow control - wait if buffer is full
                if (this.dataChannel.bufferedAmount < 1024 * 1024) {
                    sendNextChunk();
                } else {
                    setTimeout(sendNextChunk, 50);
                }
            };
            reader.readAsArrayBuffer(slice);
        };

        sendNextChunk();
    }

    handleDataMessage(data: unknown) {
        if (typeof data === 'string') {
            try {
                const meta = JSON.parse(data);
                if (meta.type === 'metadata') {
                    console.log('[Transfer] Receiving:', meta.name, meta.size);
                    this.expectedSize = meta.size;
                    this.expectedName = meta.name;
                    this.expectedType = meta.mime;
                    this.receiveBuffer = [];
                    this.receivedSize = 0;
                    this.onProgress(0, 'receiving');
                }
            } catch (e) {
                console.error('[Transfer] Metadata parse error:', e);
            }
        } else if (data instanceof ArrayBuffer) {
            this.receiveBuffer.push(data);
            this.receivedSize += data.byteLength;

            const progress = Math.min(100, (this.receivedSize / this.expectedSize) * 100);
            this.onProgress(progress, 'receiving');

            if (this.receivedSize >= this.expectedSize) {
                const blob = new Blob(this.receiveBuffer, { type: this.expectedType });
                console.log('[Transfer] Received complete:', this.expectedName);
                this.onFileReceived(blob, this.expectedName);
                this.receiveBuffer = [];
            }
        }
    }

    // ============================================
    // COMPRESSION (for QR codes)
    // ============================================

    compressSDP(data: { type: string; sdp: string }): string {
        const json = JSON.stringify(data);
        const compressed = pako.deflate(json);
        return btoa(String.fromCharCode.apply(null, Array.from(compressed)));
    }

    decompressSDP(base64: string): { type: string; sdp: string } {
        const charData = atob(base64).split('').map(x => x.charCodeAt(0));
        const binData = new Uint8Array(charData);
        const decompressed = pako.inflate(binData, { to: 'string' });
        return JSON.parse(decompressed);
    }

    // Cleanup
    disconnect() {
        this.socket?.disconnect();
        this.dataChannel?.close();
        this.peerConnection.close();
    }
}
