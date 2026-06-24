"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Inbox, Database, Settings, ShieldAlert } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const navItems = [
  {
    title: "Support Inbox",
    url: "/tickets",
    icon: Inbox,
  },
  {
    title: "Knowledge Base",
    url: "/documents",
    icon: Database,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r border-zinc-200/80 bg-zinc-50/50 dark:border-zinc-800/50 dark:bg-zinc-950/50">
      {/* Brand & Org Switcher Header */}
      <SidebarHeader className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex items-center justify-center rounded-lg bg-zinc-900 text-zinc-50 size-7 dark:bg-zinc-100 dark:text-zinc-900">
            <ShieldAlert className="size-4 shrink-0" />
          </div>
          <span className="font-semibold text-zinc-900 tracking-tight dark:text-zinc-100">
            Aegis AI
          </span>
        </div>
        
        {/* Clerk Org Switcher (restricted to workspace orgs) */}
        <div className="px-1">
          <OrganizationSwitcher
            hidePersonal
            appearance={{
              elements: {
                rootBox: "w-full flex",
                organizationSwitcherTrigger:
                  "w-full flex justify-between items-center py-1.5 px-3 border border-zinc-200 rounded-lg bg-white shadow-xs text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/80",
                organizationSwitcherTriggerIcon: "text-zinc-400 size-4",
              },
            }}
          />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Navigation Group */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                      render={
                        <Link href={item.url}>
                          <item.icon data-icon="inline-start" />
                          <span>{item.title}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      {/* User profile actions footer */}
      <SidebarFooter className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 px-1 w-full">
          <UserButton
            showName
            appearance={{
              elements: {
                rootBox: "flex w-full items-center",
                userButtonTrigger: "flex items-center gap-2",
                userButtonOuterIdentifier: "text-sm font-medium text-zinc-700 dark:text-zinc-300",
              },
            }}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
