"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Me } from "./auth";

export type Project = {
  id: string;
  name: string;
  domain: string | null;
  locationCode: number;
  locationName: string;
  /** ISO 3166-1 alpha-2, lowercase. */
  country: string;
  language: string;
  createdAt: string;
};

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), staleTime: 60_000 });

export const useProjects = () => useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });

export const useProject = (projectId: string) =>
  useQuery({ queryKey: ["project", projectId], queryFn: () => api<Project>(`/projects/${projectId}`) });
