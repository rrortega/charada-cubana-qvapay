# Charada Cubana — QvaPay Mini-app

Feature: publicador diario del "cargador" de la charada cubana, derivado de los sorteos oficiales de Florida Pick 3 / Pick 4, con histórico y análisis estadístico.
Entregable de esta fase: **documentación y plan técnico** (sin código de producto todavía).

## Specs

- **S1.** La mini-app informa el "cargador de cada día" como se expresa en Cuba: el número completo de tres cifras de Pick 3 (`el 570`), o su forma con nombre usando los DOS ÚLTIMOS dígitos sobre la tabla de charada (`el 5 con Coco`). No se desglosa cifra por cifra.
- **S2.** Los números se recopilan de los juegos oficiales (Florida Lottery Pick 3 y Pick 4). La mini-app **no** gestiona apuestas, no acepta jugadas y no paga premios: es un informador y un analizador estadístico.
- **S3.** La mini-app se ejecuta dentro de la app nativa de QvaPay usando `window.QvaPay`; debe funcionar en el simulador de QvaPay y en la app real.
- **S4.** Se almacena un histórico de resultados para consultar sorteos pasados y calcular estadísticas.
- **S5.** Sobre el histórico se calculan proyecciones: conteo de números repetidos por período, frecuencias y probabilidades.
- **S6.** La identidad del usuario se obtiene con `auth.requestLogin` y se verifica en servidor mediante `init_data` firmado (HMAC-SHA256, `secret_key = HMAC("QvaPayMiniApp", app-secret)`).
- **S7.** Si la mini-app cobra (contenido premium), el cobro se confirma **solo** por webhook firmado o por consulta server-side de la factura, nunca por el frontend.
- **S8.** El `app-secret` vive únicamente en el servidor, nunca en el JavaScript servido al WebView.
- **S9.** Modelo de monetización: funciones premium para usuarios de pago: (a) notificaciones por Telegram, (b) notificaciones push dentro de QvaPay **siempre y cuando el SDK lo permita**, (c) acceso a la analítica, (d) acceso a la adivinanza.
- **S10.** La **adivinanza** es un dicharacho casi sin sentido, generado one-to-one con el cargador del día, que tiene alta probabilidad de generar combinaciones usando los significados de cada número. Se genera **una por día** y solo los usuarios de pago tienen acceso.
- **S11.** Los datos se almacenan en **PostgreSQL**. Las credenciales del servidor de pruebas se configuran en un archivo `.env` (no versionado).

- **S12.** Los artículos de «Historia y cultura» se guardan un Markdown por artículo y la app los carga y renderiza; el contenido deja de modelarse como datos estructurados en JS. Textual: «me imagino que cada articulo lo tenfamos como un makdwon y que lo ue hagamso sea cargarlos y renderiar el markdown. eso es lo mas optimo me parece».
- **S13.** El índice de «Historia y cultura» es una presentación de artículos en tiles, uno por artículo, preparada para recibir después una imagen por artículo. Textual: «el indice arriba deberian de ser como presetnacion de articulos, luego le pondremos a cada uno su imagen pero por ahora unos tiles con cada articulo».
- **S14.** La mini-app usa el SDK de QvaPay adaptado a cada pantalla: encabezado con subtítulo y acciones, botón atrás, botón principal, colores, hápticos, avisos, compartir y apertura de enlaces externos. Textual: «Hagamos uso de el SDK de qvapay que tiene para usar los botones y encabezado dinamico , usar boton de atras, buscador y demas cosas» y «hay qeu usar el sdk hacer uso de todo lo que nos ofrece adaptado a nuestra miniapp».
- **S15.** La navegación interna pasa por el historial del navegador, de modo que el botón atrás nativo de QvaPay retroceda de verdad; el botón atrás propio se mantiene solo fuera del SDK.
- **S17.** El **botón atrás nativo** también cierra una hoja abierta (calendario, mensajes) y sale de un análisis terminado antes de abandonar la pantalla; el estado guardado en el historial nunca tiene pasos que ya no se ven. Textual: «hay que hace run mejor control del boton back nativo de la app. controlar mejor el estado y que el back haga lo que dbe hacer».
- **S16.** El arte de los significados es **por significado, no por número**: un número puede llevar varios, así que el mapeo semántico se deriva de la propia tabla (`Bruja, Gallina Prieta y Hormiga` son tres) y cada uno tiene su archivo `NNN-M.png`. Si falta el archivo, la lista se lee sin hueco reservado. Textual: «algunos numeros tienen hasta 4 significados por lo cual deberiamos de tener un png por significado y quiza sun mismo numero tenga mas de 1 png. hay que crear ese mapeo semantico con la imagen».

## Tasks

Todas las tareas se ejecutan ya sobre el repositorio real. El estado va debajo de la tabla.

