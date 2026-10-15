"use client";

import { CURATED_MODELS, MODEL_CATALOG, RUNS_PER_MONTH } from "@openseo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { type AiCompetitor, AiOverview, type AiPrompt, type AiRun, type AiSettings, type AiState, ModelName } from "@/components/tracking/ai-overview";
import {
  Check,
  ConfirmDialog,
  ExtLink,
  Group,
  isActive,
  lines,
  Note,
  RunProgress,
  SCHEDULES,
  type Schedule,
  SectionTitle,
  TabPanel,
  Tabs,
  useQueryState,
  useRunPoll,
} from "@/components/tracking/kit";
import { Badge, Button, Card, CardHeader, CostNote, EmptyState, ErrorNote, Field, Input, PageHeader, Select, Spinner, Table, Textarea } from "@/components/ui";
import { api, dateOnly, num, usd } from "@/lib/api";
import { useEstimate, useLookup } from "@/lib/lookup";
import { Price } from "@/components/research/lookup-ui";
import { hostOf } from "@/lib/url";

const TABS = ["overview", "prompts", "setup", "explorer"] as const;
type TabId = (typeof TABS)[number];
type CatalogModel = { id: string; name: string; provider: string; inputPerM: number | null; outputPerM: number | null; searchGrounded: boolean };
const MAX_MODELS = 20;
const MAX_COMPARE = 8;

const cleanName = (name: string) => name.replace(/^"+|"+$/g, "");
const splitList = (text: string) => [...new Set(text.split(",").map((part) => part.trim()).filter(Boolean))];
const titleCase = (text: string) => (text[0]?.toUpperCase() ?? "") + text.slice(1);

// ── Run control ─────────────────────────────────────────────────────────────

