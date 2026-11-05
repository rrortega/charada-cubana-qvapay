// Culture content for the mini-app.
//
// Written from primary sources: the historical and ethnographic material on
// charada cubana, the bolita, its jargon and its rules. Kept as data (not HTML)
// so the UI controls presentation and the copy stays reviewable.
//
// Editorial rule: this is cultural and historical material. It describes how
// the game works and what it means to people. It never encourages betting, and
// the "independent draws" caveat is stated where the topic invites prediction.

/** @typedef {{id:string, title:string, kicker:string, readMinutes:number, sections:{heading?:string, body:string[]}[], pull?:string}} Article */

/** @type {Article[]} */
export const ARTICLES = [
  {
    id: 'origen',
    title: 'De la charada china a la cubana',
    kicker: 'Historia',
    readMinutes: 4,
    pull: 'La bolita no nació como lotería menor ni como diversión improvisada: nació como un sistema paralelo de apuestas, pegado a la calle y a la cábala.',
    sections: [
      {
        body: [
          'La palabra «charada» llegó al español desde el francés *charade*. En su sentido más antiguo designaba un juego de ingenio: descubrir una palabra a partir de pistas, a menudo en verso. Se desarrolló en Francia durante el siglo XVIII como acertijo literario y con el tiempo se volvió un pasatiempo popular, primero de palabras y sílabas, después también de mímica.',
          'Esa idea de acertijo es la que viaja a Cuba. No llega como juego de salón, sino transformada en un sistema de correspondencias: cada número pasa a tener un símbolo, y el símbolo es la pista.',
        ],
      },
      {
        heading: 'Los 36 bichos',
        body: [
          'Antes de la charada cubana existió en la isla una charada china de 36 «bichos». No eran todos animales: el término nombraba cualquier figura simbólica asociada a un número —caballo, monja, muerto, piedra fina—. Se jugaba con tallas o figuras físicas y con «versos»: acertijos que el dueño del juego lanzaba como pistas para adivinar el número tapado bajo una tela.',
          'En los barrios esa invención no se quedó intacta. Fue absorbiendo palabras del habla popular, santos, objetos cotidianos y maneras nuevas de jugar, hasta dejar de ser un préstamo cultural y convertirse en una creación mestiza.',
        ],
      },
      {
        heading: 'Cien números',
        body: [
          'El paso de 36 a 100 números y tres premios se atribuye, en la versión más citada de la prensa cubana, a José Manuel Castillo, en el barrio de Luyanó. A esa innovación le siguieron pronto competidores: Campanario, López en Marianao, Fox en Tropicana, Battisti en el Sevilla.',
          'La ampliación incorporó la fauna autóctona de la isla y las creencias nacionales. De la charada china permanecen símbolos antiguos; el resto es de una criolledad completa, tomado de la vida cotidiana, de las preocupaciones y de los sueños de los cubanos.',
        ],
      },
    ],
  },
  {
    id: 'bolita',
    title: 'Cómo se organiza la bolita',
    kicker: 'Funcionamiento',
    readMinutes: 4,
    sections: [
      {
        body: [
          'La bolita funciona como una cadena. En la base están los jugadores. Después vienen los apuntadores, que recogen las apuestas. Por encima, la cabeza de banco reúne las listas de varios apuntadores. Y en la cima, el banquero, que pone el dinero, responde por los premios y trata de mantenerse oculto.',
          'Parece informal desde fuera, pero por dentro tiene horarios, cierres, controles y jerarquía. Lo esencial: cada apuesta queda registrada **antes** de que salga el sorteo de referencia. Sin esa disciplina el juego no se sostiene.',
        ],
      },
      {
        heading: 'El apuntador',
        body: [
          'Es la figura más visible, también llamada listero. Trata directamente con los jugadores: recorre casas con su libreta, se ubica en un punto fijo del barrio o recibe en su propia casa. Un buen apuntador necesita carisma, discreción y clientela que confíe en él; hay quien solo juega con un apuntador determinado porque sabe que cumple.',
        ],
      },
      {
        heading: 'La cabeza de banco',
        body: [
          'Figura intermedia, también llamada mensajero. Reúne la jugada de varios apuntadores, controla que las listas lleguen bien y sirve de enlace con el banco. Cada apuntador se identifica por su lista: la Lista 1 es de uno, la Lista 2 de otro.',
        ],
      },
      {
        heading: 'El banquero',
        body: [
          'Es quien pone el dinero que garantiza el juego y responde por los pagos. También es la figura más vulnerable: si lo identifican, puede perder dinero y bienes. Por eso permanece en el anonimato, y muchas veces la cabeza de banco es la única persona que lo trata directamente.',
        ],
      },
      {
        heading: 'El doble control',
        body: [
          'Las listas físicas y el dinero no siempre se entregan a diario: lo normal es que el apuntador los entregue hacia el fin de semana. Pero eso no significa que el banco espere para saber qué se jugó. Cada día, antes del cierre, el apuntador informa por teléfono o mensaje qué jugadas recogió: nombres, números, cantidades y modalidad.',
          'Cuando después llegan las listas físicas, la cabeza de banco las compara con el aviso previo. Ese doble control permite verificar que nadie cambió una jugada a última hora para aprovechar un resultado ya conocido.',
        ],
      },
    ],
  },
  {
    id: 'jugadas',
    title: 'Fijo, corrido, parlé y candado',
    kicker: 'Reglas',
    readMinutes: 3,
    pull: 'En la bolita se premian tres números. El primero es el fijo; el segundo y el tercero son los corridos.',
    sections: [
      {
        body: [
          'La bolita no tiene sorteo propio: se adapta a los resultados de una lotería tomada como referencia. Por eso las combinaciones tradicionales se ajustan al tipo de sorteo disponible.',
        ],
      },
      {
        heading: 'El fijo',
        body: [
          'Es el primer número de la tirada. La posición más importante y la que mejor paga. Jugar un número al fijo es apostar a que saldrá de primero.',
        ],
      },
      {
        heading: 'Los corridos',
        body: [
          'Son el segundo y el tercer número. Acertar un corrido es más fácil que acertar el fijo exacto, y por eso paga menos. Muchos jugadores reparten el dinero: una parte al fijo y otra al corrido.',
        ],
      },
      {
        heading: 'El parlé',
        body: [
          'Combinación de dos números en posiciones exactas: primero y segundo. Si se juega 8-7, el 8 tiene que salir primero y el 7 segundo. No basta con que aparezcan en cualquier lugar. Por eso paga mucho más.',
        ],
      },
      {
        heading: 'El candado',
        body: [
          'Los tres números premiados en el orden exacto en que salen. Una jugada cerrada: 8-7-3 significa que el 8 sale primero, el 7 segundo y el 3 tercero. Es la más difícil y una de las que mejor paga.',
        ],
      },
      {
        heading: 'Los pagos',
        body: [
          'Se paga por cada peso jugado. Las cifras varían según el lugar y el banco, pero las referencias habituales son 75 a 80 por 1 al fijo, 25 por 1 al corrido, y entre 800 y 1 000 por 1 al parlé. Los banqueros de cada zona suelen acordar topes para evitar competencia descontrolada.',
        ],
      },
    ],
  },
  {
    id: 'suenos',
    title: 'Soñar y buscar el número',
    kicker: 'Cultura',
    readMinutes: 3,
    sections: [
      {
        body: [
          'En Cuba mucha gente no recuerda el sueño entero como una historia cerrada, sino como una imagen dominante: un muerto, una serpiente, una casa, una boda, dinero, una pelea. A partir de esa imagen busca el número que le corresponde en la charada.',
          'La práctica no nace solo del juego. Detrás hay una manera antigua de mirar los sueños como mensajes o avisos. La tradición universal tiene nombre: **oneiromancia**, la adivinación por medio de los sueños, presente desde la Antigüedad y basada en la idea de que los sueños pueden ser mensajes enviados por los dioses o por los muertos.',
        ],
      },
      {
        heading: 'Por qué prende tan fuerte',
        body: [
          'En Cuba esa visión encontró terreno fértil. Se cruzó con la charada, con la costumbre de buscar suerte en los signos de la vida diaria, y también con la fe, la superstición, el espiritismo popular y las religiones afrocubanas.',
          'Por eso, cuando alguien pregunta qué número da un sueño, casi nunca hace una consulta mecánica: busca sentido, orientación y, muchas veces, fortuna.',
        ],
      },
      {
        heading: 'La imagen manda',
        body: [
          'Lo que se busca no es la trama, es la imagen. Un perro puede ser el 15; una monja, el 5; un muerto, el 8. La emoción del sueño también pesa: no se interpreta igual un animal que da miedo que uno que da tranquilidad.',
        ],
      },
    ],
  },
  {
    id: 'jerga',
    title: 'Cómo habla el barrio',
    kicker: 'Jerga',
    readMinutes: 4,
    pull: 'Muchas de estas palabras salieron del juego y pasaron al habla popular: «ligar el parlé» hoy nombra cualquier golpe de suerte.',
    sections: [
      {
        body: [
          'La jerga de la bolita no es un conjunto de tecnicismos: son voces nacidas de la práctica diaria, y muchas ya se usan fuera del juego. Aquí van las más vivas.',
        ],
      },
      {
        heading: 'Personajes',
        body: [
          '**Apuntador** — quien recoge las jugadas y anota qué número juega cada uno. **Listero** — quien lleva la lista; en muchos lugares es la misma figura. **Banquero** — quien controla el dinero grande y paga los premios. **Cabeza de banco** — reúne apuestas de varios apuntadores y hace de enlace con el banco.',
        ],
      },
      {
        heading: 'La jugada',
        body: [
          '**Apuntación** — la jugada concreta. **Lista** — el registro donde quedan anotadas las jugadas recogidas. **Tirada** — cada salida o resultado; se habla de la tirada de la tarde y la de la noche. **Limitar** — cuando el banquero pone un tope a un número porque teme que se cargue demasiado.',
        ],
      },
      {
        heading: 'Dinero en clave',
        body: [
          'La charada se metió hasta en el modo de nombrar el billete. **Una monja** son 5 pesos, por el número 5. **Un pescao** son 10, por el pescado grande. **Un perro** son 15. **Una piedra fina** son 25. Y **guayaba** es mentira, cuento o paquete.',
        ],
      },
      {
        heading: 'Del juego al habla diaria',
        body: [
          '**Ligar el parlé** significa acertar una combinación de dos números y cobrar un premio grande; con el tiempo pasó a nombrar cualquier golpe de suerte importante, dentro o fuera del juego.',
          '**Desbancar** es hacerle perder mucho dinero al banco por una jugada demasiado acertada. **Tocar con limón** es sobornar para obtener protección. **Chivato** es el delator.',
        ],
      },
    ],
  },
  {
    id: 'hoy',
    title: 'De Táchira al Cash 3',
    kicker: 'Actualidad',
    readMinutes: 2,
    sections: [
      {
        body: [
          'La bolita no ha tenido siempre la misma referencia. En 1968 se realizó la última lotería oficial en la isla y quedaron prohibidos los juegos de azar. Desde entonces, jugadores y organizadores buscaron resultados externos.',
        ],
      },
      {
        heading: 'Venezuela primero',
        body: [
          'Durante años las referencias fueron las loterías venezolanas de **Táchira** y **Zulia**. Los jugadores tomaban esos resultados como base para las tiradas diarias.',
        ],
      },
      {
        heading: 'Miami después',
        body: [
          'Hacia el año 2000 el juego pasó a regirse por el **Cash 3** y el **Play 4** de las loterías de la Florida, con dos sorteos diarios. Con internet y los teléfonos móviles, los resultados empezaron a saberse casi al instante.',
          'Esa es la referencia que usa esta app: los sorteos oficiales de la Florida Lottery. Y su naturaleza es la de siempre: cada sorteo es independiente, y ningún número está «más caliente» que otro.',
        ],
      },
    ],
  },
];

