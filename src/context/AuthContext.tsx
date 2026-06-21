import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  linkNotification: string | null;
  dismissLinkNotification: () => void;
  signOut: () => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkNotification, setLinkNotification] = useState<string | null>(null);

  useEffect(() => {
    // Check if a link event was flagged during this session
    const linked = localStorage.getItem('account_linked');
    if (linked) {
      setLinkNotification(linked);
      localStorage.removeItem('account_linked');
    }

    const initAuth = async () => {
      console.log('[Auth] initAuth: checking session...');
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('[Auth] initAuth: getSession result', session?.user?.email, error);
      if (session?.user) {
        console.log('[Auth] initAuth: authenticated user email:', session.user.email);
        setUser(session.user);
        await fetchOrCreateProfile(session.user);
      } else {
        console.log('[Auth] initAuth: no session found');
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth] onAuthStateChange event: ${event}`, session?.user?.email);
      if (session?.user) {
        setLoading(true);
        setUser(session.user);
        await fetchOrCreateProfile(session.user);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAuthorizedAdmin = (email: string | undefined) => {
    if (!email) return false;
    // Allow all emails for testing purposes
    return true;
  };

  /**
   * Checks if a newer auth.users entry (current login) should be merged into
   * an older canonical profile with the same email. If the DB trigger set
   * `canonical_id` on the new profile, we call the merge RPC then reload
   * the canonical profile so all downstream code uses the correct UUID.
   *
   * Returns the resolved canonical profile (may be the same as input).
   */
  const resolveMergeIfNeeded = async (authUser: User): Promise<any | null> => {
    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    // If the DB trigger pre-assigned a canonical_id, this is a duplicate login
    if (ownProfile?.canonical_id && !ownProfile.is_merged) {
      const canonicalId = ownProfile.canonical_id;
      console.log(`[Auth] Duplicate account detected. Merging ${authUser.id} → ${canonicalId}`);

      // Execute the server-side merge
      const { error: mergeErr } = await supabase.rpc('merge_duplicate_account', {
        p_duplicate_id: authUser.id,
        p_canonical_id: canonicalId,
      });

      if (mergeErr) {
        console.error('[Auth] Merge RPC failed:', mergeErr);
      } else {
        console.log('[Auth] Merge successful.');
        // Determine provider name for notification
        const provider = authUser.app_metadata?.provider || 'OAuth';
        const providerLabel = provider === 'google' ? 'Google'
          : provider === 'github' ? 'GitHub'
          : provider === 'email' ? 'Email' : provider;
        localStorage.setItem('account_linked', `Your ${providerLabel} account has been linked to your existing profile.`);
      }

      // Return the canonical profile
      const { data: canonicalProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', canonicalId)
        .maybeSingle();

      return canonicalProfile;
    }

    // No merge needed — also do a secondary email-level check in case
    // the trigger didn't fire (e.g., profile already existed before migration)
    if (!ownProfile && authUser.email) {
      const { data: emailProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', authUser.email)
        .eq('is_merged', false)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (emailProfile && emailProfile.id !== authUser.id) {
        console.log(`[Auth] Email-level duplicate found. Merging ${authUser.id} → ${emailProfile.id}`);
        await supabase.rpc('merge_duplicate_account', {
          p_duplicate_id: authUser.id,
          p_canonical_id: emailProfile.id,
        });
        const provider = authUser.app_metadata?.provider || 'OAuth';
        const providerLabel = provider === 'google' ? 'Google'
          : provider === 'github' ? 'GitHub'
          : provider === 'email' ? 'Email' : provider;
        localStorage.setItem('account_linked', `Your ${providerLabel} account has been linked to your existing profile.`);
        return emailProfile;
      }
    }

    return ownProfile;
  };

  const fetchOrCreateProfile = async (authUser: User) => {
    try {
      console.log(`[Auth] Fetching profile for user: ${authUser.email}`);

      // Step 1: Check for duplicate accounts and merge if needed
      const resolvedProfile = await resolveMergeIfNeeded(authUser);

      const pendingRole = localStorage.getItem('pending_role');
      const isAdminLogin = pendingRole === 'admin';
      const isAuthorized = isAuthorizedAdmin(authUser.email);

      if (resolvedProfile) {
        console.log(`[Auth] Found resolved profile. Current role:`, resolvedProfile.role);

        if (isAdminLogin && resolvedProfile.role !== 'admin' && isAuthorized) {
          console.log(`[Auth] Updating profile role to admin for: ${authUser.email}`);
          const { data: updatedProfile, error: updateError } = await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', resolvedProfile.id)
            .select()
            .single();

          if (updatedProfile) {
            console.log(`[Auth] Profile role updated to admin.`);
            setProfile(updatedProfile);
          } else {
            console.error(`[Auth] Failed to update profile role:`, updateError);
            setProfile(resolvedProfile);
          }
        } else {
          setProfile(resolvedProfile);
        }
        localStorage.removeItem('pending_role');

        // Check if account_linked notification was just set and surface it
        const linked = localStorage.getItem('account_linked');
        if (linked) {
          setLinkNotification(linked);
          localStorage.removeItem('account_linked');
        }
      } else {
        // No profile found at all — create a fresh one
        console.log(`[Auth] No profile found. Creating new profile.`);

        let newRole = 'voter';
        if (isAdminLogin) {
          if (isAuthorized) {
            newRole = 'admin';
            console.log(`[Auth] Authorized admin creation for: ${authUser.email}`);
          } else {
            console.log(`[Auth] Unauthorized admin attempt. Defaulting to voter for: ${authUser.email}`);
          }
        } else {
          console.log(`[Auth] Voter login detected. Assigning voter role.`);
        }

        const provider = authUser.app_metadata?.provider || 'email';
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: authUser.id,
            email: authUser.email!,
            full_name: authUser.user_metadata?.full_name
              || authUser.user_metadata?.name
              || authUser.email?.split('@')[0],
            role: newRole,
            linked_providers: [provider],
          })
          .select()
          .single();

        if (insertError) console.error(`[Auth] Insert error:`, insertError);
        if (newProfile) {
          console.log(`[Auth] Profile created. Role:`, newProfile.role);
          setProfile(newProfile);
        }
        localStorage.removeItem('pending_role');
      }
    } catch (err) {
      console.error('[Auth] Profile sync error:', err);
    } finally {
      setLoading(false);
    }
  };

  const signInWithOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
  };

  const verifyOtp = async (email: string, token: string): Promise<{ error: any }> => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = '/';
  };

  const dismissLinkNotification = () => setLinkNotification(null);

  return (
    <AuthContext.Provider value={{ user, profile, loading, linkNotification, dismissLinkNotification, signOut, signInWithOtp, verifyOtp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
