import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, CheckCircle, CalendarDays, Activity, Settings, LogOut, Menu, ArrowLeft, X } from "lucide-react";
import { useState, useEffect } from "react";

const navigation = [
  { name: "Pulpit", href: "/", icon: LayoutDashboard },
  { name: "Uczestnicy", href: "/uczestnicy", icon: Users },
  { name: "Walidacja", href: "/walidacja", icon: CheckCircle },
  { name: "Plan", href: "/plan", icon: CalendarDays },
  { name: "Automatyzacja", href: "/symulacja", icon: Activity },
  { name: "Ustawienia", href: "/ustawienia", icon: Settings },
];

export function Layout({ children, onLogout }: { children: React.ReactNode; onLogout?: () => void }) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const currentPage = navigation.find((n) => n.href === location);
  const isSubPage = location !== "/";

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-56 lg:w-64 flex-col border-r bg-card shrink-0">
        <div className="px-4 py-4 border-b">
          <h2 className="text-sm font-bold tracking-wider uppercase text-primary">EBON Panel</h2>
        </div>
        <nav className="flex-1 py-2 space-y-0.5 px-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        {onLogout && (
          <div className="px-2 py-3 border-t">
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-destructive hover:bg-destructive/10 w-full transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Wyloguj sie</span>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r shadow-xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="px-4 py-4 border-b flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wider uppercase text-primary">EBON Panel</h2>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-auto">
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="text-base">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
            {onLogout && (
              <div className="px-2 py-3 border-t">
                <button
                  onClick={onLogout}
                  className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-destructive hover:bg-destructive/10 w-full transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-base">Wyloguj sie</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 border-b bg-card flex items-center px-3 md:px-6 justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile: hamburger or back button */}
            <button
              className="md:hidden p-2 -ml-1 rounded-md hover:bg-muted shrink-0"
              onClick={() => {
                if (isSubPage) {
                  setLocation("/");
                } else {
                  setMobileMenuOpen(true);
                }
              }}
            >
              {isSubPage ? <ArrowLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {/* Desktop: always show back on sub-pages */}
            {isSubPage && (
              <button
                className="hidden md:flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
                onClick={() => setLocation("/")}
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Wroc</span>
              </button>
            )}
            <h1 className="text-base md:text-lg font-semibold tracking-tight truncate">
              {currentPage?.name || "EBON Panel"}
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground shrink-0">
            <span className="hidden sm:inline">Koordynator</span>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
