"use client";

import { LANGUAGES } from "@/lib/scope";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { LocationPicker, type LocationChoice } from "@/components/location-picker";
import { Check, Group, lines, SCHEDULES, type Schedule, Segmented, usdRange } from "@/components/tracking/kit";
import { DEVICES, type Device, monthlyPrice, monthlyText, runPrice, type Tracker, type TrackerRow, whereText } from "@/components/tracking/rank";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Field, Input, PageHeader, Select, Spinner, Table, Textarea } from "@/components/ui";
import { api, dateTime, num } from "@/lib/api";
import { type Project, useProject } from "@/lib/hooks";

const MAX_KEYWORDS = 1000;

function NewTracker({ project, onDone }: { project: Project; onDone: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState(project.domain ?? "");
  const [mode, setMode] = useState<"place" | "point">("place");
  const [location, setLocation] = useState<LocationChoice>({ code: project.locationCode, name: project.locationName });
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [pointLabel, setPointLabel] = useState("");
  const [language, setLanguage] = useState(project.language || "en");
  const [devices, setDevices] = useState<Device[]>(["desktop"]);
  const [schedule, setSchedule] = useState<Schedule>("weekly");
  const [text, setText] = useState("");

  const keywords = lines(text, true);
  const lat = Number(latitude);
  const lng = Number(longitude);
  const pointValid = latitude.trim() !== "" && longitude.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const price = runPrice(keywords.length, devices.length);
  const monthly = monthlyPrice(price, schedule);
  const tooMany = keywords.length > MAX_KEYWORDS;
  const ready = domain.trim().length >= 3 && devices.length > 0 && !tooMany && (mode === "place" || pointValid);

  const create = useMutation({
    mutationFn: () =>
      api<Tracker>(`/projects/${project.id}/trackers`, {
        method: "POST",
        body: {
          domain: domain.trim(),
          language,
          devices,
          schedule,
          keywords: keywords.length ? keywords : undefined,
          ...(mode === "point"
            ? { latitude: lat, longitude: lng, locationName: pointLabel.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
            : { locationCode: location.code, locationName: location.name }),
        },
      }),
    onSuccess: (tracker) => {
      void queryClient.invalidateQueries({ queryKey: ["trackers", project.id] });
      router.push(`/p/${project.id}/rank/${tracker.id}`);
    },
  });

  return (
    <Card className="mb-6">
      <CardHeader title="New tracker" description="Creating a tracker spends nothing. You pay only when a check runs." />
      <form
        className="grid gap-4 p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) create.mutate();
        }}
      >
        <Field label="Domain" hint="Subdomains count as the same site.">
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} required minLength={3} maxLength={253} placeholder="acme.com" />
        </Field>
        <Field label="Language">
          <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {!LANGUAGES.some(([code]) => code === language) && <option value={language}>{language}</option>}
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </Select>
        </Field>

        <Group label="Search from" className="sm:col-span-2" hint={mode === "place" ? "A country, region or city. Results are what a searcher there would see." : "An exact point, for businesses that rank street by street."}>
          <div className="mb-2">
            <Segmented
              label="Location type"
              value={mode}
              onChange={setMode}
              options={[
                { id: "place", label: "Place" },
                { id: "point", label: "Exact coordinates" },
              ]}
            />
          </div>
          {mode === "place" ? (
            <LocationPicker value={location} onChange={setLocation} aria-label="Location to search from" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Latitude">
                <Input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="30.2672" />
              </Field>
              <Field label="Longitude">
                <Input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="-97.7431" />
              </Field>
              <Field label="Label (optional)">
                <Input value={pointLabel} onChange={(event) => setPointLabel(event.target.value)} maxLength={200} placeholder="Downtown Austin" />
              </Field>
              {(latitude || longitude) && !pointValid && <p className="text-xs text-neg sm:col-span-3">Latitude is between -90 and 90, longitude between -180 and 180.</p>}
            </div>
          )}
        </Group>

        <Group label="Devices" hint="Each device is a separate check, so choosing both doubles the price of a run.">
          <div className="flex flex-wrap gap-4">
            {DEVICES.map((device) => (
              <Check key={device} checked={devices.includes(device)} onChange={(on) => setDevices(on ? DEVICES.filter((d) => d === device || devices.includes(d)) : devices.filter((d) => d !== device))}>
                <span className="capitalize">{device}</span>
              </Check>
            ))}
          </div>
          {devices.length === 0 && <p className="mt-1.5 text-xs text-neg">Choose at least one device.</p>}
        </Group>
        <Field label="Schedule" hint="Scheduled checks run on their own and spend each time. Manual trackers only run when you click.">
          <Select value={schedule} onChange={(event) => setSchedule(event.target.value as Schedule)}>
            {SCHEDULES.map((option) => (
              <option key={option} value={option}>
                {option[0]?.toUpperCase()}
                {option.slice(1)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Keywords" hint={`One per line, up to ${num(MAX_KEYWORDS)}. You can add more later.`}>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} placeholder={"emergency plumber austin\nwater heater repair"} className="font-mono text-[13px]" />
          </Field>
          {tooMany && <p className="mt-1.5 text-xs text-neg">{num(keywords.length)} keywords entered. A tracker holds up to {num(MAX_KEYWORDS)}.</p>}
        </div>

        <div className="rounded-md border border-line bg-sunken/60 px-3 py-2.5 sm:col-span-2" aria-live="polite">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Price of a check</p>
          {keywords.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted">Add keywords to see what one run and one month would cost.</p>
          ) : (
            <dl className="mt-1 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-muted">One run</dt>
                <dd className="font-mono text-sm font-medium tabular">{usdRange(price.min, price.max)}</dd>
                <dd className="text-xs text-muted">
                  {num(keywords.length)} {keywords.length === 1 ? "keyword" : "keywords"} × {devices.length} {devices.length === 1 ? "device" : "devices"} = {num(price.checks)} checks
                </dd>
              </div>
              <div>
                <dt className="text-muted">Per month</dt>
                <dd className="font-mono text-sm font-medium tabular">{monthly ? usdRange(monthly.min, monthly.max) : "$0.00"}</dd>
                <dd className="text-xs text-muted">{monthly ? `about ${monthly.runs} runs on a ${schedule} schedule` : "nothing runs until you start a check"}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!ready}>
            Create tracker
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {create.error && (
          <div className="sm:col-span-2">
            <ErrorNote error={create.error} />
          </div>
        )}
      </form>
    </Card>
  );
}

export default function RankPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const trackers = useQuery({ queryKey: ["trackers", projectId], queryFn: () => api<TrackerRow[]>(`/projects/${projectId}/trackers`) });
  const [creating, setCreating] = useState(false);
  const canCreate = !creating && project.data;

  return (
    <>
      <PageHeader
        title="Rank tracking"
        description="Check where your site ranks on Google for a set of keywords, from a city, a region or an exact point. Each check is billed by YepAPI per results page."
        action={
          canCreate && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> New tracker
            </Button>
          )
        }
      />
      {creating && project.data && <NewTracker project={project.data} onDone={() => setCreating(false)} />}
      {(trackers.isPending || project.isPending) && <Spinner />}
      <ErrorNote error={trackers.error ?? project.error} />
      {trackers.data?.length === 0 && !creating && (
        <EmptyState
          title="No trackers yet"
          action={
            project.data && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                Create a tracker
              </Button>
            )
          }
        >
          A tracker follows one domain in one location. Setting it up is free; you see the price before every check.
        </EmptyState>
      )}
      {trackers.data && trackers.data.length > 0 && (
        <Card>
          <Table className="relative">
            <thead>
              <tr>
                <th scope="col">Tracker</th>
                <th scope="col">Location</th>
                <th scope="col">Devices</th>
                <th scope="col">Schedule</th>
                <th scope="col" className="text-right">Keywords</th>
                <th scope="col">Last run</th>
                <th scope="col" className="text-right">One run</th>
                <th scope="col" className="text-right">Per month</th>
              </tr>
            </thead>
            <tbody>
              {trackers.data.map((tracker) => (
                <tr key={tracker.id}>
                  <td className="min-w-48">
                    <Link href={`/p/${projectId}/rank/${tracker.id}`} className="font-medium underline decoration-line underline-offset-2 hover:decoration-ink">
                      {tracker.name.replaceAll(",", ", ")}
                    </Link>
                    <p className="font-mono text-xs text-muted">{tracker.domain}</p>
                  </td>
                  <td className="min-w-40 text-muted">{whereText(tracker)}</td>
                  <td className="whitespace-nowrap capitalize">{tracker.devices.join(" + ")}</td>
                  <td className="capitalize">{tracker.schedule}</td>
                  <td className="text-right font-mono tabular">{num(tracker.keywordCount)}</td>
                  <td className="whitespace-nowrap">
                    {tracker.activeRunId ? <Badge tone="accent">Running</Badge> : tracker.lastRunAt ? dateTime(tracker.lastRunAt) : <span className="text-faint">Never</span>}
                  </td>
                  <td className="text-right font-mono whitespace-nowrap tabular">{tracker.keywordCount ? usdRange(tracker.estimate.min, tracker.estimate.max) : "—"}</td>
                  <td className="text-right font-mono whitespace-nowrap tabular text-muted">{tracker.keywordCount ? monthlyText(tracker.estimate, tracker.schedule).replace(" / month", "") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
