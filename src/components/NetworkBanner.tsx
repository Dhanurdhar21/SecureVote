/**
 * NetworkBanner.tsx — Reusable network validation banner component.
 * Detects wrong chain, locked wallet, or missing MetaMask and shows
 * appropriate message + action button.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Wifi, WifiOff, Download, ArrowRight } from 'lucide-react';
import { useBlockchain } from '../hooks/useBlockchain';

interface NetworkBannerProps {
  className?: string;
}

const NetworkBanner: React.FC<NetworkBannerProps> = ({ className = '' }) => {
  const { walletState, switchNetwork } = useBlockchain();

  // Don't render if everything is fine or still checking
  if (walletState === 'connected' || walletState === 'checking') {
    return null;
  }

  const config = {
    not_installed: {
      icon: <Download size={16} />,
      message: 'MetaMask is required for blockchain voting.',
      action: 'Install MetaMask',
      onClick: () => window.open('https://metamask.io/download/', '_blank', 'noopener,noreferrer'),
      color: 'orange',
    },
    locked: {
      icon: <WifiOff size={16} />,
      message: 'MetaMask is locked. Please unlock your wallet to continue.',
      action: 'Refresh',
      onClick: () => window.location.reload(),
      color: 'yellow',
    },
    wrong_network: {
      icon: <Wifi size={16} />,
      message: 'Wrong network detected. Please switch to Sepolia testnet.',
      action: 'Switch to Sepolia',
      onClick: switchNetwork,
      color: 'red',
    },
  }[walletState];

  if (!config) return null;

  const colorClasses = {
    orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
  }[config.color];

  const buttonClasses = {
    orange: 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400',
    yellow: 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  }[config.color];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-xs font-bold ${colorClasses} ${className}`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} />
          <span>{config.message}</span>
        </div>
        <button
          onClick={config.onClick}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${buttonClasses}`}
        >
          {config.action} <ArrowRight size={10} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default NetworkBanner;
