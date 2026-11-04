# Deploy y URLs de QvaPay

Guía operativa para publicar la mini-app y llenar los campos obligatorios del
panel de desarrollador de QvaPay.

## Cómo funciona el deploy

```
push a main
  └─ GitHub Actions
       ├─ npm test            (un test rojo bloquea el deploy)
       ├─ build imagen        (Dockerfile multi-stage)
       ├─ push a GHCR         (ghcr.io/<owner>/<repo>:<sha> y :latest)
       └─ POST webhook        (EasyPanel descarga la imagen y redeploya)
```

El workflow vive en `.github/workflows/deploy.yml`.

### Secret obligatorio

| Secret | Dónde se obtiene |
|---|---|
| `EASYPANEL_WEBHOOK_URL` | EasyPanel → tu App → **Deploy** → *Webhook* |

Sin ese secret el job falla explícitamente (`::error::`) en lugar de dar un
falso verde.

GitHub Actions construye y publica con `GITHUB_TOKEN`; no hace falta crear un
token de paquetes a mano.

### Configurar EasyPanel

1. Crea una App de tipo **App** (no un servicio desde repo).
2. En *Source* elige **Docker Image** y pon:
   ```
   ghcr.io/rrortega/charada-cubana-qvapay:latest
   ```
   El nombre debe ir en minúsculas, por eso el workflow normaliza
   `GITHUB_REPOSITORY`.
3. Si el paquete de GHCR es privado, añade en EasyPanel las credenciales del
   registro (`ghcr.io`, tu usuario de GitHub y un token con `read:packages`).
4. Copia la URL del **webhook de deploy** y guárdala como secret
   `EASYPANEL_WEBHOOK_URL`.

### Variables de entorno en EasyPanel

Ninguna va en la imagen: todas se leen en tiempo de ejecución.

| Variable | Obligatoria | Valor |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de PostgreSQL |
| `PUBLIC_BASE_URL` | Sí | Dominio público, `https://…` sin barra final |
| `SESSION_SECRET` | Sí | 32 bytes hex aleatorios |
| `QVAPAY_APP_ID` | Sí | UUID de la App en QvaPay |
| `QVAPAY_APP_SECRET` | Sí | Secret de la App (**solo servidor**) |
| `PORT` | No | `3000` por defecto |

`PUBLIC_BASE_URL` es la base de las tres URLs de pago: si está mal, el webhook
apunta a un sitio inexistente y los pagos no se registran.

## Las tres URLs obligatorias del panel

Con el servidor desplegado, se leen ya calculadas:

```
GET /api/config/pagos
```

Devuelve exactamente lo que hay que pegar en cada campo:

| Campo del panel | Ruta | Ejemplo |
|---|---|---|
| **Webhook** | `/api/qvapay/webhook` | `https://charada.tudominio.com/api/qvapay/webhook` |
| **URL de éxito** | `/?pago=exito` | `https://charada.tudominio.com/?pago=exito` |
| **URL de cancelación** | `/?pago=cancelado` | `https://charada.tudominio.com/?pago=cancelado` |

Las tres derivan de `PUBLIC_BASE_URL`, así que el mismo código sirve en local,
en preview y en producción sin tocar nada.

### Qué hace el webhook

- Lee el **cuerpo crudo**: la firma cubre los bytes exactos enviados.
- Verifica `x-qvapay-signature` como `HMAC-SHA256(body, app-secret)` en tiempo
  constante.
- Guarda en `subscriptions` con `ON CONFLICT (transaction_uuid) DO UPDATE`, así
  que un reenvío no duplica.
- Responde `200` al guardar, `401` si la firma no cuadra, `500` si falla el
  almacenamiento y `503` si falta el secret (para que QvaPay reintente más
  tarde en vez de perder el aviso).

Un evento firmado con otro secreto o con el cuerpo alterado **no llega a la
base**; está cubierto por tests.

## Assets para la ficha de QvaPay

Los archivos viven en `public/assets/` y se sirven con el resto de la app, así
que sus URLs públicas se derivan de `PUBLIC_BASE_URL`:

| Archivo | Ruta | Uso en el panel |
|---|---|---|
| `logo.png` | `/assets/logo.png` | Icono cuadrado de la mini-app |
| `logo-192.png` | `/assets/logo-192.png` | Variante ligera (splash interno) |
| `portada.jpg` | `/assets/portada.jpg` | Portada 16:9 de la tarjeta destacada |

Ejemplo con dominio `https://charada.midominio.com`:

```
Icono          https://charada.midominio.com/assets/logo.png
Portada 16:9   https://charada.midominio.com/assets/portada.jpg
```

Requisitos que cumplen:

| Requisito | Valor |
|---|---|
| Icono cuadrado, 256 px o más | 512 × 512 |
| Portada horizontal 16:9, 1280 × 720 o más | 1280 × 720 (ratio 1.778), 144 KB |
| Formatos aceptados | JPG y PNG |
| Las imágenes no se versionan con secretos | Se sirven estático, sin credenciales |

Se cachean 24 h y el HTML nunca se cachea, para que un deploy nuevo se vea al
instante sin que el usuario arrastre CSS viejo.

## Verificación local

```bash
docker build -t charada .
docker run --rm -p 3000:3000 --env-file .env charada
curl localhost:3000/healthz
```

El contenedor corre como usuario no-root, trae `tini` para reenviar `SIGTERM` y
tiene `HEALTHCHECK` contra `/healthz`.

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| El paquete de GHCR es privado y EasyPanel no puede bajarlo | Añadir credenciales del registro en EasyPanel |
| `PUBLIC_BASE_URL` sin `https` | El panel de QvaPay rechaza orígenes no https |
| Webhook accesible solo por `http` | QvaPay requiere `https`; usar el proxy de EasyPanel |
| `QVAPAY_APP_SECRET` rotado sin actualizar EasyPanel | Todas las firmas fallan y los pagos no se registran |
