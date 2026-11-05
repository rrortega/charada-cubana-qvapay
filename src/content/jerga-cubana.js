// Cuban slang, curated for the dream reader.
//
// Two jobs, and the second is the one that matters. First, the model must read
// "jeva" or "yuma" as a Cuban says them, or it reads the dream backwards.
// Second, and quietly more important: two people who dream the same thing with
// different words have to meet. Without folding synonyms into one concept, "soñé
// con mi jeva" and "soñé con mi novia" never count as a coincidence.
//
// `canonico` is that shared concept. It is deliberately plain Spanish, because
// it is a key, not a word anybody reads.
//
// Curated by hand and open to correction by a native speaker: a wrong gloss here
// is worse than a missing one, so a doubtful term stays out.

/**
 * @typedef {object} JergaEntry
 * @property {string} termino     the word as it is written in Cuban speech
 * @property {string} significado one line, what it means
 * @property {string} canonico    the plain concept it folds into
 * @property {string} contexto    where or how it is used
 */

/** Lowercase, accent-free form, so "yumá" and "yuma" match. */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** @type {JergaEntry[]} */
export const JERGA = [
  // People and the people around you.
  { termino: 'jeva', significado: 'la novia, la pareja', canonico: 'pareja', contexto: 'habla diaria, jodedera' },
  { termino: 'jevo', significado: 'el novio, la pareja', canonico: 'pareja', contexto: 'habla diaria, jodedera' },
  { termino: 'consorte', significado: 'la pareja o el compañero de siempre', canonico: 'pareja', contexto: 'habla diaria, cariño' },
  { termino: 'asere', significado: 'amigo, compadre', canonico: 'amistad', contexto: 'habla diaria, calle' },
  { termino: 'acere', significado: 'amigo', canonico: 'amistad', contexto: 'habla diaria, calle' },
  { termino: 'socio', significado: 'amigo, compañero', canonico: 'amistad', contexto: 'habla diaria' },
  { termino: 'compay', significado: 'amigo, casi siempre mayor', canonico: 'amistad', contexto: 'generación mayor, campo' },
  { termino: 'chama', significado: 'niña, muchachita', canonico: 'nino', contexto: 'habla diaria' },
  { termino: 'chamo', significado: 'muchacho, joven', canonico: 'joven', contexto: 'habla diaria' },
  { termino: 'pichon', significado: 'joven inexperto', canonico: 'joven', contexto: 'jodedera' },
  { termino: 'viejo', significado: 'el padre, o la pareja', canonico: 'familia', contexto: 'habla diaria, cariño' },
  { termino: 'vieja', significado: 'la madre, o la pareja', canonico: 'familia', contexto: 'habla diaria, cariño' },
  { termino: 'mami', significado: 'la madre, o la pareja', canonico: 'familia', contexto: 'habla diaria, cariño' },
  { termino: 'papi', significado: 'el padre, o la pareja', canonico: 'familia', contexto: 'habla diaria, cariño' },
  { termino: 'querida', significado: 'la amante', canonico: 'amante', contexto: 'habla diaria' },
  { termino: 'tiguere', significado: 'el vivo, el que se busca la vida', canonico: 'astucia', contexto: 'calle, jodedera' },
  { termino: 'guajiro', significado: 'campesino, gente del campo', canonico: 'campo', contexto: 'habla diaria' },

  // Migration and money, the two things a Cuban dreams about most.
  { termino: 'yuma', significado: 'Estados Unidos, el extranjero, o el extranjero mismo', canonico: 'extranjeria', contexto: 'habla diaria, migración' },
  { termino: 'el norte', significado: 'Estados Unidos', canonico: 'extranjeria', contexto: 'habla diaria, migración' },
  { termino: 'el que se fue', significado: 'el que emigró y vive fuera', canonico: 'emigracion', contexto: 'habla diaria, familia' },
  { termino: 'balsero', significado: 'el que se va en balsa', canonico: 'emigracion', contexto: 'migración' },
  { termino: 'irse', significado: 'emigrar', canonico: 'emigracion', contexto: 'migración' },
  { termino: 'paquete', significado: 'el envío de comida y medicinas desde fuera', canonico: 'envio', contexto: 'habla diaria, escasez' },
  { termino: 'remesa', significado: 'el dinero que llega de fuera', canonico: 'dinero', contexto: 'habla diaria, familia' },
  { termino: 'divisa', significado: 'el dinero fuerte, el que vale', canonico: 'dinero', contexto: 'habla diaria' },
  { termino: 'moneda', significado: 'el dinero', canonico: 'dinero', contexto: 'habla diaria' },
  { termino: 'bisne', significado: 'negocio, sobre todo el informal', canonico: 'negocio', contexto: 'calle, economía' },
  { termino: 'invento', significado: 'el truco con que uno resuelve', canonico: 'negocio', contexto: 'habla diaria, escasez' },
  { termino: 'resolver', significado: 'conseguir lo que falta', canonico: 'negocio', contexto: 'habla diaria' },
  { termino: 'timbiriche', significado: 'negocio pequeño, cafetería de barrio', canonico: 'negocio', contexto: 'calle' },

  // Food, and the daily struggle around it.
  { termino: 'jama', significado: 'la comida', canonico: 'comida', contexto: 'habla diaria, jodedera' },
  { termino: 'toguima', significado: 'comer', canonico: 'comer', contexto: 'habla diaria, jodedera' },
  { termino: 'picadera', significado: 'entrada, picoteo', canonico: 'comida', contexto: 'fiesta, casa' },
  { termino: 'paladar', significado: 'restaurante privado', canonico: 'restaurante', contexto: 'habla diaria' },
  { termino: 'bodega', significado: 'la tienda de la libreta', canonico: 'tienda', contexto: 'habla diaria, escasez' },
  { termino: 'libreta', significado: 'la cartilla de racionamiento', canonico: 'tienda', contexto: 'habla diaria, escasez' },
  { termino: 'cola', significado: 'la fila para comprar', canonico: 'fila', contexto: 'habla diaria, escasez' },
  { termino: 'matrimonio', significado: 'arroz con huevo, por broma', canonico: 'comida', contexto: 'jodedera, casa' },
  { termino: 'malanga', significado: 'tubérculo de la comida diaria', canonico: 'comida', contexto: 'campo, casa' },

  // Getting around.
  { termino: 'guagua', significado: 'el autobús', canonico: 'autobus', contexto: 'habla diaria' },
  { termino: 'maquina', significado: 'el carro viejo americano', canonico: 'coche', contexto: 'habla diaria' },
  { termino: 'almendron', significado: 'el carro viejo americano', canonico: 'coche', contexto: 'habla diaria' },
  { termino: 'cajon', significado: 'el taxi colectivo', canonico: 'taxi', contexto: 'habla diaria, La Habana' },
  { termino: 'botero', significado: 'el que lleva en bicitaxi', canonico: 'transporte', contexto: 'calle' },

  // The house and its failures.
  { termino: 'apagon', significado: 'el corte de electricidad', canonico: 'electricidad', contexto: 'habla diaria' },
  { termino: 'bache', significado: 'el problema, el mal momento', canonico: 'problema', contexto: 'habla diaria' },
  { termino: 'papeleta', significado: 'el trámite, el lío', canonico: 'tramite', contexto: 'habla diaria' },
  { termino: 'churre', significado: 'la grasa, la suciedad', canonico: 'suciedad', contexto: 'casa' },

  // Health and remedies.
  { termino: 'pastilla', significado: 'el medicamento', canonico: 'medicina', contexto: 'habla diaria' },
  { termino: 'emplaste', significado: 'el remedio casero', canonico: 'medicina', contexto: 'casa, generación mayor' },

  // Luck, faith and the invisible.
  { termino: 'salacion', significado: 'la mala suerte pegada', canonico: 'desgracia', contexto: 'habla diaria, fe' },
  { termino: 'mal de ojo', significado: 'la envidia que daña', canonico: 'envidia', contexto: 'fe popular' },
  { termino: 'guije', significado: 'el duende, el espíritu de río', canonico: 'espiritu', contexto: 'fe popular, campo' },
  { termino: 'ocha', significado: 'la santería, la regla de Ocha', canonico: 'religion', contexto: 'fe popular' },
  { termino: 'santero', significado: 'el que practica la santería', canonico: 'religion', contexto: 'fe popular' },
  { termino: 'muerto', significado: 'el difunto, y también el espíritu que acompaña', canonico: 'muerte', contexto: 'fe popular, habla diaria' },

  // Work.
  { termino: 'pincha', significado: 'el trabajo', canonico: 'trabajo', contexto: 'habla diaria' },
  { termino: 'camello', significado: 'el trabajo pesado', canonico: 'trabajo', contexto: 'habla diaria' },
  { termino: 'talla', significado: 'el apaño, el arreglo', canonico: 'trabajo', contexto: 'calle' },

  // The glue of speech, which the model must not read as content.
  { termino: 'que bola', significado: 'qué tal, saludo', canonico: 'saludo', contexto: 'habla diaria' },
  { termino: 'dale', significado: 'vamos, de acuerdo', canonico: 'acuerdo', contexto: 'habla diaria' },
  { termino: 'oye', significado: 'escucha, para llamar la atención', canonico: 'saludo', contexto: 'habla diaria' },
  { termino: 'guaperia', significado: 'la bravuconada', canonico: 'orgullo', contexto: 'calle, jodedera' },
  { termino: 'jodedera', significado: 'la broma, el relajo', canonico: 'broma', contexto: 'habla diaria' },
  { termino: 'tusa', significado: 'el despecho amoroso', canonico: 'despecho', contexto: 'jodedera, juventud' },
  { termino: 'chevere', significado: 'bueno, agradable', canonico: 'alegria', contexto: 'habla diaria' },
  { termino: 'candela', significado: 'el fuego, y también el problema', canonico: 'fuego', contexto: 'habla diaria' },
  { termino: 'fregado', significado: 'dañado, o el que molesta', canonico: 'problema', contexto: 'habla diaria' },
  { termino: 'enredado', significado: 'complicado', canonico: 'problema', contexto: 'habla diaria' },
  { termino: 'guateque', significado: 'la fiesta', canonico: 'fiesta', contexto: 'habla diaria' },
  { termino: 'rumba', significado: 'la fiesta, y el ritmo', canonico: 'fiesta', contexto: 'habla diaria, música' },
];

