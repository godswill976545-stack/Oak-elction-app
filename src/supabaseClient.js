import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables at startup
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[Oak Election] Missing Supabase environment variables. ' +
    'Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

// Initialize Client
export const supabase = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '');

// Detect if error looks like a paused/asleep Supabase project (free tier)
const isSupabasePausedError = (err) => {
  if (!err) return false;
  const msg = err.message || err.toString();
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Network request failed') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('ERR_NAME_NOT_RESOLVED') ||
    msg.includes('fetch') ||
    msg.includes('Unable to reach') ||
    msg.includes('timeout')
  );
};

const normalizeError = (err, fallback) => {
  if (isSupabasePausedError(err)) {
    return 'Database appears to be asleep. If you are on the Supabase free tier, resume the project from the dashboard, then retry.';
  }
  return err?.message || fallback;
};

// Health check to detect if Supabase is awake
export const checkSupabaseHealth = async () => {
  try {
    const { error } = await supabase.from('candidates').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: normalizeError(err, 'Health check failed.') };
  }
};

// Verify Student ID
export const verifyStudent = async (studentId) => {
  const { data: student, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .single();

  if (error || !student) {
    throw new Error(error?.message?.includes('0 rows')
      ? 'Invalid Student ID. Please check and try again.'
      : normalizeError(error, 'Unable to verify student.')
    );
  }
  if (student.has_voted) {
    throw new Error('You have already voted!');
  }
  return { studentId, name: student.name, verified: true };
};

// Submit Secondary Vote
export const submitSecondaryVote = async (studentId, candidateId) => {
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('has_voted')
    .eq('id', studentId)
    .single();

  if (studentError || !student) throw new Error(normalizeError(studentError, 'Student not found.'));
  if (student.has_voted) throw new Error('Double voting detected.');

  const { error: updateError } = await supabase
    .from('students')
    .update({ has_voted: true })
    .eq('id', studentId);

  if (updateError) throw new Error(normalizeError(updateError, 'Could not update voter status.'));

  const { data: candidate, error: candError } = await supabase
    .from('candidates')
    .select('secondary_vote_count')
    .eq('id', candidateId)
    .single();

  if (candError) throw new Error(normalizeError(candError, 'Candidate lookup failed.'));

  const { error: voteError } = await supabase
    .from('candidates')
    .update({ secondary_vote_count: (candidate?.secondary_vote_count || 0) + 1 })
    .eq('id', candidateId);

  if (voteError) throw new Error(normalizeError(voteError, 'Vote submission failed.'));

  return { success: true };
};

// Submit Primary Vote
export const submitPrimaryVote = async (candidateId) => {
  const { data: candidate, error: candError } = await supabase
    .from('candidates')
    .select('primary_vote_count')
    .eq('id', candidateId)
    .single();

  if (candError) throw new Error(normalizeError(candError, 'Candidate lookup failed.'));

  const { error: voteError } = await supabase
    .from('candidates')
    .update({ primary_vote_count: (candidate?.primary_vote_count || 0) + 1 })
    .eq('id', candidateId);

  if (voteError) throw new Error(normalizeError(voteError, 'Vote submission failed.'));

  return { success: true };
};

// Add New Candidate
export const addCandidate = async (candidateData) => {
  const formattedId = candidateData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const { error } = await supabase
    .from('candidates')
    .insert([{
      id: formattedId,
      ...candidateData,
      primary_vote_count: 0,
      secondary_vote_count: 0
    }]);

  if (error) throw new Error(normalizeError(error, 'Failed to add candidate.'));

  return { id: formattedId, ...candidateData };
};

// Subscribe to candidates (Realtime)
export const subscribeToCandidates = (callback) => {
  // Fetch Initial Data
  supabase.from('candidates').select('*').then(({ data, error }) => {
    if (error) {
      console.error('[Realtime] Initial fetch failed:', error.message);
      // Still callback with empty array so UI doesn't hang
      callback([]);
      return;
    }
    if (data) callback(data);
  });

  // Tap into Realtime Engine
  const subscription = supabase
    .channel('candidates-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, async () => {
      const { data, error } = await supabase.from('candidates').select('*');
      if (error) {
        console.error('[Realtime] Update fetch failed:', error.message);
        return;
      }
      if (data) callback(data);
    })
    .subscribe();

  // Return unsubscribe routine
  return () => {
    supabase.removeChannel(subscription);
  };
};
