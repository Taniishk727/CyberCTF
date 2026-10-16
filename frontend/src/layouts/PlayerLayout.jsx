import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useDialog } from '../context/DialogContext';
import { Home, Flag, Trophy, User, Shield, Terminal, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { useState } from 'react';
import UserRankDisplay from '../components/UserRankDisplay';

const studentItems = [
  { path: '/home', label: 'Home', icon: Home },
  { path: '/challenges', label: 'Challenges', icon: Flag },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { path: '/profile', label: 'Profile', icon: User }
];

export default function PlayerLayout({ children }) {
  const { user, event, isAdmin, logout } = useSession();
  const { showConfirm } = useDialog();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
      <aside className="hidden md:flex w-64 bg-background border-r border-border/50 flex-col fixed inset-y-0 left-0 z-50">
        {/* Logo Area */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-border/50">
          <Link to="/home" className="flex items-center gap-2 group">
            <div className="bg-primary/20 p-1.5 rounded text-primary group-hover:bg-primary group-hover:text-background transition-colors duration-300 shadow-glow">
              <Terminal className="w-5 h-5" />
            </div>
            <span className="font-mono font-bold text-xl tracking-tight text-white group-hover:text-primary transition-colors">
              FlagHunters
            </span>
          </Link>
        </div>

        {/* Scrollable Nav Area */}
        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-8">
          
          {/* Student Section */}
          <div className="flex flex-col gap-2">
            <span className="px-2 text-xs font-bold text-muted-foreground tracking-wider mb-2 uppercase">
              Student
            </span>
            <nav className="flex flex-col gap-1">
              {studentItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    location.pathname === path
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className={cn(
                    "w-4 h-4",
                    location.pathname === path ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )} />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Admin Section (shown if Admin or generic) */}
          {(isAdmin || user?.role === 'admin') && (
            <div className="flex flex-col gap-2">
              <span className="px-2 text-xs font-bold text-muted-foreground tracking-wider mb-2 uppercase">
                Admin
              </span>
              <nav className="flex flex-col gap-1">
                <Link
                  to="/admin"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    location.pathname.startsWith('/admin')
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Shield className={cn(
                    "w-4 h-4",
                    location.pathname.startsWith('/admin') ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )} />
                  Admin Panel
                </Link>
              </nav>
            </div>
          )}
        </div>
        
        {/* User Badge / Logout at bottom */}
        <div className="p-4 mt-auto border-t border-border/50">
          <div className="flex items-center gap-3 bg-muted/30 px-3 py-2 rounded-full cursor-pointer hover:bg-destructive/20 hover:text-destructive group transition-colors" onClick={handleLogout}>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary group-hover:bg-destructive group-hover:text-background transition-colors">
              <span className="font-mono text-sm uppercase">{user?.username?.substring(0,2) || 'TE'}</span>
            </div>
            <div className="flex-1 overflow-hidden">
               <p className="text-xs font-medium text-foreground truncate group-hover:text-destructive transition-colors">Logout</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area (offset by sidebar width) */}
      <div className="flex-1 min-w-0 md:ml-64 flex flex-col min-h-screen">
        {/* Top Header / Context bar */}
        <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 backdrop-blur-sm px-4 sm:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 sm:gap-6">
              <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
                <span className="shrink-0 text-muted-foreground/80">Event:</span>
                <span className="truncate font-mono text-primary">{event?.name || 'TestCTF'}</span>
              </div>

              {/* Live Rank Display */}
              <div className="hidden sm:block">
                <UserRankDisplay />
              </div>
            </div>

            {/* User Dropdown Menu */}
            <div className="relative shrink-0">
               <button
                 onClick={() => setDropdownOpen(!dropdownOpen)}
                 className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold font-mono hover:border-primary/50 hover:bg-primary/30 transition-colors"
                 title="User menu"
               >
                 {user?.username?.substring(0,2).toUpperCase() || 'TE'}
               </button>
               
               {/* Dropdown Menu */}
               {dropdownOpen && (
                 <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                   {/* User Info */}
                   <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
                     <p className="text-sm font-mono text-foreground font-bold">{user?.username}</p>
                     <p className="text-xs text-muted-foreground">{event?.name || 'TestCTF'}</p>
                   </div>
                   
                   {/* Menu Items */}
                   <div className="py-1">
                     <Link
                       to="/profile"
                       className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                       onClick={() => setDropdownOpen(false)}
                     >
                       <User className="w-4 h-4" />
                       View Profile
                     </Link>
                     <button
                       onClick={handleLogout}
                       className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
                     >
                       <LogOut className="w-4 h-4" />
                       Logout
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

          {/* Compact navigation for phones and tablets */}
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Player navigation">
            {studentItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  location.pathname === path
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
