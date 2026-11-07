// Thin, provider-agnostic client. Keys never leave the server.
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
export type Provider = 'openai' | 'anthropic' | 'none';

export function llmConfig(): { provider: Provider; model: string; embeddings: boolean; embeddingModel: string; endpoint: string } {
  const forced = (process.env.LLM_PROVIDER || '').toLowerCase();
  let provider: Provider = 'none';
  if (forced === 'openai' && process.env.OPENAI_API_KEY) provider = 'openai';
  else if (forced === 'anthropic' && process.env.ANTHROPIC_API_KEY) provider = 'anthropic';
  else if (process.env.OPENAI_API_KEY) provider = 'openai';
  else if (process.env.ANTHROPIC_API_KEY) provider = 'anthropic';
  const model =
    process.env.LLM_MODEL ||
    (provider === 'openai' ? 'gpt-4.1-mini' : provider === 'anthropic' ? 'claude-haiku-5-5' : '');
  return {
    provider,
    model,
    embeddings: Boolean(process.env.OPENAI_API_KEY),
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    // The host that actually receives draft text, shown to users as a disclosure.
    endpoint: provider === 'openai' ? new URL(OPENAI_BASE).host : provider === 'anthropic' ? 'api.anthropic.com' : '',
  };
}
const CHAT_TIMEOUT = Number(process.env.LLM_TIMEOUT_MS) || 45_000;
async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

/** Extract the first JSON object from a model reply (tolerates code fences and preamble). */
export function parseJsonObject(text: string): any {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model reply contained no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function chatJSON(system: string, user: string, maxTokens = 2500): Promise<any> {
  const cfg = llmConfig();
  if (cfg.provider === 'none') throw new Error('No LLM provider configured');
  return withTimeout(CHAT_TIMEOUT, async (signal) => {
    if (cfg.provider === 'openai') {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: cfg.model,
          response_format: { type: 'json_object' },
          ...(process.env.LLM_REASONING_EFFORT
            ? { reasoning_effort: process.env.LLM_REASONING_EFFORT }
            : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return parseJsonObject(data.choices?.[0]?.message?.content || '');
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    return parseJsonObject(text);
  });
}

/** Embeddings are optional (OpenAI only). Returns null when unavailable so callers fall back to BM25. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const cfg = llmConfig();
  if (!cfg.embeddings || texts.length === 0) return null;
  try {
    return await withTimeout(15_000, async (signal) => {
      const res = await fetch(`${OPENAI_BASE}/embeddings`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: cfg.embeddingModel, input: texts.map((t) => t.slice(0, 6000)) }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.data || []).map((d: any) => d.embedding as number[]);
    });
  } catch {
    return null;
  }
}
