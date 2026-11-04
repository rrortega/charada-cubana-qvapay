# Contrato del cargador

Definición normativa del cargador cubano derivado de los sorteos oficiales de
Florida Pick 3. Este documento es la fuente de verdad para la implementación y
para sus tests.

## Qué es un cargador

El cargador de un sorteo es **el resultado completo de Pick 3 como número de tres
cifras**, dicho como se dice en Cuba:

```
464  ->  "el 464"   o   "el 4 con Muerto grande"    (64 = Muerto grande)
701  ->  "el 701"   o   "el 7 con Caballo"          (01 = Caballo -> 1)
045  ->  "el 45"                                     (sin prefijo: 0 a la izquierda)
570  ->  "el 570"   o   "el 5 con Coco"             (70 = Coco)
```

**No se desglosa cifra por cifra.** Para 570 no se dice "Caballo, Caracol, cero".
La charada asigna significados a números de uno o dos dígitos, y la lectura usa
**los dos últimos dígitos** del número completo.

## Entradas

El sorteo oficial que alimenta el cargador es **Pick 3** (ID `104`), tres dígitos
base en orden de aparición (`wn1`, `wn2`, `wn3`).

El registro con `NumberType` `fb` es el **Fireball**: un número extra de premio
que **no forma parte** del número ganador y **no entra** en el cargador.

> Pick 4 no alimenta el cargador. En la charada se premian tres números —uno fijo
> y dos corridos— que son los tres dígitos del Pick 3. Pick 4 se usó en una
> versión anterior de este contrato y ese planteamiento era incorrecto.

### Cálculo

```
fijo        = base3[0] * 100 + base3[1] * 10 + base3[2]     // 0..999
prefijo     = floor(fijo / 100)                            // 0..9
dosUltimos  = fijo % 100                                   // 0..99, índice de charada
```

Los dígitos **conservan su orden**. `464` no es `446`.

## Las tres posiciones premiadas

En la charada cubana solo se premian tres números por sorteo:

| Posición | Nombre    | Pago habitual |
|----------|-----------|---------------|
| 1        | **fijo**  | 75× lo apostado |
| 2        | corrido   | 25× lo apostado |
| 3        | corrido   | 25× lo apostado |

Los tres son los tres dígitos del Pick 3 **en orden de aparición**:

```
Pick 3 = 570  ->  fijo: 5   corrido: 7   corrido: 0
```

Estas posiciones son los **dígitos** del sorteo, no entradas de la tabla de
charada. No se traducen a la tabla 1..100 para referirse al cargador.

## Forma hablada

Regla de presentación:

1. **`fijo < 100`** (el Pick 3 empieza por 0): se dice el número solo.
   `045` → `"el 45"`. El `prefijo` es `0` y no se menciona.
2. **`fijo >= 100`**: `"el <prefijo> con <significado de dosUltimos>"`.
   `570` → `"el 5 con Coco"`.
3. **`dosUltimos == 0`**: la tabla de charada no tiene entrada `0`. Se dice el
   número solo (`"el 500"`) y el significado queda en `null`.

Siempre es válido decir el número completo: `"el 570"`. La forma con nombre es
un adorno, nunca un reemplazo del dato.

## Bordes

| Caso | Ejemplo | Resultado |
|------|---------|-----------|
| `fijo` mínimo | `000` | `"el 000"`, `dosUltimos = 0`, sin significado |
| `fijo` máximo | `999` | `"el 9 con Serrucho, Gallo, Carbonero"` |
| Pick 3 con 0 inicial | `045` | `"el 45"` |
| Dígitos iguales | `777` | `"el 7 con Muletas"` (77) |
| Termina en 00 | `500` | `"el 500"`, sin significado |

## Casos de test obligatorios

| # | `base3` | `fijo` | `dosUltimos` | Dicho | Regla |
|---|---|---|---|---|---|
| 1 | `[4,6,4]` | 464 | 64 | `el 4 con Muerto grande` | lectura por 2 últimos |
| 2 | `[5,7,0]` | 570 | 70 | `el 5 con Coco` | **no** se desglosa 5-7-0 |
| 3 | `[0,4,5]` | 45 | 45 | `el 45` | sin prefijo |
| 4 | `[5,0,0]` | 500 | 0 | `el 500` | sin significado |
| 5 | `[4,4,6]` | 446 | 46 | — | el orden importa: 446 ≠ 464 |
| 6 | `[9,9,9]` | 999 | 99 | — | máximo |

## Verificación contra datos reales

Validado contra **736 sorteos** (368 días × 2 turnos, nov-2025 a nov-2026):

- `fijo < 100` en **64** sorteos; `fijo >= 100` en **661**; `dosUltimos == 0` en **11**.
- Los **100** números de charada posibles (0..99) resultan alcanzados.
- El código nuevo coincide con los valores almacenados en las **736 filas**, sin
  discrepancias.

## Qué NO hace este contrato

- No predice el sorteo siguiente. Cada sorteo es independiente; la analítica
  histórica es descriptiva, nunca predictiva.
- No incorpora el Fireball.
- No usa la hora del reloj para elegir turno: el turno se toma de `DrawType`.
- No usa Pick 4.
