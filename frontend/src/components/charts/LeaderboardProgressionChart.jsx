import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { adminApi } from '../../lib/api';

// Cyan and blue shades distinguish players while matching the site theme.
const PLAYER_COLORS = [
  '#22d3ee', '#38bdf8', '#60a5fa', '#3b82f6', '#818cf8',
  '#67e8f9', '#93c5fd', '#0ea5e9', '#a5f3fc', '#2563eb'
];

export default function LeaderboardProgressionChart({ eventId }) {
  const [data, setData] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const fetchProgression = async ({ initial = false } = {}) => {
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      try {
        if (initial) {
          setLoading(true);
        }
        const response = await adminApi.getLeaderboardProgression(eventId, 5); // Top 5 for clarity
        
        // Format Recharts data - convert timestamps to readable format
        const formattedData = (response.data.chartData || []).map(point => {
          const date = new Date(point.time);
          const timeStr = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          });
          
          // Remove the ISO string key and keep player scores
          const { time, ...playerScores } = point;
          
          return {
            time: timeStr,
            timestamp: point.time,
            ...playerScores
          };
        });

        setData(formattedData);
        setPlayers(response.data.players || []);
      } catch (error) {
        console.error('Error fetching leaderboard progression:', error);
      } finally {
        isFetchingRef.current = false;
        setLoading(false);
      }
    };

    if (eventId) {
      fetchProgression({ initial: true });
    }

    const interval = window.setInterval(() => {
      if (!eventId) return;
      fetchProgression({ initial: false });
    }, 8000);

    return () => {
      window.clearInterval(interval);
    };
  }, [eventId]);

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gradient-to-b from-card/60 to-card/30 rounded-lg border border-border/20 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading progression data...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gradient-to-b from-card/60 to-card/30 rounded-lg border border-border/20 backdrop-blur-sm">
        <p className="text-muted-foreground">No progression data available yet</p>
      </div>
    );
  }

  return (
    <div className="w-full h-96 bg-gradient-to-b from-card/70 via-card/50 to-background/30 rounded-lg border border-border/20 p-6 backdrop-blur-sm hover:border-border/30 transition-colors">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          data={data} 
          margin={{ top: 15, right: 40, left: 60, bottom: 40 }}
          className="font-sans"
        >
          {/* Subtle grid */}
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#ffffff" 
            opacity={0.08}
            vertical={false}
          />
          
          {/* Axes */}
          <XAxis
            dataKey="time"
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#9ca3af', opacity: 0.7 }}
            axisLine={{ stroke: '#374151', opacity: 0.3 }}
            tickLine={{ stroke: '#374151', opacity: 0.3 }}
          />
          
          <YAxis
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#9ca3af', opacity: 0.7 }}
            axisLine={{ stroke: '#374151', opacity: 0.3 }}
            tickLine={{ stroke: '#374151', opacity: 0.3 }}
            label={{ 
              value: 'Score', 
              angle: -90, 
              position: 'insideLeft', 
              offset: 10,
              style: { fill: '#9ca3af', fontSize: '12px', fontWeight: '600' } 
            }}
          />

          {/* Tooltip */}
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            labelStyle={{ color: '#d1d5db' }}
            itemStyle={{ color: '#d1d5db' }}
          />
          <Legend
            verticalAlign="top"
            height={36}
            wrapperStyle={{ paddingBottom: '8px' }}
            iconType="line"
          />
          {players.map((player, index) => (
            <Line
              key={player.username}
              type="monotone"
              dataKey={player.username}
              stroke={PLAYER_COLORS[index % PLAYER_COLORS.length]}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