| ID | Tarea | Spec | Ruta | Commit |
|----|-------|------|------|--------|
| T1 | Cerrar alcance de producto y postura de cumplimiento | S2 | — | — |
| T2 | Elegir y validar la fuente de datos oficial (ingesta) | S2, S4 | `src/ingest/floridaLottery.js` | — |
| T3 | Diseñar el modelo de datos en PostgreSQL e histórico | S4, S11 | `migrations/0001_init.sql` | — |
| T4 | Definir el contrato de cálculo del cargador | S1 | `docs/cargador-contract.md` | — |
| T5 | Motor de estadísticas (descriptivo) | S5 | `src/domain/stats.js` | — |
| T6 | Definir arquitectura de despliegue y secretos | S3, S8 | `docs/deploy.md` | — |
| T7 | Integración con el SDK de QvaPay | S3, S6 | `src/sdk/qvapay.js` | — |
| T8 | Login QvaPay, sesión y gate del menú Más | S6, S9 | `src/auth/`, `src/ui/session.js` | — |
| T9 | Redactar la lista de publicación de QvaPay | S2 | — | — |
| T10 | Diseñar el generador de la adivinanza diaria | S10 | — | — |
| T11 | Diseñar la entrega por Telegram | S9 | — | — |
| T12 | Viabilidad de push dentro de QvaPay | S9 | — | — |
| T13 | Cuéntame tu sueño (audio/texto + interpretación) | S9 | — | — |
| T14 | La adivinanza diaria | S10 | — | — |
| T15 | Tengo una corazonada (feed + aciertos) | S9 | — | — |
| T16 | Origen y cultura: lectura de los artículos | S2, S12, S13 | `src/content/` | — |
| T17 | Artículos en Markdown con frontmatter, cargados desde disco | S12 | `src/content/cultura/*.md` | — |
| T18 | Renderer de Markdown propio, escapado y con tests | S12 | `src/markdown/markdown.js` | — |
| T19 | Índice de tiles y lector de artículos con tipografía propia | S13 | `public/app.js`, `public/styles.css` | — |
| T20 | Integración del SDK por pantalla | S14, S15 | `src/sdk/qvapay.js`, `public/app.js` | — |
| T21 | Verificación funcional en navegador y en el simulador | S14, S15 | `tests/`, Playwright | — |

**Estado.** Completadas con evidencia ejecutada: T2, T3, T4, T5, T6, T7, T16,
T17, T18, T19, T20 y T21, más la parte de servidor de T8. Pendientes: T9–T15.

**Corte de slices del trabajo acumulado.** El trabajo de las sesiones anteriores
estaba sin commitear (793 líneas + archivos nuevos). Se entrega en la rama
`feat/cultura-sdk` en unidades revisables:

| Slice | Contenido | Commit |
|-------|-----------|--------|
| 1 | Logo recortado y hoja con área segura | `5c93200` |
| 2 | Perfil de QvaPay y sesión tolerante a cookies bloqueadas (S6) | `b7bafbd` |
| 3 | Ingesta de Pick 4 y sorteos incompletos (S4) | `519fe67` |
| 4 | Tabla de 100 significados y lectura de cultura (base refactorizada) | `d0b17b2` |
| 5 | Artículos en Markdown con frontmatter y loader (S12, T17) | `193faa6` |
| 6 | Renderer de Markdown propio y escapado (S12, T18) | `9a36fa1` |
| 7 | Índice en tiles y lector tipográfico (S13, T19) | `1b61904` |
| 8 | Helpers de chrome del SDK (S14, T20) | `43af64d` |
| 9 | Encabezado, acciones y botón atrás nativos por pantalla (S14, S15, T20) | `8d95a24` |
| 10 | Chrome inmediato al toque y entradilla legible (T21) | `3975b2c` |

**Entrega de la fase de documentación:**

```
migrations/0001_init.sql        esquema (9 tablas)
migrations/0002_seed_charada.sql tabla de 100 significados + registro de juegos
src/ingest/floridaLottery.js    cliente de la fuente oficial
docs/cargador-contract.md       contrato normativo del cargador
tests/cargador.test.js          17 tests del contrato
tests/ingest.test.js            20 tests de la ingesta
```

## Plan técnico

### 1. Postura de cumplimiento (condiciona todo lo demás)

La documentación de QvaPay indica textualmente que en la revisión:

> No se aceptan juegos de azar con dinero, rifas o loterías pagadas, ni actividades que requieran licencias que no tengas.

Esto **bloquea** una mini-app de apuestas, pero no bloquea esta: la mini-app no recibe jugadas, no cobra apuestas y no paga premios. Publica información sobre sorteos de una lotería estatal y estadísticas derivadas. La posición defendible en la revisión es:

- Somos un **informador**: publicamos resultados oficiales y estadísticas.
- **No** aceptamos apuestas, **no** vendemos números, **no** pagamos premios.
- Si hay cobro, es por **contenido analítico** (sección premium), no por participar en un sorteo.

Riesgo residual: que el revisor perciba la app como el frente de un negocio de bolita. Mitigación obligatoria: lenguaje inequívoco en toda la interfaz, ausencia de cualquier flujo de apuesta y mención explícita de la fuente oficial. Esto se redacta en T9 antes de enviar nada.

### 2. Fuente de datos: RESUELTA

El actor de Apify citado como referencia **no funciona hoy**:

