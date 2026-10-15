import type { Device } from './common';

export interface OnPageInstantParams {
  /** Full URL. */
  url: string;
}

export interface OnPageInstantData {
  pages: Array<{
    url: string;
    statusCode: number;
    title: string;
    description: string;
    h1: string[];
    wordCount: number;
    internalLinks: number;
    externalLinks: number;
    images: number;
    /** Milliseconds. */
    timeToInteractive: number;
  }>;
}

export interface OnPageContentParams {
  url: string;
}

export interface OnPageContentData {
  content: Array<{
    url: string;
    title: string;
    description: string;
    wordCount: number;
    automatedReadabilityIndex: number;
    colemanLiauIndex: number;
    fleschReadingEase: number;
  }>;
}

export interface LighthouseParams {
  url: string;
  /** Default `"desktop"`. */
  device?: Device;
  /** Also return every audit scoring under 0.9. Does not change the price. */
  include_audits?: boolean;
}

export interface LighthouseAudit {
  id: string;
  category: 'performance' | 'accessibility' | 'best-practices' | 'seo';
  title: string;
  description: string;
  /** 0-1; lower is worse. */
  score: number;
  displayValue?: string;
  opportunity: boolean;
  savingsMs?: number;
}

export interface LighthouseData {
  url: string;
  device: Device;
  /** Scores are 0-1. */
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  /** Timings are milliseconds. */
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  speedIndex: number;
  totalBlockingTime: number;
  /** Only with `include_audits: true`. */
  audits?: LighthouseAudit[];
}
