import React, { useEffect, useState, useMemo, useRef } from 'react';
import { subscribeToCandidates } from '../supabaseClient';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { Crown, BarChart3 } from 'lucide-react';
import PartyBadge from './PartyBadge';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const totalOf = (c) => (c.primary_vote_count || 0) + (c.secondary_vote_count || 0) + (c.staff_vote_count || 0);

const PARTY_COLORS = {
  'Democratic Union': '#059669',
  Eagles: '#fbbf24',
  Independent: '#78716c',
};

const PALETTE = [
  '#059669', '#fbbf24', '#0d9488', '#f59e0b',
  '#10b981', '#d97706', '#34d399', '#ca8a04',
];

const POSITION_ICONS = {
  'Head Boy': '\u{1F451}',
  'Head Girl': '\u{1F451}',
  'Social Prefect': '\u{1F389}',
  'Sports Prefect (Male)': '\u26BD',
  'Sports Prefect (Female)': '\u26BD',
};

const formatRelative = (ms) => {
  if (!ms || ms < 0) return 'just now';
  if (ms < 1000) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

const LiveResults = () => {
  const [candidates, setCandidates] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(0);

  // Screen-reader announcement: only when the totals actually change,
  // never on the per-second clock tick (see the aria-hidden timer below).
  const announcedRef = useRef(null);
  const [announcedTotal, setAnnouncedTotal] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToCandidates((data) => {
      setCandidates(data);
      // Only stamp "last updated" once we have a real payload, so the
      // initial empty state doesn't show "0s ago".
      if (data && data.length > 0) {
        setLastUpdated(Date.now());
        const t = data.reduce((sum, c) => sum + totalOf(c), 0);
        if (announcedRef.current !== t) {
          announcedRef.current = t;
          setAnnouncedTotal(t);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Tick the relative-time label every second. The first tick also seeds
  // the clock, so we don't need a separate mount-time setState.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Only consider it stale once we have both a timestamp and a clock reading.
  const isStale = Boolean(lastUpdated && now && now - lastUpdated > 15000);

  const grouped = useMemo(() => {
    const map = {};
    candidates.forEach((c) => {
      const cat = c.category || 'Uncategorized';
      if (!map[cat]) map[cat] = [];
      map[cat].push(c);
    });
    return map;
  }, [candidates]);

  const categories = Object.keys(grouped);

  const totalVotes = candidates.reduce((sum, c) => sum + totalOf(c), 0);

  // Party pie: how many positions each party currently leads.
  const partyWins = useMemo(() => {
    const wins = {};
    Object.values(grouped).forEach((catCandidates) => {
      let leader = null;
      let max = 0;
      catCandidates.forEach((c) => {
        const v = totalOf(c);
        if (v > max) { leader = c; max = v; }
      });
      if (leader && max > 0) {
        const party = leader.party || 'Independent';
        wins[party] = (wins[party] || 0) + 1;
      }
    });
    return wins;
  }, [grouped]);

  const partyEntries = Object.entries(partyWins);
  const pieData = {
    labels: partyEntries.map(([party]) => party),
    datasets: [
      {
        data: partyEntries.map(([, n]) => n),
        backgroundColor: partyEntries.map(([party]) => (PARTY_COLORS[party] || '#34d399') + 'cc'),
        borderColor: partyEntries.map(([party]) => PARTY_COLORS[party] || '#34d399'),
        borderWidth: 2,
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
      // The standings list beside the pie carries names + counts already.
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(6, 78, 59, 0.92)',
        titleFont: { family: 'Outfit', size: 13, weight: '700' },
        bodyFont: { family: 'Outfit', size: 12 },
        padding: 10,
        cornerRadius: 10,
        callbacks: { label: (ctx) => ` ${ctx.parsed} position${ctx.parsed === 1 ? '' : 's'} led` },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    // Live data refreshes every few seconds: never replay entrance motion.
    animation: { duration: 0 },
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(6, 78, 59, 0.92)',
        titleFont: { family: 'Outfit', size: 13, weight: '700' },
        bodyFont: { family: 'Outfit', size: 12 },
        padding: 10,
        cornerRadius: 10,
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Outfit', size: 11 }, stepSize: 1 },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: { color: '#fff', font: { family: 'Outfit', weight: '600', size: 12 } },
        grid: { display: false },
      },
    },
  };

  const buildChartData = (catCandidates) => ({
    labels: catCandidates.map((c) => c.name),
    datasets: [
      {
        label: 'Votes',
        data: catCandidates.map((c) => totalOf(c)),
        backgroundColor: catCandidates.map((_, i) => PALETTE[i % PALETTE.length] + 'cc'),
        borderColor: catCandidates.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 28,
      },
    ],
  });

  const getLeader = (catCandidates) => {
    if (catCandidates.length === 0) return null;
    let leader = catCandidates[0];
    let maxVotes = totalOf(leader);
    catCandidates.forEach((c) => {
      const v = totalOf(c);
      if (v > maxVotes) { leader = c; maxVotes = v; }
    });
    return maxVotes > 0 ? { ...leader, totalVotes: maxVotes } : null;
  };

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div className="results-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
            <BarChart3 size={24} color="var(--gold-400)" />
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Live Results</h2>
          </div>
          <p style={{ color: 'var(--text-on-dark-muted)', fontSize: '0.9rem', margin: 0 }}>
            Real-time electoral data.
          </p>
          <div
            className={`live-indicator ${isStale ? 'is-stale' : ''}`}
          >
            <span className="live-indicator-dot" aria-hidden="true" />
            <span aria-hidden="true">
              {lastUpdated
                ? `Live · Updated ${formatRelative(now - lastUpdated)}`
                : 'Connecting…'}
            </span>
          </div>
          <span className="sr-only" role="status">
            {announcedTotal === null
              ? 'Connecting to live results.'
              : `Live results updated. ${announcedTotal} total votes counted.`}
          </span>
        </div>
        <div className="results-stat">
          <div className="results-stat-value">{totalVotes}</div>
          <div className="results-stat-label">Total Votes</div>
        </div>
      </div>

      {/* Party Standings Pie */}
      {partyEntries.length > 0 && (
        <div className="result-category" style={{ display: 'flex', gap: 'var(--sp-8)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 220, height: 240 }}>
            <Pie options={pieOptions} data={pieData} />
          </div>
          <div style={{ flex: '2 1 240px' }}>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 var(--sp-3)' }}>Party Standings</h3>
            <p style={{ color: 'var(--text-on-dark-muted)', fontSize: '0.9rem', margin: 0 }}>
              Positions currently led by each party.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
              {partyEntries
                .slice()
                .sort((a, b) => b[1] - a[1])
                .map(([party, n]) => (
                  <div key={party} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                    <PartyBadge party={party === 'Independent' ? null : party} size={32} />
                    <span style={{ fontWeight: 700 }}>{party}</span>
                    <span style={{ color: 'var(--text-on-dark-muted)', fontSize: '0.85rem' }}>
                      {n} position{n === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Categories */}
      {categories.length === 0 && (
        <div className="empty-state">
          <p>No candidate data available yet.</p>
        </div>
      )}

      {categories.map((category) => {
        const catCandidates = grouped[category];
        const chartData = buildChartData(catCandidates);
        const leader = getLeader(catCandidates);
        const catTotal = catCandidates.reduce((s, c) => s + totalOf(c), 0);
        const icon = POSITION_ICONS[category] || '\u{1F3DB}\uFE0F';

        return (
          <div key={category} className="result-category">
            {/* Category Header */}
            <div className="result-category-header">
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <span style={{ fontSize: '1.5rem' }}>{icon}</span> {category}
              </h3>
              {leader && (
                <div className="leader-badge">
                  <Crown size={14} />
                  Leader: {leader.name}
                </div>
              )}
            </div>

            {/* Chart */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-xl)', padding: 'var(--sp-5)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ height: Math.max(160, catCandidates.length * 50 + 40) }}>
                <Bar options={barOptions} data={chartData} />
              </div>
            </div>

            {/* Leaderboard */}
            <div className="leaderboard">
              {catCandidates
                .slice()
                .sort((a, b) => totalOf(b) - totalOf(a))
                .map((c, i) => {
                  const v = totalOf(c);
                  const pct = catTotal > 0 ? Math.round((v / catTotal) * 100) : 0;
                  const isLeader = leader && leader.id === c.id;
                  const color = PALETTE[i % PALETTE.length];

                  return (
                    <div key={c.id} className={`leaderboard-row ${isLeader ? 'is-leader' : ''}`}>
                      <span className="leaderboard-rank">{i + 1}</span>
                      <PartyBadge
                        party={c.party}
                        code={c.party_code}
                        logoUrl={c.party_logo}
                        size={40}
                      />
                      <div className="leaderboard-info">
                        <div className="leaderboard-name">{c.name}</div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-on-dark-muted)', fontWeight: 600 }}>
                          {c.party || 'Independent'}
                        </div>
                        <div className="leaderboard-bar-track">
                          <div
                            className="leaderboard-bar-fill"
                            style={{
                              width: catTotal > 0 ? `${(v / catTotal) * 100}%` : '0%',
                              background: color,
                            }}
                          />
                        </div>
                      </div>
                      <span className="leaderboard-votes" style={{ color }}>{v}</span>
                      <span className="leaderboard-pct">{pct}%</span>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LiveResults;
