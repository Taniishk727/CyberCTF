import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useDialog } from '../context/DialogContext';
import { LayoutDashboard, Flag, Users, Shield, Terminal, LogOut, User, ChevronDown, Tag, UserPlus, Mail, CheckCircle } from 'lucide-react';
import { adminApi } from '../lib/api';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';

const adminItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/challenges', label: 'Manage Challenges', icon: Flag },
  { path: '/admin/categories', label: 'Manage Categories', icon: Tag },
  { path: '/admin/participants', label: 'Participants & Credentials', icon: UserPlus },
  { path: '/admin/users', label: 'Manage Users', icon: Users }
];

export default function AdminLayout({ children }) {
  const { user, event, logout } = useSession();
  const { showConfirm, showAlert } = useDialog();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [gmailStatus, setGmailStatus] = useState({ loading: true, connected: false, email: null });
  const [connectingGmail, setConnectingGmail] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchGmailStatus = async () => {
      try {
        const res = await adminApi.gmailStatus();
        if (mounted) {
          setGmailStatus({
            loading: false,
            connected: Boolean(res.data?.connected),
            email: res.data?.email || null
          });
        }
      } catch {
        if (mounted) {
          setGmailStatus({ loading: false, connected: false, email: null });
        }
      }
    };
    fetchGmailStatus();
    return () => { mounted = false; };
  }, [location.pathname]);

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

  const handleLogout = () => {
    setDropdownOpen(false);
    showConfirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
      variant: 'destructive',
      onConfirm: () => {
        logout();
        navigate('/');
      }
    });
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Fixed Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-background to-background/80 border-r border-border/40 flex flex-col fixed inset-y-0 left-0 z-50">
        {/* Logo Area */}
        <div className="h-20 flex items-center px-6 border-b border-border/30">
          <Link to="/admin" className="flex items-center gap-3 group w-full">
            <div className="bg-gradient-to-br from-primary/30 to-primary/10 p-2 rounded-lg text-primary group-hover:from-primary/40 group-hover:to-primary/20 transition-all duration-300 shadow-sm">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="font-mono font-bold text-lg tracking-tight text-white group-hover:text-primary transition-colors block">
                CyberCTF
              </span>
              <span className="text-xs text-muted-foreground">Admin Panel</span>
            </div>
          </Link>
        </div>

        {/* Scrollable Nav Area */}
        <div className="flex-1 overflow-y-auto py-8 px-4 flex flex-col gap-6">
          
          {/* Main Navigation */}
          <div className="flex flex-col gap-3">
            <span className="px-3 text-xs font-bold text-muted-foreground/70 tracking-widest uppercase">
              Navigation
            </span>
            <nav className="flex flex-col gap-1.5">
              {adminItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                    location.pathname === path
                      ? 'bg-primary/15 text-primary shadow-sm border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'
                  )}
                >
                  <Icon className={cn(
                    "w-4 h-4 transition-colors",
                    location.pathname === path ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-foreground'
                  )} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Secondary Navigation */}
          <div className="flex flex-col gap-3 pt-4 border-t border-border/30">
            <span className="px-3 text-xs font-bold text-muted-foreground/70 tracking-widest uppercase">
              Quick Actions
            </span>
            <nav className="flex flex-col gap-1.5">
              {!gmailStatus.connected ? (
                <button
                  onClick={handleConnectGmail}
                  disabled={connectingGmail}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 w-full text-left"
                  title="Authorize official competition Gmail account"
                >
                  <Mail className="w-4 h-4 text-amber-400" />
                  <span>{connectingGmail ? 'Connecting...' : 'Connect Gmail'}</span>
                </button>
              ) : (
                <Link
                  to="/admin/participants"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  title={`Gmail Authorized: ${gmailStatus.email}`}
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate text-xs">Gmail Connected</span>
                </Link>
              )}

              <Link
                to="/home"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
              >
                <Flag className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                <span>Back to Challenges</span>
              </Link>
            </nav>
          </div>
        </div>
        
        {/* User Section at bottom */}
        <div className="p-6 mt-auto border-t border-border/30 bg-gradient-to-t from-background/80 to-transparent">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 bg-gradient-to-r from-muted/40 to-muted/20 hover:from-destructive/20 hover:to-destructive/10 px-4 py-3 rounded-lg transition-all duration-200 group border border-border/30 hover:border-destructive/30"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary group-hover:bg-destructive/20 group-hover:text-destructive transition-colors">
              <span className="font-mono text-xs font-bold uppercase">{user?.username?.substring(0,2) || 'AD'}</span>
            </div>
            <div className="flex-1 text-left overflow-hidden">
              <p className="text-xs font-medium text-foreground truncate group-hover:text-destructive transition-colors">{user?.username || 'Admin'}</p>
              <p className="text-xs text-muted-foreground/60">Click to logout</p>
            </div>
            <LogOut className="w-4 h-4 text-muted-foreground/60 group-hover:text-destructive transition-colors" />
          </button>
        </div>
      </aside>

      {/* Main Content Area (offset by sidebar width) */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top Header / Context bar */}
        <header className="h-20 border-b border-border/30 bg-gradient-to-r from-background via-background to-background/80 backdrop-blur-sm sticky top-0 z-40 px-8 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest">Admin Overview</p>
              </div>
            </div>
          </div>
           
          <div className="flex items-center gap-4">
            {/* Topbar Gmail Connection Indicator & Action */}
            {!gmailStatus.loading && (
              !gmailStatus.connected ? (
                <button
                  onClick={handleConnectGmail}
                  disabled={connectingGmail}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-mono font-semibold transition-all duration-200 shadow-sm"
                  title="Link official competition Gmail account to send participant credentials"
                >
                  <Mail className="w-4 h-4 text-amber-400" />
                  <span>{connectingGmail ? 'Connecting...' : 'Connect Gmail'}</span>
                </button>
              ) : (
                <Link
                  to="/admin/participants"
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono hover:bg-emerald-500/20 transition-colors"
                  title={`Authorized sender: ${gmailStatus.email} (Click to manage)`}
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="truncate max-w-[180px]">{gmailStatus.email}</span>
                </Link>
              )
            )}

            {/* Event Info */}
            <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-muted/30 rounded-lg border border-border/30">
              <span className="text-xs text-muted-foreground/70 uppercase tracking-widest font-semibold">Current Event:</span>
              <span className="text-sm font-mono font-bold text-primary">{event?.name || 'TestCTF'}</span>
            </div>
            
            {/* User Menu Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 border',
                  dropdownOpen 
                    ? 'bg-primary/15 text-primary border-primary/30' 
                    : 'bg-primary/10 text-primary/70 border-primary/20 hover:bg-primary/15 hover:border-primary/30'
                )}
                title="User menu"
              >
                <div className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-primary text-xs font-bold font-mono">
                  {user?.username?.substring(0,2).toUpperCase() || 'AD'}
                </div>
                <ChevronDown className="w-4 h-4" />
              </button>
               
              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-3 w-56 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* User Info */}
                  <div className="px-4 py-4 border-b border-border/30 bg-gradient-to-r from-muted/20 to-transparent">
                    <p className="text-sm font-mono text-foreground font-bold">{user?.username}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Role: Admin</p>
                  </div>
                   
                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate('/home');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left"
                    >
                      <User className="w-4 h-4" />
                      <span>View as Player</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors text-left rounded-lg mx-2 my-1"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
               
              {/* Backdrop to close menu */}
              {dropdownOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
