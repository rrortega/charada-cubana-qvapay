# Cuéntame tu sueño

Analiza un sueño escrito, guarda sus **señales** —nunca el texto— y las compara
con las de la semana para mostrar coincidencias. Deduce números del 1 al 100 con
la coherencia del conjunto y enseña el arte de los elementos.

## Specs

- **S1.** La entrada es **texto**. No hay grabación de voz. Textual: «habia puesto de grabar la voz pero no, el contar el sueno debe de ser un texto».
- **S2.** Se guardan las **señales**, no el sueño. Textual: «almacenar las sennales y comparar con las que ya estan guardadas». El texto se usa para analizar y no se persiste.
- **S3.** La comparación importa porque **varias personas sueñan lo mismo o parecido en la misma semana**. Textual: «podemos tener coincidencias de mas de un aperona que suenna con lo mismo o con cosas parecidas (…) a la gente le flipa que mas de una persona coincida con el sueño en la misma semana y eso es una senal que debemos de almacenar». Ventana: 7 días.
- **S4.** La salida muestra dos lecturas de la coincidencia: **contador por señal** de la semana y **parecidos del sueño** recién analizado. Nunca textos, identidades ni fragmentos de otros usuarios.
- **S5.** El analizador **saca las señales, las convierte en posibles combinaciones de números y muestra los elementos (arte) involucrados**. Textual: «el analizador del sueno saca las senales las convierte a posibles ocnviancioens de numeros y muestra los elementos (art) involucrados».
- **S6.** La deducción no puntúa elementos sueltos: elige el conjunto de números 1–100 con **más coherencia en conjunto**. Textual: «la interporetacion del sueno es una deduccion hacia numeros del 1 al 100 que tenga mas coerencia en conjunto. y asi se arman posibles valores».
- **S7.** Acceso **abierto a quien tenga la cuenta vinculada**; el gate premium de S9 de la feature principal se activa después, igual que en la adivinanza.
- **S8.** Motor: **LLM con salida estructurada** desde el servidor, reusando el transporte compatible con OpenAI. Sin dependencias nuevas.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
|----|-------|-------|------|--------|
| T1 | Esquema: señales por envío, sin texto (`migrations/0006_suenos.sql`) | S1, S2, S3 | — | |
| T2 | Analizador: prompt con salida estructurada y validación (`src/sueno/analizar.js`) | S5, S8 | — | |
| T3 | Coherencia: elegir el conjunto de números del sueño (`src/sueno/coherencia.js`) | S6 | — | |
| T4 | Persistencia de señales y contadores de la semana (`src/sueno/store.js`) | S2, S3 | — | |
| T5 | Parecidos: sueños que comparten señales en la ventana | S3, S4 | — | |
| T6 | Rutas `POST /api/sueno` y `GET /api/sueno/senales` | S2, S4 | — | |
| T7 | Pantalla: texto, análisis, coincidencias y arte | S1, S4, S5 | — | |
| T8 | Tests de analizador, coherencia, persistencia, rutas y UI | S1–S8 | — | |
| T9 | Verificación en navegador y documentación | — | — | |

## Log

- **L1.** «ok ahora otr rama para el cuentame tu sueno. aqui se me ocurre no solo analizr el sueno sino que almacenar las sennales y comparar con las que ya estan guardadas porque podemos tener coincidencias de mas de un aperona que suenna con lo mismo o con cosas parecidas y eso tiene un peso importante en la aplicaicon. a la gente le flipa que mas de una persona coincida con el sueño en la misma semana y eso es una senal que debemos de almacenar. habia puesto de grabar la voz pero no , el contar el sueno debe de ser un texto. el analizador del sueno saca las senales las convierte a posibles ocnviancioens de numeros y muestra los elementos (art) involucrados. la interporetacion del sueno es una deduccion hacia numeros del 1 al 100 que tenga mas coerencia en conjunto. y asi se arman posibles valores.»
- **L2.** Decisión sobre qué guardar: «Solo las señales, nunca el texto».
- **L3.** Decisión sobre la coincidencia: «Contador por señal + parecidos del sueño».
- **L4.** Decisión sobre el acceso: «Abierto con cuenta, gate después».
- **L5.** Decisión sobre el motor: «LLM con salida estructurada y coherencia».
- **L6.** Base de la rama: `feat/adivinanza`, porque el transporte LLM (`src/llm/openai.js`) vive ahí. Cuando ese PR entre, esta rama se reapunta a `main`.
