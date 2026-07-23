# Documento de Requisitos — Syntax Error

## Introducción

"Syntax Error" es un plataformas 2D web con temática de programación. El jugador controla un personaje `;` (punto y coma) que atraviesa 5 niveles llenos de mecánicas "troll" inspiradas en dolores comunes del desarrollo de software. El juego se construye con KAPLAY.js, se empaqueta con Vite, se ejecuta exclusivamente en navegador web y persiste datos en LocalStorage.

## Glosario

- **Sistema_Juego**: El motor principal del juego que gestiona el ciclo de vida, escenas y lógica general.
- **Jugador**: El personaje `;` controlado por el usuario.
- **Habilidad_Comentario**: La habilidad especial "Comment Code" que vuelve al Jugador translúcido e inmune a obstáculos lógicos.
- **Gestor_Temas**: El sistema responsable de aplicar y cambiar los temas visuales.
- **Gestor_Audio**: El sistema responsable de reproducir efectos de sonido y música, con volúmenes configurables.
- **Gestor_Guardado**: El sistema responsable de persistir y recuperar el progreso del jugador usando LocalStorage.
- **Recolector_Basura**: La mecánica del Nivel 1 que elimina al Jugador si permanece inactivo más de 5 segundos.
- **Barrera_Merge**: La mecánica del Nivel 2 con muros de conflicto Git y switches que alteran el comportamiento.
- **Bucle_Infinito**: La mecánica del Nivel 3 que atrapa al Jugador, genera clones fantasma y teletransporta al inicio del nivel.
- **Sistema_Warnings**: La mecánica del Nivel 4 que acumula retardo de input proporcional al número de warnings recolectados.
- **Checkpoint**: Punto de reaparición donde el Jugador vuelve tras morir.
- **Coyote_Time**: Ventana de tiempo (~80ms) tras abandonar una plataforma en la que el Jugador aún puede saltar.
- **Jump_Buffer**: Ventana de tiempo (~100ms) antes de aterrizar en la que se registra un input de salto anticipado.
- **Cooldown**: Tiempo de espera obligatorio entre usos consecutivos de una habilidad.

---

## Requisitos

### Requisito 1: Movimiento Horizontal del Jugador

**User Story:** Como jugador, quiero mover al personaje `;` horizontalmente con controles responsivos, para poder navegar las plataformas con precisión.

#### Criterios de Aceptación

1. WHEN el usuario presiona la tecla de movimiento izquierdo (flecha izquierda o tecla A), THE Jugador SHALL desplazarse hacia la izquierda a una velocidad constante de 300 píxeles por segundo.
2. WHEN el usuario presiona la tecla de movimiento derecho (flecha derecha o tecla D), THE Jugador SHALL desplazarse hacia la derecha a una velocidad constante de 300 píxeles por segundo.
3. WHEN el usuario libera la tecla de movimiento, THE Jugador SHALL desacelerar hasta detenerse completamente en no más de 100ms.
4. THE Jugador SHALL estar sujeto a gravedad constante y colisionar con plataformas sólidas deteniéndose sobre ellas sin atravesarlas.
5. IF el Jugador alcanza el borde horizontal del nivel, THEN THE Jugador SHALL detenerse en el límite sin poder avanzar más allá.
6. WHILE el Jugador se desplaza horizontalmente, THE Sistema_Juego SHALL actualizar la posición de forma independiente del frame rate utilizando delta time.

---

### Requisito 2: Salto del Jugador

**User Story:** Como jugador, quiero saltar con altura variable y mecánicas de asistencia (coyote time, jump buffer), para que el control se sienta fluido y justo.

#### Criterios de Aceptación

