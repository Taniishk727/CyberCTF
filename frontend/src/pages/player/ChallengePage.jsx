import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { useLeaderboard } from '../../context/LeaderboardContext';
import { challengesApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, CategoryBadge, DifficultyBadge } from '../../components/ui';
import { ArrowLeft, CheckCircle, Users, Download, ExternalLink, Lightbulb, Lock, AlertCircle, Terminal, Flag, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDialog } from '../../context/DialogContext';

export default function ChallengePage() {
  const { id } = useParams();
  const { updateScore } = useSession();
  const { refreshLeaderboard } = useLeaderboard();
  
  const [challenge, setChallenge] = useState(null);
  const [lockedMessage, setLockedMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [flag, setFlag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [unlocking, setUnlocking] = useState(null);
  const [copied, setCopied] = useState(false);
  const [hintError, setHintError] = useState({ index: null, message: null });
  const { showConfirm } = useDialog();

  useEffect(() => {
    const fetchChallenge = async () => {
      try {
        const response = await challengesApi.getOne(id);
        setChallenge(response.data.challenge);
      } catch (error) {
        if (error.response?.data?.locked) {
          setLockedMessage(error.response.data.message || 'Questions are locked by the event organizer.');
        }
        console.error('Error fetching challenge:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChallenge();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!flag.trim()) return;

    setSubmitting(true);
    setResult(null);
    setHintError({ index: null, message: null });

    try {
      const response = await challengesApi.submitFlag(id, flag);
      setResult(response.data);
      
      if (response.data.correct) {
        updateScore(response.data.newScore);
        setChallenge(prev => ({ ...prev, solved: true }));
        setFlag('');
        refreshLeaderboard({ force: true }).catch(() => {});
      }
    } catch (error) {
      setResult({
        correct: false,
        message: error.response?.data?.message || 'Error submitting flag'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlockHint = async (hintIndex) => {
    const hint = challenge.hints[hintIndex];
    if (hint.unlocked || challenge.solved) return;

    setUnlocking(hintIndex);
    setHintError({ index: null, message: null });

    try {
      const response = await challengesApi.unlockHint(id, hintIndex);
      updateScore(response.data.newScore);
      refreshLeaderboard({ force: true }).catch(() => {});
      
      setChallenge(prev => ({
        ...prev,
        hints: prev.hints.map((h, i) => 
          i === hintIndex 
            ? { ...h, unlocked: true, content: response.data.hint.content }
            : h
        )
      }));
    } catch (error) {
      setHintError({
        index: hintIndex,
        message: error.response?.data?.message || 'Error unlocking hint'
      });
    } finally {
      setUnlocking(null);
    }
  };

  const copyFlagFormat = () => {
    if (!challenge?.flagFormat) return;
    navigator.clipboard.writeText(challenge.flagFormat);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        {lockedMessage ? <Lock className="w-12 h-12 text-primary" /> : <AlertCircle className="w-12 h-12 text-destructive" />}
        <p className="text-muted-foreground">{lockedMessage || 'Challenge not found'}</p>
        <Link to="/challenges">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4" />
            Back to Challenges
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Back Link */}
      <Link
        to="/challenges"
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Challenges
      </Link>

      {/* Challenge Header Section */}
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {challenge.solved && (
              <CheckCircle className="w-8 h-8 text-success shadow-glow-sm rounded-full" />
            )}
            <h1 className={cn(
              "font-mono text-4xl font-bold text-foreground transition-all duration-300",
              challenge.solved && "text-success line-through opacity-80"
            )}>
              {challenge.title}
            </h1>
          </div>
          <div className="text-right">
            <span className="font-mono text-3xl font-bold text-primary text-glow drop-shadow-md">
              {challenge.points}
            </span>
            <span className="text-sm text-muted-foreground ml-2 uppercase tracking-wide">pts</span>
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Main Content & Submission */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Description Panel */}
          <Card className="bg-card/40 border-border/50 h-fit">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                 <Terminal className="w-5 h-5 text-primary" />
                 Mission Briefing
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="prose prose-invert max-w-none mb-8">
                <p className="text-foreground whitespace-pre-wrap font-mono text-sm leading-relaxed">
                  {challenge.description}
                </p>
              </div>

              {/* Flag Format with Copy */}
              <div className="bg-muted/10 border border-border/50 rounded-lg p-4 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Flag Format</span>
                   <code className="font-mono text-primary bg-background px-3 py-1.5 rounded border border-primary/20 shadow-glow-sm">
                     {challenge.flagFormat}
                   </code>
                 </div>
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   onClick={copyFlagFormat}
                   className="text-muted-foreground hover:text-primary transition-colors"
                 >
                   {copied ? (
                     <span className="flex items-center gap-1.5 text-success"><Check className="w-4 h-4" /> Copied</span>
                   ) : (
                     <span className="flex items-center gap-1.5"><Copy className="w-4 h-4" /> Copy</span>
                   )}
                 </Button>
              </div>
            </CardContent>
          </Card>

          {/* Submission Section */}
          <Card className={cn("bg-card/40 border-border/50 transition-all duration-500", challenge.solved && "bg-success/5 border-success/20 opacity-90 shadow-[0_0_20px_rgba(var(--success),0.05)]")}>
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Flag className="w-5 h-5 text-primary" />
                Submit Flag
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {challenge.solved ? (
                <div className="flex items-center gap-3 text-success bg-success/10 p-5 rounded-xl border border-success/30 shadow-[0_0_15px_rgba(var(--success),0.2)] transition-all">
                  <CheckCircle className="w-6 h-6" />
                  <span className="font-bold font-mono text-lg tracking-wide">TARGET NEUTRALIZED. FLAG ACCEPTED.</span>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder={challenge.flagFormat || 'CTF{enter_your_flag_here}'}
                      value={flag}
                      onChange={(e) => setFlag(e.target.value)}
                      className="font-mono text-lg py-6 bg-black text-primary border-primary/30 focus-visible:ring-primary/50 focus-visible:border-primary shadow-inner placeholder:text-primary/30"
                    />
                  </div>

                  {result && (
                    <div
                      className={cn(
                        'flex items-center gap-2 p-4 rounded-lg font-mono text-sm shadow-sm transition-all animate-in fade-in slide-in-from-top-2',
                        result.correct
                          ? 'bg-success/10 text-success border border-success/30 shadow-[0_0_15px_rgba(var(--success),0.1)]'
                          : 'bg-destructive/10 text-destructive border border-destructive/30'
                      )}
                    >
                      {result.correct ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <AlertCircle className="w-5 h-5" />
                      )}
                      <span className="font-medium tracking-wide">{result.message}</span>
                      {result.correct && result.pointsAwarded && (
                        <span className="ml-auto font-bold text-glow text-base">+{result.pointsAwarded} pts</span>
                      )}
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    size="lg"
                    loading={submitting} 
                    disabled={!flag.trim()}
                    className="w-full font-mono text-base uppercase tracking-wider mt-2 shadow-glow hover:shadow-glow-lg transition-all"
                  >
                    Submit Payload
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN: Metadata Sidebar */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          
          {/* Details Sidebar Panel */}
          <Card className="bg-card/40 border-border/50">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <span className="text-sm text-muted-foreground uppercase tracking-wider">Category</span>
                 <CategoryBadge category={challenge.category} />
              </div>
              <div className="flex items-center justify-between">
                 <span className="text-sm text-muted-foreground uppercase tracking-wider">Difficulty</span>
                 <DifficultyBadge difficulty={challenge.difficulty} />
              </div>
              <div className="flex items-center justify-between">
                 <span className="text-sm text-muted-foreground uppercase tracking-wider">Solves</span>
                 <div className="flex items-center gap-1.5 font-mono text-foreground font-bold">
                   <Users className="w-4 h-4 text-muted-foreground" />
                   {challenge.solveCount}
                 </div>
              </div>
            </CardContent>
          </Card>

          {/* Attachments (Right Panel) */}
          {challenge.attachments && challenge.attachments.length > 0 && (
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="border-b border-border/30 pb-4">
                <CardTitle className="text-lg">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-3">
                  {challenge.attachments.map((attachment, index) => (
                    <a
                      key={index}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/50 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="bg-primary/20 p-2 rounded text-primary">
                         {attachment.type === 'file' ? (
                           <Download className="w-4 h-4" />
                         ) : (
                           <ExternalLink className="w-4 h-4" />
                         )}
                      </div>
                      <span className="text-sm font-mono truncate text-foreground group-hover:text-primary transition-colors">
                        {attachment.name}
                      </span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hints (Right Panel) */}
          {challenge.hints && challenge.hints.length > 0 && (
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="border-b border-border/30 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-warning" />
                  Hints
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-3">
                  {challenge.hints.map((hint, index) => (
                    <div
                      key={index}
                      className={cn(
                        'rounded-lg border p-4 transition-all duration-300',
                        hint.unlocked ? 'bg-muted/30 border-primary/30 shadow-[inset_0_0_10px_rgba(var(--primary),0.05)]' : 'bg-card/50 border-border/50'
                      )}
                    >
                      {hint.unlocked ? (
                        <p className="text-foreground text-sm font-mono leading-relaxed">{hint.content}</p>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Lock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hint {index + 1}</span>
                            </div>
                            <span className="text-xs font-mono text-warning">-{hint.cost} pts</span>
                          </div>
                          
                          {hintError.index === index && (
                             <div className="text-xs text-destructive flex items-center gap-1 font-medium bg-destructive/10 p-2 rounded border border-destructive/20 animate-in fade-in slide-in-from-top-1">
                               <AlertCircle className="w-3 h-3" />
                               {hintError.message}
                             </div>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-warning/30 text-warning hover:bg-warning hover:text-background transition-all"
                            onClick={() => {
                              showConfirm({
                                title: `Unlock Hint ${index + 1}?`,
                                message: `Are you sure you want to reveal this hint? It will deduct ${hint.cost} points from your total score.`,
                                confirmText: 'Confirm Unlock',
                                variant: 'warning',
                                onConfirm: () => handleUnlockHint(index)
                              });
                              setHintError({ index: null, message: null });
                            }}
                            disabled={challenge.solved}
                          >
                            {challenge.solved 
                              ? 'Locked post-solve' 
                              : 'Unlock Reveal'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
