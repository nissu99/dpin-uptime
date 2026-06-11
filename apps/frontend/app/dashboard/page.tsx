"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import axios from "axios";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWebsites, type Website } from "@/hooks/useWebsites";
import { IS_CLERK_CONFIGURED } from "@/lib/auth";
import { cn } from "@/lib/utils";

type UptimeStatus = "good" | "bad" | "unknown";

interface ProcessedWebsite {
  id: string;
  url: string;
  displayHost: string;
  status: UptimeStatus;
  uptimePercentage: number | null;
  lastChecked: string;
  averageLatency: number | null;
  checks: number;
  incidents: number;
  uptimeTicks: UptimeStatus[];
}

const statusConfig: Record<
  UptimeStatus,
  {
    label: string;
    icon: LucideIcon;
    dot: string;
    badge: string;
    tick: string;
  }
> = {
  good: {
    label: "Online",
    icon: Wifi,
    dot: "bg-emerald-500",
    badge:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
    tick: "bg-emerald-500",
  },
  bad: {
    label: "Down",
    icon: WifiOff,
    dot: "bg-rose-500",
    badge:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300",
    tick: "bg-rose-500",
  },
  unknown: {
    label: "Pending",
    icon: Clock3,
    dot: "bg-zinc-400",
    badge:
      "border-border bg-muted text-muted-foreground dark:border-zinc-700 dark:bg-zinc-900/80",
    tick: "bg-zinc-300 dark:bg-zinc-700",
  },
};

function getActionError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data as
      | { error?: string }
      | undefined;
    return responseError?.error ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The request could not be completed.";
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Enter a URL to monitor.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString();
  } catch {
    throw new Error("Enter a valid URL.");
  }
}

function getDisplayHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatUptime(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${value.toFixed(value >= 99 ? 2 : 1)}%`;
}

function formatLatency(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${Math.round(value)}ms`;
}