/** Word-boundary match, so "cola" does not fire inside "colador". */
function matches(term, haystack) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

/**
 * The entries the dream actually used.
 *
 * Only these travel in the prompt: the whole dictionary would cost more tokens
 * than the dream and dilute what matters.
 *
 * @param {string} texto the dream as the user wrote it
 * @param {{ limite?: number }} [options]
 * @returns {JergaEntry[]}
 */
export function jergaPara(texto, { limite = 12 } = {}) {
  const haystack = fold(texto).replace(/\s+/g, ' ');
  if (!haystack) return [];

  // Longer terms first: "mal de ojo" must win over a stray "ojo".
  const found = JERGA
    .filter((entry) => matches(entry.termino, haystack))
    .sort((a, b) => b.termino.length - a.termino.length);

  return found.slice(0, limite);
}

/**
 * The shared concept behind a signal, so synonyms meet in the same counter.
 *
 * A signal already in plain Spanish passes through untouched: the model is the
 * one that names them, and it usually writes "pareja" rather than "jeva".
 *
 * @param {string} senal
 * @returns {string}
 */
export function canonicoDe(senal) {
  const needle = fold(senal);
  if (!needle) return needle;

  const exact = JERGA.find((entry) => entry.termino === needle);
  if (exact) return exact.canonico;

  const inside = JERGA.find((entry) => matches(entry.termino, needle));
  return inside ? inside.canonico : needle;
}
