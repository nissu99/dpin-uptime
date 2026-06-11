import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Globe2,
  RadioTower,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const monitorRows = [
  {
    name: "api.dpin.dev",
    location: "Singapore validator",
    status: "online",
    latency: "82ms",
    uptime: "99.98%",
  },
  {
    name: "hub.dpin.dev",
    location: "Frankfurt validator",
    status: "online",
    latency: "116ms",
    uptime: "99.94%",
  },
  {
    name: "docs.dpin.dev",
    location: "Virginia validator",
    status: "degraded",
    latency: "304ms",
    uptime: "98.71%",
  },
];

const checks = [
  "Validator-signed status checks",
  "Latency and uptime history",
  "Per-monitor incident visibility",
];

const metrics = [
  {
    label: "Active monitors",
    value: "24",
    icon: Globe2,
    tone: "text-cyan-600 dark:text-cyan-300",
  },
  {
    label: "Healthy endpoints",
    value: "23",
    icon: ShieldCheck,
    tone: "text-emerald-600 dark:text-emerald-300",
  },
  {
    label: "Median latency",
    value: "118ms",
    icon: Zap,
    tone: "text-amber-600 dark:text-amber-300",
  },
];

function StatusPill({ status }: { status: string }) {
  const isOnline = status === "online";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium capitalize",
        isOnline
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isOnline ? "bg-emerald-500" : "bg-amber-500",
        )}
        aria-hidden="true"
      />
      {status}
    </span>
  );
}

function MonitorPreview() {
  return (
    <div className="rounded-lg border border-border bg-card shadow-xl shadow-black/5 dark:shadow-black/30">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <Activity className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Network checks</p>
            <p className="text-xs text-muted-foreground">Updated just now</p>
          </div>
        </div>
        <StatusPill status="online" />
      </div>

      <div className="grid gap-3 p-4">
        {monitorRows.map((row) => (
          <div
            key={row.name}
            className="rounded-md border border-border bg-background p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.location}
                </p>
              </div>
              <StatusPill status={row.status} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Latency</p>
                <p className="font-semibold">{row.latency}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Uptime</p>
                <p className="font-semibold">{row.uptime}</p>
              </div>
            </div>

            <div className="mt-4 flex h-8 gap-1">
              {Array.from({ length: 18 }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "min-w-1 flex-1 rounded-sm",
                    row.status === "degraded" && index > 12
                      ? "bg-amber-400"
                      : "bg-emerald-500",
                  )}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="bg-background">
      <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-14">
        <div className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
            <RadioTower
              className="size-4 text-emerald-600"
              aria-hidden="true"
            />
            Validator-backed uptime monitoring
          </div>

          <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-normal text-foreground sm:text-5xl lg:text-6xl">
            DPIN Uptime
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Track service health through distributed validators, inspect recent
            checks, and keep endpoint reliability visible from one focused
            dashboard.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Link href="/dashboard">
                Open dashboard
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">Add monitor</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-3">
            {checks.map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm">
                <CheckCircle2
                  className="size-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <MonitorPreview />
        </div>
      </section>

      <section className="border-y border-border bg-muted/25">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6 lg:px-8">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <div
                key={metric.label}
                className="flex items-center gap-4 rounded-lg border border-border bg-background p-4"
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-md bg-muted",
                    metric.tone,
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-2xl font-semibold">{metric.value}</p>
                  <p className="text-sm text-muted-foreground">
                    {metric.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-12 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-6">
          <Clock3 className="size-6 text-cyan-600" aria-hidden="true" />
          <h2 className="mt-5 text-lg font-semibold">Recent windows</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Ten compact status windows make it easy to spot intermittent drops
            without leaving the monitor list.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <ShieldCheck className="size-6 text-emerald-600" aria-hidden="true" />
          <h2 className="mt-5 text-lg font-semibold">Signed validators</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Validator responses are signed before uptime checks are accepted by
            the hub.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <Activity className="size-6 text-rose-600" aria-hidden="true" />
          <h2 className="mt-5 text-lg font-semibold">Incident clarity</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Each monitor shows current status, historical uptime, and latest
            check time in the same row.
          </p>
        </div>
      </section>
    </main>
  );
}
