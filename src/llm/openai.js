// Transport for any OpenAI-compatible chat completions endpoint.
//
// One seam, three settings: base URL, model and key. Changing provider is an
// .env edit, never a code edit, and the key never leaves the server (S8 of the
// main spec). Uses global fetch, so no dependency is added (S7).

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Read the provider settings. Null when the feature is not configured. */
export function llmConfig(env = process.env) {
  const apiKey = (env.ADIVINANZA_LLM_API_KEY ?? '').trim();
  const model = (env.ADIVINANZA_LLM_MODEL ?? '').trim();
  const baseUrl = (env.ADIVINANZA_LLM_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const timeoutMs = Number(env.ADIVINANZA_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  if (!apiKey || !model) return null;
  return { baseUrl, apiKey, model, timeoutMs };
}

/** An error a caller can branch on without parsing prose. */
function llmError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

/**
 * Build the transport.
 *
 * `fetchImpl` exists so tests can answer without the network and so a future
 * provider with a different shape can be swapped in without touching callers.
 */
export function createLlm({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  const config = llmConfig(env);

  // Some gateways hand the model a tool list by default, and a reasoning model
  // then answers with `tool_calls` and an empty message. `tool_choice: "none"`
  // closes that route; a provider that rejects the field gets it dropped after
  // the first refusal, so the transport still works without the field.
  let sendNoTools = true;

  const api = {
    configured: config !== null,
    model: config?.model ?? null,

    /**
     * One completion. Returns the assistant's text, trimmed.
     *
     * Throws with `code` set: `llm_not_configured`, `llm_timeout`,
     * `llm_http_<status>`, `llm_unparseable`, `llm_empty`.
     */
    // Generous by default: a reasoning model spends completion tokens on its
    // own deliberation before it writes a word, and a tight cap leaves an empty
    // answer with `finish_reason: stop`. Measured: at 1500 the same prompt comes
    // back empty about half the time, at 3000 it never did.
    async complete({ system, user, temperature = 0.9, maxTokens = 3000 }) {
      if (!config) {
        throw llmError('llm_not_configured', 'ADIVINANZA_LLM_API_KEY or ADIVINANZA_LLM_MODEL is missing');
      }

      const limit = timeoutMs ?? config.timeoutMs;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limit);

      const send = () => {
        const body = {
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          max_tokens: maxTokens,
        };
        if (sendNoTools) body.tool_choice = 'none';

        return fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      };

      let response;
      try {
        response = await send();
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw llmError('llm_timeout', `no answer in ${limit} ms`);
        }
        throw llmError('llm_unreachable', err?.message ?? 'fetch failed');
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        // The body explains a bad key or a bad model name; keep a slice of it in
        // the log without letting a huge page into the error.
        const detail = await response.text().catch(() => '');

        // A provider that does not know `tool_choice` says so once; ask again
        // without it and remember, so every later call skips the field.
        if (sendNoTools && response.status === 400 && /tool_choice|tools?\b/i.test(detail)) {
          sendNoTools = false;
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort(), limit);
          try {
            response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.apiKey}`,
              },
              body: JSON.stringify({
                model: config.model,
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: user },
                ],
                temperature,
                max_tokens: maxTokens,
              }),
              signal: retryController.signal,
            });
          } finally {
            clearTimeout(retryTimer);
          }
          if (!response.ok) {
            const again = await response.text().catch(() => '');
            throw llmError(`llm_http_${response.status}`, again.slice(0, 300) || response.statusText);
          }
        } else {
          throw llmError(`llm_http_${response.status}`, detail.slice(0, 300) || response.statusText);
        }
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw llmError('llm_unparseable', 'the response was not JSON');
      }

      const text = payload?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim() === '') {
        throw llmError('llm_empty', 'the response carried no text');
      }
      return text.trim();
    },
  };

  return api;
}
