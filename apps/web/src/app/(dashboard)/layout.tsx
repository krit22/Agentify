import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { Separator } from "@/components/ui/separator";
import { TenantSync } from "@/components/tenant-sync";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <TenantSync>
        <div className="flex min-h-screen w-full bg-zinc-50 dark:bg-zinc-950">
          <DashboardSidebar />
        <SidebarInset className="flex flex-col flex-1">
          {/* Header */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200/80 bg-white/70 px-4 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/70">
            <SidebarTrigger className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            
            <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <span className="text-zinc-900 dark:text-zinc-100">Aegis Console</span>
            </div>
          </header>

          {/* Main Content Pane */}
          <main className="flex-1 overflow-auto p-6 md:p-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
      </TenantSync>
    </SidebarProvider>
  );
}
