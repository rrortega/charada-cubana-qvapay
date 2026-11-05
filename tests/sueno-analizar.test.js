// Tests for the dream analyser: the prompt, the validation of the model's JSON
// and the retry policy (S5, S8).
//
// Hermetic: the provider is a double, so no network is touched and the number
// of calls is observable from outside. The vocabulary does come from the real
// charada table, because the prompt has to carry the meanings the numbers come
// from.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt, parseAnalysis, analizarSueno, PROMPT_VERSION } from '../src/sueno/analizar.js';

const ANSWER = {
  senales: [
    { nombre: 'agua', peso: 0.9, numeros: [9, 33] },
    { nombre: 'perro', peso: 0.5, numeros: [9] },
    { nombre: 'camino', peso: 0.4, numeros: [44] },
  ],
};
const OK = JSON.stringify(ANSWER);

/** A provider that replays answers in order and records every message it saw. */
function fakeLlm(answers, { configured = true } = {}) {
  const calls = [];
  return {
    configured,
    model: 'fake-model',
    calls,
    async complete(messages) {
      calls.push(messages);
      const next = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (next && typeof next === 'object' && next.error) {
        const error = new Error(next.error);
        error.code = next.error;
        throw error;
      }
      return next;
    },
  };
}

const signal = (nombre, peso, numeros) => ({ nombre, peso, numeros });
const only = (raw) => parseAnalysis(JSON.stringify({ senales: raw })).senales;

test('the prompt asks for strict JSON over the charada vocabulary (S8)', async () => {
  const { system, user } = await buildPrompt({ sueno: 'Vi un caballo junto al mar.' });

  assert.equal(PROMPT_VERSION, 1);
  assert.match(system, /entre 3 y 12/i);
  assert.match(system, /JSON/);
  // The model needs the numbered vocabulary: the meanings are what points at a
  // number, and "Caballo" alone does not say 1.
  assert.match(system, /1: Caballo/);
  assert.match(system, /100: /);
  // S5/S8: a reading of symbols, never a forecast.
  assert.match(system, /no es un pronóstico|no predice|nunca predice/i);
  assert.match(system, /nunca inventes un\s+número mayor que 100/i);
  assert.match(user, /Vi un caballo junto al mar\./);
});

test('a markdown fence around the answer is stripped', () => {
  const { senales } = parseAnalysis(`\`\`\`json\n${OK}\n\`\`\``);
  assert.equal(senales.length, 3);
  assert.equal(senales[0].nombre, 'agua');
});

test('names are folded: lowercase, no accents, trimmed', () => {
  const [first] = only([signal('  Pájaro  ', 0.5, [7])]);
  assert.equal(first.nombre, 'pajaro');
});

test('the same signal twice keeps the highest weight', () => {
  const senales = only([signal('Agua', 0.4, [9]), signal('AGUA', 0.9, [33])]);
  assert.equal(senales.length, 1);
  assert.equal(senales[0].nombre, 'agua');
  assert.equal(senales[0].peso, 0.9);
});

test('the weight is clamped into 0.05..1', () => {
  const senales = only([signal('agua', 9, [9]), signal('rio', -3, [33]), signal('pez', 0.5, [44])]);
  const byName = new Map(senales.map((s) => [s.nombre, s.peso]));
  assert.equal(byName.get('agua'), 1);
  assert.equal(byName.get('rio'), 0.05);
  assert.equal(byName.get('pez'), 0.5);
});

test('numbers outside 1..100 are dropped, deduped and capped at four', () => {
  const [first] = only([signal('agua', 1, [0, 1, 100, 101, 9, 9, 33, 50, 77])]);
  assert.deepEqual(first.numeros, [1, 100, 9, 33]);
});

test('no more than twelve signals survive', () => {
  const many = Array.from({ length: 15 }, (_, i) => signal(`s${i + 1}`, (i + 1) / 15, [i + 1]));
  const senales = only(many);
  assert.equal(senales.length, 12);
  // The cap keeps the strongest ones.
  assert.ok(senales.every((s) => s.peso >= 4 / 15));
});

test('unparseable output is sueno_json', () => {
  assert.throws(() => parseAnalysis('no pude analizarlo'), (err) => err.code === 'sueno_json');
  assert.throws(() => parseAnalysis(''), (err) => err.code === 'sueno_json');
});

test('output that yields no valid signal is sueno_sin_senales', () => {
  assert.throws(() => parseAnalysis('{"senales":[]}'), (err) => err.code === 'sueno_sin_senales');
  assert.throws(
    () => parseAnalysis(JSON.stringify({ senales: [signal('x', 1, [9])] })),
    (err) => err.code === 'sueno_sin_senales',
  );
});

test('unparseable output buys one retry', async () => {
  const llm = fakeLlm(['lo siento, no puedo ayudarte', OK]);
  const out = await analizarSueno({ sueno: 'Soñé con agua.', llm });

  assert.equal(llm.calls.length, 2);
  assert.equal(out.senales.length, 3);
  assert.equal(llm.calls[0].user, llm.calls[1].user, 'the same dream is asked again');
});

test('an answer without signals buys one retry', async () => {
  const llm = fakeLlm([JSON.stringify({ senales: [] }), OK]);
  const out = await analizarSueno({ sueno: 'Soñé con agua.', llm });
  assert.equal(llm.calls.length, 2);
  assert.equal(out.senales[0].nombre, 'agua');
});

test('an empty answer buys one retry', async () => {
  const llm = fakeLlm([{ error: 'llm_empty' }, OK]);
  await analizarSueno({ sueno: 'Soñé con agua.', llm });
  assert.equal(llm.calls.length, 2);
});

test('a 5xx buys one retry and a second failure surfaces', async () => {
  const llm = fakeLlm([{ error: 'llm_http_500' }, { error: 'llm_http_503' }]);
  await assert.rejects(
    () => analizarSueno({ sueno: 'Soñé con agua.', llm }),
    (err) => err.code === 'llm_http_503',
  );
  assert.equal(llm.calls.length, 2);
});

test('a 4xx is never retried', async () => {
  const llm = fakeLlm([{ error: 'llm_http_401' }, OK]);
  await assert.rejects(
    () => analizarSueno({ sueno: 'Soñé con agua.', llm }),
    (err) => err.code === 'llm_http_401',
  );
  assert.equal(llm.calls.length, 1, 'a bad key or model name does not improve by asking again');
});

test('a missing configuration is never retried', async () => {
  const llm = fakeLlm([{ error: 'llm_not_configured' }], { configured: false });
  await assert.rejects(
    () => analizarSueno({ sueno: 'Soñé con agua.', llm }),
    (err) => err.code === 'llm_not_configured',
  );
  assert.equal(llm.calls.length, 1);
});
