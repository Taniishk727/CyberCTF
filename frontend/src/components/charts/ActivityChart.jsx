import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { adminApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../ui';

export default function ActivityChart({ eventId, data: providedData, loading: providedLoading = false }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (providedData !== undefined) {
      setData(providedData || []);
      setLoading(false);
      return;
    }

    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await adminApi.getAnalytics(eventId);
        setData(response.data.activity || []);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      fetchAnalytics();
    }
  }, [eventId, providedData]);

  const displayData = providedData !== undefined ? providedData : data;
  const displayLoading = providedData !== undefined ? providedLoading : loading;

  if (displayLoading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <CardHeader>
          <CardTitle className="text-primary">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!displayData || displayData.length === 0) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <CardHeader>
          <CardTitle className="text-primary">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
          <p>No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
      <CardHeader>
        <CardTitle className="text-primary">Submission Activity Over Time</CardTitle>
        <p className="text-sm text-muted-foreground">Hourly breakdown of submissions</p>
      </CardHeader>
      <CardContent className="w-full">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={displayData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(34, 211, 238, 0.12)" />
            <XAxis
              dataKey="time"
              stroke="#8da6c4"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={Math.max(0, Math.floor(displayData.length / 6))}
            />
            <YAxis
              stroke="#8da6c4"
              tick={{ fontSize: 12 }}
              label={{ value: 'Submissions', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(3, 8, 15, 0.96)',
                border: '1px solid rgba(34, 211, 238, 0.35)',
                borderRadius: '8px',
                boxShadow: '0 0 16px rgba(34, 211, 238, 0.12)'
              }}
              labelStyle={{ color: '#67e8f9' }}
              formatter={(value) => [value, 'Submissions']}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="submissions"
              stroke="#22d3ee"
              name="Submissions"
              strokeWidth={2}
              dot={false}
              isAnimationActive={true}
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground">Total Submissions</p>
            <p className="font-mono text-2xl font-bold text-primary">
              {displayData.reduce((sum, d) => sum + d.submissions, 0)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground">Peak Hour</p>
            <p className="font-mono text-2xl font-bold text-primary">
              {Math.max(...displayData.map(d => d.submissions))} submissions
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground">Average per Hour</p>
            <p className="font-mono text-2xl font-bold text-primary">
              {Math.round(displayData.reduce((sum, d) => sum + d.submissions, 0) / displayData.length)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
