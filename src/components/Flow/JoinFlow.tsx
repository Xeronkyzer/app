import { useState, useRef, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { WebRTCManager } from '../../utils/webrtc';
import QRScanner from '../QRScanner';
import { motion } from 'framer-motion';

interface JoinFlowProps {
    mode: 'qr' | 'code';
    onConnected: (mgr: WebRTCManager) => void;
}

export const JoinFlow = ({ mode, onConnected }: JoinFlowProps) => {
    const [step, setStep] = useState<'input' | 'connecting' | 'show-answer'>('input');
    const [answerData, setAnswerData] = useState('');
    const [codeInput, setCodeInput] = useState<string[]>(['', '', '', '', '', '']);
    const [error, setError] = useState('');
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const managerRef = useRef<WebRTCManager | null>(null);

    const [manager] = useState(() => {
        const mgr = new WebRTCManager(
            (status) => {
                console.log('[JoinFlow] Status:', status);
                if (status === 'connected' && managerRef.current) {
                    onConnected(managerRef.current);
                }
                if (status === 'error' || status === 'failed') {
                    setError('Connection failed. Please try again.');
                    setStep('input');
                }
            },
            () => { },
            () => { },
            () => { }
        );
        managerRef.current = mgr;
        return mgr;
    });

    const setInputRef = useCallback((index: number) => (el: HTMLInputElement | null) => {
        inputRefs.current[index] = el;
    }, []);

    const handleCodeChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;

        const newCode = [...codeInput];
        newCode[index] = value.slice(-1);
        setCodeInput(newCode);
        setError('');

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all filled
        if (newCode.every(d => d !== '') && value) {
            setTimeout(() => handleJoinRoom(newCode.join('')), 100);
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !codeInput[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            const newCode = pasted.split('');
            setCodeInput(newCode);
            setTimeout(() => handleJoinRoom(pasted), 100);
        }
    };

    const joiningRef = useRef(false);

    const handleJoinRoom = async (code: string) => {
        if (code.length !== 6) return;

        // Prevent duplicate join attempts
        if (joiningRef.current) {
            console.log('[JoinFlow] Already joining, ignoring duplicate call');
            return;
        }
        joiningRef.current = true;

        setStep('connecting');
        setError('');

        console.log('[JoinFlow] Joining room:', code);
        const success = await manager.joinRoom(code);

        if (!success) {
            joiningRef.current = false; // Reset on failure so user can retry
            setError('Room not found. Check the code and try again.');
            setStep('input');
            setCodeInput(['', '', '', '', '', '']);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
    };

    const handleScanOffer = async (data: string) => {
        try {
            if (step !== 'input') return;
            const answer = await manager.handleOffer(data);
            setAnswerData(answer);
            setStep('show-answer');
        } catch (e) {
            console.error("Invalid Offer QR", e);
            setError('Invalid QR code. Please try again.');
        }
    };

    const isCodeComplete = codeInput.every(d => d !== '');

    return (
        <div className="flow-container">

            {/* Code Input Mode */}
            {mode === 'code' && step === 'input' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flow-content"
                >
                    <h2 className="title-section">Enter Room Code</h2>
                    <p className="text-muted">Enter the 6-digit code from the sender</p>

                    <div className="code-input-group" onPaste={handlePaste}>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <input
                                key={i}
                                ref={setInputRef(i)}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={codeInput[i]}
                                onChange={(e) => handleCodeChange(i, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(i, e)}
                                className="code-input"
                                autoFocus={i === 0}
                            />
                        ))}
                    </div>

                    {error && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="error-text"
                        >
                            {error}
                        </motion.p>
                    )}

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="btn btn-primary"
                        onClick={() => handleJoinRoom(codeInput.join(''))}
                        disabled={!isCodeComplete}
                    >
                        Connect
                    </motion.button>
                </motion.div>
            )}

            {/* QR Scan Mode */}
            {mode === 'qr' && step === 'input' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flow-content"
                >
                    <h2 className="title-section">Scan Sender's Code</h2>
                    <QRScanner onScan={handleScanOffer} />
                    <p className="text-muted">Point your camera at their screen</p>
                    {error && <p className="error-text">{error}</p>}
                </motion.div>
            )}

            {/* Connecting State */}
            {step === 'connecting' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flow-loading"
                >
                    <div className="spinner" />
                    <p className="text-muted">Connecting to peer...</p>
                </motion.div>
            )}

            {/* Show QR Answer */}
            {step === 'show-answer' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flow-content"
                >
                    <div className="card-qr">
                        <QRCode value={answerData} size={200} level="L" />
                    </div>

                    <div className="flow-instructions">
                        <h2 className="title-section">Show to Sender</h2>
                        <p className="text-muted">They need to scan this to complete the connection</p>
                    </div>
                </motion.div>
            )}
        </div>
    );
};
