import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(4100),
  API_URL: z.string().url().default("http://localhost:4100"),
  APP_URL: z.string().url().default("http://localhost:3200"),
  WEB_URL: z.string().url().default("http://localhost:3101"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters")
    .refine((v) => !/change-me/i.test(v), "AUTH_SECRET is still the example value. Set your own random string"),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  YEPAPI_BASE_URL: z.string().url().default("https://api.yepapi.com"),
  // Set to "false" to run the HTTP server without the background worker.
  RUN_WORKER: z.enum(["true", "false"]).default("true"),
  // Proxies in front of the API whose X-Forwarded-For is trusted for the client's address. 0 by
  // default: Next's /api rewrite passes on whatever X-Forwarded-For the visitor sent, so trusting
  // it would let anyone choose their own address.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // A header your edge proxy sets to the visitor's address and visitors cannot set themselves,
  // e.g. cf-connecting-ip behind Cloudflare or x-real-ip from nginx. Free tools rate-limit by it.
  CLIENT_IP_HEADER: z.string().regex(/^[a-z0-9-]+$/i).optional(),
  // Site audits per user: how many may run at once, and how many may start in a day.
  AUDIT_MAX_ACTIVE_PER_USER: z.coerce.number().int().min(1).max(100).default(3),
  AUDIT_MAX_PER_DAY: z.coerce.number().int().min(1).max(10000).default(30),

  // Optional: Google Search Console and Analytics. An OAuth client from Google Cloud with
  // ${APP_URL}/api/google/gsc/callback and ${APP_URL}/api/google/ga4/callback as redirect URIs.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // Tests and development: send every Google request to this server instead.
  GOOGLE_API_BASE_URL: z.string().url().optional(),

  // Optional: free tools on the public site, paid from this operator key. Unset = disabled.
  FREE_TOOLS_YEPAPI_KEY: z.string().startsWith("yep_sk_").optional(),
  // Spending cap across every visitor, per UTC day.
  FREE_TOOLS_DAILY_BUDGET_USD: z.coerce.number().positive().max(10000).default(5),
  // Cloudflare Turnstile. Required in production when free tools are on.
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  TURNSTILE_VERIFY_URL: z.string().url().default("https://challenges.cloudflare.com/turnstile/v0/siteverify"),
  // RDAP lookups for the domain age tool (free, keyless).
  RDAP_BASE_URL: z.string().url().default("https://rdap.org"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  console.error(`Invalid environment:\n${lines.join("\n")}\nSee .env.example.`);
  process.exit(1);
}

export const env = parsed.data;
