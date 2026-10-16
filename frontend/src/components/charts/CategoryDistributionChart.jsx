import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { adminApi } from '../../lib/api';
import { useCategories } from '../../context/CategoriesContext';
import { Card, CardHeader, CardTitle, CardContent } from '../ui';

// Fallback color palette if category doesn't have a stored color
const FALLBACK_COLORS = [
  '#22d3ee', '#38bdf8', '#60a5fa', '#3b82f6', '#818cf8',
  '#67e8f9', '#93c5fd', '#0ea5e9', '#a5f3fc', '#2563eb'
];

export default function CategoryDistributionChart({ eventId, data: providedData, loading: providedLoading = false }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getColorForCategory } = useCategories();

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
        setData(response.data.categoryDistribution || []);
      } catch (error) {
        console.error('[CategoryDistributionChart] Error fetching analytics:', error);
        setData([]);
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
          <CardTitle className="text-primary">Challenge Distribution</CardTitle>
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
          <CardTitle className="text-primary">Challenge Distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
          <p>No data available</p>
        </CardContent>
      </Card>
    );
  }

  // Get color for each category, using context or fallback
  const getColor = (categoryName, index) => {
    try {
      return getColorForCategory(categoryName);
    } catch (err) {
      console.warn(`[CategoryDistributionChart] Could not get color for ${categoryName}, using fallback`);
      return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
      <CardHeader>
        <CardTitle className="text-primary">Challenge Distribution by Category</CardTitle>
        <p className="text-sm text-muted-foreground">Breakdown of challenges per category</p>
      </CardHeader>
      <CardContent className="w-full">
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={displayData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ category, count }) => `${category}: ${count}`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="count"
            >
              {displayData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={getColor(entry.category, index)} 
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(3, 8, 15, 0.96)',
                border: '1px solid rgba(34, 211, 238, 0.35)',
                borderRadius: '8px',
                boxShadow: '0 0 16px rgba(34, 211, 238, 0.12)'
              }}
              labelStyle={{ color: '#67e8f9' }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
