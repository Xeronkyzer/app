import { useEffect, useState, useRef } from 'react';
import { WebRTCManager } from '../utils/webrtc';
import { motion, AnimatePresence } from 'framer-motion';

interface TransferViewProps {
    manager: WebRTCManager;
}

export const TransferView = ({ manager }: TransferViewProps) => {
    const [status, setStatus] = useState('Connected');
    const [progress, setProgress] = useState(0);
    const [history, setHistory] = useState<{ name: string; type: 'sent' | 'received' }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        manager.onStatusChange = (s) => setStatus(s);

        manager.onProgress = (p, s) => {
            setProgress(p);
            setStatus(s === 'sending' ? 'Sending...' : 'Receiving...');
            if (p >= 100) {
                setTimeout(() => {
                    setProgress(0);
                    setStatus('Connected');
                }, 2000);
            }
        };

        manager.onFileReceived = (blob, name) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setHistory(prev => [...prev, { name, type: 'received' }]);
            setStatus('File Received!');
            setTimeout(() => setStatus('Connected'), 2000);
        };
    }, [manager]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            manager.sendFile(file);
            setHistory(prev => [...prev, { name: file.name, type: 'sent' }]);
        }
    };

    return (
        <div className="transfer-container fade-in">
            {/* Main Transfer Card */}
            <motion.div layout className="transfer-card">
                <motion.div
                    key={status}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="title-section"
                    style={{ marginBottom: progress > 0 ? '0' : '1rem' }}
                >
                    {status}
                </motion.div>

                {progress > 0 && (
                    <div className="progress-bar">
                        <motion.div
                            className="progress-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                {progress === 0 && (
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="btn btn-primary"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ marginTop: '1.5rem' }}
                    >
                        Select File to Send
                    </motion.button>
                )}

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />
            </motion.div>

            {/* History Section */}
            <div className="history-section">
                <h3 className="history-title">Transfer History</h3>
                <div className="history-list">
                    <AnimatePresence>
                        {history.map((item, i) => (
                            <motion.div
                                key={`${item.name}-${i}`}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="history-item"
                            >
                                <span className="history-item-name">{item.name}</span>
                                <span className={`history-item-badge ${item.type}`}>{item.type}</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {history.length === 0 && (
                        <p className="history-empty">No files shared yet</p>
                    )}
                </div>
            </div>
        </div>
    );
};