1. WHILE el Jugador está en contacto con el suelo, WHEN el usuario presiona la tecla de salto, THE Jugador SHALL ejecutar un salto vertical aplicando una velocidad ascendente inicial definida por el parámetro de configuración de fuerza de salto.
2. WHEN el usuario libera la tecla de salto antes de alcanzar la altura máxima, THE Jugador SHALL multiplicar la velocidad vertical ascendente por un factor de corte entre 0.3 y 0.5 para producir un salto de menor altura proporcional al tiempo de pulsación.
3. WHILE el Jugador ha abandonado una plataforma hace menos de 80ms sin haber saltado, THE Jugador SHALL permitir ejecutar un salto (Coyote_Time).
4. WHEN el usuario presiona la tecla de salto hasta 100ms antes de aterrizar, THE Sistema_Juego SHALL registrar el input y ejecutar el salto automáticamente al contactar el suelo (Jump_Buffer); IF el Jugador no contacta el suelo dentro de la ventana de 100ms, THEN THE Sistema_Juego SHALL descartar el input almacenado.
5. IF el Jugador está en el aire y no se encuentra dentro de la ventana de Coyote_Time, THEN THE Sistema_Juego SHALL ignorar la pulsación de la tecla de salto sin ejecutar salto alguno.

---

### Requisito 3: Habilidad "Comment Code"

**User Story:** Como jugador, quiero activar la habilidad "Comment Code" para volverme temporalmente inmune a obstáculos lógicos, ofreciendo una opción táctica de supervivencia.

#### Criterios de Aceptación

1. WHEN el usuario presiona Shift o C, IF el Cooldown ha expirado, THEN THE Jugador SHALL entrar en estado "comentado" durante 0.5 segundos.
2. WHILE el Jugador está en estado "comentado", THE Jugador SHALL mostrarse con opacidad reducida al 50% y en escala de grises con el prefijo visual `// ;`.
3. WHILE el Jugador está en estado "comentado", THE Jugador SHALL ignorar colisiones con obstáculos lógicos (Recolector_Basura, Bucle_Infinito, Sistema_Warnings), sin recibir daño ni activar sus efectos.
4. WHILE el Jugador está en estado "comentado", THE Jugador SHALL desactivar la colisión con plataformas sólidas pero permanecer sujeto a gravedad.
5. WHEN el estado "comentado" finaliza, THE Sistema_Juego SHALL iniciar un Cooldown de 2 segundos antes de permitir un nuevo uso.
6. WHILE el Cooldown está activo, THE Sistema_Juego SHALL mostrar un indicador visual del tiempo restante del Cooldown junto al Jugador o en la interfaz.
7. IF el usuario presiona Shift o C mientras el Cooldown está activo, THEN THE Sistema_Juego SHALL ignorar la activación sin interrumpir el estado actual del Jugador.
8. IF el estado "comentado" finaliza mientras el Jugador se encuentra dentro de una plataforma sólida, THEN THE Sistema_Juego SHALL reposicionar al Jugador sobre la superficie más cercana por encima de la plataforma.
9. IF el Jugador muere mientras está en estado "comentado", THEN THE Sistema_Juego SHALL cancelar el estado "comentado" e iniciar el proceso de reaparición sin iniciar el Cooldown.

---

### Requisito 4: Sistema de Muerte y Reaparición

**User Story:** Como jugador, quiero reaparecer instantáneamente tras morir sin penalización de vidas, para mantener el ritmo de juego rápido.

#### Criterios de Aceptación

1. WHEN el Jugador colisiona con un obstáculo letal o cruza el límite inferior del nivel (kill-plane), THE Sistema_Juego SHALL registrar la muerte, reproducir una señal visual de muerte y reaparecer al Jugador en el último Checkpoint activado.
2. WHEN el Jugador muere, THE Sistema_Juego SHALL reaparecer al Jugador en un tiempo no mayor a 500ms desde el momento de la muerte.
3. WHEN el Jugador reaparece, THE Sistema_Juego SHALL restablecer el estado del Jugador al estado por defecto del Checkpoint: posición del Checkpoint, velocidad a cero, Cooldown de Habilidad_Comentario reiniciado a disponible y contador de warnings del nivel reiniciado a cero.
4. THE Sistema_Juego SHALL permitir reintentos infinitos sin límite de vidas.
5. WHEN el Jugador reaparece, THE Sistema_Juego SHALL otorgar un periodo de invulnerabilidad de 1 segundo durante el cual el Jugador no puede recibir daño de obstáculos letales, indicado visualmente mediante parpadeo del personaje.

---

### Requisito 5: Nivel 1 — Recolector de Basura Vigilante

**User Story:** Como jugador, quiero enfrentar un robot aspiradora que me elimina si estoy inactivo, para incentivar el movimiento constante.

#### Criterios de Aceptación

