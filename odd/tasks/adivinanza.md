# Adivinanza diaria

Un dicharacho del día generado por un LLM a partir del cargador, persistido para poder volver atrás en el historial, de solo lectura y para compartir. Complementa S9/S10 de `charada-cubana-miniapp.md`; no las reemplaza.

## Specs

- **S1.** El dicharacho se genera con un **LLM**, contra un endpoint **compatible con OpenAI**, desde el servidor. La clave vive en `.env` y nunca se sirve al WebView (S8). Textual: «LLM por día, ahora mismo» y «Endpoint compatible con OpenAI (recomendado)».
- **S2.** Se genera **una por día y se persiste**. La misma fecha devuelve siempre el mismo texto: se genera una vez, no en cada visita.
- **S3.** El jugador **no hace nada**: no adivina, no escribe números, no hay puntuación. Textual: «no hace nada solo la puede leer y compartir».
- **S4.** Hay **historial**: se puede ir atrás y leer las adivinanzas de días anteriores. Textual: «la adivinanza del dia es algo que se debe persistir para poder ir atras en el historial».
- **S5.** Se arma con los **significados de los números del cargador del día** (S10 de la feature original). «Alta probabilidad de generar combinaciones» es licencia literaria del texto, **nunca** una promesa de acierto (mismo cuidado que en la sección 8 del documento original).
- **S6.** Por ahora **abierta a todos**; el gate premium de S9/S10 se activa después. Textual: «Abierta por ahora, gate después».
- **S7.** **Sin dependencias nuevas**: el transporte usa `fetch` de Node. Si no hay clave configurada, el endpoint lo dice con un estado explícito y la pantalla no inventa texto.
- **S8.** Compartir usa el `share` del SDK ya existente; no se añade otro camino.
- **S9.** El dicharacho es **más sutil y más críptico**: cada significado entra como **pista, nunca como palabra**. Se nombra un rasgo, un refrán o una costumbre que solo encaje con él. Textual: «en vez de hablar de un animal usamos una caracteristica del animal (…) en vez de decir que el elefante hizo algo podemos decir que el orejon que nunca se olvida de nada hizo tal cosa (…) y para decir el muerto se rie desde el patio, podriamos decir "el que ya no respira de sus maldades se acuerda"». Un texto que nombre alguno de los significados del día **se descarta y se reintenta**.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
|----|-------|-------|------|--------|
| T1 | Transporte LLM compatible con OpenAI (`src/llm/openai.js`) | S1, S7 | — | |
| T2 | Generador y prompt desde el cargador del día (`src/content/adivinanza.js`) | S1, S5, S9 | — | |
| T2b | Pistas en vez de nombres: filtro de filtración y reintento con la lista prohibida | S9 | — | |
| T3 | Persistencia idempotente por fecha (`src/adivinanza/store.js`) | S2, S4 | — | |
| T4 | Rutas `/api/adivinanza` y `/api/adivinanzas` | S2, S4, S7 | — | |
| T5 | Pantalla, historial y compartir (`public/app.js`, `public/styles.css`) | S3, S4, S8 | — | |
| T6 | Tests de transporte, generador, persistencia, rutas y UI | S1–S8 | — | |
| T7 | Documentar las variables en `.env.example` y el README | S1, S7 | — | |

## Log

- **L1.** «ahora si quiero crear al feature de la adivinanza.»
- **L2.** «LLM por día, ahora mismo»
- **L3.** «no hace nada solo la puede leer y compartir. la adivinanza del dia es algo que se debe persistir para poder ir atras en el historial»
- **L4.** «Abierta por ahora, gate después»
- **L5.** «Endpoint compatible con OpenAI (recomendado)»
- **L6.** «en la adivinanza hay que ser un poco mas sutiles y mas cripticos. por ejemplo en vez de hablar de un animal usamos una caracteristica del animal. ejemplo en vez de decir que el elefante hizo algo podemos decir que el orejon que nunca se olvida de nada hizo tal cosa. orejon y buena memoria es un elefante. y para decir el muerto se rie desde el patio, podriamos decir "el que ya no respira de sus maldades se acuerda" si no respia es que esta muerto y de sus maldades se acuerda es la erminacion de un refran que dice el que solo se rie de sus maldades se acuerda. o sea asi somos mas sutiles mas cripticos en la adivinanza o dichazacho.»
