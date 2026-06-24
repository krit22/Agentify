"use client";

import * as React from "react";
import { useOrganization, useAuth, OrganizationList } from "@clerk/nextjs";
import { useApiClient } from "@/lib/api";
import { ShieldAlert } from "lucide-react";

export function TenantSync({ children }: { children: React.ReactNode }) {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const { orgId, isLoaded: isAuthLoaded } = useAuth();
  const { fetchWithAuth } = useApiClient();
  const [syncedOrgId, setSyncedOrgId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOrgLoaded && organization && organization.id !== syncedOrgId) {
      const syncOrg = async () => {
        try {
          console.log(`[TENANT SYNC] Syncing active organization: ${organization.name} (${organization.id})`);
          await fetchWithAuth("/api/auth/sync", {
            method: "POST",
            body: JSON.stringify({ orgName: organization.name }),
          });
          setSyncedOrgId(organization.id);
        } catch (error) {
          console.error("[TENANT SYNC] Failed to sync tenant organization with database:", error);
        }
      };
      syncOrg();
    }
  }, [organization, isOrgLoaded, syncedOrgId, fetchWithAuth]);

  const isLoaded = isOrgLoaded && isAuthLoaded;

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-32 rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  // If no organization is selected, show the setup screen
  if (!orgId) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full max-w-md flex flex-col gap-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center rounded-2xl bg-zinc-900 text-zinc-50 size-12 dark:bg-zinc-100 dark:text-zinc-900 shadow-md">
              <ShieldAlert className="size-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-2">
              Select or Create an Organization
            </h1>
            <p className="text-sm text-zinc-500 max-w-sm">
              Aegis AI requires an active organization tenant to manage knowledge bases, settings, and support tickets.
            </p>
          </div>

          <div className="border border-zinc-200/80 bg-white p-6 rounded-2xl shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/50 flex flex-col items-center gap-4">
            <OrganizationList 
              hidePersonal
              afterCreateOrganizationUrl="/settings"
              afterSelectOrganizationUrl="/settings"
            />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
