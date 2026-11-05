// Tests for src/content/charada.js
//
// The data is the delivered table plus the artwork folders, so these tests check
// structure and the invariants the UI depends on instead of hard-coded counts:
// a row per number, artwork that actually exists on disk under the number's own
// folder, and a ficha that carries its meanings, relations and tradition.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import {
  loadCharada,
  compactList,
  getFicha,
  totals,
  displayName,
  __resetCharadaForTests,
} from '../src/content/charada.js';

/** Where a public path lands on disk. */
const onDisk = (publicPath) => new URL(`../public${publicPath}`, import.meta.url);

test('the list has one row per number, in order, from 1 to 100', async () => {
  __resetCharadaForTests();
  const rows = await compactList();
  assert.equal(rows.length, 100);
  assert.deepEqual(rows.map((r) => r.number), Array.from({ length: 100 }, (_, i) => i + 1));
});

test('every row carries a principal name and its meaning names', async () => {
  for (const row of await compactList()) {
    assert.equal(typeof row.principal, 'string');
    assert.ok(row.principal.length > 0, `entry ${row.number}: principal`);
    assert.ok(row.nombres.length >= 1, `entry ${row.number}: names`);
    assert.equal(row.conArte <= row.significados, true, `entry ${row.number}: art count`);
  }
});

test('every reported icon exists on disk, inside its own number folder', async () => {
  for (const row of await compactList()) {
    if (row.icon === null) continue;
    assert.match(row.icon, new RegExp(`^/significados/${String(row.number).padStart(2, '0')}/[a-z0-9-]+\\.png$`));
    assert.equal(existsSync(onDisk(row.icon)), true, `missing file: ${row.icon}`);
  }
});

test('entry 1 is the horse, with its own artwork', async () => {
  const ficha = await getFicha(1);
  assert.equal(ficha.number, 1);
  assert.equal(ficha.principal, 'Caballo');
  assert.equal(ficha.icon, '/significados/01/caballo.png');
  assert.ok(ficha.significados.some((s) => s.id === 'caballo' && s.rol === 'principal'));
});

test('a ficha lists every meaning with role, description and optional art', async () => {
  const ficha = await getFicha(37);
  assert.equal(ficha.number, 37);
  assert.ok(ficha.significados.length > 1);
  for (const meaning of ficha.significados) {
    assert.equal(typeof meaning.nombre, 'string');
    assert.ok(['principal', 'alternativo'].includes(meaning.rol), `role ${meaning.rol}`);
    assert.equal(typeof meaning.descripcion, 'string');
    if (meaning.icon !== null) assert.equal(existsSync(onDisk(meaning.icon)), true, meaning.icon);
  }
});

test('a ficha reports its artwork count consistently with the files', async () => {
  const ficha = await getFicha(37);
  const onDiskCount = ficha.significados.filter((s) => s.icon).length;
  for (const meaning of ficha.significados) {
    const expected = existsSync(new URL(`../public/significados/37/${meaning.id}.png`, import.meta.url));
    assert.equal(meaning.icon !== null, expected, meaning.id);
  }
  assert.equal(onDiskCount, ficha.significados.filter((s) => s.icon).length);
});

test('tradition keeps only what it has, as numbers when it is numeric', async () => {
  const ficha = await getFicha(1);
  assert.equal(typeof ficha.tradicion.peon, 'number');
  assert.equal(typeof ficha.tradicion.companero, 'number');
  assert.ok(ficha.tradicion.cuadrilla === undefined || typeof ficha.tradicion.cuadrilla === 'string');
  const last = await getFicha(100);
  assert.deepEqual(last.tradicion, {});
});

test('related numbers are numbers, ready to navigate', async () => {
  const ficha = await getFicha(1);
  assert.ok(ficha.relacionadas.length > 0);
  for (const related of ficha.relacionadas) assert.equal(Number.isInteger(related), true);
});

test('an entry outside the table is null', async () => {
  assert.equal(await getFicha(101), null);
  assert.equal(await getFicha(0), null);
});

test('the totals count the artwork that exists, not the one the file declared', async () => {
  const rows = await compactList();
  const data = await loadCharada();
  const sum = rows.reduce((acc, row) => acc + row.significados, 0);
  assert.equal(sum, data.resumen.significados, 'the JSON still describes every meaning');

  const counts = await totals();
  assert.equal(counts.fichas, 100);
  assert.equal(counts.significados, sum);
  assert.equal(counts.png + counts.pendientes, counts.significados);
});

test('the symbol of a number is the one the file declares, not the drawing', async () => {
  // 98 declares guayaba, but the folder only holds gallo.png: the declaration
  // wins, and the symbol simply has no drawing.
  const ficha = await getFicha(98);
  assert.equal(ficha.principal, 'Guayaba');
  assert.equal(ficha.icon, null);
  const marked = ficha.significados.filter((s) => s.rol === 'principal');
  assert.equal(marked.length, 1);
  assert.equal(marked[0].nombre, 'Guayaba');
  const gallo = ficha.significados.find((s) => s.id === 'gallo');
  assert.ok(gallo, 'the rooster is an alternative meaning');
  assert.equal(gallo.rol, 'alternativo');
});

test('meaning names are served as titles, respecting the particles', () => {
  assert.equal(displayName('caballo'), 'Caballo');
  assert.equal(displayName('gato tigre'), 'Gato Tigre');
  assert.equal(displayName('piedra fina'), 'Piedra Fina');
  assert.equal(displayName('año del cuero'), 'Año del Cuero');
  assert.equal(displayName('  '), '');
});

test('a ficha never serves a lower-case name', async () => {
  for (const number of [1, 14, 37, 51, 100]) {
    const ficha = await getFicha(number);
    for (const meaning of ficha.significados) {
      const first = meaning.nombre.charAt(0);
      assert.equal(first, first.toLocaleUpperCase('es'), `${number}/${meaning.id}: ${meaning.nombre}`);
    }
  }
});

test('every resolved icon is named after its meaning id', async () => {
  for (const number of [1, 14, 37, 51, 99, 100]) {
    const ficha = await getFicha(number);
    const folder = String(number).padStart(2, '0');
    for (const meaning of ficha.significados) {
      if (meaning.icon === null) continue;
      assert.equal(meaning.icon, `/significados/${folder}/${meaning.id}.png`, `${number}/${meaning.id}`);
    }
  }
});
