"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Button, ErrorNote, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Request = { clientName: string; redirectHost: string; scope: string; user: { email: string } };

const PROBLEMS: Record<string, string> = {
  unknown_client: "This app is not registered with OpenSEO. Start the connection again from the app.",
  bad_redirect: "This app asked to return to an address it did not register, so OpenSEO stopped. Start the connection again from the app.",
};

function Consent() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("request") ?? "";
  const problem = params.get("error");

  const request = useQuery({
    queryKey: ["oauth-request", id],
    queryFn: () => api<Request>(`/oauth/requests/${id}`),
    enabled: Boolean(id) && !problem,
    retry: false,
  });

  // Not signed in: sign in, then come straight back here.
  const signedOut = request.error instanceof ApiError && request.error.status === 401;
  useEffect(() => {
    if (signedOut) router.replace(`/sign-in?next=${encodeURIComponent(`/oauth/consent?request=${id}`)}`);
  }, [signedOut, router, id]);

  const decide = useMutation({
    mutationFn: (approve: boolean) => api<{ redirectTo: string }>(`/oauth/requests/${id}`, { method: "POST", body: { approve } }),
    onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
  });

  if (problem || (!id && !problem)) {
    return (
      <div className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <h1 className="font-display text-lg font-semibold">Can&apos;t connect this app</h1>
        <p className="text-sm text-muted">{PROBLEMS[problem ?? ""] ?? "The connection request is missing. Start it again from the app."}</p>
      </div>
    );
  }
  if (request.isPending || signedOut) return <Spinner />;
  if (request.error) {
    return (
      <div className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <h1 className="font-display text-lg font-semibold">This request has expired</h1>
        <p className="text-sm text-muted">Connection requests last ten minutes and work once. Start the connection again from the app.</p>
      </div>
    );
  }

  const { clientName, redirectHost, user } = request.data;
  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <h1 className="font-display text-lg font-semibold">
        Connect <span className="break-words">{clientName}</span> to OpenSEO?
      </h1>
      <p className="text-sm text-muted">
        Signed in as <span className="text-ink">{user.email}</span>. After you decide, you go back to{" "}
        <span className="font-mono text-ink">{redirectHost}</span>.
      </p>
      <div className="text-sm">
        <p className="font-medium">It will be able to</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
          <li>read your projects, saved keywords, rankings, audits and Search Console data</li>
          <li>run lookups, which are billed to your data key, under your monthly limit</li>
          <li>create and change projects, trackers, prompts and audits</li>
        </ul>
        <p className="mt-3 font-medium">It cannot</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
          <li>see your data key, API keys or password</li>
          <li>connect Google accounts or create API keys</li>
        </ul>
      </div>
      <p className="text-xs text-muted">Only connect apps you trust. You can disconnect it at any time in Settings.</p>
      <ErrorNote error={decide.error} />
      <div className="flex gap-2">
        <Button variant="primary" loading={decide.isPending && decide.variables === true} disabled={decide.isPending} onClick={() => decide.mutate(true)} className="flex-1">
          Allow
        </Button>
        <Button loading={decide.isPending && decide.variables === false} disabled={decide.isPending} onClick={() => decide.mutate(false)} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Consent />
    </Suspense>
  );
}
