// Pulls official Florida Pick 3 draws and stores them idempotently.
// Usage: npm run ingest [days]
import './env.js';
import pg from 'pg';
import {
  fetchDrawHistory,
  normaliseBatch,
  GAME_IDS,
} from '../src/ingest/floridaLottery.js';
import { computeCargador } from '../src/domain/cargador.js';

const days = Number(process.argv[2] ?? 30);
const end = new Date();
const start = new Date(end.getTime() - days * 86_400_000);

const raw = await fetchDrawHistory(GAME_IDS.pick3, start, end);
const batch = normaliseBatch(raw, { expectedGameId: GAME_IDS.pick3, winningDigits: 3 });
console.log(`${raw.length} records -> ${batch.length} usable draws`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let inserted = 0;
let cargadores = 0;
for (const draw of batch) {
  const res = await client.query(
    `INSERT INTO draws (game_id, draw_date, draw_type, base_digits, fireball, total_winners, total_payouts, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (game_id, draw_date, draw_type) DO NOTHING
     RETURNING id`,
    [GAME_IDS.pick3, draw.drawDate, draw.drawType, draw.baseDigits, draw.fireball,
      draw.totalWinners, draw.totalPayouts, JSON.stringify(draw.rawPayload)],
  );
  let drawId = res.rows[0]?.id;
  if (res.rowCount) inserted += 1;
  else {
    const found = await client.query(
      'SELECT id FROM draws WHERE game_id=$1 AND draw_date=$2 AND draw_type=$3',
      [GAME_IDS.pick3, draw.drawDate, draw.drawType],
    );
    drawId = found.rows[0]?.id;
  }
  if (!drawId) continue;

  const c = computeCargador(draw.baseDigits);
  const car = await client.query(
    `INSERT INTO cargadores (draw_id, date, draw_type, fijo, prefijo, dos_ultimos)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (draw_id) DO NOTHING`,
    [drawId, draw.drawDate, draw.drawType, c.fijo, c.prefijo, c.dosUltimos],
  );
  cargadores += car.rowCount;
}

console.log(`draws inserted: ${inserted}, cargadores inserted: ${cargadores}`);
await client.end();
