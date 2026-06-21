import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, ArrowRight, Zap, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';

const LandingPage = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background Effects */}
      <div className="absolute inset-0 premium-gradient pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-primary/10 blur-[120px] rounded-full opacity-50" />

      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-bold text-2xl tracking-tighter">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          SecureVote <span className="text-primary">AI</span>
        </div>
        <div className="flex gap-6 text-sm font-medium text-muted-foreground">
          <a href="#" className="hover:text-white transition-colors">Features</a>
          <a href="#" className="hover:text-white transition-colors">Security</a>
          <a href="#" className="hover:text-white transition-colors">Enterprise</a>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-20 pb-32">
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-6"
          >
            <Zap className="w-3 h-3" /> NEXT-GEN ELECTION MANAGEMENT
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-6xl md:text-8xl font-bold tracking-tight mb-8 leading-[0.9]"
          >
            The future of <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">secure democracy.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12"
          >
            Enterprise-grade voting infrastructure powered by AI. Secure, transparent, and built for modern organizations.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <RoleCard
            title="Administrator"
            description="Manage elections, candidates, and real-time analytics with fraud detection."
            icon={<Lock className="w-6 h-6" />}
            onClick={() => {
              if (user && profile?.role === 'admin') {
                navigate('/admin/dashboard');
              } else {
                navigate('/admin/login');
              }
            }}
            delay={0.3}
          />
          <RoleCard
            title="Voter"
            description="Cast your vote securely using our multi-step verification process."
            icon={<Users className="w-6 h-6" />}
            onClick={() => {
              if (user && profile?.role === 'voter') {
                navigate('/voter/wizard');
              } else {
                navigate('/voter/login');
              }
            }}
            delay={0.4}
            primary
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-32 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-white/10 pt-12"
        >
          <Stat label="Total Votes Cast" value="1.2M+" />
          <Stat label="Fraud Alerts Blocked" value="45k" />
          <Stat label="Uptime SLA" value="99.99%" />
          <Stat label="Security Score" value="A+" />
        </motion.div>
      </main>
    </div>
  );
};

const RoleCard = ({ title, description, icon, onClick, delay, primary = false }: any) => (
  <motion.button
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    onClick={onClick}
    className={clsx(
      "group relative p-8 rounded-3xl text-left transition-all duration-500 overflow-hidden",
      primary ? "bg-primary text-white" : "bg-white/5 border border-white/10 hover:border-white/20"
    )}
  >
    <div className="relative z-10">
      <div className={clsx(
        "w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110",
        primary ? "bg-white/20" : "bg-primary/20 text-primary"
      )}>
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
        {title} <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
      </h3>
      <p className={clsx("text-sm leading-relaxed", primary ? "text-white/80" : "text-muted-foreground")}>
        {description}
      </p>
    </div>
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
  </motion.button>
);

const Stat = ({ label, value }: any) => (
  <div>
    <div className="text-2xl font-bold mb-1">{value}</div>
    <div className="text-xs text-muted-foreground uppercase tracking-widest">{label}</div>
  </div>
);

export default LandingPage;
