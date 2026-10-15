import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '../../components/ui';
import { Calendar, Users, Flag, Trophy, Plus, Copy, CheckCircle, Trash2, X, Download, MonitorPlay, Mail, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { formatDate, cn } from '../../lib/utils';
import { useDialog } from '../../context/DialogContext';
import CategoryDistributionChart from '../../components/charts/CategoryDistributionChart';
import SolveRatesChart from '../../components/charts/SolveRatesChart';
import ActivityChart from '../../components/charts/ActivityChart';

export default function DashboardPage() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: '', description: '' });
  const [copiedPin, setCopiedPin] = useState(null);
  const [selectedEventForAnalytics, setSelectedEventForAnalytics] = useState(null);
  const [gmailStatus, setGmailStatus] = useState({ loading: true, connected: false, email: null });
  const [connectingGmail, setConnectingGmail] = useState(false);
  const { showAlert, showConfirm } = useDialog();

  const fetchDashboard = async () => {
    try {
      const [dashRes, gmailRes] = await Promise.allSettled([
        adminApi.getDashboard(),
        adminApi.gmailStatus()
      ]);
      if (dashRes.status === 'fulfilled') {
        setStats(dashRes.value.data.stats || []);
      }
      if (gmailRes.status === 'fulfilled') {
        setGmailStatus({
          loading: false,
          connected: Boolean(gmailRes.value.data?.connected),
          email: gmailRes.value.data?.email || null
        });
      } else {
        setGmailStatus({ loading: false, connected: false, email: null });
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      setConnectingGmail(true);
      const res = await adminApi.connectGmail();
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        window.location.href = adminApi.connectGmailUrl();
      }
    } catch {
      window.location.href = adminApi.connectGmailUrl();
    } finally {
      setConnectingGmail(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!selectedEventForAnalytics) {
        setAnalytics(null);
        return;
      }

      try {
        setAnalyticsLoading(true);
        const response = await adminApi.getAnalytics(selectedEventForAnalytics);
        setAnalytics(response.data);
      } catch (error) {
        console.error('Error fetching analytics:', error);
        setAnalytics(null);
      } finally {
        setAnalyticsLoading(false);
      }
    };

    fetchAnalytics();
  }, [selectedEventForAnalytics]);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.name.trim()) return;

    setCreating(true);
    try {
      await adminApi.createEvent(newEvent);
      setShowCreateModal(false);
      setNewEvent({ name: '', description: '' });
      fetchDashboard();
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Error creating event', 'destructive');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    showConfirm({
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event? This will delete all challenges and players in this event.',
      confirmText: 'Delete Event',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await adminApi.deleteEvent(eventId);
          fetchDashboard();
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'Error deleting event', 'destructive');
        }
      }
    });
  };

  const handleToggleActive = async (eventId, currentStatus) => {
    try {
      await adminApi.updateEvent(eventId, { isActive: !currentStatus });
      fetchDashboard();
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Error updating event', 'destructive');
    }
  };

  const handleToggleQuestions = (event) => {
    const willBeVisible = event.questionsVisible !== true;
    showConfirm({
      title: willBeVisible ? 'Make Questions Visible' : 'Lock Questions',
      message: willBeVisible
        ? `Players in ${event.name} will be able to see all active questions${event.startDate && new Date(event.startDate) > new Date() ? ' when the room start time is reached' : ' immediately'}. Continue?`
        : `Players in ${event.name} will no longer be able to view questions or submit answers. Continue?`,
      confirmText: willBeVisible ? 'Make Visible' : 'Lock Questions',
      variant: willBeVisible ? 'success' : 'warning',
      onConfirm: async () => {
        try {
          await adminApi.updateEvent(event.id, { questionsVisible: willBeVisible });
          await fetchDashboard();
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'Error updating question visibility', 'destructive');
        }
      }
    });
  };

  const copyPin = (pin) => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(pin);
    setTimeout(() => setCopiedPin(null), 2000);
  };

  const handleExportLeaderboard = async (eventId, eventName) => {
    try {
      const response = await adminApi.exportLeaderboardPDF(eventId);
      
      // Create blob and download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leaderboard_${eventName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showAlert('Success', 'Leaderboard exported successfully!', 'success');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to export leaderboard', 'destructive');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalPlayers = stats.reduce((acc, s) => acc + s.playerCount, 0);
  const totalChallenges = stats.reduce((acc, s) => acc + s.challengeCount, 0);
  const totalSubmissions = stats.reduce((acc, s) => acc + s.submissionCount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Manage your CTF events</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4" />
          Create Event
        </Button>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Events</p>
              <p className="text-2xl font-mono font-bold text-foreground">{stats.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-cyan-400/10">
              <Users className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Players</p>
              <p className="text-2xl font-mono font-bold text-foreground">{totalPlayers}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-400/10">
              <Flag className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Challenges</p>
              <p className="text-2xl font-mono font-bold text-foreground">{totalChallenges}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-400/10">
              <Trophy className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Solves</p>
              <p className="text-2xl font-mono font-bold text-foreground">{totalSubmissions}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gmail Integration Banner */}
      {!gmailStatus.loading && (
        !gmailStatus.connected ? (
          <Card className="border-amber-500/40 bg-amber-500/10 backdrop-blur-sm">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-amber-500/20 text-amber-300">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    Gmail Email Integration Not Connected
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-normal">Action Required</span>
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Connect the official competition Gmail account to dispatch participant credentials and automated emails.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Button
                  onClick={handleConnectGmail}
                  loading={connectingGmail}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Connect Gmail Now
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-200">
                    Official Gmail Connected: <span className="font-mono text-emerald-300 font-bold">{gmailStatus.email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ready to dispatch participant credentials via official Gmail API.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link to="/admin/participants">
                  <Button variant="outline" size="sm" className="border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/20 text-xs">
                    Manage Credentials
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectGmail}
                  loading={connectingGmail}
                  className="border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/20 text-xs"
                  title="Switch or reconnect Gmail account"
                >
                  Reconnect
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* Events List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No events yet. Create your first event!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stats.map(({ event, playerCount, challengeCount, submissionCount }) => (
                <div
                  key={event.id}
                  className={cn(
                    'flex flex-col p-5 rounded-xl border transition-all duration-200',
                    event.isActive 
                      ? 'bg-card/40 border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.05)] hover:shadow-[0_0_20px_rgba(var(--primary),0.1)] hover:border-primary/50' 
                      : 'bg-muted/10 border-border/50 opacity-75'
                  )}
                >
                  {/* Event Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-mono text-lg font-bold text-foreground line-clamp-1" title={event.name}>{event.name}</h3>
                      <div className="mt-1">
                        {event.isActive ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-success/10 text-success border border-success/30 font-medium tracking-wider uppercase">Active</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-muted/50 text-muted-foreground border border-border/50 font-medium tracking-wider uppercase">Inactive</span>
                        )}
                      </div>
                      <div className="mt-2">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border font-medium tracking-wide',
                          event.questionsVisible
                            ? 'bg-success/10 text-success border-success/30'
                            : 'bg-warning/10 text-warning border-warning/30'
                        )}>
                          {event.questionsVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {event.questionsVisible ? 'Questions Visible' : 'Questions Locked'}
                        </span>
                      </div>
                    </div>
                    {/* Delete Toggle */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteEvent(event.id)}
                      className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 h-8 w-8 -mr-2 -mt-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* PIN Display */}
                  <div className="flex flex-col gap-1.5 mb-5 bg-black/40 p-3 rounded-lg border border-black">
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Access PIN</span>
                    <button
                      onClick={() => copyPin(event.gamePin)}
                      className="flex items-center justify-between px-3 py-2 rounded bg-success/10 border border-success/30 hover:bg-success/20 transition-colors group cursor-pointer"
                      title="Click to copy PIN"
                    >
                      <span className="font-mono font-bold text-success text-lg tracking-widest">{event.gamePin}</span>
                      {copiedPin === event.gamePin ? (
                        <span className="flex items-center gap-1 text-xs text-success font-bold bg-success/20 px-2 py-1 rounded">
                          <CheckCircle className="w-3 h-3" /> Copied
                        </span>
                      ) : (
                        <Copy className="w-4 h-4 text-success/70 group-hover:text-success transition-colors" />
                      )}
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-5">
                     <div className="flex flex-col items-center justify-center p-2 rounded bg-muted/30 border border-border/30">
                        <Users className="w-4 h-4 text-cyan-400 mb-1" />
                        <span className="font-mono font-bold text-sm">{playerCount}</span>
                     </div>
                     <div className="flex flex-col items-center justify-center p-2 rounded bg-muted/30 border border-border/30">
                        <Flag className="w-4 h-4 text-warning mb-1" />
                        <span className="font-mono font-bold text-sm">{challengeCount}</span>
                     </div>
                     <div className="flex flex-col items-center justify-center p-2 rounded bg-muted/30 border border-border/30">
                        <Trophy className="w-4 h-4 text-success mb-1" />
                        <span className="font-mono font-bold text-sm">{submissionCount}</span>
                     </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-auto pt-4 border-t border-border/50 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportLeaderboard(event.id, event.name)}
                      className="w-full min-w-0 justify-center px-2"
                      title="Download leaderboard as PDF"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/admin/stream?eventId=${event.id}`, '_blank')}
                      className="w-full min-w-0 justify-center px-2"
                      title="Open Streamer Mode Broadcast"
                    >
                      <MonitorPlay className="w-4 h-4 mr-1" />
                      Stream View
                    </Button>
                    <Button
                      variant={event.questionsVisible ? 'outline' : 'primary'}
                      size="sm"
                      className={cn(
                        'col-span-2 w-full min-w-0 justify-center px-2',
                        event.questionsVisible && 'border-warning/40 text-warning hover:bg-warning/10'
                      )}
                      onClick={() => handleToggleQuestions(event)}
                    >
                      {event.questionsVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {event.questionsVisible ? 'Lock Questions' : 'Make Questions Visible'}
                    </Button>
                    <Button
                      variant={event.isActive ? "outline" : "default"}
                      size="sm"
                      className={cn("col-span-2 w-full min-w-0 justify-center px-2 transition-all", !event.isActive && "bg-primary text-background")}
                      onClick={() => handleToggleActive(event.id, event.isActive)}
                    >
                      {event.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Analytics Section */}
      {stats.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-mono text-2xl font-bold text-foreground">Visual Analytics</h2>
            <p className="text-muted-foreground">Select an event to view detailed analytics</p>
          </div>

          {/* Event Selector */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedEventForAnalytics === null ? "default" : "outline"}
              onClick={() => setSelectedEventForAnalytics(null)}
            >
              All Events
            </Button>
            {stats.map(({ event }) => (
              <Button
                key={event.id}
                variant={selectedEventForAnalytics === event.id ? "default" : "outline"}
                onClick={() => setSelectedEventForAnalytics(event.id)}
              >
                {event.name}
              </Button>
            ))}
          </div>

          {/* Analytics Charts */}
          {selectedEventForAnalytics ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CategoryDistributionChart data={analytics?.categoryDistribution || []} loading={analyticsLoading} />
              <SolveRatesChart data={analytics?.solveRates || []} loading={analyticsLoading} />
              <div className="lg:col-span-2">
                <ActivityChart data={analytics?.activity || []} loading={analyticsLoading} />
              </div>
            </div>
          ) : (
            <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
              <CardContent className="p-12 flex items-center justify-center text-muted-foreground">
                <p>Select an event to view analytics</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Create New Event</CardTitle>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateEvent} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Event Name</label>
                  <Input
                    placeholder="CTF Challenge 2024"
                    value={newEvent.name}
                    onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <textarea
                    placeholder="Welcome to the CTF..."
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    className="flex min-h-[100px] w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={creating} disabled={!newEvent.name.trim()}>
                    Create Event
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
