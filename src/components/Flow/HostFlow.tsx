import { useEffect, useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import { WebRTCManager } from '../../utils/webrtc';
import QRScanner from '../QRScanner';
import { motion } from 'framer-motion';

interface HostFlowProps {
    mode: 'qr' | 'code';
    onConnected: (mgr: WebRTCManager) => void;
}

export const HostFlow = ({ mode, onConnected }: HostFlowProps) => {
    const [step, setStep] = useState<'creating' | 'waiting' | 'scan-answer'>('creating');
    const [offerData, setOfferData] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const managerRef = useRef<WebRTCManager | null>(null);
    const initializedRef = useRef(false);

    const [manager] = useState(() => {
        const mgr = new WebRTCManager(
            (status) => {
                if (status === 'connected' && managerRef.current) {
                    onConnected(managerRef.current);
                }
            },
            (_p, _s) => { },
            (_f, _n) => { },
            (code) => setRoomCode(code)
        );
        managerRef.current = mgr;
        return mgr;
    });

    useEffect(() => {
        // Prevent double-execution in React Strict Mode
        if (initializedRef.current) return;
        initializedRef.current = true;

        const init = async () => {
            if (mode === 'code') {
                await manager.createRoom();
                setStep('waiting');
            } else {
                const offer = await manager.createOffer();
                setOfferData(offer);
                setStep('waiting');
            }
        };
        init();

        // No cleanup here - manager persists until component fully unmounts
    }, [mode, manager]);


    const handleScanAnswer = async (data: string) => {
        try {
            await manager.handleAnswer(data);
        } catch (e) {
            console.error("Invalid Answer QR", e);
        }
    };

    return (
        <div className="flow-container">
            {step === 'creating' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flow-loading"
                >
                    <div className="spinner" />
                    <p className="text-muted">Setting up secure room...</p>
                </motion.div>
            )}

            {step === 'waiting' && mode === 'code' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flow-content"
                >
                    <div className="code-display-card">
                        <p className="code-label">Room Code</p>
                        <div className="code-digits">
                            {roomCode.split('').map((digit, i) => (
                                <motion.span
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="code-digit"
                                >
                                    {digit}
                                </motion.span>
                            ))}
                        </div>
                    </div>

                    <div className="flow-instructions">
                        <h2 className="title-section">Share This Code</h2>
                        <p className="text-muted">Ask the receiver to enter this code to connect</p>
                    </div>

                    <div className="waiting-indicator">
                        <div className="pulse-ring" />
                        <span>Waiting for peer...</span>
                    </div>
                </motion.div>
            )}

            {step === 'waiting' && mode === 'qr' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flow-content"
                >
                    <div className="card-qr">
                        <QRCode value={offerData} size={200} level="L" />
                    </div>

                    <div className="flow-instructions">
                        <h2 className="title-section">Scan This Code</h2>
                        <p className="text-muted">Ask the receiver to scan this QR code</p>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="btn btn-primary"
                        onClick={() => setStep('scan-answer')}
                    >
                        Scan Their Response →
                    </motion.button>
                </motion.div>
            )}

            {step === 'scan-answer' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flow-content"
                >
                    <h2 className="title-section">Scan Response Code</h2>
                    <QRScanner onScan={handleScanAnswer} />
                    <p className="text-muted">Point your camera at their screen</p>
                </motion.div>
            )}
        </div>
    );
};
