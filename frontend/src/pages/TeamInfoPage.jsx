import { Link } from 'react-router-dom';
import { ArrowLeft, Heart, Sparkles } from 'lucide-react';
import TeamCarousel from '../components/info/TeamCarousel';
import { teamMembers } from '../data/teamMembers';

export default function TeamInfoPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-6xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mb-8 rounded-2xl border border-white/20 bg-white/10 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Team Members
              </p>
              <h1 className="font-mono text-3xl font-bold">Team FlagHunters</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Meet our PICT team behind development, challenge creation, testing, and design.
              </p>
            </div>
            <div className="hidden rounded-full border border-border/50 bg-background/70 px-3 py-1 text-xs text-muted-foreground md:block">
              Made with <Heart className="mx-1 inline h-3 w-3 fill-destructive text-destructive" /> by Team FlagHunters
            </div>
          </div>
        </div>

        <TeamCarousel members={teamMembers} />
      </div>
    </div>
  );
}
