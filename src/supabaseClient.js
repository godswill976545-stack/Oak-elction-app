// D1-backed API client.
//
// The Cloudflare credentials live only on the server (Vercel env / server.js).
// The browser talks to same-origin `/api/*` routes — the secrets are never
// bundled. Exports keep the old supabaseClient names so components are
// largely unchanged.
//
// Admin auth: verifyAdminPin() exchanges the PIN for a signed session token
// (12h). Every privileged call then sends x-admin-token; the server verifies
// it with pure HMAC (no D1 round trip). A 403 with code 'token_expired' means
// the session lapsed and the UI should re-prompt for the PIN.

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed. Please try again.');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

// Admin session token, set after a successful PIN check. Components pass it
// through as a prop (see App.jsx); this module keeps no hidden state so the
// token lifetime is owned by React state (cleared on reload = re-auth).
const authHeaders = (adminToken) => (adminToken ? { 'x-admin-token': adminToken } : {});

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
export const searchStudents = async (q, adminToken) => {
  return request(`/api/students-search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(adminToken),
  });
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

export const setPartyLogo = async (name, logo_url, adminToken) => {
  return request('/api/parties', {
    method: 'POST',
    body: JSON.stringify({ name, logo_url, adminToken }),
  });
};

// Staff roll (Admin)
export const fetchStaff = async (adminToken) => {
  return request('/api/staff', { headers: authHeaders(adminToken) });
};

export const addStaff = async (code, name, adminToken) => {
  return request('/api/staff', {
    method: 'POST',
    body: JSON.stringify({ code, name, adminToken }),
  });
};

// Add New Candidate (photo_url is a data-URL or https URL — R2 has no
// browser-direct upload; the server uploads the data-URL to the bucket)
export const addCandidate = async (candidateData, adminToken) => {
  return request('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({ ...candidateData, adminToken }),
  });
};

// Verify Admin PIN (server-side hash compare via /api/verify-pin).
// Returns the session token (string) on success, null on wrong PIN.
export const verifyAdminPin = async (pin) => {
  const data = await request('/api/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  return data.ok && data.token ? data.token : null;
};

// Candidacy applications (hidden /candidate-form + admin review)
export const submitCandidacy = async (payload) => {
  return request('/api/candidacy', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const fetchCandidacies = async (adminToken) => {
  return request('/api/candidacy', { headers: authHeaders(adminToken) });
};

export const fetchCandidacy = async (id, adminToken) => {
  return request(`/api/candidacy?id=${encodeURIComponent(id)}`, {
    headers: authHeaders(adminToken),
  });
};

export const setCandidacyStatus = async (id, status, adminToken) => {
  return request('/api/candidacy', {
    method: 'POST',
    body: JSON.stringify({ action: 'status', id, status, adminToken }),
  });
};

// Subscribe to candidates (polling — D1 has no realtime channel).
// Calls back immediately, then every pollMs. Returns an unsubscribe function.
//
// This used to poll every 3s no matter what, which meant the full candidate
// list was re-downloaded continuously for the whole ballot session and
// the grid re-animated under the voter's finger. Now the interval is the
// caller's choice and polling stops entirely while the tab is hidden.
// The server also edge-caches the list for 5s, so kiosk bursts share one D1
// read instead of each paying the 1200-req/5min REST budget.
//
// The callback still fires on every successful fetch even if the payload is
// unchanged, so LiveResults' "updated Ns ago" clock stays honest. Consumers
// that would rather not re-render on an identical payload should diff it
// themselves (see CandidateProfiles).
export const subscribeToCandidates = (callback, { pollMs = 10000 } = {}) => {
  let stopped = false;
  let timer = null;

  const load = async () => {
    if (stopped || document.hidden) return;
    try {
      const data = await request('/api/candidates');
      if (!stopped && Array.isArray(data)) callback(data);
    } catch {
      // Keep the last good state on transient failures.
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      await load();
      schedule();
    }, pollMs);
  };

  load();
  schedule();

  // Catch up immediately when the voter comes back to the tab.
  const onVisible = () => !document.hidden && load();
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
};
