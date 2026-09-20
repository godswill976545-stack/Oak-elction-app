// Neon-backed API client.
//
// The Neon DATABASE_URL lives only on the server (Vercel env / server.js).
// The browser talks to same-origin `/api/*` routes — the secret is never
// bundled. Exports keep the old supabaseClient names so components are
// unchanged.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}

// Verify Student ID
export const verifyStudent = async (studentId) => {
  return request('/api/verify-student', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  });
};

// Submit Secondary Vote
export const submitSecondaryVote = async (studentId, candidateId) => {
  return request('/api/vote-secondary', {
    method: 'POST',
    body: JSON.stringify({ studentId, candidateId }),
  });
};

// Submit Primary Vote (named student, one per position)
export const submitPrimaryVote = async (studentId, candidateId) => {
  return request('/api/vote-primary', {
    method: 'POST',
    body: JSON.stringify({ studentId, candidateId }),
  });
};

// Search students by name (primary portal)
export const searchStudents = async (q) => {
  return request(`/api/students-search?q=${encodeURIComponent(q)}`);
};

// Verify Staff Code
export const verifyStaff = async (staffCode) => {
  return request('/api/verify-staff', {
    method: 'POST',
    body: JSON.stringify({ staffCode }),
  });
};

// Submit Staff Vote
export const submitStaffVote = async (staffCode, candidateId) => {
  return request('/api/vote-staff', {
    method: 'POST',
    body: JSON.stringify({ staffCode, candidateId }),
  });
};

// Parties directory (+ logo updates from Admin)
export const fetchParties = async () => {
  return request('/api/parties');
};

export const setPartyLogo = async (name, logo_url) => {
  return request('/api/parties', {
    method: 'POST',
    body: JSON.stringify({ name, logo_url }),
  });
};

// Staff roll (Admin)
export const fetchStaff = async () => {
  return request('/api/staff');
};

export const addStaff = async (code, name) => {
  return request('/api/staff', {
    method: 'POST',
    body: JSON.stringify({ code, name }),
  });
};

// Add New Candidate (photo_url is a data-URL or https URL — Neon has no storage bucket)
export const addCandidate = async (candidateData) => {
  return request('/api/candidates', {
    method: 'POST',
    body: JSON.stringify(candidateData),
  });
};

// Verify Admin PIN (server-side hash compare via /api/verify-pin)
export const verifyAdminPin = async (pin) => {
  const data = await request('/api/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  return Boolean(data.ok);
};

// Candidacy applications (hidden /candidate-form + admin review)
export const submitCandidacy = async (payload) => {
  return request('/api/candidacy', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const fetchCandidacies = async () => {
  return request('/api/candidacy');
};

export const fetchCandidacy = async (id) => {
  return request(`/api/candidacy?id=${encodeURIComponent(id)}`);
};

export const setCandidacyStatus = async (id, status) => {
  return request('/api/candidacy', {
    method: 'POST',
    body: JSON.stringify({ action: 'status', id, status }),
  });
};

// Subscribe to candidates (polling — Neon has no realtime channel).
// Calls back immediately, then every 3s. Returns an unsubscribe function.
export const subscribeToCandidates = (callback) => {
  let stopped = false;

  const load = async () => {
    try {
      const data = await request('/api/candidates');
      if (!stopped && Array.isArray(data)) callback(data);
    } catch {
      // Keep the last good state on transient failures.
    }
  };

  load();
  const id = setInterval(load, 3000);

  return () => {
    stopped = true;
    clearInterval(id);
  };
};
