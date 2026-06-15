import React, { useEffect, useState, useMemo } from 'react';
import { subscribeToCandidates } from '../supabaseClient';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Crown, BarChart3 } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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

const LiveResults = () => {
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToCandidates((data) => setCandidates(data));
    return () => unsubscribe();
  }, []);

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

  const totalVotes = candidates.reduce(
    (sum, c) => sum + (c.primary_vote_count || 0) + (c.secondary_vote_count || 0), 0
  );

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
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
        data: catCandidates.map((c) => (c.primary_vote_count || 0) + (c.secondary_vote_count || 0)),
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
    let maxVotes = (leader.primary_vote_count || 0) + (leader.secondary_vote_count || 0);
    catCandidates.forEach((c) => {
      const v = (c.primary_vote_count || 0) + (c.secondary_vote_count || 0);
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
        </div>
        <div className="results-stat">
          <div className="results-stat-value">{totalVotes}</div>
          <div className="results-stat-label">Total Votes</div>
        </div>
      </div>

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
        const catTotal = catCandidates.reduce(
          (s, c) => s + (c.primary_vote_count || 0) + (c.secondary_vote_count || 0), 0
        );
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
                .sort((a, b) => ((b.primary_vote_count || 0) + (b.secondary_vote_count || 0)) - ((a.primary_vote_count || 0) + (a.secondary_vote_count || 0)))
                .map((c, i) => {
                  const v = (c.primary_vote_count || 0) + (c.secondary_vote_count || 0);
                  const pct = catTotal > 0 ? Math.round((v / catTotal) * 100) : 0;
                  const isLeader = leader && leader.id === c.id;
                  const color = PALETTE[i % PALETTE.length];

                  return (
                    <div key={c.id} className={`leaderboard-row ${isLeader ? 'is-leader' : ''}`}>
                      <span className="leaderboard-rank">{i + 1}</span>
                      {c.photo_url && (
                        <img src={c.photo_url} alt={c.name} className="leaderboard-avatar" />
                      )}
                      <div className="leaderboard-info">
                        <div className="leaderboard-name">{c.name}</div>
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
