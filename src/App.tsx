import { useState } from 'react';
import './styles/main.css';
import { HostFlow } from './components/Flow/HostFlow';
import { JoinFlow } from './components/Flow/JoinFlow';
import { TransferView } from './components/TransferView';
import { WebRTCManager } from './utils/webrtc';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [view, setView] = useState<'landing' | 'host' | 'join' | 'transfer'>('landing');
  const [manager, setManager] = useState<WebRTCManager | null>(null);
  const [connectionMode, setConnectionMode] = useState<'qr' | 'code'>('code');

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo">FalseFile</div>
        <div className="header-right">
          <span className="encryption-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            E2E Encrypted
          </span>
          <div className="status-dot" title="Online" />
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <AnimatePresence mode="wait">

          {/* Landing View */}
          {view === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="landing-container"
            >
              <h1 className="title-hero">
                Share<span className="title-accent">.</span><br />Instantly
              </h1>
              <p className="text-muted landing-subtitle">
                No servers. No uploads. Peer-to-peer file sharing with end-to-end encryption.
              </p>

              {/* Connection Mode Toggle */}
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${connectionMode === 'code' ? 'active' : ''}`}
                  onClick={() => setConnectionMode('code')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                  </svg>
                  Room Code
                </button>
                <button
                  className={`mode-btn ${connectionMode === 'qr' ? 'active' : ''}`}
                  onClick={() => setConnectionMode('qr')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M7 7h3v3H7z" />
                    <path d="M14 7h3v3h-3z" />
                    <path d="M7 14h3v3H7z" />
                  </svg>
                  QR Scan
                </button>
              </div>

              <div className="btn-group">
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn btn-primary btn-lg"
                  onClick={() => setView('host')}
                >
                  Send Files
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn btn-outline btn-lg"
                  onClick={() => setView('join')}
                >
                  Receive Files
                </motion.button>
              </div>

              <p className="feature-text">
                Works on same WiFi • No file size limits • Fast local transfer
              </p>
            </motion.div>
          )}

          {/* Host Flow */}
          {view === 'host' && (
            <motion.div
              key="host"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="flow-page"
            >
              <button className="btn btn-ghost btn-back" onClick={() => setView('landing')}>
                ← Back
              </button>
              <HostFlow
                mode={connectionMode}
                onConnected={(mgr) => {
                  setManager(mgr);
                  setView('transfer');
                }}
              />
            </motion.div>
          )}

          {/* Join Flow */}
          {view === 'join' && (
            <motion.div
              key="join"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="flow-page"
            >
              <button className="btn btn-ghost btn-back" onClick={() => setView('landing')}>
                ← Back
              </button>
              <JoinFlow
                mode={connectionMode}
                onConnected={(mgr) => {
                  setManager(mgr);
                  setView('transfer');
                }}
              />
            </motion.div>
          )}

          {/* Transfer View */}
          {view === 'transfer' && manager && (
            <motion.div
              key="transfer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flow-page"
            >
              <TransferView manager={manager} />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="footer">
        <span>Peer-to-peer • WebRTC • DTLS Encrypted</span>
      </footer>
    </div>
  );
}

export default App;
