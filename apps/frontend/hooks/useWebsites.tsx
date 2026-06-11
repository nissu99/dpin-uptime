"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";

import { API_BACKEND_URL } from "@/config";

export type WebsiteStatus = "Good" | "Bad";

export interface WebsiteTick {
  id: string;
  createdAt: string;
  status: WebsiteStatus;
  latency: number;
}

export interface Website {
  id: string;
  url: string;
  ticks: WebsiteTick[];
}

interface WebsitesResponse {
  websites: Website[];
}

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data as
      | { error?: string }
      | undefined;
    return responseError?.error ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while loading websites.";
}

export function useWebsites() {
  const { getToken, isLoaded, userId } = useAuth();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const token = await getToken();

    if (!token) {
      throw new Error("You need to sign in before managing monitors.");
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }, [getToken]);

  const refreshWebsites = useCallback(async () => {
    if (!isLoaded) {
      return;
    }

    if (!userId) {
      setWebsites([]);
      setLastUpdatedAt(Date.now());
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    setIsRefreshing(true);

    try {
      const headers = await getAuthHeaders();
      const response = await axios.get<WebsitesResponse>(
        `${API_BACKEND_URL}/api/v1/websites`,
        { headers },
      );

      setWebsites(response.data.websites);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getAuthHeaders, isLoaded, userId]);

  const addWebsite = useCallback(
    async (url: string) => {
      const headers = await getAuthHeaders();

      await axios.post(
        `${API_BACKEND_URL}/api/v1/website`,
        { url },
        { headers },
      );

      await refreshWebsites();
    },
    [getAuthHeaders, refreshWebsites],
  );

  const deleteWebsite = useCallback(
    async (websiteId: string) => {
      const headers = await getAuthHeaders();

      await axios.delete(`${API_BACKEND_URL}/api/v1/website`, {
        data: { websiteId },
        headers,
      });

      await refreshWebsites();
    },
    [getAuthHeaders, refreshWebsites],
  );

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshWebsites();
    }, 0);

    if (!isLoaded || !userId) {
      return () => window.clearTimeout(initialRefresh);
    }

    const interval = window.setInterval(() => {
      void refreshWebsites();
    }, 60 * 1000);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [isLoaded, refreshWebsites, userId]);

  return {
    websites,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    error,
    refreshWebsites,
    addWebsite,
    deleteWebsite,
  };
}
