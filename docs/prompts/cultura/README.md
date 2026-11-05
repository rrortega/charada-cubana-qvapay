# Prompts de las ilustraciones de «Historia y cultura»

Un archivo por artículo. Cada uno lleva el texto listo para pegar en el generador y
el nombre exacto del archivo que hay que dejar caer en el repositorio.

## Especificación común (vale para las seis)

| | |
|---|---|
| Formato | PNG con transparencia |
| Tamaño | cuadrado, 1024×1024 (se muestra a 390 px de ancho) |
| Composición | un solo tema, centrado, con ~10 % de aire en los bordes |
| Fondo | transparente; la app lo pinta oscuro (`#0e1116`) |
| Paleta | violeta: `#8b5cf6`, `#6d28d9`, `#a78bfa`, con toques de `#f2f5fa` |
| Estilo | ilustración vectorial limpia, línea fina violeta y rellenos planos con un degradado suave; sombra apenas insinuada |
| Prohibido | texto, letras, marcas de agua, números escritos, varias escenas en una |

**Coherencia**: genera primero `01-origen.png` y usa esa imagen como **referencia**
en el generador para las cinco restantes. Sin referencia salen seis estilos
distintos y se nota en el índice.

## Dónde va cada archivo

```
public/assets/cultura/<id>.png
```

Y para encenderla, escribir la ruta en el encabezado del artículo:

```yaml
image: /assets/cultura/origen.png
```

El cargador de artículos y el índice ya leen ese campo: no hay que tocar código.
Sin imagen, el tile muestra el número de orden, que es el respaldo previsto.

## Modelos probados como referencia

`black-forest-labs/flux.2-pro` (mejor composición) o `google/gemini-2.5-flash-image`
(más rápido). Cualquier generador que acepte imagen de referencia sirve.
