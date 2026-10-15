import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { challengesApi } from '../../lib/api';
import { useLeaderboard } from '../../context/LeaderboardContext';
import TeamCarousel from '../../components/info/TeamCarousel';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui';
import { Flag, Trophy, Target, Zap, ArrowRight, CheckCircle, Terminal, Users, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { teamMembers } from '../../data/teamMembers';

export default function HomePage() {
  const { user, event } = useSession();
  const { currentUser, totalPlayers, loading: leaderboardLoading } = useLeaderboard();
  const [stats, setStats] = useState({ solved: 0, total: 0 });
  const [recentChallenges, setRecentChallenges] = useState([]);
  const [questionsLocked, setQuestionsLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const challengesRes = await challengesApi.getAll();

        if (challengesRes.data.locked) {
          setQuestionsLocked(true);
          setStats({ solved: 0, total: 0 });
          setRecentChallenges([]);
          return;
        }
        const challenges = challengesRes.data.challenges || [];
        const solvedCount = challenges.filter(c => c.solved).length;
        
        setStats({
          solved: solvedCount,
          total: challenges.length
        });

        // Get unsolved challenges for recommendations
        const unsolved = challenges.filter(c => !c.solved).slice(0, 3);
        setRecentChallenges(unsolved);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Welcome Hero Banner */}
      <div className="bg-card/40 border border-border/50 rounded-2xl p-10 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
        
        <div className="bg-primary shadow-glow p-4 rounded-xl inline-flex text-background mb-8 relative z-10">
          <Terminal className="w-8 h-8" />
        </div>
        
        <h1 className="font-mono text-5xl font-bold text-foreground mb-4 relative z-10">
          Welcome to <span className="text-glow">{event?.name || 'TestCTF'}</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mb-8 relative z-10">
          Jump back into the competition, solve event-specific challenges, and climb the leaderboard.
        </p>
        
        <div className="flex items-center gap-4 relative z-10">
          <Link to="/challenges" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-background px-6 py-3 rounded-lg font-medium transition-colors shadow-glow-sm">
            {questionsLocked ? <Lock className="w-5 h-5" /> : <Flag className="w-5 h-5" />}
            {questionsLocked ? 'Questions Locked' : 'Open Challenges'}
          </Link>
          <Link to="/leaderboard" className="inline-flex items-center gap-2 border border-border/50 hover:bg-muted/30 text-foreground px-6 py-3 rounded-lg font-medium transition-colors">
            <Trophy className="w-5 h-5" />
            View Leaderboard
          </Link>
        </div>
      </div>

      {/* 3 Column Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Your Score */}
        <Card className="bg-card/40 border-border/50">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Your Score</p>
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-4xl font-mono font-bold text-primary">{user?.score || 0}</p>
              <p className="text-sm text-muted-foreground">
                {leaderboardLoading ? 'Loading rank...' : `Rank #${currentUser?.rank ?? '-'}`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Challenges Solved */}
        <Card className="bg-card/40 border-border/50">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Challenges Solved</p>
              <Flag className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-4xl font-mono font-bold text-primary">
                {stats.solved}<span className="text-2xl text-muted-foreground">/{stats.total}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0}% completion
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard Competitors */}
        <Card className="bg-card/40 border-border/50">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Leaderboard</p>
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-4xl font-mono font-bold text-primary">{totalPlayers}</p>
              <p className="text-sm text-muted-foreground">
                {leaderboardLoading ? 'Refreshing leaderboard...' : 'Active competitors'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2 Column Bottom Information Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Event Challenges Info */}
        <Card className="bg-card/40 border-border/50 flex flex-col h-full">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
               <Flag className="w-5 h-5 text-primary" />
               <CardTitle className="text-lg">Event Challenges</CardTitle>
            </div>
              <p className="text-sm text-muted-foreground">{questionsLocked ? 'The event organizer has not made the questions visible yet.' : 'Latest challenges available in your current session'}</p>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[150px]">
            <Link to="/challenges" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors mt-auto mb-4">
              View All Challenges <ArrowRight className="w-4 h-4" />
            </Link>
          </CardContent>
        </Card>

        {/* Top Players Info */}
        <Card className="bg-card/40 border-border/50 flex flex-col h-full">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
               <Trophy className="w-5 h-5 text-primary" />
               <CardTitle className="text-lg">Top Players</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">Current standings for your event</p>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[150px]">
             <div className="py-6 px-12 bg-background/50 border border-border/50 rounded-lg text-sm text-muted-foreground w-full text-center mt-2 mb-8">
               {totalPlayers === 0 ? 'No players yet' : 'Leaderboard active'}
             </div>
             
            <Link to="/leaderboard" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors mt-auto mb-4">
              Full Leaderboard <ArrowRight className="w-4 h-4" />
            </Link>
          </CardContent>
        </Card>

      </div>

      <Card className="bg-card/40 border-border/50 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Team Spotlight</CardTitle>
          <p className="text-sm text-muted-foreground">Meet the builders behind CyberCTF</p>
        </CardHeader>
        <CardContent className="pt-2 pb-4">
          <TeamCarousel members={teamMembers} />
        </CardContent>
      </Card>
    </div>
  );
}