- `http://www.flalottery.com/pick3` responde `301` hacia `https://floridalottery.com/games/draw-games/pick-3`.
- `.gamePageNumbers`, `.gamePageBalls`, `.balls`, `.regWeight`: **0 coincidencias** en el HTML actual.

**Fuente real validada y funcionando.** Cadena de descubrimiento completa:

1. La página es AEM y expone `.../winning-numbers.model.json`.
2. Ese modelo declara `header.apiUrl = "https://apim-website-prod-eastus.azure-api.net"` (API Gateway de Azure).
3. `clientlib-site` es un webpack loader con `publicPath=/etc.clientlibs/flalottery-web/clientlibs/`; los chunks viven en `/etc.clientlibs/flalottery-web/clientlibs/clientlib-site-imports/resources/<chunk>.<hash>.js`.
4. El chunk `6246` crea el cliente HTTP con una única cabecera: **`x-partner: web`**.

Endpoints operativos (verificados con datos reales):

```
GET https://apim-website-prod-eastus.azure-api.net/drawgamesapp/getLatestDrawGames
    header: x-partner: web
    -> todos los juegos con su último sorteo

GET .../drawgamesapp/searchgames?id=104&startDate=1-OCT-2026&endDate=3-NOV-2026
    header: x-partner: web
    -> histórico; fechas en formato D-MMM-YYYY
```

IDs confirmados: **PICK 3 = 104**, **PICK 4 = 108**.

Resultado real obtenido (histórico de un mes):

```
PICK 3 MIDDAY  2026-11-03  base=[4,6,4] fireball=[2]
PICK 3 EVENING 2026-11-03  base=[7,0,1] fireball=[0]
PICK 4 MIDDAY  2026-11-03  base=[6,7,3,4] fireball=[2]
PICK 4 EVENING 2026-11-03  base=[5,3,6,3] fireball=[0]

68 sorteos de Pick 3 en el período consultado (34 MIDDAY + 34 EVENING)
```

**Corrección importante sobre el actor original:** el cuarto registro de Pick 3 y el quinto de Pick 4 son `NumberType: "fb"` (**Fireball**), un número adicional de premio, **no parte del número ganador**. El actor los trataba como un dígito más al construir `m1` (`digits[0]+digits[1]+digits[2]`), lo que funcionaba por casualidad al tomar solo los tres primeros, pero dejaba el Fireball en el array sin distinguirlo. La ingesta debe separar explícitamente `base` (tipos `wn*`) de `fireball` (`fb`). El Fireball puede habilitar análisis adicional, pero no contamina el cargador.

### 2b. Navegador headless: descartado

Ya no es necesario: la fuente es un API JSON. Verificación de los paquetes propuestos, para no adoptar una dependencia inexistente:

| Paquete | Estado |
|---------|--------|
| `molibrowser` | **404 en npm, no existe** |
| `@molibrowser/core` | **404, no existe** |
| `obscura` | Existe, pero es un paquete **vacío**: 1 versión, sin descripción, no es un navegador |
| `playwright` / `puppeteer` | Existen y se mantienen, si alguna vez hiciera falta |

Un headless habría heredado la fragilidad del DOM con un coste de Chromium por ejecución. El API JSON es estrictamente superior: rápido, estable y barato. Se descarta.

Riesgo residual de la fuente: depende de una cabecera (`x-partner: web`) y de un API interno sin contrato público. La ingesta debe (a) fallar de forma visible si la forma de la respuesta cambia, y (b) no depender de un único punto —guardar los datos crudos. `robots.txt` permite el crawling (`Disallow:` vacío).

### 3. El cargador: definición corregida

**Corrección de un error propio.** Una versión anterior de este documento definía
el cargador como una combinación `m1-m2-m3` de Pick 3 + Pick 4, con un conjunto de
"señas" ordenadas. Eso era incorrecto y se conserva aquí como registro de la
corrección, no como especificación.

Definición correcta (ver `docs/cargador-contract.md`):

- El cargador es **el resultado completo de Pick 3 como número de tres cifras**.
- Se dice `el 570`, o con nombre usando **los dos últimos dígitos**: `el 5 con Coco` (70).
- **No** se desglosa cifra por cifra: 570 no es Caballo/Caracol/cero.
- En la charada se premian tres números: **fijo** (1ª posición, paga 75x) y
  **dos corridos** (2ª y 3ª, pagan 25x).
- **Pick 4 no interviene.** La definición anterior lo incluía por error.

Por qué el diseño anterior estaba mal, en concreto:

- Ordenaba las señas alfabéticamente, destruyendo el orden de los dígitos, que es
  justamente lo que determina fijo y corridos.
- Trataba cada dígito como índice independiente de la tabla de charada, cuando la
  tabla asigna significados a números de uno o dos dígitos.
- Reducía `m1 > 100` a `head`/`tail` como si fueran dos señas separadas, cuando
  lo correcto es leer los dos últimos dígitos del número completo.

**Impacto en los datos:** 736 cargadores se recalcularon con la regla correcta
(migración `0003_cargador_reshape.sql`). La columna `senas` y las columnas
`m1/m2/m3` se eliminaron por describir semántica obsoleta.

