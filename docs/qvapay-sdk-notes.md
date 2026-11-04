# Notas de integración con el SDK de QvaPay

Registro verificado de la superficie del SDK y de las reglas de compatibilidad que
la implementación debe respetar. Fuente: documentación oficial y el propio
`sdk-sim.js` (v1), inspeccionado directamente.

## Superficie de `window.QvaPay`

```
QvaPay.version                 "1" (versión del protocolo, no de la app)
QvaPay.launchParams            { slug, language }
QvaPay.theme                   tema actual (puede ser null antes de getTheme)
QvaPay.ready()                 oculta el loader nativo
QvaPay.close()                 cierra la mini-app
QvaPay.getTheme()              -> { mode, colors: { bg, surface, text, primary } }
QvaPay.on(evento, cb)          themeChanged | backButton | mainButton | headerAction
QvaPay.off(evento, cb)
QvaPay.share({ text? })        hoja nativa de compartir
QvaPay.openLink(url)           abre https en el navegador del sistema

QvaPay.auth.requestLogin({ scopes })   -> { init_data, hash, scopes }
QvaPay.payments.payInvoice(uuid)       -> { status: 'paid', transaction_uuid }

QvaPay.ui.header.set({ subtitle, actions })
QvaPay.ui.colors.set({ header, background })
QvaPay.ui.mainButton.set({ text, visible, loading, enabled })
QvaPay.ui.backButton.set({ visible })
QvaPay.ui.haptic(tipo)
QvaPay.ui.toast(mensaje, { type })
```

Todos los métodos devuelven una promesa. Rechazan con `{ code, message }`.

## Reglas de compatibilidad (importantes)

| Regla | Motivo |
|---|---|
| Detectar capacidades por **presencia del método**, nunca por número de versión. | `version` es del protocolo y no cambia entre releases de la app. |
| `ui.header` y botón atrás automático llegan en **3.7.0**; `ui.colors` en **3.7.1**. | Por debajo, el método no existe y hay que mantener barra propia. |
| Enviar **siempre** `text` y `visible` juntos en `mainButton.set`. | Antes de 3.7.0 cada `set` reemplazaba el botón entero; un `set({loading:true})` lo ocultaba. |
| No pintar una barra propia si `ui.header` existe. | Se verían dos barras seguidas. Se marca `<html class="in-qvapay">`. |
| Decidir siempre por `code`, no por `message`. | El `message` viene localizado y genérico a propósito. |

## Códigos de error

| Código | Significado | Tratamiento |
|---|---|---|
| `USER_CANCELLED` | Cerró la hoja. No es error. | Mostrar **nada**. |
| `NOT_ALLOWED` | Origen no permitido, scope no concedido o KYC pendiente. | Informar, no reintentar. |
| `INVALID_PARAMS` | Parámetros mal formados. | Error de integración, no reintentar. |
| `UNKNOWN_METHOD` | El método no existe en esta versión. | Error de integración. |
| `BUSY` | Otra hoja abierta. | Reintentable. |
| `NETWORK` | Sin conexión. | Reintentable. |
| `INVOICE_APP_MISMATCH` | La factura no es de esta App. | No reintentar. |
| `FAILED` | Cualquier otro rechazo. | La app ya explicó el motivo al usuario. |

## Protocolo del simulador (verificado en `sdk-sim.js`)

El simulador **no** es un mock inerte: habla un protocolo de `postMessage`.

```
tag: '__qvapaySim'
```

1. El puente carga y emite `window.parent.postMessage({ tag, v, booted: true }, '*')`.
2. El host responde con un **saludo** que fija el origen:
   `{ tag, v, hello: true, theme, launch: {slug, language}, fresh }`.
   Sin este saludo, las llamadas se encolan y a los 4 s se rechazan con `NOT_ALLOWED`.
3. Cada llamada viaja como `{ tag, v, id, method, params }`.
4. La respuesta debe ser `{ tag, v, id, ok: true, result }` o
   `{ tag, v, id, ok: false, error }`. **Sin `ok` la promesa nunca resuelve.**
5. Los eventos (`themeChanged`, etc.) llegan como `{ tag, v, event, data }`.

Orígenes aceptados como simulador: `https://www.qvapay.com`, `https://qvapay.com`
y `http://localhost:*` / `http://127.0.0.1:*`.

## Requisitos del contenedor

- Solo `https` en producción; `http://localhost` vale para el simulador.
- El simulador incrusta la página en un iframe, así que hace falta:
  `Content-Security-Policy: frame-ancestors 'self' https://www.qvapay.com`.
- Sin cookies compartidas ni sesión de QvaPay; el token nunca entra al WebView.
- No hay `window.open` ni `target="_blank"`: usar `openLink`.
- Contenido mixto bloqueado.

## Verificación ejecutada

Con Playwright, contra el servidor real y una página que implementa el protocolo
del simulador:

| Escenario | Resultado |
|---|---|
| Navegador normal (sin SDK) | 2 tarjetas renderizadas, `window.QvaPay` ausente, cabecera propia visible, 0 errores |
| Dentro del iframe con saludo | `getTheme` → `ui.header.set` → `ready`, en ese orden |
| Marca `in-qvapay` | Aplicada; cabecera propia oculta |
| Tema oscuro | Fondo aplicado, `themeMode=dark` |
| `themeChanged` a claro | Fondo y variables CSS actualizados; tarjetas legibles |
| Errores de consola | Ninguno |

## Defectos encontrados y corregidos durante T7

1. **`getTheme` que rechaza tumbaba la página.** Una promesa rechazada sin
   capturar abortaba el arranque. Ahora `applyTheme` tolera el fallo, conserva la
   paleta propia y sigue suscribiéndose a `themeChanged`.
2. **Tema claro ilegible.** Se pintaba `body.background` pero las tarjetas usaban
   variables de `:root`, que no cambiaban: quedaban texto negro sobre negro. Ahora
   el tema escribe las custom properties (`--bg`, `--text`, `--surface`,
   `--primary`) y el CSS deriva superficies con `color-mix`.