/** Single-term lookup used by the glossary search. */
export const GLOSSARY = [
  { term: 'Apuntación', def: 'La jugada concreta que hace una persona al apostar a uno o varios números.' },
  { term: 'Apuntador', def: 'Quien recoge las jugadas y anota qué número juega cada persona. También llamado listero.' },
  { term: 'Banco', def: 'El fondo económico que cubre las apuestas, y también la organización central del juego en una zona.' },
  { term: 'Banquero', def: 'Quien pone o controla el dinero grande. Paga los premios y suele mantenerse en el anonimato.' },
  { term: 'Bicho', def: 'En la charada china, cada una de las 36 figuras del juego original.' },
  { term: 'Bolita', def: 'Nombre popular de la lotería clandestina cubana asociada a la charada.' },
  { term: 'Cábala', def: 'La interpretación supersticiosa de un sueño, coincidencia o señal para decidir qué número jugar.' },
  { term: 'Cabeza de banco', def: 'Figura intermedia: reúne apuestas de varios apuntadores y hace de enlace con el banco.' },
  { term: 'Candado', def: 'Combinación de los tres números premiados en el orden exacto en que salen.' },
  { term: 'Centena', def: 'Apuesta a una cifra de tres números, no a un número aislado de la charada.' },
  { term: 'Charada', def: 'La lista de equivalencias entre números y símbolos.' },
  { term: 'Chivato', def: 'El delator o soplón.' },
  { term: 'Corrido', def: 'Los números que salen en segundo o tercer lugar. Pagan menos que el fijo.' },
  { term: 'Desbancar', def: 'Hacerle perder mucho dinero al banco con una jugada demasiado acertada.' },
  { term: 'Fijo', def: 'El número que sale en primer lugar. La posición que mejor paga.' },
  { term: 'Guayaba', def: 'Mentira, cuento o paquete. En el juego, una pista falsa del banquero.' },
  { term: 'Ligar el parlé', def: 'Acertar una combinación de dos números. Hoy nombra cualquier golpe de suerte.' },
  { term: 'Limitar', def: 'Cuando el banquero pone un tope a las apuestas sobre un número.' },
  { term: 'Lista', def: 'El registro donde quedan anotadas las jugadas recogidas.' },
  { term: 'Listero', def: 'Quien lleva la lista de las apuestas. En muchos lugares es el apuntador.' },
  { term: 'Mensajero', def: 'Figura intermedia que reúne jugadas de una zona y las lleva al banco.' },
  { term: 'Monja', def: 'Símbolo del número 5 y, por extensión, nombre popular del billete de 5 pesos.' },
  { term: 'Parlé', def: 'Apuesta combinada de dos números en posiciones exactas: primero y segundo.' },
  { term: 'Pescao', def: 'El billete de 10 pesos, por el número 10 (pescado grande).' },
  { term: 'Perro', def: 'El billete o la cantidad de 15 pesos, por el número 15.' },
  { term: 'Piedra fina', def: 'El billete de 25 pesos, por el número 25.' },
  { term: 'Rifa Chiffá', def: 'Forma antigua de la charada china practicada en Cuba, de 36 bichos.' },
  { term: 'Terminales', def: 'Forma popular de llamar a la bolita o a jugarla por las cifras finales del resultado.' },
  { term: 'Tirada', def: 'Cada salida o resultado del juego.' },
  { term: 'Tocar con limón', def: 'Sobornar a alguien para obtener protección o favores dentro del juego.' },
  { term: 'Verso', def: 'La adivinanza o pista con la que se sugería un número sin decirlo.' },
];