function RunControl({ projectId, state }: { projectId: string; state: AiState }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [startedRunId, setStartedRunId] = useState<string | null>(null);
  const { estimate, settings } = state;
  const runId = state.activeRun?.id ?? startedRunId;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["ai", projectId] });
  const run = useRunPoll<AiRun>(["ai-run", runId], runId ? `/projects/${projectId}/ai/runs/${runId}` : null, refresh);
  const start = useMutation({
    mutationFn: () => api<AiRun>(`/projects/${projectId}/ai/runs`, { method: "POST" }),
    onSuccess: (created) => {
      queryClient.setQueryData(["ai-run", created.id], created);
      setStartedRunId(created.id);
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["ai", projectId, "state"] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/projects/${projectId}/ai/runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai-run", runId] }),
  });

  const activePrompts = state.prompts.filter((prompt) => prompt.active).length;
  const perRun = estimate.expected ?? estimate.min;
  const runsPerMonth = RUNS_PER_MONTH[settings.schedule];
  const running = isActive(run.data?.status);
  const finished = run.data && !running && startedRunId === run.data.id ? run.data : null;
  const blocked = !settings.brand.trim() ? "Set your brand name under Setup." : settings.models.length === 0 ? "Select at least one model under Setup." : activePrompts === 0 ? "Add at least one active prompt." : null;

  return (
    <>
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:w-auto sm:flex-1 sm:grid-cols-4">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">One run</dt>
              <dd className="font-mono text-sm font-medium tabular">
                {num(estimate.answers)} {estimate.answers === 1 ? "answer" : "answers"}
              </dd>
              <dd className="text-xs text-muted">
                {activePrompts} {activePrompts === 1 ? "prompt" : "prompts"} × {settings.models.length} {settings.models.length === 1 ? "model" : "models"}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">Minimum</dt>
              <dd className="font-mono text-sm font-medium tabular">{usd(estimate.min)}</dd>
              <dd className="text-xs text-muted">$0.01 per answer; longer answers and web search cost more</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">Expected</dt>
              <dd className="font-mono text-sm font-medium tabular">{estimate.expected != null ? usd(estimate.expected) : "—"}</dd>
              <dd className="text-xs text-muted">{estimate.expected != null ? "based on your previous runs" : "known once every selected model has run"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">Per month</dt>
              <dd className="font-mono text-sm font-medium tabular">{runsPerMonth ? `${estimate.expected != null ? "about" : "from"} ${usd(perRun * runsPerMonth)}` : "$0.00"}</dd>
              <dd className="text-xs text-muted">{runsPerMonth ? `${settings.schedule} schedule, about ${runsPerMonth} runs` : "manual: nothing runs until you click"}</dd>
            </div>
          </dl>
          <div className="flex flex-col items-start gap-1.5">
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={running || blocked !== null}>
              <Play className="size-4" aria-hidden /> Run now
            </Button>
            {blocked && <span className="max-w-48 text-xs text-muted">{blocked}</span>}
          </div>
        </div>
      </Card>

      {run.data && running && (
        <RunProgress
          title="Asking the models"
          status={run.data.status}
          done={run.data.done}
          total={run.data.total || estimate.answers}
          unit="answers"
          costUsd={run.data.costUsd}
          failed={run.data.failed}
          onCancel={() => cancel.mutate()}
          cancelling={cancel.isPending}
          cancelError={cancel.error}
        />
      )}
      {finished && (
        <div className="mb-5">
          {finished.status === "failed" ? (
            <ErrorNote error={new Error(`The run failed: ${finished.error ?? "unknown error"}`)} />
          ) : (
            <Note>
              Run {finished.status}: {finished.done} of {finished.total} answers{finished.failed ? `, ${finished.failed} failed` : ""}, <span className="font-mono text-ink tabular">{usd(finished.costUsd)}</span> spent.
            </Note>
          )}
        </div>
      )}
      <ErrorNote error={run.error} />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => start.mutate()}
        title="Run AI visibility now?"
        confirmLabel={`Run · ${estimate.expected != null ? `about ${usd(estimate.expected)}` : `from ${usd(estimate.min)}`}`}
        pending={start.isPending}
        error={start.error}
      >
        <p>
          {activePrompts} active {activePrompts === 1 ? "prompt" : "prompts"} × {settings.models.length} {settings.models.length === 1 ? "model" : "models"} = <span className="font-mono text-ink tabular">{num(estimate.answers)} answers</span>, billed to your YepAPI balance.
        </p>
        <p>
          Answers are priced by tokens with a $0.01 minimum each, so the run costs at least <span className="font-mono text-ink tabular">{usd(estimate.min)}</span>.{" "}
          {estimate.expected != null ? (
            <>
              Based on your previous runs, expect about <span className="font-mono text-ink tabular">{usd(estimate.expected)}</span>.
            </>
          ) : (
            "There is no history for every selected model yet, so the final cost is not known in advance."
          )}{" "}
          Web search is {settings.webSearch ? "on, which adds roughly a cent or more per answer" : "off"}.
        </p>
      </ConfirmDialog>
    </>
  );
}

// ── Prompts ─────────────────────────────────────────────────────────────────

