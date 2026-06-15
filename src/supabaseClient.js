import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Initialize Client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Verify Student ID
export const verifyStudent = async (studentId) => {
  const { data: student, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .single();

  if (error || !student) {
    throw new Error("Invalid Student ID. Please check and try again.");
  }
  if (student.has_voted) {
    throw new Error("You have already voted!");
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

  if (studentError || !student) throw new Error("Student not found.");
  if (student.has_voted) throw new Error("Double voting detected.");

  const { error: updateError } = await supabase
    .from('students')
    .update({ has_voted: true })
    .eq('id', studentId);
  
  if (updateError) throw new Error("Could not update voter status.");

  const { data: candidate } = await supabase
    .from('candidates')
    .select('secondary_vote_count')
    .eq('id', candidateId)
    .single();

  await supabase
    .from('candidates')
    .update({ secondary_vote_count: (candidate?.secondary_vote_count || 0) + 1 })
    .eq('id', candidateId);

  return { success: true };
};

// Submit Primary Vote
export const submitPrimaryVote = async (candidateId) => {
  const { data: candidate } = await supabase
    .from('candidates')
    .select('primary_vote_count')
    .eq('id', candidateId)
    .single();

  await supabase
    .from('candidates')
    .update({ primary_vote_count: (candidate?.primary_vote_count || 0) + 1 })
    .eq('id', candidateId);

  return { success: true };
};

// Add New Candidate
export const addCandidate = async (candidateData) => {
  const formattedId = candidateData.name.toLowerCase().replace(/\s+/g, '-');
  
  const { error } = await supabase
    .from('candidates')
    .insert([{
      id: formattedId,
      ...candidateData,
      primary_vote_count: 0,
      secondary_vote_count: 0
    }]);
    
  if (error) throw new Error(error.message);
  
  return { id: formattedId, ...candidateData };
};

// Subscribe to candidates (Realtime)
export const subscribeToCandidates = (callback) => {
  // Fetch Initial Data
  supabase.from('candidates').select('*').then(({ data }) => {
    if (data) callback(data);
  });

  // Tap into Realtime Engine
  const subscription = supabase
    .channel('candidates-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, async () => {
      const { data } = await supabase.from('candidates').select('*');
      if (data) callback(data);
    })
    .subscribe();

  // Return unsubscribe routine
  return () => {
    supabase.removeChannel(subscription);
  };
};