**Cobertura de tests:** 35 tests en verde (`tests/cargador.test.js` y
`tests/ingest.test.js`), incluido el caso explícito de que 570 se lee por su 70 y
nunca como 5-7-0.

### 4. Arquitectura de despliegue

El WebView de QvaPay exige `https`, no comparte cookies ni sesión, bloquea contenido mixto y no permite `window.open`. Además el simulador incrustra la página en un iframe, así que hay que enviar:

```
Content-Security-Policy: frame-ancestors 'self' https://www.qvapay.com
```

Un único origen `https` sirve el frontend y el API evita problemas de origen y simplifica la lista de orígenes permitidos de la ficha de QvaPay. Los tres componentes:

- **Frontend**: estático servido por el mismo origen, con `sdk-sim.js` incluido (inocuo en producción).
- **Backend**: verificación de `init_data`, endpoints de histórico y estadísticas, webhook.
- **Ingesta**: job programado que trae resultados, idempotente por `(juego, sorteo, fecha)`.

Secrets solo en variables de entorno del servidor (S8). `app-id` y `app-secret` de QvaPay nunca se sirven al cliente.

### 5. Integración con el SDK (T7)

Implementado en `src/sdk/qvapay.js`, con 26 tests en `tests/qvapay.test.js`.
Referencia completa verificada en `docs/qvapay-sdk-notes.md`.

**Reglas de compatibilidad aplicadas:**

- Detección de capacidades por **presencia del método**, nunca por versión.
- `ui.header` (3.7.0) y `ui.colors` (3.7.1) son opcionales; sin ellos se mantiene
  la barra propia.
- `mainButton.set` envía siempre `text` + `visible` juntos, porque antes de 3.7.0
  cada `set` reemplazaba el botón entero.
- Decisión de errores por `code`; `USER_CANCELLED` no muestra nada.

**Página real** (`public/`): renderiza el cargador del mediodía y de la noche,
con el número completo, su forma hablada y las tres posiciones premiadas (fijo
resaltado). Funciona igual dentro y fuera de QvaPay.

**Servidor** (`src/http/server.js`): sirve estáticos, expone
`GET /api/cargadores/ultimos` y aplica las cabeceras que el contenedor exige
(`frame-ancestors` con qvapay.com, `nosniff`, sin caché). Solo se expone
`src/sdk/qvapay.js` al navegador; `src/db/` y `.env` no son accesibles
(verificado: 404).

**Verificación ejecutada** con Playwright contra el servidor real:

| Escenario | Resultado |
|---|---|
| Navegador normal sin SDK | 2 tarjetas, `window.QvaPay` ausente, 0 errores |
| Iframe con saludo del simulador | `getTheme` → `ui.header.set` → `ready` |
| `in-qvapay` aplicado | Sí, cabecera propia oculta |
| `themeChanged` oscuro→claro | Variables CSS actualizadas, legible |

**Dos defectos encontrados y corregidos:**

1. Un `getTheme` rechazado tumbaba el arranque entero (promesa sin capturar).
   Ahora se tolera y la página sigue.
2. El tema claro dejaba las tarjetas ilegibles: se pintaba `body.background` pero
   no las custom properties que usan las tarjetas. Corregido con `color-mix`.

### 6. Estadísticas (T5)

Implementado en `src/domain/stats.js`, con 21 tests en `tests/stats.test.js`.

**Enfoque: descriptivo, nunca predictivo.** Cada función que podría leerse como
una señal devuelve también el valor **esperado por azar**, para que la interfaz
pueda mostrar la comparación en vez de insinuar un patrón. Esto no es un detalle
de estilo: presentar una proyección como si mejorara la probabilidad es engañoso
y reabre el riesgo de revisión de QvaPay.

#### Resultados sobre 3.536 sorteos reales (2022-2026)

**Las tres posiciones son estadísticamente uniformes.** No hay sesgo por dígito:

| Posición | chi-cuadrado | Crítico (df=9, p=.05) | Veredicto |
|---|---|---|---|
| fijo (pos1) | 15.27 | 16.92 | uniforme |
| corrido (pos2) | 4.19 | 16.92 | uniforme |
| corrido (pos3) | 11.49 | 16.92 | uniforme |

**Los patrones coinciden con la teoría:**

| Patrón | Observado | Teórico |
|---|---|---|
| triple (777) | 1.1% | 1.0% |
| pareja (466) | 27.1% | 27.0% |
| todos distintos | 71.8% | 72.0% |

**El "de corrido" no existe como señal:** repetición del número de charada entre
sorteos consecutivos = 33 observados frente a **35.35 esperados por azar**
(tasa observada 0.93% vs 1.00% teórica). Las repeticiones ocurren; no predicen.

#### Funciones