function SuggestPrompts({ projectId, existing, onAdded }: { projectId: string; existing: AiPrompt[]; onAdded: () => void }) {
  const [description, setDescription] = useState("");
  const [count, setCount] = useState(10);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const have = useMemo(() => new Set(existing.map((prompt) => prompt.prompt.toLowerCase())), [existing]);
  const suggest = useMutation({
    mutationFn: () => api<{ prompts: string[]; costUsd: number }>(`/projects/${projectId}/ai/suggest-prompts`, { method: "POST", body: { description: description.trim(), count } }),
    onSuccess: (data) => setPicked(new Set(data.prompts.filter((prompt) => !have.has(prompt.toLowerCase())))),
  });
  const add = useMutation({
    mutationFn: () => api<{ added: number; skipped: number }>(`/projects/${projectId}/ai/prompts`, { method: "POST", body: { prompts: [...picked] } }),
    onSuccess: () => {
      suggest.reset();
      setPicked(new Set());
      onAdded();
    },
  });
  return (
    <Card>
      <CardHeader title="Suggest prompts" description="Describe the business and a small model drafts the questions buyers might ask an assistant. Nothing is added until you choose." />
      <div className="space-y-3 p-4">
        <Field label="What the business does" hint="A sentence or two: what you sell, to whom, and where.">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label="How many prompts" value={count} onChange={(event) => setCount(Number(event.target.value))} className="w-auto!">
            {[5, 10, 15, 20, 30].map((option) => (
              <option key={option} value={option}>
                {option} prompts
              </option>
            ))}
          </Select>
          <Button onClick={() => suggest.mutate()} loading={suggest.isPending} disabled={description.trim().length < 10}>
            <Sparkles className="size-4" aria-hidden /> Suggest prompts
          </Button>
          <CostNote min={0.01} note="about a cent, priced by tokens, from your YepAPI balance" />
        </div>
        <ErrorNote error={suggest.error} />
        {suggest.data && (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="font-mono text-xs text-muted" role="status">
              {suggest.data.prompts.length} suggestions · cost {usd(suggest.data.costUsd, 3)}
            </p>
            {suggest.data.prompts.length === 0 ? (
              <p className="text-[13px] text-muted">The model returned nothing usable. Try a more specific description.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {suggest.data.prompts.map((prompt) => {
                    const duplicate = have.has(prompt.toLowerCase());
                    return (
                      <li key={prompt}>
                        <Check
                          checked={picked.has(prompt)}
                          disabled={duplicate}
                          onChange={(on) => {
                            const next = new Set(picked);
                            if (on) next.add(prompt);
                            else next.delete(prompt);
                            setPicked(next);
                          }}
                        >
                          {prompt}
                          {duplicate && <span className="ml-2 font-mono text-[11px] uppercase text-faint">already added</span>}
                        </Check>
                      </li>
                    );
                  })}
                </ul>
                <Button variant="primary" onClick={() => add.mutate()} loading={add.isPending} disabled={picked.size === 0}>
                  Add {picked.size} selected
                </Button>
                <ErrorNote error={add.error} />
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function PromptsTab({ projectId, state }: { projectId: string; state: AiState }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState<AiPrompt | null>(null);
  const stateKey = ["ai", projectId, "state"];
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["ai", projectId] });
  const fresh = lines(text).filter((line) => line.length >= 3);

  const add = useMutation({
    mutationFn: () => api<{ added: number; skipped: number }>(`/projects/${projectId}/ai/prompts`, { method: "POST", body: { prompts: fresh } }),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`/projects/${projectId}/ai/prompts/${id}`, { method: "PATCH", body: { active } }),
    onMutate: ({ id, active }) => {
      queryClient.setQueryData<AiState>(stateKey, (old) => old && { ...old, prompts: old.prompts.map((p) => (p.id === id ? { ...p, active } : p)) });
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/projects/${projectId}/ai/prompts/delete`, { method: "POST", body: { ids: [id] } }),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });
  const perPrompt = state.settings.models.length * 0.01;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Prompts" description="The questions asked on every run. Pause a prompt to keep its history without paying for new answers." />
        {toggle.error && (
          <div className="border-b border-line p-3">
            <ErrorNote error={toggle.error} />
          </div>
        )}
        {state.prompts.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No prompts yet">Add the questions your customers ask AI assistants, or let a model suggest some below.</EmptyState>
          </div>
        ) : (
          <Table className="relative">
            <thead>
              <tr>
                <th scope="col" className="w-20">Active</th>
                <th scope="col">Prompt</th>
                <th scope="col">Added</th>
                <th scope="col" className="w-10">
                  <span className="sr-only">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.prompts.map((prompt) => (
                <tr key={prompt.id}>
                  <td>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-ink"
                        checked={prompt.active}
                        aria-label={`Include "${prompt.prompt}" in runs`}
                        onChange={(event) => toggle.mutate({ id: prompt.id, active: event.target.checked })}
                      />
                      <span className="font-mono text-[11px] uppercase text-muted">{prompt.active ? "On" : "Paused"}</span>
                    </label>
                  </td>
                  <td className={prompt.active ? "min-w-64" : "min-w-64 text-muted"}>{prompt.prompt}</td>
                  <td className="whitespace-nowrap text-muted">{dateOnly(prompt.createdAt)}</td>
                  <td>
                    <button type="button" onClick={() => setDeleting(prompt)} aria-label={`Delete "${prompt.prompt}"`} className="rounded-sm p-1 text-muted hover:bg-sunken hover:text-neg">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <form
          className="space-y-3 border-t border-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (fresh.length) add.mutate();
          }}
        >
          <Field label="Add prompts" hint="One per line, written the way a person would ask. Up to 200 per project. Adding is free.">
            <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder={"What is the best invoicing software for plumbers?\nHow do I find a reliable plumber near me?"} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={add.isPending} disabled={fresh.length === 0 || fresh.length > 100}>
              <Plus className="size-4" aria-hidden /> Add {fresh.length || ""} {fresh.length === 1 ? "prompt" : "prompts"}
            </Button>
            {fresh.length > 0 && state.settings.models.length > 0 && <CostNote min={fresh.length * perPrompt} note="or more, added to each run" />}
          </div>
          {fresh.length > 100 && <p className="text-xs text-neg">Add up to 100 prompts at a time.</p>}
          {add.data && (
            <p role="status" className="text-[13px] text-muted">
              Added {add.data.added}
              {add.data.skipped ? `, skipped ${add.data.skipped} already in the list` : ""}.
            </p>
          )}
          <ErrorNote error={add.error} />
        </form>
      </Card>
      <SuggestPrompts projectId={projectId} existing={state.prompts} onAdded={refresh} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Delete this prompt?"
        confirmLabel="Delete"
        danger
        pending={remove.isPending}
        error={remove.error}
      >
        <p className="text-ink">{deleting?.prompt}</p>
        <p>Its stored answers are deleted too. To keep the history, pause the prompt instead.</p>
      </ConfirmDialog>
    </div>
  );
}

// ── Setup ───────────────────────────────────────────────────────────────────

function ModelPicker({ value, onChange }: { value: string[]; onChange: (models: string[]) => void }) {
  const [search, setSearch] = useState("");
  const catalog = useQuery({
    queryKey: ["ai-models"],
    queryFn: () => api<{ curated: { id: string; assistant: string; default: boolean }[]; models: CatalogModel[] }>("/ai/models"),
    staleTime: Infinity,
  });
  const curated = catalog.data?.curated ?? CURATED_MODELS;
  const models: CatalogModel[] = catalog.data?.models ?? MODEL_CATALOG;
  const byId = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const full = value.length >= MAX_MODELS;
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((model) => model !== id));
  const curatedIds = new Set(curated.map((model) => model.id));
  const extra = value.filter((id) => !curatedIds.has(id));

  const term = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const out = new Map<string, CatalogModel[]>();
    for (const model of models) {
      if (term && !`${model.id} ${model.name}`.toLowerCase().includes(term)) continue;
      out.set(model.provider, [...(out.get(model.provider) ?? []), model]);
    }
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [models, term]);

  return (
    <Group label="Models" hint={`Each selected model answers every prompt, so each one multiplies the price of a run. ${value.length} of ${MAX_MODELS} selected.`}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {curated.map((model) => {
          const info = byId.get(model.id);
          return (
            <li key={model.id} className="rounded-md border border-line px-3 py-2">
              <Check checked={value.includes(model.id)} disabled={full && !value.includes(model.id)} onChange={(on) => toggle(model.id, on)}>
                <span className="block font-medium">{model.assistant}</span>
                <span className="block font-mono text-[11px] break-all text-muted">
                  {model.id}
                  {info?.inputPerM != null && ` · ${usd(info.inputPerM)} / 1M in`}
                </span>
              </Check>
            </li>
          );
        })}
      </ul>
      {extra.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Other selected models">
          {extra.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-sm border border-ink py-0.5 pr-0.5 pl-1.5 font-mono text-[11px]">
              {id}
              <button type="button" onClick={() => toggle(id, false)} aria-label={`Remove ${id}`} className="rounded-sm p-0.5 hover:bg-sunken">
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3 rounded-md border border-line">
        <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">All models ({models.length})</summary>
        <div className="border-t border-line p-3">
          <Input type="search" aria-label="Search models" placeholder="Search by name or ID" value={search} onChange={(event) => setSearch(event.target.value)} />
          <ErrorNote error={catalog.error} />
          <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
            {groups.length === 0 && <p className="text-[13px] text-muted">No models match.</p>}
            {groups.map(([provider, list]) => (
              <section key={provider}>
                <h4 className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted">
                  {provider} <span className="text-faint">({list.length})</span>
                </h4>
                <ul className="space-y-1.5">
                  {list.map((model) => (
                    <li key={model.id}>
                      <Check checked={value.includes(model.id)} disabled={full && !value.includes(model.id)} onChange={(on) => toggle(model.id, on)}>
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span>{cleanName(model.name)}</span>
                          <span className="font-mono text-[11px] break-all text-muted">{model.id}</span>
                          <span className="font-mono text-[11px] text-muted tabular">{model.inputPerM != null ? `${usd(model.inputPerM)} / 1M input tokens` : "price not listed"}</span>
                          {model.searchGrounded && <Badge>always searches</Badge>}
                        </span>
                      </Check>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </details>
    </Group>
  );
}

type CompetitorDraft = { key: number; name: string; domain: string; aliases: string };

function SetupTab({ projectId, settings }: { projectId: string; settings: AiSettings }) {
  const queryClient = useQueryClient();
  const [brand, setBrand] = useState(settings.brand);
  const [aliases, setAliases] = useState(settings.brandAliases.join(", "));
  const [domain, setDomain] = useState(settings.domain ?? "");
  const [competitors, setCompetitors] = useState<CompetitorDraft[]>(() =>
    settings.competitors.map((c, index) => ({ key: index, name: c.name, domain: c.domain ?? "", aliases: (c.aliases ?? []).join(", ") })),
  );
  const [models, setModels] = useState(settings.models);
  const [webSearch, setWebSearch] = useState(settings.webSearch);
  const [schedule, setSchedule] = useState<Schedule>(settings.schedule);
  const [nextKey, setNextKey] = useState(settings.competitors.length);

  const save = useMutation({
    mutationFn: () => {
      const cleaned: AiCompetitor[] = competitors
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name.trim(), domain: c.domain.trim() || undefined, aliases: splitList(c.aliases).slice(0, 10) }));
      return api<AiSettings>(`/projects/${projectId}/ai/settings`, {
        method: "PUT",
        body: { brand: brand.trim(), brandAliases: splitList(aliases).slice(0, 10), domain: domain.trim() || null, competitors: cleaned, models, webSearch, schedule },
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai", projectId, "state"] }),
  });
  const edit = (key: number, patch: Partial<CompetitorDraft>) => {
    save.reset();
    setCompetitors(competitors.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  return (
    <form
      className="space-y-5"
      onChange={() => save.isSuccess && save.reset()}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Card>
        <CardHeader title="Your brand" description="An answer counts as a mention when it names the brand or an alias, and as a citation when a source links to the domain." />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Brand name">
            <Input value={brand} onChange={(event) => setBrand(event.target.value)} required maxLength={100} />
          </Field>
          <Field label="Domain" hint="Used to detect citations.">
            <Input value={domain} onChange={(event) => setDomain(event.target.value)} maxLength={253} placeholder="acme.com" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Other names" hint="Comma-separated, up to 10. Abbreviations, product names, common misspellings.">
              <Input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="Acme Inc, AcmePro" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Competitors" description="Tracked in the same answers for share of voice. Up to 20; they add nothing to the price." />
        <div className="space-y-3 p-4">
          {competitors.length === 0 && <p className="text-[13px] text-muted">No competitors tracked.</p>}
          {competitors.map((competitor, index) => (
            <fieldset key={competitor.key} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
              <legend className="sr-only">Competitor {index + 1}</legend>
              <Field label="Name">
                <Input value={competitor.name} onChange={(event) => edit(competitor.key, { name: event.target.value })} maxLength={100} required />
              </Field>
              <Field label="Domain">
                <Input value={competitor.domain} onChange={(event) => edit(competitor.key, { domain: event.target.value })} maxLength={253} placeholder="optional" />
              </Field>
              <Field label="Other names">
                <Input value={competitor.aliases} onChange={(event) => edit(competitor.key, { aliases: event.target.value })} placeholder="comma-separated" />
              </Field>
              <Button variant="ghost" aria-label={`Remove competitor ${competitor.name || index + 1}`} onClick={() => setCompetitors(competitors.filter((c) => c.key !== competitor.key))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </fieldset>
          ))}
          <Button
            size="sm"
            disabled={competitors.length >= 20}
            onClick={() => {
              setCompetitors([...competitors, { key: nextKey, name: "", domain: "", aliases: "" }]);
              setNextKey(nextKey + 1);
            }}
          >
            <Plus className="size-3.5" aria-hidden /> Add competitor
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Models and schedule" description="Model IDs are pinned exactly, so a version change shows up as a new line in your trend instead of a silent shift." />
        <div className="space-y-5 p-4">
          <ModelPicker value={models} onChange={setModels} />
          {models.length === 0 && <p className="text-xs text-neg">Select at least one model to run.</p>}
          <Group label="Web search">
            <Check checked={webSearch} onChange={setWebSearch}>
              <span className="font-medium">Let models search the web</span>
              <span className="block text-xs text-muted">Needed for citations: without it models answer from memory and list no sources. It adds roughly a cent or more per answer.</span>
            </Check>
          </Group>
          <div className="sm:max-w-64">
            <Field label="Schedule" hint="Scheduled runs start on their own and spend each time.">
              <Select value={schedule} onChange={(event) => setSchedule(event.target.value as Schedule)}>
                {SCHEDULES.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save setup
        </Button>
        <span className="text-xs text-muted">Saving spends nothing.</span>
        {save.isSuccess && (
          <span role="status" className="text-[13px] text-pos">
            Saved
          </span>
        )}
      </div>
      <ErrorNote error={save.error} />
    </form>
  );
}

// ── Explorer ────────────────────────────────────────────────────────────────

type CompareInput = { prompt: string; models: string[]; webSearch: boolean };
type CompareData = { prompt: string; webSearch: boolean; answers: { model: string; answer: string; sources: { url: string; title?: string }[]; costUsd: number; error: string | null }[] };

function ExplorerTab({ projectId, settings }: { projectId: string; settings: AiSettings }) {
  const options = useMemo(() => [...new Set([...settings.models, ...CURATED_MODELS.map((model) => model.id)])], [settings.models]);
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<string[]>(() => settings.models.slice(0, MAX_COMPARE));
  const [webSearch, setWebSearch] = useState(true);
  const lookup = useLookup<CompareData, CompareInput>(projectId, "ai_compare");
  const valid = prompt.trim().length >= 3 && models.length > 0;
  const input: CompareInput | null = valid ? { prompt: prompt.trim(), models, webSearch } : null;
  // The price depends only on how many models are asked, so the estimate ignores the prompt text.
  const estimate = useEstimate(projectId, "ai_compare", models.length ? { prompt: "price check", models, webSearch } : null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Prompt explorer" description="Ask one prompt to several models side by side. Nothing is saved to your tracked prompts or trend." />
        <form
          className="space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (input) lookup.run(input);
          }}
        >
          <Field label="Prompt">
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} maxLength={2000} placeholder="What is the best invoicing software for plumbers?" />
          </Field>
          <Group label="Models" hint={`Up to ${MAX_COMPARE}. Each model is one paid answer.`}>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((id) => (
                <li key={id}>
                  <Check
                    checked={models.includes(id)}
                    disabled={models.length >= MAX_COMPARE && !models.includes(id)}
                    onChange={(on) => setModels(on ? [...models, id] : models.filter((model) => model !== id))}
                  >
                    <ModelName id={id} />
                  </Check>
                </li>
              ))}
            </ul>
          </Group>
          <Check checked={webSearch} onChange={setWebSearch}>
            Web search on <span className="text-muted">(needed for sources; adds roughly a cent or more per answer)</span>
          </Check>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={lookup.isPending} disabled={!valid || estimate.stale}>
              Ask {models.length} {models.length === 1 ? "model" : "models"}
            </Button>
            <Price estimate={estimate} active={models.length > 0} note="minimum; priced by tokens, from your YepAPI balance" />
          </div>
          <ErrorNote error={lookup.error} />
        </form>
      </Card>

      {lookup.isPending && <Spinner label="Waiting for the models" />}
      {lookup.result && lookup.data && (
        <>
          <p className="font-mono text-xs text-muted" role="status">
            {lookup.data.answers.length} answers · cost {usd(lookup.result.costUsd, 3)} · web search {lookup.data.webSearch ? "on" : "off"}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {lookup.data.answers.map((answer) => (
              <Card key={answer.model}>
                <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 text-[13px]">
                  <ModelName id={answer.model} />
                  <span className="shrink-0 font-mono text-xs text-muted tabular">{usd(answer.costUsd, 3)}</span>
                </header>
                <div className="space-y-3 p-4">
                  {answer.error ? (
                    <ErrorNote error={new Error(answer.error)} />
                  ) : (
                    <>
                      <p className="max-h-96 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap">{answer.answer.trim() || "The model returned an empty answer."}</p>
                      <div>
                        <SectionTitle>Sources ({answer.sources.length})</SectionTitle>
                        {answer.sources.length === 0 ? (
                          <p className="text-[13px] text-muted">No sources cited.</p>
                        ) : (
                          <ol className="list-decimal space-y-1 pl-5 text-[13px]">
                            {answer.sources.map((source) => (
                              <li key={source.url}>
                                <ExtLink href={source.url}>{source.title?.trim() || source.url}</ExtLink>
                                <span className="ml-1.5 font-mono text-[11px] text-muted">{hostOf(source.url)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function AiView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useQueryState<TabId>("tab", TABS, "overview");
  const state = useQuery({ queryKey: ["ai", projectId, "state"], queryFn: () => api<AiState>(`/projects/${projectId}/ai`) });

  return (
    <>
      <PageHeader
        title="AI visibility"
        description="Ask the questions your customers ask, across the assistants they use, and see how often your brand is mentioned and cited."
      />
      {state.isPending && <Spinner />}
      <ErrorNote error={state.error} />
      {state.data && (
        <>
          <RunControl projectId={projectId} state={state.data} />
          <Tabs
            label="AI visibility sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "prompts", label: "Prompts", count: state.data.prompts.length },
              { id: "setup", label: "Setup" },
              { id: "explorer", label: "Explorer" },
            ]}
          />
          {tab !== "explorer" && (
            <TabPanel id={tab}>
              {tab === "overview" && <AiOverview projectId={projectId} webSearch={state.data.settings.webSearch} />}
              {tab === "prompts" && <PromptsTab projectId={projectId} state={state.data} />}
              {tab === "setup" && <SetupTab projectId={projectId} settings={state.data.settings} />}
            </TabPanel>
          )}
          {/* Kept mounted so paid answers survive a visit to another tab. */}
          <TabPanel id="explorer" hidden={tab !== "explorer"}>
            <ExplorerTab projectId={projectId} settings={state.data.settings} />
          </TabPanel>
        </>
      )}
    </>
  );
}

export default function AiPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AiView />
    </Suspense>
  );
}
