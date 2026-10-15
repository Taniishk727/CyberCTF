import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoriesApi, challengesApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, CategoryBadge, DifficultyBadge } from '../../components/ui';
import { Search, Filter, CheckCircle, Users, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';

const difficulties = ['All', 'Easy', 'Medium', 'Hard'];

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [loading, setLoading] = useState(true);
  const [lockedMessage, setLockedMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');
  const [showSolved, setShowSolved] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const challengesRes = await challengesApi.getAll();
        if (challengesRes.data.locked) {
          setChallenges([]);
          setLockedMessage(challengesRes.data.message || 'Questions are locked by the event organizer.');
          return;
        }
        setChallenges(challengesRes.data.challenges || []);

        const categoriesRes = await categoriesApi.get();
        
        if (categoriesRes.data.categories) {
          const dynamicCategories = categoriesRes.data.categories.map(c => c.name);
          setCategories(['All', ...dynamicCategories]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredChallenges = challenges.filter((challenge) => {
    const matchesSearch = challenge.title.toLowerCase().includes(search.toLowerCase()) ||
                          challenge.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || challenge.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'All' || challenge.difficulty === selectedDifficulty;
    const matchesSolved = showSolved || !challenge.solved;

    return matchesSearch && matchesCategory && matchesDifficulty && matchesSolved;
  });

  // Group by category
  const groupedChallenges = filteredChallenges.reduce((acc, challenge) => {
    if (!acc[challenge.category]) {
      acc[challenge.category] = [];
    }
    acc[challenge.category].push(challenge);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="font-mono text-3xl font-bold text-foreground">Challenges</h1>
        {!lockedMessage && <p className="text-muted-foreground">
          {challenges.filter(c => c.solved).length} / {challenges.length} solved
        </p>}
      </div>

      {lockedMessage ? (
        <Card className="bg-card/50 border-primary/30">
          <CardContent className="p-10 text-center flex flex-col items-center gap-3">
            <Lock className="w-10 h-10 text-primary" />
            <h2 className="font-mono text-xl font-semibold">Questions Locked</h2>
            <p className="text-muted-foreground">{lockedMessage}</p>
            <p className="text-sm text-muted-foreground">The event organizer will make the challenges visible when the room is ready.</p>
          </CardContent>
        </Card>
      ) : <>

      {/* Filters */}
      <Card className="bg-card/50">
        <CardContent className="p-4 flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search challenges..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                  selectedCategory === category
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Difficulty & Solved Filter */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              {difficulties.map((difficulty) => (
                <button
                  key={difficulty}
                  onClick={() => setSelectedDifficulty(difficulty)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                    selectedDifficulty === difficulty
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {difficulty}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={showSolved}
                onChange={(e) => setShowSolved(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-input accent-primary"
              />
              <span className="text-sm text-muted-foreground">Show solved</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Challenges Grid */}
      {Object.keys(groupedChallenges).length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No challenges found matching your filters.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedChallenges).map(([category, categoryChallenges]) => (
          <div key={category} className="flex flex-col gap-3">
            <h2 className="font-mono text-lg font-semibold text-foreground flex items-center gap-2">
              <CategoryBadge category={category} />
              <span>{category}</span>
              <span className="text-sm text-muted-foreground font-normal">
                ({categoryChallenges.filter(c => c.solved).length}/{categoryChallenges.length})
              </span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryChallenges.map((challenge) => (
                <Link key={challenge._id} to={`/challenges/${challenge._id}`}>
                  <Card 
                    hover 
                    className={cn(
                      'h-full transition-all duration-300',
                      challenge.solved && 'border-success/50 bg-success/20 shadow-[0_0_20px_rgba(var(--success),0.1)]'
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {challenge.solved && (
                            <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                          )}
                          <CardTitle className={cn("text-base transition-all", challenge.solved && "text-success line-through opacity-80")}>
                            {challenge.title}
                          </CardTitle>
                        </div>
                        <span className="font-mono text-sm text-primary font-bold whitespace-nowrap">
                          {challenge.points} pts
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {challenge.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <DifficultyBadge difficulty={challenge.difficulty} />
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3 text-cyan-400" />
                          <span>{challenge.solveCount} solves</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
      </>}
    </div>
  );
}
