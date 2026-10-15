import Link from 'next/link';
import { AGENT_SKILLS } from '@openseo/shared';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { CodeBlock } from '@/components/code-block';
import { CopyPromptButton } from '@/components/copy-prompt-button';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { setupPrompt } from '@/content/snippets';
import { pageMeta } from '@/lib/metadata';
import { GITHUB_URL, MCP_URL } from '@/lib/site';

const slug = 'mcp';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

// "owner/repo" for plugin marketplaces, once the repository is public.
const repo = GITHUB_URL ? GITHUB_URL.replace(/^https?:\/\/github\.com\//, '') : '<owner>/<repo>';

const envKey = `# macOS and Linux: add to ~/.zshrc or ~/.bashrc
export OPENSEO_API_KEY="oseo_..."

# Windows (PowerShell), saved for new terminals
setx OPENSEO_API_KEY "oseo_..."`;

const clients: { id: string; name: string; where: string; code: string; note?: string }[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    where: 'Terminal',
    code: `claude mcp add --transport http openseo ${MCP_URL} \\
  --header "Authorization: Bearer $OPENSEO_API_KEY"`,
    note: 'Or install the plugin below, which adds the server and the skills together.',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    where: 'claude_desktop_config.json (Settings, Developer, Edit config)',
    code: `{
  "mcpServers": {
    "openseo": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${MCP_URL}",
               "--header", "Authorization:Bearer \${OPENSEO_API_KEY}"],
      "env": { "OPENSEO_API_KEY": "oseo_..." }
    }
  }
}`,
    note: 'Claude Desktop reaches remote servers with keys through the mcp-remote bridge, which needs Node.js. Restart Claude Desktop afterwards.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    where: '~/.cursor/mcp.json, or .cursor/mcp.json in a project',
    code: `{
  "mcpServers": {
    "openseo": {
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer \${env:OPENSEO_API_KEY}" }
    }
  }
}`,
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot agent mode)',
    where: '.vscode/mcp.json, or MCP: Open User Configuration',
    code: `{
  "inputs": [
    { "type": "promptString", "id": "openseo-key", "description": "OpenSEO API key", "password": true }
  ],
  "servers": {
    "openseo": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer \${input:openseo-key}" }
    }
  }
}`,
    note: 'VS Code asks for the key once and stores it securely.',
  },
  {
    id: 'codex',
    name: 'Codex',
    where: '~/.codex/config.toml',
    code: `[mcp_servers.openseo]
url = "${MCP_URL}"
bearer_token_env_var = "OPENSEO_API_KEY"`,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    where: '~/.gemini/settings.json',
    code: `{
  "mcpServers": {
    "openseo": {
      "httpUrl": "${MCP_URL}",
      "headers": { "Authorization": "Bearer $OPENSEO_API_KEY" }
    }
  }
}`,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    where: 'opencode.json',
    code: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openseo": {
      "type": "remote",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer {env:OPENSEO_API_KEY}" }
    }
  }
}`,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    where: '~/.codeium/windsurf/mcp_config.json',
    code: `{
  "mcpServers": {
    "openseo": {
      "serverUrl": "${MCP_URL}",
      "headers": { "Authorization": "Bearer \${env:OPENSEO_API_KEY}" }
    }
  }
}`,
  },
];

const pluginInstall = `/plugin install openseo --marketplace ${repo}

