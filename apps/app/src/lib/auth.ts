import { api } from "./api";

export type Me = {
  user: { id: string; email: string; name: string };
  settings: { hasYepapiKey: boolean; yepapiKeyHint: string | null; yepapiKeyCheckedAt: string | null; monthlyBudgetUsd: number | null };
  /** This install's agent endpoint and docs, for the agent setup prompt. */
  links?: { mcpUrl: string; docsUrl: string };
};

export const signIn = (email: string, password: string) =>
  api("/auth/sign-in/email", { method: "POST", body: { email, password } });

export const signUp = (name: string, email: string, password: string) =>
  api("/auth/sign-up/email", { method: "POST", body: { name, email, password } });

export const signOut = () => api("/auth/sign-out", { method: "POST", body: {} });
