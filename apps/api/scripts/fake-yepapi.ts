/**
 * Development stand-in for YepAPI (made-up data, documented response shapes).
 *
 *   pnpm --filter @openseo/api fake-yepapi        # listens on :4199
 *   YEPAPI_BASE_URL=http://localhost:4199 pnpm dev:api
 *
 * Any key starting with "yep_sk_" is accepted. The server itself is in src/testing/fake-yepapi.ts.
 */
import { startFakeYepApi } from "../src/testing/fake-yepapi";

const fake = await startFakeYepApi(Number(process.env.FAKE_YEPAPI_PORT ?? 4199));
console.log(`Fake YepAPI listening on ${fake.url} (made-up data)`);