1. WHILE el Jugador permanece sin presionar teclas de movimiento durante más de 5 segundos en el Nivel 1, THE Recolector_Basura SHALL eliminar al Jugador.
2. WHEN el Jugador presiona una tecla de movimiento antes de que transcurran 5 segundos de inactividad, THE Recolector_Basura SHALL reiniciar el temporizador de inactividad a 0.
3. WHILE el temporizador de inactividad está activo, THE Recolector_Basura SHALL mostrar una animación progresiva del robot acercándose al Jugador, proporcional al tiempo transcurrido del temporizador.
4. WHILE el Jugador está en estado "comentado", THE Recolector_Basura SHALL ignorar al Jugador y pausar el temporizador de inactividad; WHEN el estado "comentado" finaliza, THE Recolector_Basura SHALL reanudar el temporizador desde el valor en que fue pausado.
5. WHEN el Jugador reaparece tras morir en el Nivel 1, THE Recolector_Basura SHALL reiniciar el temporizador de inactividad a 0.

---

### Requisito 6: Nivel 2 — Barrera Merge

**User Story:** Como jugador, quiero enfrentar muros de conflicto Git con switches engañosos, para experimentar la confusión de un merge conflict.

#### Criterios de Aceptación

1. THE Barrera_Merge SHALL presentar muros que bloquean físicamente el paso del Jugador hasta que se active el switch correcto de la sección de conflicto correspondiente.
2. WHEN el Jugador activa el switch correcto, THE Barrera_Merge SHALL abrir el camino eliminando el muro correspondiente y mostrando una señal visual de resolución exitosa.
3. WHEN el Jugador activa el switch incorrecto, THE Barrera_Merge SHALL invertir los controles de movimiento horizontal del Jugador (izquierda produce desplazamiento derecho y viceversa) por el resto del nivel.
4. IF el Jugador activa un switch incorrecto mientras los controles ya están invertidos, THEN THE Barrera_Merge SHALL mantener la inversión sin modificarla (la inversión no se acumula ni se cancela).
5. WHILE los controles están invertidos, THE Sistema_Juego SHALL mantener la inversión incluso tras la muerte y reaparición del Jugador, restableciéndola únicamente cuando el Jugador complete o reinicie el Nivel 2.
6. THE Barrera_Merge SHALL presentar entre 2 y 4 switches por sección de conflicto, de los cuales exactamente 1 es correcto.
7. WHEN el Jugador activa un switch incorrecto, THE Barrera_Merge SHALL mostrar una señal visual de conflicto que indique la activación de la penalización.
8. THE Barrera_Merge SHALL incluir al menos 3 secciones de conflicto en el Nivel 2.

---

### Requisito 7: Nivel 3 — Bucle Infinito (Stack Overflow)

**User Story:** Como jugador, quiero enfrentar zonas que me atrapen en bucles con clones fantasma, simulando un stack overflow.

#### Criterios de Aceptación

1. WHEN el Jugador entra en una zona de bucle, THE Bucle_Infinito SHALL atrapar al Jugador forzando la repetición automática de los últimos 2 segundos de movimiento registrados en un ciclo continuo, impidiendo el control manual del Jugador.
2. WHILE el Jugador está atrapado en un bucle, THE Bucle_Infinito SHALL generar un nuevo clon fantasma por cada iteración completa del ciclo, donde cada clon replica el movimiento del ciclo con un retraso acumulativo de 100ms respecto al clon anterior, hasta un máximo de 10 clones simultáneos.
3. WHEN el número de clones alcanza 10, THE Bucle_Infinito SHALL mostrar el mensaje "RangeError: Maximum call stack size exceeded" durante 1.5 segundos y teletransportar al Jugador al inicio del Nivel 3, eliminando todos los clones activos.
4. WHILE el Jugador está en estado "comentado", THE Bucle_Infinito SHALL no activar la trampa de bucle al entrar en la zona, permitiendo al Jugador atravesar la zona de bucle sin ser atrapado.
5. IF el Jugador activa la Habilidad_Comentario mientras está atrapado en un bucle, THEN THE Bucle_Infinito SHALL liberar al Jugador del ciclo, restaurar el control manual y eliminar todos los clones fantasma generados.

---

