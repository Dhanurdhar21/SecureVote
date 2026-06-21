import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Mail, ArrowRight, Loader2, Github, Chrome, CheckCircle2, Link2, X, AlertTriangle, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

type OAuthProvider = 'google' | 'github';

const AdminLogin = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Password Recovery state
  const [isRecovery, setIsRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // When set, the user tried email/password but the account uses OAuth
  const [oauthRedirect, setOauthRedirect] = useState<{ provider: OAuthProvider; label: string } | null>(null);
  // Countdown for auto-redirect to OAuth
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  // Prevent immediate redirect after creating a new account to show the success message
  const [justCreated, setJustCreated] = useState(false);
  const navigate = useNavigate();
  const { user, profile, linkNotification, dismissLinkNotification } = useAuth();

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setIsRecovery(true);
    }
  }, []);

  useEffect(() => {
    if (user && profile && !isRecovery && !justCreated) {
      if (profile.role === 'admin') {
        console.log('[Login] Redirect destination: /admin/dashboard');
        navigate('/admin/dashboard');
      } else {
        console.log(`[Login] Authenticated user (${user.email}) is not admin (role: ${profile.role}). Staying on login page.`);
      }
    }
  }, [user, profile, navigate, isRecovery]);

  // Auto-redirect countdown when OAuth provider is detected
  useEffect(() => {
    if (redirectCountdown === null || !oauthRedirect) return;
    if (redirectCountdown <= 0) {
      handleOAuthLogin(oauthRedirect.provider);
      return;
    }
    const timer = setTimeout(() => setRedirectCountdown(redirectCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown, oauthRedirect]);

  /**
   * Check if a given email already exists in the profiles table 
   * and is linked to an OAuth provider (google/github).
   */
  const checkOAuthAccount = async (emailToCheck: string): Promise<{ provider: OAuthProvider; label: string } | null> => {
    try {
      const trimmed = emailToCheck.trim().toLowerCase();
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('linked_providers')
        .eq('email', trimmed)
        .eq('is_merged', false)
        .maybeSingle();

      if (!existingProfile?.linked_providers) return null;

      const providers: string[] = existingProfile.linked_providers;

      if (providers.includes('google')) {
        return { provider: 'google', label: 'Google' };
      }
      if (providers.includes('github')) {
        return { provider: 'github', label: 'GitHub' };
      }

      return null;
    } catch {
      return null;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setOauthRedirect(null);
    setRedirectCountdown(null);

    const trimmedEmail = email.trim().toLowerCase();

    try {
      if (mode === 'signup') {
        // Before signing up, check if this email is already linked to OAuth
        const oauthInfo = await checkOAuthAccount(trimmedEmail);
        if (oauthInfo) {
          setOauthRedirect(oauthInfo);
          setRedirectCountdown(5);
          setLoading(false);
          return;
        }

        localStorage.setItem('pending_role', 'admin');
        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: { role: 'admin' }
          }
        });

        if (authError) {
          if (authError.message === 'User already registered') {
            // User already exists! Instead of throwing an error, try to sign them in.
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password
            });

            if (signInError) {
              if (signInError.message === 'Invalid login credentials') {
                // The password was wrong, OR it's an OAuth account. Check OAuth first.
                const oauthInfo = await checkOAuthAccount(trimmedEmail);
                if (oauthInfo) {
                  setOauthRedirect(oauthInfo);
                  setRedirectCountdown(5);
                  setLoading(false);
                  return;
                }
                throw new Error("This email is already registered, but the password you entered is incorrect. Please log in.");
              }
              throw signInError;
            }

            // Sign in succeeded!
            setMessage("Welcome back! Logging you in...");
            return;
          }
          throw authError;
        }

        if (data.session) {
          // Auto logged in because email confirmations are disabled
          setJustCreated(true);
          setMessage('Account created successfully! Redirecting to portal...');
          // Wait 2.5 seconds so the user can read the message before redirecting
          setTimeout(() => {
            setJustCreated(false); // This will trigger the useEffect to redirect to dashboard
          }, 2500);
        } else {
          setMessage('Account created! Please check your email to verify your account.');
          setMode('signin');
        }
      } else {
        // Attempt email/password sign-in
        localStorage.setItem('pending_role', 'admin');
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password
        });

        if (authError) {
          // Check if this email belongs to an OAuth-only account
          if (authError.message === 'Invalid login credentials') {
            const oauthInfo = await checkOAuthAccount(trimmedEmail);
            if (oauthInfo) {
              // This account uses OAuth — guide the user
              setOauthRedirect(oauthInfo);
              setRedirectCountdown(5);
              setLoading(false);
              return;
            }
          }
          throw authError;
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setLoading(true);
    setError('');
    setOauthRedirect(null);
    setRedirectCountdown(null);

    localStorage.setItem('pending_role', 'admin');

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/admin/dashboard`
        }
      });

      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'OAuth login failed.');
      setLoading(false);
    }
  };

  const handleSendPasswordReset = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    setError('');
    setOauthRedirect(null);
    setRedirectCountdown(null);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/admin/login`
      });
      if (resetErr) throw resetErr;
      setMessage('Password reset link sent! Check your email to set a password for email login.');
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setMessage('Password updated successfully! Redirecting...');
      setTimeout(() => {
        // Clear hash and recovery mode, allowing auto-redirect to trigger
        window.history.replaceState(null, '', window.location.pathname);
        setIsRecovery(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-black relative">
      <div className="absolute inset-0 bg-primary/5 blur-[120px] rounded-full opacity-20" />

      {/* Account Linked Notification */}
      <AnimatePresence>
        {linkNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl max-w-sm w-full"
          >
            <Link2 size={16} className="shrink-0" />
            <span className="flex-1">{linkNotification}</span>
            <button onClick={dismissLinkNotification} className="text-green-400/60 hover:text-green-400 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Portal</h1>
          <p className="text-muted-foreground text-sm">Secure access to election management</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 backdrop-blur-xl shadow-2xl">
          {isRecovery ? (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold mb-2">Set New Password</h2>
                <p className="text-xs text-muted-foreground">Please enter a new password for your account.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground ml-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 focus:outline-none focus:border-primary transition-all text-sm"
                  />
                </div>
              </div>
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                  {error}
                </div>
              )}
              {message && (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} /> {message}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 mt-4"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Save Password <ArrowRight size={18} /></>}
              </button>
            </form>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() => handleOAuthLogin('google')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 py-3 rounded-xl text-xs font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  <Chrome size={16} className="text-primary" /> Google
                </button>
                <button
                  onClick={() => handleOAuthLogin('github')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 py-3 rounded-xl text-xs font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  <Github size={16} /> GitHub
                </button>
              </div>

              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold"><span className="bg-black/50 px-4 text-muted-foreground backdrop-blur-sm">Or continue with email</span></div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (oauthRedirect) {
                          setOauthRedirect(null);
                          setRedirectCountdown(null);
                        }
                      }}
                      placeholder="admin@securevote.ai"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 focus:outline-none focus:border-primary transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 focus:outline-none focus:border-primary transition-all text-sm"
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {oauthRedirect && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -8, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-amber-300 text-xs font-bold mb-0.5">
                              This account uses {oauthRedirect.label} Sign-In
                            </p>
                            <p className="text-amber-300/70 text-[11px]">
                              Your email is linked to {oauthRedirect.label}. Please use the {oauthRedirect.label} button above to sign in, or set a password below.
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleOAuthLogin(oauthRedirect.provider)}
                            className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-xs border border-amber-500/20"
                          >
                            {oauthRedirect.provider === 'google' ? <Chrome size={14} /> : <Github size={14} />}
                            Continue with {oauthRedirect.label}
                            {redirectCountdown !== null && redirectCountdown > 0 && (
                              <span className="text-amber-400/60 text-[10px] font-mono">({redirectCountdown}s)</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleSendPasswordReset}
                            className="bg-white/5 hover:bg-white/10 text-muted-foreground font-bold py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 text-[10px] border border-white/10"
                            title="Set a password so you can also log in with email"
                          >
                            <KeyRound size={12} /> Set Password
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && !oauthRedirect && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-xs flex items-center gap-2">
                    <CheckCircle2 size={16} /> {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !!oauthRedirect}
                  className="w-full bg-primary py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <>{mode === 'signin' ? 'Sign In' : 'Create Account'} <ArrowRight size={18} /></>}
                </button>

                <div className="text-center mt-4 text-sm text-muted-foreground">
                  {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                      setError('');
                      setMessage('');
                      setOauthRedirect(null);
                      setRedirectCountdown(null);
                    }}
                    className="text-primary font-bold hover:underline"
                  >
                    {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
