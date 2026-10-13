import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '../../components/ui';
import { Users, Search, Trash2, Trophy, Flag, Ban, CheckCircle, RotateCcw, UserPlus, X } from 'lucide-react';
import { formatDate, cn } from '../../lib/utils';
import { useDialog } from '../../context/DialogContext';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [search, setSearch] = useState('');
  const { showAlert, showConfirm, showPrompt } = useDialog();

  // Create User Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: '',
    password: '',
    generatePassword: false,
    email: '',
    fullName: '',
    eventId: ''
  });

  const fetchData = async () => {
    try {
      const [usersRes, eventsRes] = await Promise.all([
        adminApi.getUsers(selectedEvent || undefined, 'player'),
        adminApi.getEvents()
      ]);
      setUsers(usersRes.data.users);
      setEvents(eventsRes.data.events);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const username = newUserData.username.trim();
    const email = newUserData.email.trim();
    const eventId = newUserData.eventId || selectedEvent;

    if (!username) {
      showAlert('Validation Error', 'Username is required.', 'destructive');
      return;
    }
    if (!newUserData.generatePassword && newUserData.password.trim().length < 4) {
      showAlert('Validation Error', 'Enter a password with at least 4 characters or choose automatic password generation.', 'destructive');
      return;
    }
    if (newUserData.generatePassword && !email) {
      showAlert('Email Required', 'Enter the user’s email address so the generated password can be delivered securely.', 'destructive');
      return;
    }
    if (email && !eventId) {
      showAlert('Event Required', 'Assign the user to an event before emailing credentials so the room PIN can be included.', 'destructive');
      return;
    }

    try {
      setCreating(true);
      const response = await adminApi.createUser({
        username,
        password: newUserData.generatePassword ? undefined : newUserData.password.trim(),
        generatePassword: newUserData.generatePassword,
        email: email || undefined,
        fullName: newUserData.fullName.trim() || undefined,
        eventId: eventId || undefined
      });

      if (response.data.emailDelivery?.status === 'sent') {
        showAlert('User Created', `User "${username}" was created and the username, password, and room PIN were emailed successfully.`, 'success');
      } else if (response.data.emailDelivery?.status === 'failed') {
        showAlert('User Created — Email Failed', `The account exists, but the credential email could not be sent: ${response.data.emailDelivery.error || 'Unknown delivery error'}.`, 'destructive');
      } else {
        showAlert('Success', `User "${username}" created successfully.`, 'success');
      }
      setIsModalOpen(false);
      setNewUserData({ username: '', password: '', generatePassword: false, email: '', fullName: '', eventId: '' });
      fetchData();
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to create user', 'destructive');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedEvent]);

  const handleDelete = async (id, username) => {
    showConfirm({
      title: 'Delete Player',
      message: `Are you sure you want to permanently delete player "${username}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await adminApi.deleteUser(id);
          fetchData();
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'Error deleting user', 'destructive');
        }
      }
    });
  };

  const handleDeleteAll = async () => {
    const scopeDescription = selectedEvent
      ? `all players in event "${events.find(e => e._id === selectedEvent)?.name || 'selected event'}"`
      : 'ALL players across all events';

    showPrompt({
      title: 'Delete All Players',
      message: `DANGER: Are you sure you want to permanently delete ${scopeDescription}? All associated submissions and hint progress will also be erased. Type DELETE to confirm.`,
      confirmText: 'Delete All',
      expectedValue: 'DELETE',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const res = await adminApi.deleteAllUsers(selectedEvent || undefined);
          showAlert('Success', res.data?.message || 'Players deleted successfully', 'success');
          fetchData();
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'Error deleting all users', 'destructive');
        }
      }
    });
  };

  const handleStatusUpdate = async (id, currentStatus) => {
    const isCurrentlyBanned = currentStatus === true;

    if (isCurrentlyBanned) {
      showConfirm({
        title: 'Unban Player',
        message: 'Are you sure you want to UNBAN this player?',
        confirmText: 'Unban Player',
        variant: 'success',
        onConfirm: async () => {
          try {
            await adminApi.unbanUser(id);
            fetchData();
          } catch (error) {
            showAlert('Error', error.response?.data?.message || 'Error unbanning user', 'destructive');
          }
        }
      });
      return;
    }

    const reason = window.prompt('Ban reason', 'Violation of rules');
    if (reason === null) {
      return;
    }

    showConfirm({
      title: 'Ban Player',
      message: 'Are you sure you want to BAN this player?',
      confirmText: 'Ban Player',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await adminApi.banUser(id, reason.trim() || 'Violation of rules');
          fetchData();
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'Error banning user', 'destructive');
        }
      }
    });
  };

  const handleReset = async (id, username) => {
    showPrompt({
      title: 'Reset Player Progress',
      message: `DANGER: This will wipe all points and challenge progress for ${username}. This action is irreversible.`,
      confirmText: 'Reset Progress',
      expectedValue: 'RESET',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await adminApi.resetUser(id);
          fetchData();
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'Error resetting player', 'destructive');
        }
      }
    });
  };

  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(search.toLowerCase())
  );

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-3xl font-bold text-foreground flex items-center gap-3">
            <Users className="w-8 h-8 text-cyan-400" />
            Players
          </h1>
          <p className="text-muted-foreground">{users.length} players</p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          {users.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete All Players
            </Button>
          )}
          <Button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add New User
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Event Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground whitespace-nowrap">Event:</label>
          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-input text-foreground"
          >
            <option value="">All Events</option>
            {events.map((event) => (
              <option key={event._id} value={event._id}>{event.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {filteredUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No players found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Username</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Event</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Score</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Solves</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Joined</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const banned = user.isBanned || user.status === 'banned';

                    return (
                    <tr key={user._id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="p-4">
                        <span className={cn("font-mono font-medium", banned ? 'text-muted-foreground line-through' : 'text-foreground')}>
                          {user.username}
                        </span>
                      </td>
                      <td className="p-4">
                        {banned ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-destructive/20 text-destructive border border-destructive/30 font-medium uppercase tracking-wider">Banned</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-success/20 text-success border border-success/30 font-medium uppercase tracking-wider">Active</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground">
                          {user.eventId?.name || 'Unknown'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="flex items-center justify-end gap-1 font-mono text-primary font-bold">
                          <Trophy className="w-4 h-4 text-amber-400" />
                          {user.score}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="flex items-center justify-end gap-1 text-muted-foreground">
                          <Flag className="w-4 h-4 text-blue-400" />
                          {user.solveCount}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusUpdate(user._id, banned)}
                            title={banned ? 'Unban Player' : 'Ban Player'}
                            className={banned ? "text-success hover:text-success hover:bg-success/10" : "text-destructive hover:text-destructive hover:bg-destructive/10"}
                          >
                            {banned ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleReset(user._id, user.username)}
                            title="Reset Progress"
                            className="text-warning hover:text-warning hover:bg-warning/10"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(user._id, user.username)}
                            title="Delete Player"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add New User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-border/50">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <h3 className="font-mono font-bold text-lg text-foreground">Add New User</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Username / Student ID *
                </label>
                <Input
                  required
                  placeholder="e.g. C2K24101"
                  value={newUserData.username}
                  onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                  className="font-mono"
                  autoFocus
                />
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUserData.generatePassword}
                  onChange={(e) => setNewUserData({ ...newUserData, generatePassword: e.target.checked, password: '' })}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">Generate a strong password automatically</span>
                  <span className="mt-1 block text-xs text-muted-foreground">The password is generated and hashed on the server, never shown to you, and emailed to the user.</span>
                </span>
              </label>

              {!newUserData.generatePassword && (
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Password / Passcode *
                  </label>
                  <Input
                    required
                    type="password"
                    placeholder="Minimum 4 characters"
                    value={newUserData.password}
                    onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                    className="font-mono"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Full Name (Optional)
                </label>
                <Input
                  placeholder="e.g. John Doe"
                  value={newUserData.fullName}
                  onChange={(e) => setNewUserData({ ...newUserData, fullName: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Email Address {newUserData.generatePassword ? '*' : '(Optional)'}
                </label>
                <Input
                  type="email"
                  placeholder="e.g. john@college.edu"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Assign to Event {newUserData.email.trim() ? '*' : ''}
                </label>
                <select
                  value={newUserData.eventId || selectedEvent}
                  onChange={(e) => setNewUserData({ ...newUserData, eventId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-sm"
                >
                  <option value="">{newUserData.email.trim() ? 'Select an event to email its room PIN' : 'No Event (Join with Game PIN later)'}</option>
                  {events.map((event) => (
                    <option key={event._id} value={event._id}>{event.name} (PIN: {event.gamePin})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={creating}
                  disabled={!newUserData.username.trim() || (!newUserData.generatePassword && !newUserData.password.trim())}
                >
                  Create User
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
