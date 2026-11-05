// The dream service: one call per submitted dream.
//
// It composes the three pieces so the route stays a thin wire: analyse the text
// into signals, choose the coherent set of numbers, store the signals (never the
// text), then read the week — how many dreams carried each signal and which
// other dreams look like this one (S3, S4, S6).

import { createLlm } from '../llm/openai.js';
import { analizarSueno, PROMPT_VERSION } from './analizar.js';
import { elegirConjunto } from './coherencia.js';
import {
  guardarSueno,
  contarSenales,
  contarNumeros,
  suenosParecidos,
  historialDeSuenos,
  suenoDe,
} from './store.js';

/** The window of the coincidence (S3): the same week, seven days. */
const DIAS = 7;

/**
 * @param {object} options
 * @param {import('pg').Pool} options.pool
 * @param {ReturnType<typeof createLlm>} [options.llm] provider, injectable for tests
 */
export function createSuenoService({ pool, llm = createLlm() } = {}) {
  /**
   * Analyse, choose, store and read the week.
   *
   * The signals are stored before the reads, so the dream just submitted is
   * part of the counter and of nothing else: `suenosParecidos` excludes it.
   */
  async function analizar({ texto, userId = null }) {
    const { resumen, senales } = await analizarSueno({ sueno: texto, llm });
    const { numeros, soporte } = elegirConjunto(senales);

    const { id } = await guardarSueno(pool, {
      senales,
      texto,
      resumen,
      numeros,
      userId,
      modelo: llm.model,
    });

    const [semana, parecidos] = await Promise.all([
      contarSenales(pool, { dias: DIAS }),
      suenosParecidos(pool, {
        suenoId: id,
        senales: senales.map((senal) => senal.nombre),
        // Comparing someone with their own dreams is not a coincidence.
        usuarioId: userId,
        dias: DIAS,
      }),
    ]);

    return { resumen, senales, numeros, soporte, coincidencias: { senales: semana, parecidos } };
  }

  return {
    configured: llm.configured,
    model: llm.model,
    promptVersion: PROMPT_VERSION,
    analizar,
    senales: (options) => contarSenales(pool, options),
    numeros: (options) => contarNumeros(pool, options),
    historial: (options) => historialDeSuenos(pool, options),
    lectura: (options) => suenoDe(pool, options),
  };
}
