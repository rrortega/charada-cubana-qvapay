# Sincronización de resultados

Cómo llegan los sorteos oficiales a la base, y qué se dispara cuando llega uno
nuevo.

## El problema

La app solo vale si tiene el resultado del día **cuando la gente lo busca**.
Florida publica a lo largo del día, no a una hora fija: comprobado el 4 nov 2026,
el sorteo de mediodía ya estaba publicado a las 15:28 ET y el de la noche no.

Un cron a una hora fija falla en los dos sentidos: llega tarde si el sorteo se
adelanta y desperdicia llamadas si se retrasa.

## Dos mecanismos que cooperan

```
                    ┌──────────────────────────┐
  visita ──────────▶│ GET /api/tiro  /api/dias │
                    └───────────┬──────────────┘
                                │ dispara en segundo plano
                                ▼
  timer cada 5 min ────────▶ refresh()  ◀── single-flight + cooldown 60 s
                                │
                                ▼
                     fetchLatestDraws()  (API oficial)
                                │
                                ▼
                  inserta draws + cargadores (idempotente)
                                │
                                ▼
                    onNewDraws(draws)   ←── aquí se engancha el match
```

### 1. Ingesta al vuelo

Cada lectura de `/api/tiro` o `/api/dias` lanza un `refresh()` **sin esperarlo**.

La respuesta se construye con lo que ya está en la base, así que nunca se bloquea
esperando a la red. El usuario ve lo que hay; en la siguiente recarga ve lo nuevo.

Verificado: 8 lecturas concurrentes responden en **10 ms** con `200`.

### 2. Cron de respaldo

`setInterval` cada 5 minutos, más un `refresh({ force: true })` al arrancar.

Esto mantiene la base caliente aunque no haya visitas: cuando llega el primer
usuario justo después de un sorteo, el dato ya está.

El intervalo de 5 min no satura el upstream porque `refresh()` es:

- **single-flight**: llamadas concurrentes comparten la misma promesa en vuelo;
- **con cooldown**: como mucho una llamada real al upstream por minuto.

## La señal para las corazonadas

`createSync()` expone `onNewDraws(fn)`. Se llama **solo cuando se inserta un
sorteo nuevo**, con la lista de los que entraron.

```js
sync.onNewDraws(async (draws) => {
  await matcher.matchPending(draws);   // corazonadas -> aciertos
});
```

Es el punto de enganche correcto por tres razones:

- No depende del cron: si el dato entra por una visita, el match corre igual.
- No corre dos veces: si el sorteo ya existía, no se inserta y no hay evento.
- Si el match falla, el hook está en `try/catch` y la ingesta continúa.

Verificado borrando el sorteo del 4 nov y forzando un refresh:

```
refresh 1  → inserted: 0  | hook fired: 0
(dato borrado)
refresh 2  → inserted: 1  | hook fired: 1
```

## Idempotencia

Todo `INSERT` usa `ON CONFLICT DO NOTHING` sobre `(game_id, draw_date, draw_type)`.

Un reinicio del proceso, un cron solapado o una visita durante el cron producen
como mucho una fila por sorteo. Probado: reingestar el mismo día inserta 0.

## Resultados parciales

Pick 3 y Pick 4 se publican por separado. La consulta usa `LEFT JOIN` a propósito:

- Si falta el Pick 4, el cargador **se muestra igual** con su Pick 3.
- Los campos derivados (corridos, parlé, candado) quedan vacíos y el draw se
  marca `complete: false`.

Sin esto, un sorteo recién publicado desaparecía de la app durante horas —
exactamente en la ventana de más tráfico. Fue un bug real, corregido y cubierto
por tests.

## Dónde correr el scheduler

En producción, **dentro del proceso de la app** es suficiente: EasyPanel mantiene
un contenedor vivo y `setInterval` corre mientras haya tráfico o no.

Si algún día hay varias réplicas, el cooldown y el single-flight son por proceso,
así que N réplicas harían N llamadas por minuto. Con una sola instancia no hay
problema; con varias, mover el `refresh()` a un cron externo (EasyPanel lo tiene)
y dejar la app solo con la ingesta al vuelo.

## Backfill inicial

```bash
npm run ingest 365
```

Trae un año de una vez. Se ejecuta una vez al desplegar por primera vez; después
el sincronizador mantiene todo al día.