| Función | Devuelve |
|---|---|
| `digitFrequencyByPosition` | Frecuencia por dígito y posición. |
| `chiSquareUniform` | Bondad de ajuste a uniforme, para mostrar honestidad. |
| `classifyPattern` / `patternDistribution` | triple / pareja / distintos. |
| `PATTERN_THEORY` | Probabilidades teóricas para comparar. |
| `exactResultFrequency` | Números exactos más repetidos. |
| `charadaNumberFrequency` | Frecuencia de los 100 números de charada. |
| `gapsForCharadaNumber` | Apariciones, huecos y hueco actual. |
| `consecutiveRepetition` | Repetición entre sorteos **con su esperado**. |

#### Riesgo abierto

`gapsForCharadaNumber` permite decir "no sale desde hace N sorteos". Es un hecho,
pero en manos de un jugador se lee como "ya le toca". La UI debe mostrar siempre
el contexto de independencia; esta decisión queda para la tarea de interfaz.

### 7. Monetización

Modelo decidido: **funciones premium** para usuarios de pago.

| Función | Spec | Viabilidad |
|---------|------|-----------|
| Notificaciones por Telegram | S9 | Viable. Fuera de QvaPay, controlada por nosotros. |
| Push dentro de QvaPay | S9 | **Bloqueada por el SDK.** Ver 7b. |
| Acceso a analítica | S9 | Viable. Gating server-side. |
| Acceso a la adivinanza | S9, S10 | Viable. Gating server-side. |

Si se cobra, el flujo es: servidor crea la factura con `POST /v2/create_invoice`, el frontend pide `payments.payInvoice`, y el acceso se activa **solo** al recibir el webhook firmado. El webhook debe ser idempotente por `transaction_uuid` y validar `x-qvapay-signature` en tiempo constante sobre el cuerpo crudo.

El gating debe ser **server-side siempre**. Ocultar el botón en el frontend no es protección: el WebView es inspeccionable y el contenido premium no debe viajar antes de confirmarse el pago.

### 7b. Push dentro de QvaPay: no es viable hoy

Verificado en la documentación oficial. El SDK de miniapps **no expone ninguna API de notificaciones**: no existe `QvaPay.push`, ni métodos de suscripción, ni forma de enviar avisos a los usuarios de una mini-app.

El sistema push de QvaPay (`/docs/push`) es otra cosa: funciona para **apps cliente** que registran el token del dispositivo con la sesión del usuario (`POST /push/tokens`). Sus endpoints son `POST /push/tokens`, `DELETE /push/tokens`, `POST /push/events`, `GET /push/inbox`, y los tipos de aviso son un catálogo cerrado donde `miniapp_review` es de QvaPay hacia el desarrollador. **No existe endpoint para que un tercero envíe push.**

Por tanto, la condición del requisito ("siempre y cuando lo permita el SDK") **no se cumple**: el push dentro de QvaPay queda descartado hasta que QvaPay publique esa capacidad. Las alternativas reales son:

- **Telegram** — control total, canal propio, sin depender de QvaPay. Es la vía principal.
- Web Push del navegador — no sirve dentro del WebView de QvaPay por el aislamiento del contenedor.
- Pedir la capacidad a QvaPay mediante la Conversación del panel (T9).

### 8. La adivinanza

Spec S10: un dicharacho casi sin sentido, generado a partir del cargador del día, con alta probabilidad de evocar combinaciones usando los significados de cada número. Una por día, solo para usuarios de pago.

Diseño pendiente (T10). Puntos que debe resolver:

- **Determinismo**: la adivinanza del día debe ser estable y reproducible; misma entrada, misma salida. Se genera una vez y se persiste, no se regenera por visita.
- **Fuente de significado**: la tabla de 100 entradas ya existe y es la base. El generador compone una frase con los significados de las señas del cargador.
- **"Alta probabilidad de generar combinaciones"**: es una afirmación sobre el resultado. Debe formularse como licencia literaria del texto, nunca como promesa de acierto. Mismo cuidado que en la sección 6.
- **Persistencia**: `adivinanza(fecha, texto, cargador_origen, generada_en)`.

### 9. PostgreSQL

Spec S11. Motor: **PostgreSQL 17.11**. Base `charada_db` creada.

**Esquema aplicado** (`migrations/0001_init.sql`, 9 tablas):

| Tabla | Propósito |
|-------|-----------|
| `charada_significados` | 100 entradas canónicas, versionadas. Sembradas. |
| `games` | Registro de juegos. `104=pick3`, `108=pick4`. Sembrado. |
| `draws` | Sorteos crudos. Único por `(game_id, draw_date, draw_type)`. `base_digits` y `fireball` separados. `raw_payload` preserva el registro original. |
| `cargadores` | Cargador derivado por sorteo. Único por `draw_id`. |
| `users` | Usuarios QvaPay por `uuid` estable. |
| `subscriptions` | Acceso premium. `transaction_uuid` Único = clave de idempotencia del webhook. |
| `adivinanzas` | Una por día, persistida. |
| `telegram_vinculos` | Usuario ↔ chat de Telegram. |
| `entregas` | Log de envíos con clave de idempotencia. |

**Verificación ejecutada:**

