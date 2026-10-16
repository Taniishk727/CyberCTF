import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { authApi } from '../lib/api';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui';
import { Terminal, ArrowRight, Shield } from 'lucide-react';

export default function JoinPage() {
  const navigate = useNavigate();
  const { login } = useSession();
  
  const [gamePin, setGamePin] = useState('');
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.join(username, gamePin, passcode);
      login(response.data.user, response.data.event, response.data.token);
      navigate('/home');
    } catch (err) {
      if (!err.response) {
        setError('Unable to reach server. Please check your connection or CORS settings.');
      } else if (err.response.status === 401) {
        setError(err.response?.data?.message || 'Incorrect passcode for this username');
      } else if (err.response.status === 403) {
        setError(err.response?.data?.message || 'Access denied or account banned');
      } else if (err.response.status === 429) {
        setError(err.response?.data?.message || 'Too many attempts. Please wait a moment.');
      } else if (err.response.status >= 500) {
        setError('Server error occurred. Please try again later.');
      } else {
        setError(err.response?.data?.message || 'Failed to join event');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Terminal className="w-10 h-10 text-primary" />
          <h1 className="font-mono font-bold text-3xl text-foreground text-glow">Flag Hunters</h1>
        </div>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              Join Flag Hunters Event
            </CardTitle>
            <CardDescription>
              Enter Room PIN, Username, and Passcode to join or resume
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="gamePin" className="text-sm font-medium text-foreground">
                  Room PIN
                </label>
                <Input
                  id="gamePin"
                  type="text"
                  placeholder="Enter 6-character Room PIN"
                  value={gamePin}
                  onChange={(e) => setGamePin(e.target.value.replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  onInput={(e) => { e.target.value = e.target.value.toUpperCase(); }}
                  maxLength={6}
                  className="text-center text-base font-mono tracking-widest uppercase"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="username" className="text-sm font-medium text-foreground">
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="passcode" className="text-sm font-medium text-foreground">
                  Account Passcode
                </label>
                <Input
                  id="passcode"
                  type="password"
                  placeholder="Enter passcode (min 4 chars)"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="font-mono"
                />
                <span className="text-xs text-muted-foreground">
                  Your secret passcode secures your score and prevents others from logging in as you.
                </span>
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button type="submit" loading={loading} disabled={gamePin.length !== 6 || !username.trim() || passcode.length < 4}>
                Join Event
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <Link
              to="/admin/login"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Shield className="w-4 h-4" />
              Admin Login
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
