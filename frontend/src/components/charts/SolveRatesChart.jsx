import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { adminApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../ui';

export default function SolveRatesChart({ eventId, data: providedData, loading: providedLoading = false }) {
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
        setData(response.data.solveRates || []);
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
          <CardTitle className="text-primary">Solve Rates</CardTitle>
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
          <CardTitle className="text-primary">Solve Rates</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
          <p>No data available</p>
        </CardContent>
      </Card>
    );
  }

  const sortedData = [...displayData].sort((a, b) => a.percent - b.percent);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
      <CardHeader>
        <CardTitle className="text-primary">Challenge Solve Rates</CardTitle>
        <p className="text-sm text-muted-foreground">Percentage of players who solved each challenge</p>
      </CardHeader>
      <CardContent className="w-full">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={sortedData}
            margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(34, 211, 238, 0.12)" />
            <XAxis
              dataKey="challenge"
              stroke="#8da6c4"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis
              stroke="#8da6c4"
              tick={{ fontSize: 12 }}
              label={{ value: '% Solved', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(3, 8, 15, 0.96)',
                border: '1px solid rgba(34, 211, 238, 0.35)',
                borderRadius: '8px',
                boxShadow: '0 0 16px rgba(34, 211, 238, 0.12)'
              }}
              labelStyle={{ color: '#67e8f9' }}
              formatter={(value) => [`${value}%`, 'Solve Rate']}
            />
            <Legend />
            <Bar
              dataKey="percent"
              fill="#22d3ee"
              name="Solve Rate (%)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground">Total Challenges</p>
            <p className="font-mono text-2xl font-bold text-primary">{displayData.length}</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground">Average Solve Rate</p>
            <p className="font-mono text-2xl font-bold text-primary">
              {Math.round(displayData.reduce((sum, d) => sum + d.percent, 0) / displayData.length)}%
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground">Total Solves</p>
            <p className="font-mono text-2xl font-bold text-primary">
              {displayData.reduce((sum, d) => sum + d.solves, 0)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
