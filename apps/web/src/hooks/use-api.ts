"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";

export function useSettings() {
  const { orgId } = useAuth();
  const { fetchWithAuth } = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["settings", orgId],
    queryFn: () => fetchWithAuth("/api/orgs/settings"),
    enabled: !!orgId,
  });

  const mutation = useMutation({
    mutationFn: (data: {
      settings?: {
        vectorScoreThreshold?: number;
        defaultTicketUrgency?: "low" | "med" | "high";
        escalationSLAHours?: number;
      };
      widgetConfig?: {
        brandColor?: string;
        greetingMessage?: string;
        allowedDomains?: string[];
      };
    }) =>
      fetchWithAuth("/api/orgs/settings", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", orgId] });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    updateSettings: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}

export function useDocuments() {
  const { orgId } = useAuth();
  const { fetchWithAuth } = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["documents", orgId],
    queryFn: () => fetchWithAuth("/api/orgs/documents"),
    enabled: !!orgId,
    // Poll every 4 seconds if any document is in transition statuses
    refetchInterval: (queryResult) => {
      const docs = queryResult?.state?.data?.documents || [];
      const hasProcessing = docs.some((doc: { status: string }) =>
        ["QUEUED", "EXTRACTING", "EMBEDDING"].includes(doc.status)
      );
      return hasProcessing ? 4000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetchWithAuth("/api/orgs/documents", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", orgId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      fetchWithAuth(`/api/orgs/documents/${docId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", orgId] });
    },
  });

  return {
    documents: query.data?.documents || [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    refetch: query.refetch,
    uploadDocument: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.error,
    deleteDocument: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}

export function useTickets(status?: string, page: number = 1, limit: number = 20) {
  const { orgId } = useAuth();
  const { fetchWithAuth } = useApiClient();

  const query = useQuery({
    queryKey: ["tickets", orgId, status, page, limit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("page", page.toString());
      params.set("limit", limit.toString());
      return fetchWithAuth(`/api/orgs/tickets?${params.toString()}`);
    },
    enabled: !!orgId,
  });

  return {
    tickets: query.data?.tickets || [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useTicketDetail(ticketId: string | null) {
  const { orgId } = useAuth();
  const { fetchWithAuth } = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["ticket", orgId, ticketId],
    queryFn: () => fetchWithAuth(`/api/orgs/tickets/${ticketId}`),
    enabled: !!orgId && !!ticketId,
  });

  const replyMutation = useMutation({
    mutationFn: (message: string) =>
      fetchWithAuth(`/api/orgs/tickets/${ticketId}/reply`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", orgId, ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets", orgId] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () =>
      fetchWithAuth(`/api/orgs/tickets/${ticketId}/resolve`, {
        method: "POST",
      }),
  });

  const harvestMutation = useMutation({
    mutationFn: (data: { publish: boolean; question: string; answer: string }) =>
      fetchWithAuth(`/api/orgs/tickets/${ticketId}/harvest`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", orgId, ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets", orgId] });
      queryClient.invalidateQueries({ queryKey: ["documents", orgId] });
    },
  });

  return {
    ticket: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    sendReply: replyMutation.mutateAsync,
    isSendingReply: replyMutation.isPending,
    suggestResolve: resolveMutation.mutateAsync,
    isSuggestingResolve: resolveMutation.isPending,
    harvestResolve: harvestMutation.mutateAsync,
    isHarvesting: harvestMutation.isPending,
  };
}
