import { agentSetupPrompt } from '@openseo/shared';
import { GITHUB_URL, MCP_URL, SITE_URL } from '@/lib/site';

/** The prompt that has an agent connect itself, pointed at this site's own install. */
export const setupPrompt = agentSetupPrompt({ mcpUrl: MCP_URL, docsUrl: `${SITE_URL}/docs/mcp` });

/** Generic MCP client config. File name and exact field names vary by client. */
export const mcpJsonConfig = `{
  "mcpServers": {
    "openseo": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer oseo_your_key"
      }
    }
  }
}`;

export const claudeMcpAdd = `claude mcp add --transport http openseo ${MCP_URL} \\
  --header "Authorization: Bearer $OPENSEO_API_KEY"`;

const cloneTarget = GITHUB_URL ? `${GITHUB_URL}.git` : '<repository-url>';

export const selfHostQuickstart = `git clone ${cloneTarget} openseo
cd openseo
cp .env.example .env
# In .env: point DATABASE_URL at your Postgres database,
# set AUTH_SECRET to 32+ random characters, and set
# ENCRYPTION_KEY to the output of: openssl rand -base64 32
pnpm install
pnpm db:migrate
pnpm dev`;

export const selfHostClone = `git clone ${cloneTarget} openseo
cd openseo`;

/** The whole stack with Docker: database, API, dashboard and site. */
export const selfHostDocker = `git clone ${cloneTarget} openseo
cd openseo
cp .env.example .env
# In .env, set two secrets:
#   AUTH_SECRET=     any 32+ random characters
#   ENCRYPTION_KEY=  output of: openssl rand -base64 32
docker compose up -d --build
# Dashboard http://localhost:3200 · site http://localhost:3101`;

export const hasRepositoryUrl = GITHUB_URL !== null;
