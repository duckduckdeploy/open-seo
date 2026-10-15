"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocationPicker, type LocationChoice } from "@/components/location-picker";
import { Button, Card, EmptyState, ErrorNote, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { api, dateOnly } from "@/lib/api";
import { type Project, useProjects } from "@/lib/hooks";

function NewProject({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [location, setLocation] = useState<LocationChoice>({ code: 2840, name: "United States", country: "US" });
  const create = useMutation({
    mutationFn: (body: { name: string; domain?: string; locationCode: number; locationName: string; country?: string }) =>
      api<Project>("/projects", { method: "POST", body }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/p/${project.id}`);
    },
  });

  return (
    <Card className="mb-6 p-4">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const domain = String(form.get("domain") ?? "").trim();
          create.mutate({
            name: String(form.get("name") ?? ""),
            domain: domain || undefined,
            locationCode: location.code,
            locationName: location.name,
            // Several data sources take the country rather than the location code.
            country: location.country?.toLowerCase(),
          });
        }}
      >
        <Field label="Project name">
          <Input name="name" required maxLength={120} placeholder="Acme" autoFocus />
        </Field>
        <Field label="Website" hint="Optional. Used as the default for audits, rankings and backlinks.">
          <Input name="domain" placeholder="acme.com" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Default market" hint="Country used for keyword data. You can change it per search.">
            <LocationPicker value={location} onChange={setLocation} countriesOnly />
          </Field>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create project
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        <div className="sm:col-span-2">
          <ErrorNote error={create.error} />
        </div>
      </form>
    </Card>
  );
}

export default function ProjectsPage() {
  const projects = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Projects"
        description="One project per website. Keywords, trackers, audits and AI prompts live inside a project."
        action={
          !creating && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> New project
            </Button>
          )
        }
      />
      {creating && <NewProject onDone={() => setCreating(false)} />}
      {projects.isPending && <Spinner />}
      <ErrorNote error={projects.error} />
      {projects.data?.length === 0 && !creating && (
        <EmptyState title="No projects yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Create your first project</Button>}>
          Start with the website you want to grow.
        </EmptyState>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.data?.map((project) => (
          <Link key={project.id} href={`/p/${project.id}`} className="rounded-lg border border-line bg-surface p-4 transition-shadow hover:border-ink hover:shadow-hard-sm">
            <p className="truncate font-display text-base font-semibold">{project.name}</p>
            <p className="truncate font-mono text-xs text-muted">{project.domain ?? "no domain"}</p>
            <p className="mt-4 text-xs text-faint">
              {project.locationName} · created {dateOnly(project.createdAt)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
