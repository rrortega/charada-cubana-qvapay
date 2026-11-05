// Tests for the prompt and the text filter of the daily adivinanza.
//
// The two properties worth pinning: every one of the day's meanings reaches the
// model, and a text that names one of them is caught (S9). Both are decisions
// about the text, not about the network, so this file never calls a provider.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrompt,
  normaliseAdivinanza,
  leakedMeanings,
  banInstruction,
  PROMPT_VERSION,
} from '../src/content/adivinanza.js';

const cargador = {
  date: '2026-11-04',
  drawType: 'EVENING',
  fijo: { value: 982, digits: [9, 8, 2] },
  charada: { value: 82 },
  corridos: [{ value: 30 }, { value: 12 }],
};

const meanings = new Map([[9, 'Elefante'], [82, 'Muerto'], [30, 'Soga'], [12, 'Pelota']]);
const meaningFor = (n) => meanings.get(n) ?? null;

test('the prompt carries every meaning of the day and forbids naming them', () => {
  const { system, user } = buildPrompt({ date: cargador.date, cargador, meaningFor });

  for (const name of ['Elefante', 'Muerto', 'Soga', 'Pelota']) {
    assert.ok(user.includes(name), `the model must receive ${name}`);
  }
  assert.ok(user.includes('2026-11-04'), 'the date belongs in the prompt');
  assert.ok(/SIN NOMBRARLOS/.test(system), 'the rule about clues must be in the system message');
  assert.ok(/pista/i.test(user), 'the user turn repeats the clue rule');
  assert.ok(/no prometas/i.test(system), 'a forecast must never be asked for');
});

test('a meaning without an entry is labelled, not left blank', () => {
  const { user } = buildPrompt({
    date: '2026-11-04',
    cargador: { ...cargador, corridos: [{ value: 77 }] },
    meaningFor: () => null,
  });
  assert.match(user, /sin significado: 77/);
});

test('the lunch draw is named as mediodía, the night one as la noche', () => {
  assert.match(buildPrompt({ date: 'x', cargador: { ...cargador, drawType: 'MIDDAY' }, meaningFor }).user, /mediodía/);
  assert.match(buildPrompt({ date: 'x', cargador, meaningFor }).user, /noche/);
});

test('naming a meaning is a leak; hinting it is not', () => {
  const names = ['Elefante', 'Muerto', 'Piedra Fina'];

  assert.deepEqual(
    leakedMeanings('El elefante se amarró una soga y el muerto se ríe.', names),
    ['Elefante', 'Muerto'],
  );
  assert.deepEqual(
    leakedMeanings('El orejón que nunca se olvida de nada bailó con el que ya no respira.', names),
    [],
  );
});

test('the leak check ignores case and accents, and any word of a compound', () => {
  assert.deepEqual(leakedMeanings('EL ELEFANTE', ['Elefante']), ['Elefante']);
  assert.deepEqual(leakedMeanings('se puso una piedra de sombrero', ['Piedra Fina']), ['Piedra Fina']);
  assert.deepEqual(leakedMeanings('la jicótea mira', ['Jicotea']), ['Jicotea']);
});

test('short filler words of a name do not count as a leak on their own', () => {
  assert.deepEqual(leakedMeanings('el de la casa', ['El Sol']), []);
});

test('the ban instruction names the offending words', () => {
  assert.match(banInstruction(['Muerto', 'Soga']), /Muerto, Soga/);
});

test('the cleaning step keeps the text and drops the wrapping', () => {
  const raw = '```\n"Adivinanza: El orejón guardó la cuenta y el callado no respira. "\n```';
  assert.equal(
    normaliseAdivinanza(raw),
    'El orejón guardó la cuenta y el callado no respira.',
  );
});

test('an unusable answer is rejected with a code', () => {
  assert.throws(() => normaliseAdivinanza('   '), { code: 'adivinanza_vacia' });
  assert.throws(() => normaliseAdivinanza('Corto.'), { code: 'adivinanza_corta' });
  assert.throws(() => normaliseAdivinanza('a '.repeat(400)), { code: 'adivinanza_larga' });
  assert.throws(
    () => normaliseAdivinanza('El orejón garantiza que ese número sale seguro y lo repite cada tarde.'),
    { code: 'adivinanza_promesa' },
  );
});

test('the prompt version is recorded so a stored text can be explained', () => {
  assert.equal(PROMPT_VERSION, 3);
});
