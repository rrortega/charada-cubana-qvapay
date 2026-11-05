// Audit of the charada artwork: what exists, what is missing and what is reused.
//
// Reads the delivered table and the artwork folders through the same module the
// API uses, so the report cannot disagree with what the app shows.
//
// Usage:
//   node scripts/audit-significados.mjs            # informe en Markdown
//   node scripts/audit-significados.mjs --list     # solo rutas sin imagen

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { compactList, getFicha, totals } from '../src/content/charada.js';

const onlyList = process.argv.includes('--list');

const counts = await totals();
const rows = await compactList();

/** @type {Array<{number: number, principal: string, id: string, nombre: string, rol: string, path: string}>} */
const missing = [];
/** @type {Map<string, string[]>} hash -> public paths */
const byHash = new Map();

for (const row of rows) {
  const ficha = await getFicha(row.number);
  if (!ficha) continue;

  for (const meaning of ficha.significados) {
    const folder = String(ficha.number).padStart(2, '0');

    if (!meaning.icon) {
      missing.push({
        number: ficha.number,
        principal: ficha.principal,
        id: meaning.id,
        nombre: meaning.nombre,
        rol: meaning.rol,
        path: `${folder}/${meaning.id}.png`,
      });
      continue;
    }

    // Same bytes under two names means one drawing is doing the work of several.
    const bytes = await readFile(new URL(`../public${meaning.icon}`, import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(meaning.icon.replace('/significados/', ''));
  }
}

const reused = [...byHash.values()].filter((files) => files.length > 1);

if (onlyList) {
  for (const item of missing) process.stdout.write(`${item.path}\n`);
  process.exit(0);
}

const out = [];
out.push('# Significados: arte y huecos');
out.push('');
out.push('Generado con `node scripts/audit-significados.mjs`. No editar a mano: se regenera.');
out.push('');
out.push('## Resumen');
out.push('');
out.push(`- Fichas: **${counts.fichas}**`);
out.push(`- Significados: **${counts.significados}**`);
out.push(`- Con imagen en disco: **${counts.png}**`);
out.push(`- Sin imagen: **${counts.pendientes}**`);
out.push(`- Dibujos distintos por contenido: **${byHash.size}** (${counts.png - byHash.size} archivos repiten los bytes de otro)`);
out.push(`- Archivos que ningún significado reclama: **${counts.huerfanos.length}**`);
out.push('');

if (missing.length > 0) {
  out.push('## Sin imagen');
  out.push('');
  out.push('| Nº | Principal | Significado | Rol | Archivo a crear |');
  out.push('|----|-----------|-------------|-----|-----------------|');
  for (const item of missing) {
    out.push(`| ${item.number} | ${item.principal} | ${item.nombre} | ${item.rol} | \`${item.path}\` |`);
  }
  out.push('');
}

out.push('## Arte reutilizado');
out.push('');
if (reused.length === 0) {
  out.push('Ningún dibujo se repite.');
} else {
  out.push('Estos grupos comparten exactamente los mismos bytes: un mismo dibujo sirve a varios');
  out.push('significados. Reutilizar por concepto está bien — «perro» y «perro grande» pueden');
  out.push('ser el mismo perro —, pero conviene revisar los que mezclan ideas distintas.');
  out.push('');
  for (const files of reused.sort((a, b) => b.length - a.length).slice(0, 40)) {
    out.push(`- ${files.map((f) => `\`${f}\``).join(' = ')}`);
  }
  if (reused.length > 40) out.push(`- … y ${reused.length - 40} grupos más.`);
}

if (counts.huerfanos.length > 0) {
  out.push('');
  out.push('## Huérfanos');
  out.push('');
  out.push('Archivos que no corresponden a ningún significado de su número:');
  out.push('');
  for (const path of counts.huerfanos) out.push(`- \`${path}\``);
}

process.stdout.write(`${out.join('\n')}\n`);