### Requisito 8: Nivel 4 — Warnings Acumulados

**User Story:** Como jugador, quiero que señales de advertencia acumulen retardo en mis controles, simulando la degradación por warnings ignorados.

#### Criterios de Aceptación

1. WHEN el Jugador colisiona con una señal `⚠️`, THE Sistema_Warnings SHALL incrementar el contador de warnings del Jugador en 1 unidad.
2. WHILE el Jugador tiene N warnings acumulados (donde N >= 1), THE Sistema_Warnings SHALL aplicar un retardo de input a las acciones de movimiento y salto, calculado como `t_delay = t_base * (1 + 0.15 * N)` donde `t_base = 50ms`.
3. THE Sistema_Warnings SHALL mostrar el número de warnings acumulados como un contador numérico persistente en la interfaz del nivel.
4. WHILE el Jugador está en estado "comentado", THE Sistema_Warnings SHALL no registrar colisiones con señales `⚠️`.
5. WHEN el Jugador muere o completa el Nivel 4, THE Sistema_Warnings SHALL restablecer el contador de warnings a 0 y eliminar todo retardo de input acumulado.
6. IF el contador de warnings alcanza 20, THEN THE Sistema_Warnings SHALL dejar de incrementar el contador al colisionar con nuevas señales `⚠️`, manteniendo el retardo máximo correspondiente a N=20.

---

### Requisito 9: Nivel 5 — Producción

**User Story:** Como jugador, quiero un nivel final que combine todas las mecánicas previas, representando el caos de un deploy a producción.

#### Criterios de Aceptación

1. THE Sistema_Juego SHALL incluir en el Nivel 5 al menos una instancia activa de cada mecánica: Recolector_Basura, Barrera_Merge, Bucle_Infinito y Sistema_Warnings.
2. THE Sistema_Juego SHALL estructurar el Nivel 5 con al menos 4 secciones donde cada mecánica se presenta individualmente, y al menos 1 sección donde 2 o más mecánicas actúan simultáneamente sobre el Jugador.
3. WHILE 2 o más mecánicas están activas simultáneamente en una sección, THE Sistema_Juego SHALL aplicar cada mecánica de forma independiente siguiendo las reglas definidas en sus respectivos requisitos (Requisitos 5, 6, 7 y 8).
4. WHEN el Jugador alcanza el final de la última sección del Nivel 5, THE Sistema_Juego SHALL registrar la finalización del juego en el Gestor_Guardado y mostrar una indicación visual de completación del juego.
5. WHILE el Jugador está en el Nivel 5, THE Sistema_Warnings SHALL mantener los warnings acumulados y THE Barrera_Merge SHALL mantener la inversión de controles según las reglas de sus respectivos requisitos hasta muerte o completación del nivel.

---

### Requisito 10: Sistema de Temas Visuales

**User Story:** Como jugador, quiero seleccionar entre 5 temas visuales, para personalizar la experiencia estética del juego.

#### Criterios de Aceptación

1. THE Gestor_Temas SHALL ofrecer 5 temas seleccionables: Terminal Retro, IDE Dark, IDE Light, Blueprint y BSOD.
2. WHEN el usuario selecciona un tema, THE Gestor_Temas SHALL aplicar la paleta de colores y estilo visual correspondiente a todos los elementos visibles (fondo, plataformas, Jugador, obstáculos, interfaz) en menos de 200ms.
3. WHEN el usuario selecciona un tema, THE Gestor_Temas SHALL persistir la selección mediante el Gestor_Guardado.
4. WHEN el juego se inicia, THE Gestor_Temas SHALL aplicar el tema guardado por el Gestor_Guardado.
5. THE Gestor_Temas SHALL permitir cambiar de tema desde el menú de configuración sin reiniciar el nivel actual.
6. IF el Gestor_Guardado no contiene un tema guardado o el valor es inválido, THEN THE Gestor_Temas SHALL aplicar "Terminal Retro" como tema por defecto.

---

### Requisito 11: Sistema de Audio

**User Story:** Como jugador, quiero efectos de sonido y música ambiental con volúmenes configurables por separado, para una experiencia auditiva personalizable.

#### Criterios de Aceptación

