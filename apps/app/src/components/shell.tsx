"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bot,
  ChevronLeft,
  FolderKanban,
  Globe,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  Menu,
  Search,
  Settings,
  Star,
  Swords,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { useMe, useProject } from "@/lib/hooks";
import { BalanceAlert, BalanceChip, BalancePanel } from "./balance";
import { TOOLS } from "./research/tool-catalog";
import { ThemeSwitcher } from "./theme";
import { cx, Spinner } from "./ui";

const projectNav = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/keywords", label: "Keyword research", icon: Search },
  { href: "/saved", label: "Saved keywords", icon: Star },
  { href: "/rank", label: "Rank tracking", icon: TrendingUp },
  { href: "/search", label: "Search performance", icon: BarChart3 },
  { href: "/domain", label: "Domain overview", icon: Globe },
  { href: "/backlinks", label: "Backlinks", icon: Link2 },
  { href: "/competitors", label: "Competitors", icon: Swords },
  { href: "/audit", label: "Site audit", icon: Activity },
  { href: "/ai", label: "AI visibility", icon: Bot },
  { href: "/local", label: "Local SEO", icon: MapPin },
];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Search; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px]",
        active ? "bg-ink font-medium text-bg" : "text-muted hover:bg-sunken hover:text-ink",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

function ProjectNav({ projectId, pathname }: { projectId: string; pathname: string }) {
  const project = useProject(projectId);
  const base = `/p/${projectId}`;
  return (
    <>
      <Link href="/projects" className="mb-2 flex items-center gap-1 px-2.5 text-xs text-muted hover:text-ink">
        <ChevronLeft className="size-3.5" aria-hidden /> All projects
      </Link>
      <div className="mb-3 px-2.5">
        <p className="truncate font-display text-sm font-semibold">{project.data?.name ?? "…"}</p>
        <p className="truncate font-mono text-xs text-muted">{project.data?.domain ?? "no domain"}</p>
      </div>
      <nav className="space-y-0.5" aria-label="Project">
        {projectNav.map((item) => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? pathname === base : pathname.startsWith(href);
          return <NavLink key={item.href} href={href} label={item.label} icon={item.icon} active={active} />;
        })}
      </nav>
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ projectId?: string }>();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauthenticated) router.replace("/sign-in");
  }, [unauthenticated, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (me.isPending || unauthenticated) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (me.error) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-display text-lg font-semibold">Can't reach the API</p>
          <p className="mt-1 text-sm text-muted">{me.error.message}</p>
        </div>
      </div>
    );
  }

  async function onSignOut() {
    await signOut().catch(() => {});
    queryClient.clear();
    router.replace("/sign-in");
  }

  const needsKey = !me.data.settings.hasYepapiKey;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <Link href="/projects" className="font-display text-base font-semibold">
          Open<span className="bg-accent px-1 text-accent-fg">SEO</span>
        </Link>
        <div className="flex items-center gap-2">
          <BalanceChip />
          <button type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} className="rounded-md p-1.5 hover:bg-sunken">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      <aside
        className={cx(
          "flex-col border-r border-line bg-surface p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh",
          open ? "flex" : "hidden",
        )}
      >
        <Link href="/projects" className="mb-5 hidden px-2.5 pt-1 font-display text-lg font-semibold tracking-tight lg:block">
          Open<span className="bg-accent px-1 text-accent-fg">SEO</span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          {params.projectId ? (
            <ProjectNav projectId={params.projectId} pathname={pathname} />
          ) : (
            <>
              <nav className="space-y-0.5" aria-label="Main">
                <NavLink href="/projects" label="Projects" icon={FolderKanban} active={pathname.startsWith("/projects")} />
                <NavLink href="/tools" label="SEO tools" icon={Wrench} active={pathname === "/tools"} />
              </nav>
              <nav className="mt-4 space-y-0.5" aria-label="SEO tools">
                <p className="px-2.5 pb-1 font-mono text-[11px] uppercase tracking-wide text-faint">Tools</p>
                {TOOLS.filter((tool) => !tool.slug.includes("?")).map((tool) => (
                  <NavLink key={tool.slug} href={`/tools/${tool.slug}`} label={tool.title} icon={tool.icon} active={pathname.startsWith(`/tools/${tool.slug}`)} />
                ))}
              </nav>
            </>
          )}
        </div>
        <div className="mt-3 space-y-0.5 border-t border-line pt-3">
          <BalancePanel />
          {params.projectId && <NavLink href="/tools" label="SEO tools" icon={Wrench} active={false} />}
          <NavLink href="/settings" label="Settings and usage" icon={Settings} active={pathname.startsWith("/settings")} />
          <button type="button" onClick={onSignOut} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-sunken hover:text-ink">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
          <div className="px-2.5 pt-2">
            <ThemeSwitcher />
          </div>
          <p className="truncate px-2.5 pt-1 font-mono text-[11px] text-faint">{me.data.user.email}</p>
        </div>
      </aside>

      <main className="min-w-0">
        {needsKey && !pathname.startsWith("/settings") && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink bg-accent px-4 py-2 text-[13px] text-accent-fg lg:px-8">
            <KeyRound className="size-4" aria-hidden />
            <span>Add your YepAPI key to run research. New YepAPI accounts get $5 in free credits.</span>
            <Link href="/settings" className="font-semibold underline underline-offset-2">
              Add key
            </Link>
          </div>
        )}
        {!needsKey && <BalanceAlert />}
        {/* Research views use the full width, so wide tables and four-card rows fit without scrolling. */}
        <div className={cx("mx-auto px-4 py-6 lg:px-8 lg:py-8", pathname.startsWith("/tools/") || pathname.startsWith("/p/") ? "max-w-none" : "max-w-6xl")}>{children}</div>
      </main>
    </div>
  );
}
