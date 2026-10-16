import { ASSISTANT_BRANDS } from '@/components/brand-icon';
import Link from 'next/link';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/ai-visibility';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function AiVisibilityTutorial() {
  return (
    <DocArticle slug={slug} brands={ASSISTANT_BRANDS}>
      <p>
        AI visibility asks the questions your customers ask, across the assistants they use, and records whether each
        answer mentions your brand, whether it cites your site, and where you come compared with your competitors.
      </p>

      <h2 id="setup">Set it up</h2>
      <Steps>
        <Step title="Describe your brand">
          <p>
            Open <Ui>AI visibility</Ui> and go to <strong>Setup</strong>. The brand name starts as your project name and
            the domain as its website. Add other names people use: abbreviations, product names, common misspellings.
          </p>
        </Step>
        <Step title="Add competitors">
          <p>
            Up to 20. They cost nothing extra: they are looked for in the same answers, which gives you share of voice.
            A domain lets OpenSEO count their citations too.
          </p>
        </Step>
        <Step title="Choose the models">
          <p>
            The default set has one current model per assistant people use: ChatGPT, Gemini, Claude and Perplexity.
            Grok, Meta AI and DeepSeek are one click away, and <strong>All models</strong> lists more than 120. Each
            model answers every prompt, so each one multiplies the price of a run. The exact model ID is stored with
            every answer, so a new model version shows up in your trend instead of silently changing it.
          </p>
        </Step>
        <Step title="Keep web search on">
          <p>
            With web search, models look things up and list their sources, which is what makes citations possible. It
            adds roughly a cent or more per answer. Without it, models answer from memory and cite nothing.
          </p>
        </Step>
        <Step title="Save">
          <p>
            Click <Ui>Save setup</Ui>. Saving spends nothing. You can also set a daily, weekly or monthly schedule here.
          </p>
        </Step>
      </Steps>

      <h2 id="prompts">Add prompts</h2>
      <p>
        On the <strong>Prompts</strong> tab, add the questions a buyer might type into an assistant, one per line, for
        example <code>What is the best invoicing software for plumbers?</code>. Leave your brand name out: the point is
        to see whether the assistant brings you up by itself.
      </p>
      <p>
        No ideas? <strong>Suggest prompts</strong> drafts them from a sentence about the business, for about a cent.
        Nothing is added until you tick the ones you want. Pause a prompt to stop paying for it while keeping its
        history.
      </p>

      <h2 id="run">Run it</h2>
      <p>
        The bar at the top shows one run (prompts × models answers), the minimum price ($0.01 per answer), and, once
        every model has answered before, the expected price from your history. Click <Ui>Run now</Ui> and confirm. You
        can cancel a run that is going; answers already collected are kept.
      </p>

      <h2 id="read">Read the results</h2>
      <DocTable
        caption="AI visibility measures"
        head={['Measure', 'How it is counted']}
        rows={[
          ['Mentioned', 'The answer’s text contains your brand name, one of your other names, or your domain, as a whole word in any letter case. Links, email addresses and citation markers such as [1] do not count: a link to your site is a citation, not a mention.'],
          ['Cited', 'One of the sources the model listed is on your domain or a subdomain of it.'],
          ['Position', 'The order in which tracked brands are first mentioned in the answer: 1 means you came up first.'],
          ['Mention rate, citation rate', 'Share of answers in a run that mention or cite you, counting only prompts that do not name your brand.'],
          ['Share of voice', 'How many answers mention each tracked brand, yours highlighted, with how often each came first or was cited.'],
        ]}
      />
      <p>
        The <strong>Overview</strong> tab has the latest run in detail: rates by model, share of voice, the domains
        models cite most (good link-building targets), and a grid of prompts by model. Click a prompt to read each
        model&apos;s full answer and its sources. After a second run, a trend chart appears.
      </p>

      <h3 id="fair">What is left out, and when a change is shown</h3>
      <ul>
        <li>
          <strong>Prompts that name your brand</strong> (&quot;Is Acme any good?&quot;) nearly always get an answer
          that mentions it, so they would flatter your rates. They are left out of the rates, share of voice and trend,
          and marked <em>names your brand</em> in the grid.
        </li>
        <li>
          <strong>Failed or empty answers</strong> are left out too, rather than counted as answers that missed you.
          They show as <em>No answer</em> in the grid.
        </li>
        <li>
          The change since the previous run is shown only when both runs answered at least 90% of what they planned,
          and only over the prompt, model and brand combinations both runs asked. If a run fell short, or you changed
          your prompts, models or brand name in between, the page says why there is no change instead of showing a
          misleading one. Trend points from runs under 90% are marked as less reliable.
        </li>
        <li>
          Cited links are stored without tracking parameters (<code>utm_</code>, <code>gclid</code> and similar), so the
          same page is not counted twice.
        </li>
      </ul>
      <Callout title="What these numbers are, and are not">
        <p>
          They are what each model answers through its API. ChatGPT, Gemini and the other consumer apps add their own
          instructions, memory and personalisation, so a person may see something different. Use the trend to judge
          direction, not as an exact copy of what any one user sees.
        </p>
      </Callout>

      <h2 id="explorer">Try a question first</h2>
      <p>
        The <strong>Explorer</strong> tab asks one prompt to up to 8 models side by side, without adding it to your
        tracked prompts or your trend. It is a quick way to test a question before you track it. It is priced by tokens,
        with a $0.01 minimum per model.
      </p>

      <Callout tone="cost" title="Keeping runs affordable">
        <p>
          A weekly run of 20 prompts on 4 models is 80 answers, about 4.35 runs a month: at least $3.48 a month, more
          with long answers. Start with a few prompts and the default models, look at what one run really costs, then
          grow. Agents can set a hard ceiling per run; see <Link href="/docs/costs-and-limits#ceilings">Costs, caching and limits</Link>.
        </p>
      </Callout>
    </DocArticle>
  );
}