1. THE Gestor_Audio SHALL reproducir efectos de sonido (SFX) para: salto, muerte, activación de habilidad, alerta del Recolector_Basura, activación de switch de Barrera_Merge, activación de trampa del Bucle_Infinito y colisión con señal del Sistema_Warnings.
2. THE Gestor_Audio SHALL reproducir un loop de música (chiptune/lo-fi) específico por nivel, con un loop distinto para cada uno de los 5 niveles y el menú principal.
3. THE Gestor_Audio SHALL permitir configurar el volumen de música y SFX de forma independiente con valores entre 0.0 (silencio total) y 1.0 (volumen máximo), en incrementos de 0.1.
4. WHEN el usuario modifica el volumen, THE Gestor_Audio SHALL aplicar el cambio al audio en reproducción en menos de 50ms y persistir el valor mediante el Gestor_Guardado.
5. WHEN el Jugador cambia de nivel, THE Gestor_Audio SHALL realizar un crossfade de la música actual al loop del nuevo nivel con una duración de transición de 1 segundo.
6. IF el navegador bloquea la reproducción de audio por política de autoplay, THEN THE Gestor_Audio SHALL reanudar la reproducción tras la primera interacción del usuario sin producir error visible.
7. IF un recurso de audio falla al cargarse, THEN THE Gestor_Audio SHALL continuar la ejecución del juego sin audio para ese recurso y sin mostrar error al usuario.

---

### Requisito 12: Persistencia de Datos

**User Story:** Como jugador, quiero que mi progreso, configuración y preferencias se guarden automáticamente, para no perder avance entre sesiones.

#### Criterios de Aceptación

1. THE Gestor_Guardado SHALL almacenar en LocalStorage: niveles completados (array de 5 booleanos), tema seleccionado, volúmenes de audio (música y SFX, cada uno entre 0.0 y 1.0) y direcciones de memoria recolectadas.
2. WHEN el Jugador completa un nivel, THE Gestor_Guardado SHALL actualizar el estado de niveles completados en LocalStorage dentro de los 100ms posteriores al evento de finalización, garantizando que la progresión secuencial se mantenga (si el nivel N se marca completo, todos los niveles anteriores también deben estar marcados como completos).
3. WHEN el juego se inicia, THE Gestor_Guardado SHALL cargar el estado persistido y aplicarlo a todos los sistemas (Gestor_Temas, Gestor_Audio, progresión) antes de mostrar el menú principal al usuario.
4. IF LocalStorage no contiene datos, o el contenido no es JSON parseable, o el JSON no cumple con la estructura esperada (campos faltantes o tipos incorrectos), THEN THE Gestor_Guardado SHALL inicializar el estado con valores por defecto (levelsCompleted: todos false, currentTheme: "terminal", audioVolume: música 0.5 y SFX 0.7, memoryAddresses: vacío) sin producir error visible al usuario.
5. THE Gestor_Guardado SHALL serializar el estado en formato JSON con la estructura: `{"levelsCompleted": [bool x5], "currentTheme": string, "audioVolume": {"music": number, "sfx": number}, "memoryAddresses": []}`.
6. IF una operación de escritura a LocalStorage falla (por cuota excedida u otro error del navegador), THEN THE Gestor_Guardado SHALL reintentar la escritura una vez y, si falla nuevamente, mostrar una notificación al usuario indicando que el progreso no pudo guardarse, sin interrumpir la sesión de juego activa.

#### Propiedad de Correctitud (Round-Trip)

7. PARA TODO estado válido del juego, serializar con el Gestor_Guardado y luego deserializar SHALL producir un estado con igualdad profunda en todos los campos serializados respecto al original.

---

### Requisito 13: Menú Principal y Navegación

**User Story:** Como jugador, quiero un menú principal con acceso a selección de nivel, configuración y créditos, para navegar fácilmente por el juego.

#### Criterios de Aceptación

