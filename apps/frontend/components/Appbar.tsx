"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, LayoutDashboard, Moon, RadioTower, Sun } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { IS_CLERK_CONFIGURED } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function Appbar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-500 text-white shadow-sm shadow-emerald-500/20">
            <RadioTower className="size-5" aria-hidden="true" />
          </span>
          <span className="truncate text-base font-semibold tracking-normal sm:text-lg">
            DPIN Uptime
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-md border border-border bg-muted/35 p-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                  isActive && "bg-background text-foreground shadow-sm",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            title="Toggle theme"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
          </Button>

          {IS_CLERK_CONFIGURED ? (
            <>
              <SignedOut>
                <div className="hidden items-center gap-2 sm:flex">
                  <SignInButton mode="modal">
                    <Button type="button" variant="ghost" size="sm">
                      Sign in
                    </Button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Sign up
                    </Button>
                  </SignUpButton>
                </div>
              </SignedOut>

              <SignedIn>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="hidden sm:flex"
                >
                  <Link href="/dashboard">Open app</Link>
                </Button>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "size-9",
                    },
                  }}
                />
              </SignedIn>
            </>
          ) : (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="hidden sm:flex"
            >
              <Link href="/dashboard">Configure auth</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