function formatRelativeTime(value: string | null, now: number) {
  if (!value) {
    return "Never checked";
  }

  const date = new Date(value);
  const time = date.getTime();

  if (Number.isNaN(time)) {
    return "Unknown";
  }

  const seconds = Math.max(0, Math.floor((now - time) / 1000));

  if (seconds < 45) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function toUptimeStatus(status: string): UptimeStatus {
  if (status === "Good") {
    return "good";
  }

  if (status === "Bad") {
    return "bad";
  }

  return "unknown";
}

function processWebsite(website: Website, now: number): ProcessedWebsite {
  const sortedTicks = [...website.ticks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const newestTick = sortedTicks[0];
  const newestTickTime = newestTick
    ? new Date(newestTick.createdAt).getTime()
    : null;
  const currentStatus =
    newestTick && newestTickTime && now - newestTickTime <= 5 * 60 * 1000
      ? toUptimeStatus(newestTick.status)
      : "unknown";

  const uptimeTicks: UptimeStatus[] = Array.from({ length: 10 }, (_, index) => {
    const windowStart = now - (10 - index) * 3 * 60 * 1000;
    const windowEnd = now - (9 - index) * 3 * 60 * 1000;
    const windowTicks = sortedTicks.filter((tick) => {
      const tickTime = new Date(tick.createdAt).getTime();
      return tickTime >= windowStart && tickTime < windowEnd;
    });

    if (windowTicks.length === 0) {
      return "unknown";
    }

    const goodTicks = windowTicks.filter(
      (tick) => tick.status === "Good",
    ).length;
    return goodTicks / windowTicks.length >= 0.5 ? "good" : "bad";
  });

  const checks = sortedTicks.length;
  const goodTicks = sortedTicks.filter((tick) => tick.status === "Good").length;
  const uptimePercentage = checks > 0 ? (goodTicks / checks) * 100 : null;
  const averageLatency =
    checks > 0
      ? sortedTicks.reduce((total, tick) => total + tick.latency, 0) / checks
      : null;
  const incidents = sortedTicks.filter((tick) => {
    const tickTime = new Date(tick.createdAt).getTime();
    return tick.status === "Bad" && now - tickTime <= 24 * 60 * 60 * 1000;
  }).length;

  return {
    id: website.id,
    url: website.url,
    displayHost: getDisplayHost(website.url),
    status: currentStatus,
    uptimePercentage,
    lastChecked: formatRelativeTime(newestTick?.createdAt ?? null, now),
    averageLatency,
    checks,
    incidents,
    uptimeTicks,
  };
}

function StatusBadge({ status }: { status: UptimeStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        config.badge,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {config.label}
    </span>
  );
}

function UptimeTicks({ ticks }: { ticks: UptimeStatus[] }) {
  return (
    <div>
      <div className="flex h-8 gap-1" aria-label="Last 30 minutes status">
        {ticks.map((tick, index) => (
          <span
            key={`${tick}-${index}`}
            title={`${30 - index * 3} minutes ago: ${statusConfig[tick].label}`}
            className={cn("min-w-2 flex-1 rounded-sm", statusConfig[tick].tick)}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>30m ago</span>
        <span>now</span>
      </div>
    </div>
  );
}

function CreateWebsiteModal({
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(url);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Add monitor</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The hub will start checking this endpoint after validators
              connect.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <label htmlFor="website-url" className="mt-6 block text-sm font-medium">
          URL
        </label>
        <input
          id="website-url"
          type="url"
          autoFocus
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
          className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/20"
        />

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isSubmitting && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            Add monitor
          </Button>
        </div>
      </form>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-lg border border-border bg-muted"
        />
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-md bg-emerald-500/10 text-emerald-600">
        <Globe2 className="size-6" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-lg font-semibold">No monitors yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Add the first endpoint to start collecting validator checks and uptime
        history.
      </p>
      <Button
        type="button"
        onClick={onAdd}
        className="mt-6 bg-emerald-600 text-white hover:bg-emerald-700"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add monitor
      </Button>
    </div>
  );
}

function WebsiteCard({
  isDeleting,
  onDelete,
  website,
}: {
  isDeleting: boolean;
  onDelete: (website: ProcessedWebsite) => void;
  website: ProcessedWebsite;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <article className="rounded-lg border border-border bg-card shadow-sm">
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex min-w-0 items-center gap-4 text-left"
          aria-expanded={isExpanded}
        >
          <span
            className={cn(
              "size-3 shrink-0 rounded-full",
              statusConfig[website.status].dot,
            )}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate font-semibold">
              {website.displayHost}
            </span>
            <span className="mt-1 block truncate text-sm text-muted-foreground">
              {website.url}
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <StatusBadge status={website.status} />
          <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {formatUptime(website.uptimePercentage)} uptime
          </span>
          <Button asChild type="button" size="icon" variant="ghost">
            <a
              href={website.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${website.displayHost}`}
              title={`Open ${website.displayHost}`}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onDelete(website)}
            disabled={isDeleting}
            aria-label={`Delete ${website.displayHost}`}
            title={`Delete ${website.displayHost}`}
            className="text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setIsExpanded((value) => !value)}
            aria-label={isExpanded ? "Collapse monitor" : "Expand monitor"}
            title={isExpanded ? "Collapse monitor" : "Expand monitor"}
          >
            {isExpanded ? (
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border p-4">
          <UptimeTicks ticks={website.uptimeTicks} />
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Last checked</p>
              <p className="mt-1 font-medium">{website.lastChecked}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Average latency</p>
              <p className="mt-1 font-medium">
                {formatLatency(website.averageLatency)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Checks</p>
              <p className="mt-1 font-medium">{website.checks}</p>
            </div>
            <div>
              <p className="text-muted-foreground">24h incidents</p>
              <p className="mt-1 font-medium">{website.incidents}</p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function SignedOutDashboard() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-3xl place-items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-md bg-emerald-500/10 text-emerald-600">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">
          Sign in to view monitors
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Your uptime monitors, validator checks, and incident history are tied
          to your account.
        </p>
        <SignInButton mode="modal">
          <Button
            type="button"
            className="mt-6 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Sign in
          </Button>
        </SignInButton>
      </div>
    </main>
  );
}

function AuthConfigurationState() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-3xl place-items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-md bg-amber-500/10 text-amber-600">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Clerk is not configured</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to run
          the authenticated dashboard.
        </p>
      </div>
    </main>
  );
}

function DashboardContent() {
  const {
    addWebsite,
    deleteWebsite,
    error,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    refreshWebsites,
    websites,
  } = useWebsites();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingWebsiteId, setDeletingWebsiteId] = useState<string | null>(
    null,
  );

  const processedWebsites = useMemo(() => {
    return websites.map((website) => processWebsite(website, lastUpdatedAt));
  }, [lastUpdatedAt, websites]);

  const summary = useMemo(() => {
    const uptimeValues = processedWebsites
      .map((website) => website.uptimePercentage)
      .filter((value): value is number => value !== null);
    const latencyValues = processedWebsites
      .map((website) => website.averageLatency)
      .filter((value): value is number => value !== null);

    return {
      total: processedWebsites.length,
      online: processedWebsites.filter((website) => website.status === "good")
        .length,
      issues: processedWebsites.filter((website) => website.status === "bad")
        .length,
      averageUptime:
        uptimeValues.length > 0
          ? uptimeValues.reduce((total, value) => total + value, 0) /
            uptimeValues.length
          : null,
      averageLatency:
        latencyValues.length > 0
          ? latencyValues.reduce((total, value) => total + value, 0) /
            latencyValues.length
          : null,
    };
  }, [processedWebsites]);

  const handleAddWebsite = async (rawUrl: string) => {
    setModalError(null);

    let url: string;
    try {
      url = normalizeUrl(rawUrl);
    } catch (validationError) {
      setModalError(getActionError(validationError));
      return;
    }

    setIsSubmitting(true);

    try {
      await addWebsite(url);
      setIsModalOpen(false);
      setActionError(null);
    } catch (requestError) {
      setModalError(getActionError(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWebsite = async (website: ProcessedWebsite) => {
    const confirmed = window.confirm(
      `Delete monitor for ${website.displayHost}?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingWebsiteId(website.id);

    try {
      await deleteWebsite(website.id);
      setActionError(null);
    } catch (requestError) {
      setActionError(getActionError(requestError));
    } finally {
      setDeletingWebsiteId(null);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">
              Validator monitor console
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              Service uptime
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Watch endpoint health, latest validator responses, and recent
              incident windows from one operational view.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshWebsites()}
              disabled={isRefreshing}
            >
              <RefreshCcw
                className={cn("size-4", isRefreshing && "animate-spin")}
                aria-hidden="true"
              />
              Refresh
            </Button>
            <Button
              type="button"
              onClick={() => {
                setModalError(null);
                setIsModalOpen(true);
              }}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add monitor
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={Globe2}
            label="Monitors"
            value={String(summary.total)}
          />
          <MetricCard
            icon={Wifi}
            label="Online"
            value={String(summary.online)}
          />
          <MetricCard
            icon={WifiOff}
            label="Down"
            value={String(summary.issues)}
          />
          <MetricCard
            icon={Clock3}
            label="Average latency"
            value={formatLatency(summary.averageLatency)}
          />
        </div>

        {(error || actionError) && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-medium">Request failed</p>
              <p className="mt-1">{actionError ?? error}</p>
            </div>
          </div>
        )}

        <section className="mt-6">
          {isLoading ? (
            <DashboardSkeleton />
          ) : processedWebsites.length === 0 ? (
            <EmptyState
              onAdd={() => {
                setModalError(null);
                setIsModalOpen(true);
              }}
            />
          ) : (
            <div className="grid gap-4">
              {processedWebsites.map((website) => (
                <WebsiteCard
                  key={website.id}
                  website={website}
                  isDeleting={deletingWebsiteId === website.id}
                  onDelete={handleDeleteWebsite}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {isModalOpen && (
        <CreateWebsiteModal
          error={modalError}
          isSubmitting={isSubmitting}
          onClose={() => {
            if (!isSubmitting) {
              setIsModalOpen(false);
            }
          }}
          onSubmit={handleAddWebsite}
        />
      )}
    </main>
  );
}

export default function DashboardPage() {
  if (!IS_CLERK_CONFIGURED) {
    return <AuthConfigurationState />;
  }

  return (
    <>
      <SignedOut>
        <SignedOutDashboard />
      </SignedOut>
      <SignedIn>
        <DashboardContent />
      </SignedIn>
    </>
  );
}