1. WHEN el juego se inicia, THE Sistema_Juego SHALL mostrar un menú principal con opciones navegables por teclado: Jugar, Selección de Nivel, Configuración.
2. WHEN el usuario selecciona "Jugar", THE Sistema_Juego SHALL iniciar el primer nivel no completado o el Nivel 1 si todos están completados.
3. WHEN el usuario selecciona "Selección de Nivel", THE Sistema_Juego SHALL mostrar los 5 niveles con indicación visual diferenciada entre niveles completados, desbloqueados y bloqueados.
4. THE Sistema_Juego SHALL permitir acceder a niveles ya completados para rejugarlos.
5. WHEN el usuario presiona Escape durante un nivel, THE Sistema_Juego SHALL pausar el juego y mostrar un menú de pausa con opciones: Continuar, Reiniciar Nivel, Volver al Menú.
6. WHILE el juego está en estado de pausa, THE Sistema_Juego SHALL congelar toda la lógica del juego (física, temporizadores, mecánicas) hasta que el usuario seleccione una opción del menú de pausa.
7. WHEN el usuario selecciona "Reiniciar Nivel" en el menú de pausa, THE Sistema_Juego SHALL reiniciar el nivel actual desde el inicio, restableciendo el estado del Jugador y las mecánicas del nivel.
8. WHEN el usuario selecciona "Volver al Menú" en el menú de pausa, THE Sistema_Juego SHALL detener el nivel actual y mostrar el menú principal.

---

### Requisito 14: Selección de Nivel

**User Story:** Como jugador, quiero seleccionar niveles desbloqueados desde una pantalla dedicada, para elegir qué nivel jugar.

#### Criterios de Aceptación

1. WHEN el juego se inicia por primera vez, THE Sistema_Juego SHALL tener el Nivel 1 desbloqueado y los niveles 2-5 bloqueados.
2. WHEN el Jugador completa un nivel N (donde N < 5), THE Sistema_Juego SHALL desbloquear el nivel N+1.
3. THE Sistema_Juego SHALL mostrar los niveles con tres estados visuales diferenciados: completado, desbloqueado y bloqueado.
4. WHEN el usuario selecciona un nivel desbloqueado o completado, THE Sistema_Juego SHALL cargar e iniciar ese nivel.
5. IF el usuario intenta seleccionar un nivel bloqueado, THEN THE Sistema_Juego SHALL mostrar un mensaje indicando que debe completar el nivel previo, visible durante al menos 2 segundos.

---

### Requisito 15: Configuración

**User Story:** Como jugador, quiero acceder a una pantalla de configuración para ajustar audio y tema visual.

#### Criterios de Aceptación

1. THE Sistema_Juego SHALL mostrar una pantalla de configuración accesible desde el menú principal y el menú de pausa.
2. THE Sistema_Juego SHALL incluir en la configuración: un control deslizante de volumen de música (rango 0.0 a 1.0, incrementos de 0.1), un control deslizante de volumen de SFX (rango 0.0 a 1.0, incrementos de 0.1) y selección de tema visual entre los 5 temas disponibles (Terminal Retro, IDE Dark, IDE Light, Blueprint, BSOD).
3. WHEN el usuario modifica cualquier configuración, THE Sistema_Juego SHALL aplicar el cambio en menos de 100ms sin requerir confirmación y persistir el nuevo valor mediante el Gestor_Guardado.
4. WHEN el usuario sale de la pantalla de configuración, THE Sistema_Juego SHALL retornar a la pantalla desde la que se accedió (menú principal o menú de pausa) sin alterar el estado del juego pausado.
5. IF el usuario accede a la configuración desde el menú de pausa y modifica el tema visual, THEN THE Sistema_Juego SHALL aplicar el cambio de tema al nivel en curso sin reiniciar ni alterar la posición del Jugador.
6. THE Sistema_Juego SHALL mostrar el valor actual de cada opción de configuración al abrir la pantalla (volúmenes actuales y tema seleccionado resaltado), reflejando los datos del Gestor_Guardado.

---

### Requisito 16: Checkpoints

**User Story:** Como jugador, quiero que existan checkpoints dentro de los niveles, para no repetir secciones largas tras morir.

#### Criterios de Aceptación

