import { Trophy, Users, Flag, BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function EventStatsPanel({ leaderboard = [], eventData = null }) {
  const totalPlayers = leaderboard.length;
  const activePlayers = leaderboard.filter(p => p.solveCount > 0).length;
  const totalSolves = leaderboard.reduce((sum, p) => sum + p.solveCount, 0);
  const avgScore = totalPlayers > 0 ? Math.round(leaderboard.reduce((sum, p) => sum + p.score, 0) / totalPlayers) : 0;

  const StatCard = ({ icon: Icon, label, value, color = 'text-primary' }) => (
    <div className="rounded-lg bg-gradient-to-br from-card/60 to-card/30 border border-border/20 p-4 hover:border-border/40 hover:from-card/70 transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex-shrink-0', {
          'from-cyan-500/20 to-cyan-500/5': color === 'text-cyan-400',
          'from-cyan-500/20 to-cyan-500/5': color === 'text-cyan-400',
          'from-amber-500/20 to-amber-500/5': color === 'text-amber-400',
        })}>
          <Icon className={cn('w-5 h-5', color === 'text-cyan-400' ? 'text-cyan-400' : color === 'text-amber-400' ? 'text-amber-400' : color)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <aside className="w-full lg:w-80 flex flex-col gap-4">
      {/* Event Info Card */}
      {eventData && (
        <div className="rounded-lg bg-gradient-to-br from-primary/12 to-primary/5 border border-primary/30 p-5 hover:border-primary/40 transition-colors hover:shadow-md">
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">Event</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Event Name</p>
              <p className="font-medium text-foreground mt-2 truncate">{eventData.name || 'Unknown'}</p>
            </div>
            <div className="pt-2">
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Game PIN</p>
              <p className="font-mono text-lg font-bold text-primary mt-2">{eventData.gamePin || '------'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Live Statistics</h3>
        
        <StatCard 
          icon={Users}
          label="Players"
          value={totalPlayers}
          color="text-cyan-400"
        />

        <StatCard 
          icon={Trophy}
          label="Active"
          value={activePlayers}
          color="text-cyan-400"
        />

        <StatCard
          icon={Flag}
          label="Total Solves"
          value={totalSolves}
          color="text-amber-400"
        />

        <StatCard
          icon={BarChart3}
          label="Avg Score"
          value={avgScore}
          color="text-primary"
        />
      </div>
    </aside>
  );
}