- Migración aplicada sin error; seed con 100 significados y 2 juegos.
- Cargados **1.472 sorteos** reales (736 Pick 3 + 736 Pick 4, nov-2025 a nov-2026).
- **Idempotencia probada:** re-ejecutar la ingesta sobre los mismos datos insertó **0 filas**.
- **736 cargadores** calculados y persistidos (4 con dos señas, 111 con tres, 621 con cuatro).
- Integridad: 0 duplicados, 0 anomalías, 368 días.
- Histórico profundo disponible: ~3.500 sorteos desde 2022.

**Hallazgo crítico:** la API devuelve los registros **desordenados** (verificado: la respuesta no está ordenada ascendente). La ingesta debe ordenar y deduplicar por `(draw_date, draw_type)`. Si se confía en el orden de llegada, se corrompe el histórico.

Reglas: migraciones versionadas en `migrations/`, sin `psql` como dependencia de despliegue, credenciales solo por entorno.

**Advertencia de seguridad en curso:** la cadena entregada usa el superusuario `postgres` del servidor con `sslmode=disable`. Ese servidor aloja otras aplicaciones. Riesgos: (a) las credenciales viajan sin cifrar por internet público; (b) usar el superusuario en la app da acceso potencial a `chambapro`, `finkilo_db` y `waha_db`. Recomendación pendiente de decisión: rol dedicado a `charada_db` y TLS. La credencial fue compartida en el chat; conviene rotarla antes de producción.

### 10. Riesgos abiertos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| La ficha se percibe como apuestas | Rechazo en revisión | Lenguaje y UX de informador (T9) |
| La fuente oficial cambia o desaparece | Sin datos frescos | API validada; alertar si cambia la forma de la respuesta |
| Push en QvaPay no existe | Función premium inviable | Sustituida por Telegram (7b) |
| Superusuario de servidor compartido en la app | Acceso amplio por error | Rol dedicado a `charada_db` (9) |
| Credencial sin TLS por internet público | Interceptación | Habilitar TLS y rotar la contraseña (9) |
| Proyecciones presentadas como predicción | Engaño al usuario y revisión | Lenguaje descriptivo (6) |
| Histórico incompleto al lanzar | Estadísticas sin base | Ingesta histórica antes del lanzamiento (T2) |
| Iconos de los 100 significados desalineados y con significado equivocado | La lista miente | Rehacer las hojas en el orden de la tabla o retirar los iconos (L21) |

## Log

