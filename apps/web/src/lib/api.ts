"use client";

import { useAuth } from "@clerk/nextjs";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export function useApiClient() {
  const { getToken } = useAuth();

  const fetchWithAuth = React.useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(options.headers);
      
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      // Default to JSON content type unless it's FormData
      if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      return response.json();
    },
    [getToken]
  );

  return { fetchWithAuth };
}

import * as React from "react";
