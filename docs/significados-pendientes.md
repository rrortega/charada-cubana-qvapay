# Significados: arte y huecos

Generado con `node scripts/audit-significados.mjs`. No editar a mano: se regenera.

## Resumen

- Fichas: **100**
- Significados: **693**
- Con imagen en disco: **693**
- Sin imagen: **0**
- Dibujos distintos por contenido: **472** (221 archivos repiten los bytes de otro)
- Archivos que ningún significado reclama: **0**

## Arte reutilizado

Estos grupos comparten exactamente los mismos bytes: un mismo dibujo sirve a varios
significados. Reutilizar por concepto está bien — «perro» y «perro grande» pueden
ser el mismo perro —, pero conviene revisar los que mezclan ideas distintas.

- `10/dinero.png` = `20/dinero.png` = `38/dinero.png` = `48/monedas.png` = `60/dinero-grande.png` = `68/dinero.png` = `90/mucho-dinero.png`
- `12/perro-grande.png` = `15/perro.png` = `28/perro-chico.png` = `71/perro-mediano.png` = `75/perro-mediano.png` = `95/perro-grande.png`
- `38/carro.png` = `38/automovil.png` = `52/coche.png` = `79/coche.png` = `87/coche.png` = `100/automovil.png`
- `44/temporal.png` = `44/tormenta.png` = `60/tempestad.png` = `65/trueno.png` = `90/temporal.png` = `99/temporal.png`
- `11/gallo.png` = `15/gallo.png` = `21/gallo.png` = `47/gallo.png` = `98/gallo.png`
- `17/armas.png` = `63/espada.png` = `77/guerra.png` = `95/guerra.png` = `95/espada.png`
- `18/paloma.png` = `24/paloma-blanca.png` = `24/paloma.png` = `34/paloma.png` = `87/paloma.png`
- `21/maja.png` = `21/culebra.png` = `32/maja.png` = `39/culebra.png` = `74/serpiente.png`
- `22/estrella.png` = `45/estrella.png` = `66/estrella.png` = `76/estrella.png` = `82/estrella.png`
- `45/tranvia.png` = `54/tren.png` = `72/ferrocarril.png` = `79/tren.png` = `91/tranvia.png`
- `01/sol.png` = `22/sol.png` = `25/sol.png` = `58/sol.png`
- `03/viaje.png` = `12/viaje.png` = `17/viaje.png` = `90/viaje.png`
- `03/muerto.png` = `08/muerto.png` = `78/sarcofago.png` = `96/muerto.png`
- `04/soldado.png` = `04/militar.png` = `51/soldado.png` = `63/soldado.png`
- `07/cochino.png` = `32/cochino.png` = `75/puerco.png` = `92/puerco-gordo.png`
- `22/sapo.png` = `25/rana.png` = `25/sapo.png` = `70/rana.png`
- `23/vapor.png` = `23/barco.png` = `52/barco.png` = `81/barco.png`
- `25/piedra-fina.png` = `26/brillante.png` = `37/piedra-fina.png` = `53/diamante.png`
- `27/mono.png` = `34/mono.png` = `38/macaco.png` = `97/mono-grande.png`
- `30/cangrejo.png` = `45/cangrejo.png` = `55/cangrejo.png` = `58/cangrejo.png`
- `31/zapatos.png` = `61/zapato.png` = `67/zapato.png` = `96/zapatos-nuevos.png`
- `32/mulo.png` = `46/burro.png` = `65/mula.png` = `84/mulo.png`
- `36/teatro.png` = `66/mascara.png` = `66/careta.png` = `81/teatro.png`
- `40/sangre.png` = `41/sangre.png` = `47/mucha-sangre.png` = `84/sangre-ajena.png`
- `50/florero.png` = `54/flores.png` = `75/flores.png` = `94/flores.png`
- `02/caracol.png` = `07/caracol.png` = `63/caracol.png`
- `03/luna.png` = `06/luna.png` = `17/luna.png`
- `04/pavo-real.png` = `13/pavo.png` = `13/pavo-real.png`
- `05/mar.png` = `89/agua.png` = `89/mar.png`
- `05/lombriz.png` = `19/lombriz.png` = `88/gusano.png`
- `06/jicotea.png` = `22/jicotea.png` = `43/jicotea.png`
- `07/sueno.png` = `54/sueno.png` = `57/cama.png`
- `08/leon.png` = `57/leon.png` = `82/leon.png`
- `08/tigre.png` = `14/tigre.png` = `78/tigre.png`
- `09/buey.png` = `30/buey.png` = `72/buey-viejo.png`
- `10/pescado.png` = `10/pescado-grande.png` = `24/pescado-grande.png`
- `12/cometa.png` = `74/papalote.png` = `89/cometa.png`
- `12/ropa.png` = `66/mudada.png` = `73/mudada.png`
- `16/incendio.png` = `46/fuego.png` = `87/fuego.png`
- `20/canon.png` = `54/canon.png` = `74/canon.png`
- … y 85 grupos más.
