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
- **S9.** El sueño **se guarda con su lectura, por usuario**: se puede volver a leer cuando quiera, y solo su autor puede hacerlo. Sustituye a S2 en lo que toca al texto. Textual: «Quiero almacenar mi historial de suenos. y cargar las interpretaciones las veces ue quiera. o sea eso hay que almacenarlo por usuario».
- **S10.** La coincidencia es **entre personas distintas**: nunca con los sueños del propio autor, y se muestran **nick y avatar de QvaPay** de quienes soñaron algo parecido. Textual: «no puede comparar senales mias propias o sea debe de identificar suenos de usuarios diferentes (…) mejor poner su nikname de qvapay que lo tenemos conectado, su nikname y avatar».
- **S11.** La semana ofrece **jugada**: fijos, corridos y parles derivados del peso de los números, presentados como material de la semana y nunca como pronóstico. Textual: «En las senales ponme posiles combinacioens a jugar esta semana (…) me muestras los fijos que puedo jugar, los corridos y los parles».
- **S12.** La pantalla tiene **dos tabs desde el principio** —«Mi sueño» y «La interpretación»—, el segundo bloqueado hasta que hay lectura; el campo y el botón van dentro del primero, el botón a todo lo ancho, y al interpretar se abre el segundo con un esqueleto. La lectura se escribe **carácter a carácter**.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
|----|-------|-------|------|--------|
| T1 | Esquema: señales por envío, sin texto (`migrations/0006_suenos.sql`) | S1, S2, S3 | 824c644 | |
| T2 | Analizador: prompt con salida estructurada y validación (`src/sueno/analizar.js`) | S5, S8 | 824c644 | |
| T3 | Coherencia: elegir el conjunto de números del sueño (`src/sueno/coherencia.js`) | S6 | 824c644 | |
| T4 | Persistencia de señales y contadores de la semana (`src/sueno/store.js`) | S2, S3 | 824c644 | |
| T5 | Parecidos: sueños que comparten señales en la ventana | S3, S4 | 824c644 | |
| T6 | Rutas `POST /api/sueno` y `GET /api/sueno/senales` | S2, S4 | 824c644 | |
| T7 | Pantalla: texto, análisis, coincidencias y arte | S1, S4, S5 | f2186fc | |
| T8 | Tests de analizador, coherencia, persistencia, rutas y UI | S1–S8 | 824c644, f2186fc | |
| T9 | Verificación en navegador y documentación | — | f2186fc | |
| T10 | Historial por cuenta: migración 0007, lectura guardada y rutas | S9 | 328bfba | |
| T11 | Coincidencia entre personas, con nick y avatar | S10 | 328bfba | |
| T12 | Jugada de la semana: fijos, corridos y parles | S11 | 328bfba, 6b15029 | |
| T13 | Tabs desde el principio, esqueleto propio y lectura en stream | S12 | 6b15029 | |

## Log

- **L1.** «ok ahora otr rama para el cuentame tu sueno. aqui se me ocurre no solo analizr el sueno sino que almacenar las sennales y comparar con las que ya estan guardadas porque podemos tener coincidencias de mas de un aperona que suenna con lo mismo o con cosas parecidas y eso tiene un peso importante en la aplicaicon. a la gente le flipa que mas de una persona coincida con el sueño en la misma semana y eso es una senal que debemos de almacenar. habia puesto de grabar la voz pero no , el contar el sueno debe de ser un texto. el analizador del sueno saca las senales las convierte a posibles ocnviancioens de numeros y muestra los elementos (art) involucrados. la interporetacion del sueno es una deduccion hacia numeros del 1 al 100 que tenga mas coerencia en conjunto. y asi se arman posibles valores.»
- **L2.** Decisión sobre qué guardar: «Solo las señales, nunca el texto».
- **L3.** Decisión sobre la coincidencia: «Contador por señal + parecidos del sueño».
- **L4.** Decisión sobre el acceso: «Abierto con cuenta, gate después».
- **L5.** Decisión sobre el motor: «LLM con salida estructurada y coherencia».
- **L6.** Base de la rama: `feat/adivinanza`, porque el transporte LLM (`src/llm/openai.js`) vive ahí. Cuando ese PR entre, esta rama se reapunta a `main`.
- **L7.** Reutiliza las variables `ADIVINANZA_LLM_*` del transporte: son el proveedor del servidor, no de una función. El texto del sueño viaja al proveedor para analizarlo (es inherente al análisis) y no se guarda; la pantalla lo dice en una línea.
- **L8.** «En las senales ponme posiles combinacioens a jugar esta semana mientrtas el sueno aun esta virando en el cosmos de la charada. me muestras los fijos que puedo jugar, los corridos y los parles. presentalos lindo». Regla confirmada: peso por número = suma de sus señales; corridos = los dos más pesados; fijo = prefijo de una cifra más pesada + charada de dos cifras más pesada; parles = los tres más pesados emparejados.
- **L9.** «Quiero almacenar mi historial de suenos. y cargar las interpretaciones las veces ue quiera. o sea eso hay que almacenarlo por usuario». Revierte la decisión de L2: el texto sí se guarda, atado a la cuenta y legible solo por ella.
- **L10.** «En el apartado de abajo SE PARECE A no puede comparar senales mias propias o sea debe de identificar suenos de usuarios diferentes. cuadno tenga la cantidad de personas esta semana mejor poner su nikname de qvapay que lo tenemos conectado, su nikname y avatar asi podemos mostrar quienes han tenido suenos como el tuyo».
- **L11.** «esto que hiciste es una mierda. NO es asi lo que pedi (…) De entrada tenemos el tab visibler con mi sueno y la interpretacon. La interpretacion estara bloqueada porque no hay. En el tab de mi sueno pones el textarea y el boton de interpretar a todo lo ancho en mobile (…) cuando le demos al boton de interpretar se aciva el tab de la interpertacion y se debe de ver un sckeleton loading (…) Ese texto de la intereptacion debe de dibujarse como si fuera una respuesta de un stream desde el servidor o sea caracter a caracter».
- **L12.** «El scheleton loading no se ve». Causa: el sueño reusaba `.anaskeleton`, que está en `display: none` salvo dentro de `.anaresult.is-loading`. Se le dio clase propia y un borde que lo mantiene visible.