- **L1.** "este proyectivo es una miniapp que va a renderizar y vivir dentro de la app nativa de QVAPAY. la documenacion de como construyirla, su sdk, etc esta aqui https://www.qvapay.com/docs/miniapps"
- **L2.** "basicamente la charada cubana es el juego de Pick3 y PIc 4 de la loteria de la florida pero es una conbinacion de ambos que se juega en cuba al cual se le dice la charada o la bolita. y esta miniapp informara de el cagador de cada dia expresado como se expresa en cuba. pero recopilara los datos de los juegos oficiales. Tambien debe de almancear el historico para luego proyectar probabilidades, conteo de repetidos por periodo etc."
- **L3.** El proyecto no tiene código previo: solo `LICENSE`. Predecesor: un actor de Apify del usuario, usado como referencia conceptual.
- **L4.** Alcance de esta entrega elegido por el usuario: "Solo documentación y plan técnico". No se escribe código de producto.
- **L5.** "el modelo de monetizacion sera opcioens mas premiun en el app cmo notificacion via telegram, notificacion via push notifications en el mismo qvapay siempre y cuadno lo permita el sdk, y ademas acceso a analitica, y a la adivinanza. La adivinanza es un dicharacho casi sin sentido que tenga lata probabilidad de genear convinaciones usando los significados que te pase por cada numero. hay que genera runa adivinanza por dia y a esa adivinanza tendria solo acceso los usaurios de pago. obviamente tendremos que almacenar datos asi que considera el uso de postgress para esto."
- **L6.** "por otro lado considero que podemos usar un navegador headless como Molibrowser o el Obscura que estan optimizados para el scrapping. algo asi hace internamente apify pero no quiero usar apify para esto."
- **L7.** El usuario entrega credenciales de PostgreSQL de pruebas. Verificado: la base `charada_db` no existía; fue creada con autorización explícita. El servidor aloja otras bases (`chambapro`, `finkilo_db`, `waha_db`) que quedaron intactas.
- **L8.** Hallazgo técnico: localizado el API Gateway de Azure de la Florida Lottery (`apim-website-prod-eastus.azure-api.net`) mediante el model exporter de AEM. Verificado que `molibrowser` no existe en npm y que `obscura` es un paquete vacío.
- **L10.** T3 y T4 completadas. Esquema aplicado (9 tablas), 1.472 sorteos cargados con idempotencia probada, 736 cargadores persistidos. Contrato del cargador fijado en `docs/cargador-contract.md` con 37 tests en verde. Hallazgo nuevo: la API devuelve los registros desordenados.
- **L9.** T2 completada con evidencia. Cabecera requerida: `x-partner: web`. Endpoints validados con datos reales: `getLatestDrawGames` y `searchgames?id&startDate&endDate`. IDs: PICK 3 = 104, PICK 4 = 108. Histórico verificado: 68 sorteos en un mes. Hallazgo: el cuarto registro de Pick 3 (`fb`) es Fireball, no parte del número ganador. Navegador headless descartado por innecesario.
- **L11.** "El corrido: Son los números que salen en segundo o tercer lugar... Si un número que jugaste sale como corrido, la ganancia es menor que la del fijo, pagándose habitualmente unas 25 veces lo apostado."
- **L12.** "El parlé: Es una jugada combinada en la que el jugador selecciona dos números al mismo tiempo. Para ganar el parlé, ambos números tienen que salir premiados... el pago es mucho más alto, oscilando generalmente entre 800 y 1,000 veces."
- **L13.** Fuentes aportadas: dimecuba.com y libreonline.com. Ambas confirman: solo se premian tres números (uno fijo, dos corridos); fijo paga 75x, corrido 25x; parlé 800-1000x; candado = 6 números; la bolita se rige por Cash-3 y Play-4 de Florida, dos veces al día.
- **L14.** "En Cuba, cuando se habla del cargador del día se dice el número de tres cifras tal cual (por ejemplo, 570) o se menciona por su nombre según la charada tradicional, pero sin desglosarlo cifra por cifra... se toman principalmente los dos últimos dígitos... (570) los dos últimos números son el 70 (Coco). Se diría 'el 5 con el Coco' o 'el 570'."
- **L15.** T5 completada. Motor descriptivo en `src/domain/stats.js` con 21 tests. Histórico ampliado a 3.536 sorteos (2022-2026). Las tres posiciones resultan uniformes; patrones coinciden con la teoría; la repetición entre sorteos es inferior a la esperada por azar.
- **L16.** T7 completada. SDK integrado y verificado en navegador real (Playwright): fuera de QvaPay y dentro de un iframe que implementa el protocolo del simulador. Dos defectos encontrados y corregidos (getTheme rechazado tumbaba la página; tema claro ilegible).
- **L17.** «En historia y Cultura la presentacion es un desastre, me imagino que cada articulo lo tenfamos como un makdwon y que lo ue hagamso sea cargarlos y renderiar el markdown. eso es lo mas optimo me parece. y el indice arriba deberian de ser como presetnacion de articulos, luego le pondremos a cada uno su imagen pero por ahora unos tiles con cada articulo. Hagamos uso de el SDK de qvapay que tiene para usar los botones y encabezado dinamico , usar boton de atras, buscador y demas cosas. https://www.qvapay.com/docs/miniapps/sdk mira cuantas cosas hay para usar aqui. hay qeu usar el sdk hacer uso de todo lo que nos ofrece adaptado a nuestra miniapp». Specs S12–S15, tareas T17–T21.
- **L18.** Decisiones de esta sesión: renderer de Markdown propio sin dependencias (no `marked`), y el trabajo pendiente se commitea en una rama nueva por unidad revisable antes de empezar. Estado del árbol al retomar: 793 líneas modificadas sin commitear, 171 tests en verde, base de datos al día con la migración `0004` aplicada.

- **L19.** Rebanada de lectura de cultura entregada en `feat/cultura-sdk` en
  diez commits: artículos Markdown con frontmatter (T17), renderer propio
  escapado con 20 tests (T18), índice en tiles y lector tipográfico (T19),
  helpers de chrome del SDK con 15 tests y su uso por pantalla con navegación
  por historial (T20). Total del proyecto: 218 tests en verde.
- **L20.** Verificación funcional (T21) contra el servidor real con Playwright y
  un `window.QvaPay` inyectado: encabezado y botón principal por pantalla,
  acción de búsqueda enfocando el campo, atrás nativo devolviendo del artículo al
  índice, compartir, hápticos y colores; 0 errores de consola. Defectos
  corregidos: el chrome se sincronizaba tras cargar los datos (barra con la
  pantalla anterior) y la entradilla se leía como un párrafo más.