1. THE Sistema_Juego SHALL colocar al menos 1 Checkpoint intermedio por nivel además del punto de inicio.
2. WHEN el Jugador colisiona con un Checkpoint no activado, THE Sistema_Juego SHALL activar ese Checkpoint como punto de reaparición actual, reemplazando cualquier Checkpoint previamente activado en el nivel.
3. WHEN el Jugador muere, THE Sistema_Juego SHALL reaparecer al Jugador en el último Checkpoint activado del nivel actual.
4. WHEN un Checkpoint se activa, THE Sistema_Juego SHALL mostrar una señal visual de confirmación durante al menos 500ms.
5. THE Sistema_Juego SHALL diferenciar visualmente los Checkpoints activados de los no activados durante todo el nivel.
6. WHEN el Jugador reinicia el nivel o vuelve al menú principal, THE Sistema_Juego SHALL restablecer todos los Checkpoints del nivel al estado no activado y asignar el punto de inicio como punto de reaparición.

---

## Requisitos No Funcionales

### Requisito 17: Rendimiento

**User Story:** Como jugador, quiero que el juego se ejecute de forma fluida en navegadores web modernos, para una experiencia de juego sin interrupciones.

#### Criterios de Aceptación

1. THE Sistema_Juego SHALL mantener una tasa de frames de al menos 60 FPS en hardware de gama media.
2. THE Sistema_Juego SHALL completar la carga inicial del juego en menos de 3 segundos en conexiones de 10 Mbps.
3. THE Sistema_Juego SHALL mantener un uso de memoria inferior a 200 MB durante la ejecución.

---

### Requisito 18: Compatibilidad

**User Story:** Como jugador, quiero que el juego funcione en los navegadores web modernos principales, para poder jugarlo en mi navegador preferido.

#### Criterios de Aceptación

1. THE Sistema_Juego SHALL ser compatible con las 2 versiones más recientes de Chrome, Firefox, Safari y Edge.
2. THE Sistema_Juego SHALL funcionar en resoluciones de pantalla desde 1280x720 hasta 3840x2160.
3. THE Sistema_Juego SHALL adaptarse al tamaño de ventana del navegador manteniendo las proporciones del juego.

---

### Requisito 19: Accesibilidad

**User Story:** Como jugador, quiero opciones de accesibilidad básicas, para que más personas puedan disfrutar del juego.

#### Criterios de Aceptación

1. THE Sistema_Juego SHALL permitir la remapeo de controles de teclado.
2. THE Sistema_Juego SHALL proporcionar suficiente contraste visual entre el Jugador, los obstáculos y el fondo en todos los temas.
3. THE Sistema_Juego SHALL mostrar indicadores visuales además de los auditivos para eventos importantes (muerte, activación de habilidad, alertas).

---

### Requisito 20: Estructura del Proyecto

**User Story:** Como desarrollador, quiero una estructura de proyecto organizada y modular, para facilitar el mantenimiento y la extensión del código.

#### Criterios de Aceptación

1. THE Sistema_Juego SHALL organizar el código fuente en los directorios: scenes/, components/, mechanics/, systems/, assets/ y levels/.
2. THE Sistema_Juego SHALL separar la lógica de cada mecánica de nivel en módulos independientes dentro de mechanics/.
3. THE Sistema_Juego SHALL implementar los sistemas transversales (temas, audio, guardado) como módulos independientes dentro de systems/.

---

## Propiedades de Correctitud

### Propiedad 1: Invariante de Estado del Jugador

PARA TODO frame de ejecución, la posición del Jugador SHALL estar dentro de los límites del nivel o en proceso de reaparición por muerte.

### Propiedad 2: Idempotencia de Guardado

PARA TODA secuencia de guardado y carga repetida sin cambios intermedios, el estado cargado SHALL ser idéntico al estado guardado originalmente.

### Propiedad 3: Round-Trip de Serialización

PARA TODO estado válido S, `deserializar(serializar(S))` SHALL producir un estado equivalente a S.

### Propiedad 4: Invariante del Cooldown

WHILE el Cooldown de la Habilidad_Comentario está activo, THE Sistema_Juego SHALL rechazar activaciones de la habilidad, garantizando que nunca existan dos estados "comentado" superpuestos.

### Propiedad 5: Metamórfica del Sistema de Warnings

PARA TODO N >= 0, el retardo aplicado con N+1 warnings SHALL ser estrictamente mayor que el retardo con N warnings.

### Propiedad 6: Invariante de Progresión de Niveles

PARA TODO estado de guardado válido, si `levelsCompleted[i]` es `true`, entonces `levelsCompleted[j]` para todo `j < i` SHALL ser también `true` (progresión secuencial).
