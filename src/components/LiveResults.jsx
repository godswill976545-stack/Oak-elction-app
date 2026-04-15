import React, { useEffect, useState } from 'react';
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
import { Trophy, Crown, Activity } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const PALETTE = [
  '#059669', // Emerald 600
  '#fbbf24', // Gold 400
  '#0d9488', // Teal 600
  '#f59e0b', // Gold 500
  '#10b981', // Emerald 500
  '#d97706', // Gold 600
  '#34d399', // Emerald 400
  '#ca8a04', // Gold 700
];

const POSITION_ICONS = {
  'Head Boy': '👑',
  'Head Girl': '👑',
  'Social Prefect': '🎉',
  'Sports Prefect (Male)': '⚽',
  'Sports Prefect (Female)': '⚽',
};

const LiveResults = () => {
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToCandidates((data) => {
      setCandidates(data);
    });
    return () => unsubscribe();
  }, []);

  const grouped = {};
  candidates.forEach(c => {
    const cat = c.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  });

  const categories = Object.keys(grouped);

  const totalVotes = candidates.reduce((sum, c) => {
    return sum + (c.primary_vote_count || 0) + (c.secondary_vote_count || 0);
  }, 0);

  const barOptions = (categoryLabel) => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      title: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(6, 78, 59, 0.9)',
        titleFont: { family: 'Outfit', size: 14 },
        bodyFont: { family: 'Outfit', size: 13 },
        padding: 12,
        cornerRadius: 12,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { family: 'Outfit' } },
        grid: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      y: {
        ticks: { color: '#ffffff', font: { family: 'Outfit', weight: '600', size: 13 } },
        grid: { display: false }
      }
    }
  });

  const buildChartData = (categoryCandidates) => {
    const labels = categoryCandidates.map(c => c.name);
    const data = categoryCandidates.map(c => (c.primary_vote_count || 0) + (c.secondary_vote_count || 0));
    const backgroundColors = categoryCandidates.map((_, i) => PALETTE[i % PALETTE.length] + 'cc');
    const borderColors = categoryCandidates.map((_, i) => PALETTE[i % PALETTE.length]);

    return {
      labels,
      datasets: [{
        label: 'Total Votes',
        data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 12,
      }]
    };
  };

  const pieOptions = (catTotal) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#ffffff', font: { family: 'Outfit', size: 12 }, padding: 15 }
      },
      tooltip: {
        backgroundColor: 'rgba(6, 78, 59, 0.9)',
        bodyFont: { family: 'Outfit', size: 13 },
        padding: 12,
        cornerRadius: 12,
        callbacks: {
          label: (context) => {
            const val = context.raw || 0;
            const pct = catTotal > 0 ? Math.round((val / catTotal) * 100) : 0;
            return ` ${context.label}: ${pct}% (${val} votes)`;
          }
        }
      }
    }
  });

  const getLeader = (catCandidates) => {
    if (catCandidates.length === 0) return null;
    let leader = catCandidates[0];
    let maxVotes = (leader.primary_vote_count || 0) + (leader.secondary_vote_count || 0);
    catCandidates.forEach(c => {
      const v = (c.primary_vote_count || 0) + (c.secondary_vote_count || 0);
      if (v > maxVotes) { leader = c; maxVotes = v; }
    });
    return maxVotes > 0 ? { ...leader, totalVotes: maxVotes } : null;
  };

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Dashboard Summary */}
      <div className="candidate-card-glass" style={{ padding: '32px 40px', marginBottom: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Activity size={24} color="var(--gold-400)" />
            <h2 style={{ fontSize: '2rem', margin: 0 }}>Analytics Vault</h2>
          </div>
          <p className="subtitle" style={{ margin: 0, fontSize: '1rem' }}>Live processing of encrypted electoral data streams.</p>
        </div>
        
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.05)', padding: '20px 32px', borderRadius: '24px', 
          border: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center'
        }}>
          <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Cumulative Participation
          </p>
          <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--emerald-500)' }}>{totalVotes}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {categories.length === 0 && (
          <div className="glass-container text-center" style={{ maxWidth: '100%', padding: '80px' }}>
            <p className="subtitle">Polling stations are currently empty. No candidate data streams detected.</p>
          </div>
        )}

        {categories.map((category) => {
          const catCandidates = grouped[category];
          const chartData = buildChartData(catCandidates);
          const leader = getLeader(catCandidates);
          const catTotal = catCandidates.reduce((s, c) => s + (c.primary_vote_count || 0) + (c.secondary_vote_count || 0), 0);
          const icon = POSITION_ICONS[category] || '🏛️';

          return (
            <div key={category} className="candidate-card-glass" style={{ padding: '32px' }}>
              {/* Category Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '2rem' }}>{icon}</span> {category}
                </h3>
                
                {leader && (
                  <div style={{ 
                    display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(245, 158, 11, 0.15)', 
                    padding: '8px 20px', borderRadius: '100px', border: '1px solid var(--gold-500)' 
                  }}>
                    <Crown size={18} color="var(--gold-400)" />
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--gold-400)' }}>
                      Current Leader: {leader.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Data Visualization Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
                {/* Bar Chart */}
                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '24px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ height: Math.max(200, catCandidates.length * 60 + 60) }}>
                    <Bar options={barOptions(category)} data={chartData} />
                  </div>
                </div>

                {/* Pie Chart & Stats */}
                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '24px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flexGrow: 1, minHeight: '200px' }}>
                    {catTotal > 0 ? (
                      <Pie options={pieOptions(catTotal)} data={{
                        ...chartData,
                        datasets: chartData.datasets.map(d => ({ ...d, borderWidth: 0, borderRadius: 0 }))
                      }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
                        <Trophy size={40} style={{ marginBottom: '12px' }} />
                        <p className="subtitle" style={{ margin: 0 }}>No vote data available yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Leaderboard Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginTop: '32px' }}>
                {catCandidates.map((c, i) => {
                  const v = (c.primary_vote_count || 0) + (c.secondary_vote_count || 0);
                  const pct = catTotal > 0 ? Math.round((v / catTotal) * 100) : 0;
                  const isLeader = leader && leader.id === c.id;
                  
                  return (
                    <div key={c.id} style={{
                      background: isLeader ? 'rgba(5, 150, 105, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                      border: isLeader ? '1px solid var(--emerald-500)' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '20px',
                      padding: '20px',
                      textAlign: 'center',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      {isLeader && <div style={{ position: 'absolute', top: 0, right: 0, padding: '4px 8px', background: 'var(--emerald-500)', color: '#fff', fontSize: '10px', fontWeight: 800 }}>LEADER</div>}
                      <p style={{ fontWeight: 800, color: PALETTE[i % PALETTE.length], fontSize: '2rem', margin: 0 }}>{v}</p>
                      <p style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600, margin: '8px 0 2px 0' }}>{c.name}</p>
                      <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{pct}% share</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LiveResults;
