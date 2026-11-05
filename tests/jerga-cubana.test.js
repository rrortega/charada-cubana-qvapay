// Tests for the Cuban slang dictionary.
//
// Two properties matter. The reader must pick the entries a dream actually used
// (and only those: the whole dictionary in every prompt costs more than the
// dream), and synonyms must fold into one concept, or two people who dream the
// same thing never meet in the weekly counter.

import test from 'node:test';
import assert from 'node:assert/strict';

import { JERGA, jergaPara, canonicoDe, fold } from '../src/content/jerga-cubana.js';

test('every entry is complete and unique', () => {
  const seen = new Set();

  for (const entry of JERGA) {
    for (const key of ['termino', 'significado', 'canonico', 'contexto']) {
      assert.equal(typeof entry[key], 'string', `${entry.termino} has no ${key}`);
      assert.ok(entry[key].length > 0, `${entry.termino} has an empty ${key}`);
    }
    // Keys are compared folded, so they must be stored folded.
    assert.equal(entry.termino, fold(entry.termino), `${entry.termino} is not folded`);
    assert.ok(!seen.has(entry.termino), `${entry.termino} is listed twice`);
    seen.add(entry.termino);
  }

  assert.ok(JERGA.length >= 60, 'the dictionary is broad enough to be useful');
});

test('the glove terms of the request are in there', () => {
  const byTerm = new Map(JERGA.map((entry) => [entry.termino, entry]));

  assert.equal(byTerm.get('jeva').canonico, 'pareja');
  assert.equal(byTerm.get('yuma').canonico, 'extranjeria');
  assert.equal(byTerm.get('jama').canonico, 'comida');
});

test('only the entries the dream used are returned', () => {
  const found = jergaPara('Anoche soñé que mi jeva se iba pa la yuma y me dejaba sin jama.');
  const terms = found.map((entry) => entry.termino);

  assert.ok(terms.includes('jeva'), 'the girlfriend is recognised');
  assert.ok(terms.includes('yuma'), 'the country is recognised');
  assert.ok(terms.includes('jama'), 'the food is recognised');
  assert.ok(!terms.includes('guagua'), 'a term that was not used stays out');
});

test('a plain dream brings no glossary', () => {
  assert.deepEqual(jergaPara('Soñé con un caballo blanco en la playa.'), []);
  assert.deepEqual(jergaPara(''), []);
  assert.deepEqual(jergaPara(null), []);
});

test('matching respects word boundaries and multi-word terms', () => {
  const colador = jergaPara('Soñé que colaba café en un colador viejo.');
  assert.ok(!colador.some((entry) => entry.termino === 'cola'), '"cola" is not inside "colador"');

  const ojo = jergaPara('Me echaron mal de ojo en el barrio.');
  assert.ok(ojo.some((entry) => entry.termino === 'mal de ojo'), 'the phrase wins over its parts');
});

test('the glossary is capped so the prompt stays cheaper than the dream', () => {
  const everything = JERGA.map((entry) => entry.termino).join(' y ');
  assert.equal(jergaPara(everything, { limite: 4 }).length, 4);
  assert.ok(jergaPara(everything).length <= 12);
});

test('synonyms fold to one concept, plain words pass through', () => {
  assert.equal(canonicoDe('jeva'), 'pareja');
  assert.equal(canonicoDe('Jevá'), 'pareja', 'accents and case do not matter');
  assert.equal(canonicoDe('mi jeva'), 'pareja', 'the concept travels inside a phrase');
  assert.equal(canonicoDe('novia'), 'novia', 'a plain word is already its own concept');
  assert.equal(canonicoDe(''), '');
});

test('two dreams about the same thing in different words share a concept', () => {
  const a = canonicoDe('jeva');
  const b = canonicoDe('pareja');
  const c = canonicoDe('consorte');

  assert.equal(a, b);
  assert.equal(b, c);
});