- **L21.** Hallazgo de la verificación visual (fuera del alcance de esta rebanada): las hojas de sprites de los 100 significados no encajan con la tabla. Medido: cada PNG es 887×1774 con una rejilla de 10 columnas × 20 filas de celdas de ~88.7 px, mientras el código asume 10 × 5 de 177 px y escala la hoja a 460×230. Además, la fila 0 sí coincide con las entradas 1–10 (caballo, mariposa, niño, gato, monja, jicotea, caracol, muerto, elefante, pescado), pero desde la 11 los iconos no corresponden al significado de la tabla: el 11 es Gallo y el icono es un sol. Queda como decisión abierta rehacer las hojas en el orden documentado o dejar la lista sin iconos.
- **L22.** Decisión del usuario: el arte va **por significado**, no por número, y se llena solo con lo que se pueda verificar; el resto se lee sin icono. El mapeo se deriva de la tabla sembrada (`splitMeanings`), no se duplica el texto: 100 números dan **151 significados** (39 con dos, 6 con tres). Contrato de archivo `NNN-M.png`; `/api/significados` devuelve una ranura por significado y anuncia el icono solo si el archivo existe. 13 tests nuevos.
- **L23.** Defecto reportado por el usuario: «en la lista de significados sale un error entry.meanings is not iterable». Causa raíz: los endpoints de contenido se servían con `cache-control: public, max-age=3600`, así que el navegador seguía entregando el payload anterior (con `meaning`, `sheet`, `col`, `row`) durante una hora; el cliente nuevo no podía iterar `meanings`. Arreglo en la raíz, no en el cliente: `sendRevalidatedJson` con ETag débil y `cache-control: no-cache`, de modo que el navegador revalida siempre (304 sin cuerpo cuando no cambió) y un cambio de contrato nunca queda escondido. Aplicado a `/api/significados` y `/api/cultura`. 5 tests; verificado con curl: 200 + `no-cache` + ETag, y 304 con 0 bytes en la petición condicional.
- **L24.** Revisión nativa del tramo de código (`e857c18..1a18884`, lineage `review-d05bd31e07e0296a`). El candidato completo no cabía: `lens_context_budget_exceeded` con 15 commits y 379 archivos, empujado por el commit de datos. Se revisó el rango de código en la rama temporal `review-code-slice`: tier high, tres lentes, 2.513 líneas. `risk` y `readability` sin hallazgos; `reliability` devolvió **R3-1 (crítico)**: `getJson` en `public/app.js` no enviaba `authHeaders`, así que el token de respaldo solo viajaba en `/api/sesion` y el trabajo de cookies particionadas era inefectivo en su propio escenario. Verificado en el código y corregido en `d8ec44f`, con test estructural del cableado (los tests de servidor no podían verlo). El cierre nativo quedó en `escalated` / `unknown_causality` (la ubicación era a nivel de archivo), con `native_stop_required`: por eso la corrección se hizo aquí y no por la ruta de corrección del proveedor.
- **L25.** Decisión explícita: el código de significados vive en `848eca0`, el mismo commit que los datos (12.400 de sus 13.392 líneas son el JSON y los 369 PNG), y **no tiene revisión nativa**. Su evidencia es la suite (246 tests), la auditoría del arte y la verificación visual de lista y fichas. Revisarlo exigiría separar datos y código en commits distintos.

## Menú Más (T8 parcial)

Cuatro herramientas en `VIEWS.mas`, servidas siempre:

| Id | Herramienta | Requiere cuenta |
|---|---|---|
| `sueno` | Cuéntame tu sueño | Sí |
| `adivinanza` | La adivinanza | Sí |
| `corazonada` | Tengo una corazonada | Sí |
| `cultura` | Origen y cultura | No |

**Regla de gate decidida por el usuario:** el menú se muestra siempre; el
requisito de cuenta aparece **al tocar** una herramienta que lo necesita, y en
ese caso se explica qué se gana vinculando antes de mencionar que falta
desarrollo. Sin cuenta, `cultura` responde «Muy pronto» directamente.

**Autenticación implementada:**

- `src/auth/verifyInitData.js` — HMAC-SHA256 con `secret_key =
  HMAC("QvaPayMiniApp", app-secret)`, comparación en tiempo constante, rechazo de
  firmas viejas y de payloads de otra App.
- `src/auth/session.js` — cookie firmada `HttpOnly; SameSite=Lax`, verificación
  por HMAC, caducidad de 30 días, degrada a «sin sesión» ante cualquier problema.
- Rutas: `POST /api/login` (init_data en el cuerpo crudo), `GET /api/sesion`,
  `POST /api/logout`.

**Verificado:** 15 tests en `tests/auth.test.js` con payloads firmados de verdad
(no fixtures), incluido el rechazo de campo alterado, secreto ajeno, App ajena,
payload caducado y firma ausente. Total del proyecto: **141 tests en verde**.

**Pendiente para activar el login real:** `QVAPAY_APP_ID` y `QVAPAY_APP_SECRET`
vacíos en `.env`. Sin ellos `POST /api/login` responde `NO_SECRET` (comprobado).

**Decisión del usuario sobre corazonadas:** estadísticas por usuario
(corazonadas enviadas, aciertos, racha) **sin ranking competitivo**. Un orden
público de «quién predice mejor» presentaría como mérito lo que el análisis de
3.536 sorteos demuestra que es ruido: las tres posiciones son uniformes.

- **L26.** «hay que hace run mejor control del boton back nativo de la app. controlar mejor el estado y que el back haga lo que dbe hacer». Se modeló la hoja como un paso del historial (S17): el calendario y las hojas de mensaje empujan su entrada al abrirse; atrás la cierra y no abandona la pantalla, y cerrarla con sus propios controles devuelve la entrada (con `history.back()` cuando nada sigue, con `replaceState` cuando la cierra una navegación, para que no aterrice después del `push`). El resultado del análisis gana entrada propia y atrás vuelve a la entrada del número. Verificado con un `window.QvaPay` inyectado y Playwright: calendario + atrás (hoja cerrada, sigue en Tiros), calendario + Escape (sin entrada colgada), hoja de mensaje + atrás (sigue en Más), artículo + atrás (índice de tiles), análisis + atrás (vuelve la entrada), elegir día (estado sin `overlay`).
