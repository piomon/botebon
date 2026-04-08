import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, CheckCircle, CalendarDays, Activity, Settings, LogOut } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "./ui/sidebar";

const navigation = [
  { name: "Pulpit", href: "/", icon: LayoutDashboard },
  { name: "Uczestnicy", href: "/uczestnicy", icon: Users },
  { name: "Walidacja", href: "/walidacja", icon: CheckCircle },
  { name: "Plan", href: "/plan", icon: CalendarDays },
  { name: "Symulacja", href: "/symulacja", icon: Activity },
  { name: "Ustawienia", href: "/ustawienia", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar className="border-r">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sm font-semibold tracking-wider uppercase text-sidebar-primary px-4 py-3">EBON Panel</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link href={item.href} className="flex items-center gap-3">
                            <item.icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 border-b bg-card flex items-center px-6 justify-between shrink-0">
            <h1 className="text-lg font-semibold tracking-tight">
              {navigation.find((n) => n.href === location)?.name || "EBON Panel"}
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Koordynator</span>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
