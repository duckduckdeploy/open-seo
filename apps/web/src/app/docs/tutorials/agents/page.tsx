import Link from 'next/link';
import { Callout, DocTable, Step, Steps } from '@/components/doc-blocks';
import { CodeBlock } from '@/components/code-block';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/agents';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

const firstAsk = `Using OpenSEO, find keyword ideas for "emergency plumber" in my project.
Keep it under $0.20. Save the 20 with the highest volume and difficulty
under 40, tagged "q4".`;

const trackAsk = `Create a weekly rank tracker for acme.com in Austin, Texas, on mobile,
top 20, with the keywords tagged "q4". Tell me what one check and one
month will cost before running anything.`;

const contextAsk = `Read the project context. Then add our goal (more booked jobs in north
Austin), our two main competitors (globex.com, initech.com) and the
pages we care about most, and save it back.`;

export default function AgentsTutorial() {
  return (
    <DocArticle slug={slug} brands={['mcp', 'claude', 'chatgpt', 'claudecode', 'cursor', 'codex', 'geminicli']}>
      <p>
        Everything in the app is also available to AI agents through OpenSEO&apos;s MCP server: research, saving,
        trackers, audits, AI visibility and local SEO. You ask in plain language; the agent picks the tools, checks
        prices and keeps under the ceiling you set.
      </p>

      <h2 id="connect">Connect once</h2>
      <p>
        Create an API key under Settings, then paste the setup prompt from Settings into your agent: it connects
        itself. For the skills, the Claude Code plugin and the config for each client, see{' '}
        <Link href="/docs/mcp">Connect your agent</Link>. The skills are the quickest start: ask your agent to run the
        seo-coach skill.
      </p>

      <h2 id="money">How agents handle money</h2>
      <p>Before the examples, the rules every OpenSEO tool follows:</p>
      <ul>
        <li>
          Tools that spend take <code>dry_run</code>, which returns the price and spends nothing, and{' '}
          <code>max_cost_usd</code>, a ceiling you agree with the agent. A call whose price could be higher is refused
          before anything is spent.
        </li>
        <li>
          Background runs (<code>run_rank_check</code>, <code>run_ai_visibility</code>, <code>run_geo_grid</code>)
          require a ceiling.
        </li>
        <li>Cached results are free, so asking the agent to look again at something from this week costs nothing.</li>
        <li>
          Your monthly spending limit applies to agents too. It is the backstop if you give an agent a broad task; set
          one under Settings before you do.
        </li>
      </ul>
      <Callout tone="cost" title="Say the budget out loud">
        <p>
          Tell the agent what it may spend (&quot;keep it under $0.50&quot;). Agents are told to state prices and use
          dry runs, but a clear number in your request is what they pass as <code>max_cost_usd</code>.
        </p>
      </Callout>

      <h2 id="examples">Three workflows</h2>
      <h3 id="keywords">Research and save keywords</h3>
      <CodeBlock label="You ask" code={firstAsk} />
      <Steps>
        <Step title="list_projects">
          <p>The agent finds your project. With only one project, it can skip this.</p>
        </Step>
        <Step title="keyword_ideas with dry_run">
          <p>It checks the price of 150 ideas (about $0.08) against your $0.20.</p>
        </Step>
        <Step title="keyword_ideas with max_cost_usd: 0.20">
          <p>It runs the lookup with your ceiling and filters the results.</p>
        </Step>
        <Step title="save_keywords">
          <p>It saves the 20 keywords with their figures and the tag. Saving is free.</p>
        </Step>
      </Steps>

      <h3 id="tracker">Set up tracking, with prices first</h3>
      <CodeBlock label="You ask" code={trackAsk} />
      <p>
        The agent uses <code>search_locations</code> to find Austin&apos;s location code (free),{' '}
        <code>list_saved_keywords</code> with the tag, and <code>create_rank_tracker</code>, which spends nothing.{' '}
        <code>list_rank_trackers</code> then gives the price range of one check, and the agent multiplies it by about
        4.35 for a weekly month. It runs <code>run_rank_check</code> only when you agree, with that range as its
        ceiling, and reads the outcome with <code>get_rank_results</code>.
      </p>

      <h3 id="context">Give the agent memory of your project</h3>
      <CodeBlock label="You ask" code={contextAsk} />
      <p>
        Each project has free-form context notes that any agent can read with <code>get_project</code> and replace with{' '}
        <code>update_project_context</code>. Keep your goals, audience, competitors and key pages there, and every agent
        session starts from the same understanding.
      </p>

      <h2 id="ideas">More things to ask for</h2>
      <DocTable
        caption="Example requests"
        head={['Ask', 'Tools the agent uses']}
        rows={[
          ['"Who are my organic competitors, and which keywords does the top one have that I don\'t? Under $0.30."', 'competitors_domain, keyword_gap'],
          ['"Audit acme.com, then summarise the critical issues with the URLs to fix."', 'start_site_audit, list_site_audits, get_site_audit, get_audit_issues'],
          ['"Run Lighthouse on our pricing page on mobile and list the three biggest savings."', 'lighthouse'],
          ['"Ask ChatGPT, Claude and Perplexity which plumbing software they recommend and tell me who gets cited."', 'ai_compare'],
          ['"How much have we spent on OpenSEO this month, and what is left on YepAPI?"', 'get_usage, get_balance (both free)'],
        ]}
      />
      <p>
        The full list of tools and what each one costs is in <Link href="/docs/mcp-tools">MCP tools</Link>.
      </p>
    </DocArticle>
  );
}
