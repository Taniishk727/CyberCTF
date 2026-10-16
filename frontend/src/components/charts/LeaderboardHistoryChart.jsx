import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { leaderboardApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../ui';

const SERIES_COLORS = ['#22d3ee', '#38bdf8', '#60a5fa', '#3b82f6', '#818cf8', '#67e8f9', '#93c5fd', '#0ea5e9', '#a5f3fc', '#2563eb'];

export default function LeaderboardHistoryChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await leaderboardApi.getHistory();
        setData(response.data);
      } catch (err) {
        console.error('Error fetching leaderboard history:', err);
        setError('Failed to load leaderboard history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  if (loading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <CardHeader>
          <CardTitle className="text-primary">Score Progression</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <CardHeader>
          <CardTitle className="text-primary">Score Progression</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
          <p>No data available</p>
        </CardContent>
      </Card>
    );
  }

  // Extract user names from the first data point
  const userNames = data.length > 0 
    ? Object.keys(data[0]).filter(key => key !== 'timestamp')
    : [];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
      <CardHeader>
        <CardTitle className="text-primary">Score Progression</CardTitle>
        <p className="text-sm text-muted-foreground">Track top players' scores over time</p>
      </CardHeader>
      <CardContent className="w-full">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(34, 211, 238, 0.12)" />
            <XAxis
              dataKey="timestamp"
              stroke="#8da6c4"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={Math.max(0, Math.floor(data.length / 6))}
            />
            <YAxis
              stroke="#8da6c4"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(3, 8, 15, 0.96)',
                border: '1px solid rgba(34, 211, 238, 0.35)',
                borderRadius: '8px',
                boxShadow: '0 0 16px rgba(34, 211, 238, 0.12)'
              }}
              labelStyle={{ color: '#67e8f9' }}
              formatter={(value) => value?.toFixed(0) || 0}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
            />
            {userNames.map((userName, index) => (
              <Bar
                key={userName}
                dataKey={userName}
                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                isAnimationActive={true}
                animationDuration={800}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