# On older Claude Code versions, in two steps:
/plugin marketplace add ${repo}
/plugin install openseo@openseo`;

const skillsInstall = `# Any agent that reads SKILL.md files (Claude Code, Codex, OpenCode and others)
npx skills add ${repo}/plugins/openseo/skills`;

const pluginUpdate = `/plugin marketplace update openseo
/reload-plugins`;

export default function McpPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        OpenSEO has an MCP server, so AI agents such as ChatGPT, Claude, Cursor, Codex and Gemini can use everything in
        the app: research keywords, check rankings, read your Search Console data, run audits. Skills add ready-made
        SEO workflows on top. Setup takes a couple of minutes.
      </p>

      <h2 id="chatgpt">ChatGPT and Claude: sign in with OpenSEO</h2>
      <p>
        ChatGPT and Claude (on the web and in the desktop app) connect through a custom connector and sign in with your
        OpenSEO account. No API key needed.
      </p>
      <Steps>
        <Step title="Add a connector">
          <p>
            <strong>ChatGPT:</strong> <Ui>Settings</Ui>, <Ui>Apps &amp; Connectors</Ui>, <Ui>Advanced settings</Ui>,
            turn on <strong>Developer mode</strong>, then <Ui>Create</Ui>. <strong>Claude:</strong> <Ui>Settings</Ui>,{' '}
            <Ui>Connectors</Ui>, <Ui>Add custom connector</Ui>.
          </p>
        </Step>
        <Step title="Point it at OpenSEO">
          <p>
            Name it OpenSEO, set the server URL to <code>{MCP_URL}</code>, and choose <strong>OAuth</strong> as the
            authentication. Leave the client ID and secret empty: the connector registers itself.
          </p>
        </Step>
        <Step title="Sign in and allow">
          <p>
            A window opens on OpenSEO. Sign in if you need to, check what the connector will be able to do, and click{' '}
            <Ui>Allow</Ui>. You are sent back and the tools appear.
          </p>
        </Step>
      </Steps>
      <p>
        Connected apps are listed in <Ui>Settings</Ui> in OpenSEO, where you can disconnect them at once. Access lasts an
        hour at a time and renews itself; the connector never sees your password or keys. Developer mode and custom
        connectors depend on your ChatGPT or Claude plan.
      </p>

      <h2 id="prompt">Other agents: a setup prompt</h2>
      <Steps>
        <Step title="Create an API key">
          <p>
            In the app, open <Ui>Settings</Ui> and create an API key under <strong>API keys</strong>. It starts with{' '}
            <code>oseo_</code> and is shown once. Treat it like a password.
          </p>
        </Step>
        <Step title="Put it in an environment variable">
          <CodeBlock label="Terminal" code={envKey} />
          <p>The prompt below never asks for the key in chat, so it stays out of your conversation history.</p>
        </Step>
        <Step title="Paste the setup prompt into your agent">
          <div className="not-prose my-3">
            <CopyPromptButton text={setupPrompt} />
          </div>
          <p>
            The agent works out what it is, adds the OpenSEO server its own way, asks you to reload if needed, and checks
            the connection with two free calls. It does not create anything or spend during setup. The prompt in{' '}
            <Ui>Settings</Ui> in the app is already filled in with your install&apos;s address.
          </p>
          <CodeBlock label="Setup prompt" code={setupPrompt} />
        </Step>
      </Steps>

      <h2 id="plugin">Skills and the Claude Code plugin</h2>
      <p>Skills are written workflows your agent follows, built on the MCP tools. Each one prices paid steps first and keeps to the limit you agree.</p>
      <DocTable
        caption="OpenSEO skills"
        head={['Skill', 'What it does']}
        mono={[0]}
        rows={AGENT_SKILLS.map((skill) => [skill.name, skill.summary])}
      />
      <p>
        In Claude Code, the plugin installs the MCP server and all the skills together. It reads your key from{' '}
        <code>OPENSEO_API_KEY</code> and connects to {MCP_URL}; set <code>OPENSEO_MCP_URL</code> to use a self-hosted
        install instead.
      </p>
      <CodeBlock label="Claude Code" code={pluginInstall} />
      <p>
        Then try <code>/openseo:seo-coach</code>. For other agents, connect the server as below and add the skills with
        the skills command, or copy the folders from <code>plugins/openseo/skills</code> in the repository into your
        agent&apos;s skills folder.
      </p>
      <CodeBlock label="Terminal" code={skillsInstall} />
      <p>
        How you start a skill depends on the agent: a slash command in some, or just asking (&quot;run the seo-audit
        skill&quot;) in others.
      </p>

      <h2 id="manual">Set it up by hand</h2>
      <p>
        Every client needs the same three things: the URL <code>{MCP_URL}</code>, the streamable HTTP transport, and
        the header <code>Authorization: Bearer</code> followed by your key. Field names differ by client:
      </p>
      {clients.map((client) => (
        <section key={client.id}>
          <h3 id={client.id}>{client.name}</h3>
          <CodeBlock label={client.where} code={client.code} />
          {client.note ? <p>{client.note}</p> : null}
        </section>
      ))}
      <p>
        Self-hosting? Use your own API address, for example <code>http://localhost:4100/mcp</code> on your computer. See{' '}
        <Link href="/docs/self-hosting">Self-hosting</Link>.
      </p>

      <h2 id="verify">Check it works</h2>
      <p>
        Ask your agent to call <code>whoami</code> and <code>list_projects</code>. Both are free. If they work, the agent
        sees all 61 tools, listed with their prices in <Link href="/docs/mcp-tools">MCP tools</Link>.
      </p>

      <Callout tone="cost" title="How agents spend">
        <p>
          MCP access costs nothing extra: an agent pays the same for a lookup as you do in the app. Every paid tool
          takes <code>dry_run</code>, which returns the price and spends nothing, and <code>max_cost_usd</code>, which
          refuses the call if it could cost more. Background runs require a ceiling. The monthly limit in Settings
          stops all spending, by you or any agent, once it is reached. See{' '}
          <Link href="/docs/tutorials/agents">Work with an AI agent</Link>.
        </p>
      </Callout>

      <h2 id="update">Updating</h2>
      <CodeBlock label="Claude Code" code={pluginUpdate} />
      <p>
        For skills added with the skills command, run <code>npx skills update</code>. Copied folders: replace them with
        the latest from the repository. The MCP connection itself never needs updating: new tools appear on their own.
      </p>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <DocTable
        caption="Common problems"
        head={['Problem', 'What to do']}
        rows={[
          ['401 or "Send an OpenSEO API key"', 'The header is missing or the key is wrong or revoked. Check the variable is set in the environment the agent starts from, and that the header reads Bearer, a space, then the key.'],
          ['The agent does not see the tools', 'Restart or reload the agent after adding the server; most read their MCP configuration only at start.'],
          ['405 Method not allowed', 'The server is stateless and only answers POST. Choose the streamable HTTP transport, not SSE.'],
          ['Variables are not expanded', 'Some clients start without your shell environment. Put the key in the client’s own env setting, or restart it from a terminal where the variable is set.'],
          ['ChatGPT says the URL is unsafe', 'Use the full https:// address, and a server reachable from the internet; ChatGPT cannot reach localhost. Self-hosted installs need HTTPS on a public domain.'],
          ['The sign-in window says the request expired', 'Requests last ten minutes and work once. Start the connection again from the app.'],
          ['A connected app stopped working', 'If a refresh token is ever used twice, OpenSEO ends that connection for safety. Disconnect it in Settings and connect again.'],
          ['cost_ceiling_exceeded', 'The call could cost more than the limit. Raise max_cost_usd or ask for less, such as fewer results or a smaller grid.'],
        ]}
      />

      <h2 id="rest">REST API</h2>
      <p>
        The same key works with the <Link href="/docs/rest-api">REST API</Link>, for scripts and your own tools. Send it
        in the same <code>Authorization</code> header.
      </p>
    </DocArticle>
  );
}
