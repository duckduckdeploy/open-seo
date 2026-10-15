"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { agentSetupPrompt } from "@openseo/shared";
import { useState } from "react";
import { useBalance } from "@/components/balance";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Spinner, Stat, Table } from "@/components/ui";
import { api, dateTime, num, usd } from "@/lib/api";
import type { Me } from "@/lib/auth";
import { useMe } from "@/lib/hooks";

type Usage = {
  since: string;
  total: { costUsd: number; calls: number };
  byFeature: { feature: string; costUsd: number; calls: number }[];
  byDay: { day: string; costUsd: number }[];
  recent: { id: string; endpoint: string; feature: string | null; ok: boolean; status: number | null; costUsd: number; createdAt: string }[];
};
type ApiKeyRow = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };

function YepKeyCard({ settings }: { settings: Me["settings"] }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const done = () => {
    setValue("");
    // The balance and usage cards depend on which key is connected.
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.invalidateQueries({ queryKey: ["balance"] });
    void queryClient.invalidateQueries({ queryKey: ["usage"] });
  };
  const save = useMutation({
    mutationFn: () => api("/settings/yepapi-key", { method: "PUT", body: { apiKey: value.trim() } }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api("/settings/yepapi-key", { method: "DELETE" }), onSuccess: done });

  return (
    <Card>
      <CardHeader
        title="YepAPI key"
        description="OpenSEO runs every lookup with your own key. You pay YepAPI directly; OpenSEO adds nothing."
        action={settings.hasYepapiKey ? <Badge tone="pos">Connected</Badge> : <Badge tone="warn">Not set</Badge>}
      />
      <div className="space-y-4 p-4">
        {settings.hasYepapiKey && (
          <p className="text-[13px] text-muted">
            Current key <span className="font-mono text-ink">{settings.yepapiKeyHint}</span>, checked {dateTime(settings.yepapiKeyCheckedAt)}.
          </p>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="min-w-64 flex-1">
            <Field label={settings.hasYepapiKey ? "Replace key" : "API key"}>
              <Input value={value} onChange={(event) => setValue(event.target.value)} type="password" autoComplete="off" placeholder="yep_sk_…" required />
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!value.trim()}>
            Save key
          </Button>
          {settings.hasYepapiKey && (
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Remove
            </Button>
          )}
        </form>
        <ErrorNote error={save.error ?? remove.error} />
        <p className="text-xs text-muted">
          No key yet?{" "}
          <a href="https://yepapi.com?ref=openseo" target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-2">
            Create a YepAPI account
          </a>{" "}
          and get $5 in free credits. The key is encrypted at rest and never shown again.
        </p>
      </div>
    </Card>
  );
}

function BudgetCard({ settings }: { settings: Me["settings"] }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(settings.monthlyBudgetUsd?.toString() ?? "");
  const save = useMutation({
    mutationFn: () => api("/settings/budget", { method: "PUT", body: { monthlyBudgetUsd: value.trim() ? Number(value) : null } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <Card>
      <CardHeader title="Monthly spending limit" description="OpenSEO stops making paid calls once this month's spend reaches the limit. Leave empty for no limit." />
      <form
        className="flex flex-wrap items-end gap-2 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="w-40">
          <Field label="Limit (USD)">
            <Input value={value} onChange={(event) => setValue(event.target.value)} type="number" min="0.01" step="0.01" placeholder="No limit" />
          </Field>
        </div>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
        {save.isSuccess && <span className="pb-2 text-[13px] text-pos">Saved</span>}
        <div className="w-full">
          <ErrorNote error={save.error} />
        </div>
      </form>
    </Card>
  );
}

function ApiKeysCard() {
  const queryClient = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api<ApiKeyRow[]>("/api-keys") });
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: () => api<{ key: string }>("/api-keys", { method: "POST", body: { name: name.trim() } }),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <Card>
      <CardHeader title="OpenSEO API keys" description="For the REST API and for connecting AI agents over MCP. Anything a key runs is billed to your YepAPI key." />
      <div className="space-y-4 p-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="min-w-56 flex-1">
            <Field label="Key name">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Claude Code on my laptop" maxLength={80} required />
            </Field>
          </div>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            Create key
          </Button>
        </form>
        <ErrorNote error={create.error ?? remove.error} />
        {create.data && (
          <div className="rounded-md border border-ink bg-sunken p-3">
            <p className="text-[13px] font-medium">Copy this key now. It won't be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{create.data.key}</code>
              <Button
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(create.data.key);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
        {keys.isPending ? (
          <Spinner />
        ) : keys.data?.length ? (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Last used</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.data.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td className="font-mono text-xs">{key.prefix}…</td>
                  <td>{key.lastUsedAt ? dateTime(key.lastUsedAt) : "Never"}</td>
                  <td>{dateTime(key.createdAt)}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" aria-label={`Revoke ${key.name}`} onClick={() => remove.mutate(key.id)}>
                      <Trash2 className="size-3.5" aria-hidden /> Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-[13px] text-muted">No API keys yet.</p>
        )}
      </div>
    </Card>
  );
}

function UsageCard() {
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => api<Usage>("/usage") });
  // Not fetched when no key is connected; the tile then shows a dash.
  const balance = useBalance();
  if (usage.isPending) return <Spinner />;
  if (usage.error) return <ErrorNote error={usage.error} />;
  const { total, byFeature, recent } = usage.data;
  return (
    <Card>
      <CardHeader
        title="Usage this month"
        description="What OpenSEO has spent with your key, and what is left on your YepAPI account."
        action={
          <Button size="sm" onClick={() => void balance.refetch()} loading={balance.isFetching} disabled={balance.isPending && !balance.isFetching}>
            {!balance.isFetching && <RefreshCw className="size-3.5" aria-hidden />} Check balance
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="YepAPI balance"
            value={usd(balance.data?.balanceUsd)}
            sub={
              balance.data?.available === false
                ? "YepAPI does not report it here; see your YepAPI dashboard"
                : balance.data
                  ? `Live from YepAPI, checked ${dateTime(balance.data.checkedAt)}${balance.data.autoTopup ? " · auto top-up on" : ""}`
                  : "Live from YepAPI"
            }
          />
          <Stat label="Spent" value={usd(total.costUsd)} />
          <Stat label="Paid calls" value={num(total.calls)} />
        </div>
        {byFeature.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Feature</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {byFeature.map((row) => (
                <tr key={row.feature}>
                  <td className="capitalize">{row.feature.replaceAll("_", " ")}</td>
                  <td className="text-right tabular">{num(row.calls)}</td>
                  <td className="text-right font-mono tabular">{usd(row.costUsd, 3)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {recent.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[13px] font-medium">Last {recent.length} calls</summary>
            <Table className="mt-2">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th className="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{dateTime(row.createdAt)}</td>
                    <td className="font-mono text-xs">{row.endpoint}</td>
                    <td>{row.ok ? <Badge tone="pos">ok</Badge> : <Badge tone="neg">{row.status ?? "failed"}</Badge>}</td>
                    <td className="text-right font-mono tabular">{usd(row.costUsd, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </details>
        )}
      </div>
    </Card>
  );
}

function AgentCard({ links }: { links: NonNullable<Me["links"]> }) {
  const [copied, setCopied] = useState(false);
  const prompt = agentSetupPrompt(links);
  return (
    <Card>
      <CardHeader
        title="Connect your AI agent"
        description="Create an API key below and store it in an environment variable named OPENSEO_API_KEY. Then paste this prompt into Claude, Cursor, Codex or another agent: it connects itself and checks the connection without spending anything."
      />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              void navigator.clipboard.writeText(prompt).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              });
            }}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy setup prompt"}
          </Button>
          <a href={links.docsUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium underline underline-offset-2">
            Setup guide and skills
          </a>
        </div>
        <p className="font-mono text-xs text-muted">
          Agent endpoint: <span className="text-ink">{links.mcpUrl}</span>
        </p>
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted">Show the prompt</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-line bg-sunken p-3 font-mono text-xs whitespace-pre-wrap">{prompt}</pre>
        </details>
      </div>
    </Card>
  );
}

type Grant = { clientId: string; name: string; redirectHost: string; connectedAt: string; lastUsedAt: string | null };

function ConnectedAppsCard() {
  const queryClient = useQueryClient();
  const grants = useQuery({ queryKey: ["oauth-grants"], queryFn: () => api<Grant[]>("/oauth/grants") });
  const revoke = useMutation({
    mutationFn: (clientId: string) => api(`/oauth/grants/${encodeURIComponent(clientId)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["oauth-grants"] }),
  });
  if (!grants.data?.length) return null;
  return (
    <Card>
      <CardHeader title="Connected apps" description="Apps you signed in to with OpenSEO, such as ChatGPT. Disconnecting one stops it at once." />
      <ul className="divide-y divide-line">
        {grants.data.map((grant) => (
          <li key={grant.clientId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
            <span>
              <span className="font-medium">{grant.name}</span>
              <span className="text-muted">
                {" "}
                · {grant.redirectHost} · connected {dateTime(grant.connectedAt)}
                {grant.lastUsedAt ? ` · last used ${dateTime(grant.lastUsedAt)}` : ""}
              </span>
            </span>
            <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === grant.clientId} onClick={() => revoke.mutate(grant.clientId)}>
              <Trash2 className="size-3.5" aria-hidden /> Disconnect
            </Button>
          </li>
        ))}
      </ul>
      <div className="px-4 pb-3">
        <ErrorNote error={revoke.error ?? grants.error} />
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const me = useMe();
  if (!me.data) return <Spinner />;
  return (
    <>
      <PageHeader title="Settings and usage" description={`Signed in as ${me.data.user.email}`} />
      <div className="space-y-6">
        <YepKeyCard settings={me.data.settings} />
        <UsageCard />
        <BudgetCard settings={me.data.settings} />
        {me.data.links && <AgentCard links={me.data.links} />}
        <ConnectedAppsCard />
        <ApiKeysCard />
      </div>
    </>
  );
}
