// Audit of the charada artwork: what exists, what is missing and what is unused.
//
// Reads the delivered table and the artwork folders through the same module the
// API uses, so the report cannot disagree with what the app shows.
//
// Usage:
//   node scripts/audit-significados.mjs            # informe en Markdown
//   node scripts/audit-significados.mjs --list     # solo rutas a crear

import { compactList, getFicha, totals } from '../src/content/charada.js';

const onlyList = process.argv.includes('--list');

const counts = await totals();
const rows = await compactList();

/** @type {Array<{number: number, principal: string, id: string, nombre: string, rol: string, path: string}>} */
const missing = [];

for (const row of rows) {
  const ficha = await getFicha(row.number);
  if (!ficha) continue;
  for (const meaning of ficha.significados) {
    if (meaning.icon) continue;
    missing.push({
      number: ficha.number,
      principal: ficha.principal,
      id: meaning.id,
      nombre: meaning.nombre,
      rol: meaning.rol,
      path: `${String(ficha.number).padStart(2, '0')}/${meaning.id}.png`,
    });
  }
}

if (onlyList) {
  for (const item of missing) process.stdout.write(`${item.path}\n`);
  process.exit(0);
}

const out = [];

// Pendientes por ficha, para planificar por lotes.
const byNumber = new Map();
for (const item of missing) byNumber.set(item.number, (byNumber.get(item.number) ?? 0) + 1);

out.push('# Significados sin imagen');
out.push('');
out.push('Generado con `node scripts/audit-significados.mjs`. No editar a mano: se regenera.');
out.push('');
out.push('## Resumen');
out.push('');
out.push(`- Fichas: **${counts.fichas}**`);
out.push(`- Significados: **${counts.significados}**`);
out.push(`- Con imagen en disco: **${counts.png}**`);
out.push(`- **Sin imagen: ${counts.pendientes}**`);
out.push(`- Archivos que ningún significado reclama: **${counts.huerfanos.length}**`);
out.push('');
out.push('## Sin imagen');
out.push('');
out.push('| Nº | Principal | Significado | Rol | Archivo a crear |');
out.push('|----|-----------|-------------|-----|-----------------|');
for (const item of missing) {
  out.push(`| ${item.number} | ${item.principal} | ${item.nombre} | ${item.rol} | \`${item.path}\` |`);
}

if (counts.huerfanos.length > 0) {
  out.push('');
  out.push('## Huérfanos');
  out.push('');
  out.push('Archivos en las carpetas que no corresponden a ningún significado de ese número:');
  out.push('');
  for (const path of counts.huerfanos) out.push(`- \`${path}\``);
}

out.push('');
out.push('## Pendientes por número');
out.push('');
out.push('Número de significados sin imagen en cada ficha, para planificar por lotes:');
out.push('');
const perNumber = [];
for (let n = 1; n <= 100; n += 1) {
  perNumber.push(`${n}: ${byNumber.get(n) ?? 0}`);
}
out.push('```');
out.push(perNumber.join('  ·  '));
out.push('```');

out.push('');
out.push('## Números completos');
out.push('');
const complete = rows.filter((row) => !byNumber.has(row.number)).map((row) => row.number);
out.push(complete.length > 0 ? complete.join(', ') : 'Ninguno: todos los números tienen al menos una imagen pendiente.');

process.stdout.write(`${out.join('\n')}\n`);
