import { supabase } from './supabase';

/**
 * Synchronizes election statuses dynamically based on the current server time.
 * This ensures that elections transition seamlessly between 'upcoming', 'active',
 * and 'completed' states without requiring manual database updates.
 */
export const syncElectionStatuses = async (): Promise<void> => {
  try {
    const { error } = await supabase.rpc('sync_election_statuses');
    if (error) {
      console.error('Failed to sync election statuses:', error.message);
    }
  } catch (err) {
    console.error('Unexpected error syncing election statuses:', err);
  }
};
