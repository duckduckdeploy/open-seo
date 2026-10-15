"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth";
import { Button, ErrorNote, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  // Where to go after signing in, for example back to a connection request. Same-site paths only.
  const nextParam = useSearchParams().get("next");
  // Same-site paths only, with no whitespace, control characters or backslashes: the URL parser
  // strips tabs and newlines, so "/\t/evil.com" would otherwise become "//evil.com".
  const next = nextParam && /^\/(?![/\\])[^\s\x00-\x1f\\]*$/.test(nextParam) ? nextParam : null;
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    try {
      if (isSignUp) await signUp(String(form.get("name") ?? ""), email, password);
      else await signIn(email, password);
      router.replace(next ?? "/projects");
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <h1 className="font-display text-lg font-semibold">{isSignUp ? "Create your account" : "Sign in"}</h1>
      {isSignUp && (
        <Field label="Name">
          <Input name="name" autoComplete="name" required maxLength={80} />
        </Field>
      )}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" hint={isSignUp ? "At least 8 characters." : undefined}>
        <Input name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} required minLength={8} />
      </Field>
      <ErrorNote error={error} />
      <Button type="submit" variant="primary" loading={pending} className="w-full">
        {isSignUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        {isSignUp ? "Already have an account? " : "New here? "}
        <Link href={`${isSignUp ? "/sign-in" : "/sign-up"}${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-ink underline underline-offset-2">
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
