# Investigación de diseño jugable: plataformas troll y masocore para Syntax Error

## Estado y propósito

Este documento organiza una línea de investigación para **Syntax Error** basada en recursos de diseño asociados a plataformas troll y masocore. Su objetivo es evaluar cómo convertir errores de software en trampas legibles, repetibles y coherentes con la arquitectura actual del juego.

Las propuestas de este documento **no constituyen alcance aprobado**. Antes de incorporarlas al producto deben pasar por prototipado, prueba de juego y, cuando corresponda, actualización formal de requisitos y tareas.

## 1. Análisis de referentes

### 1.1 I Wanna Be the Guy (IWBTG)

IWBTG popularizó una relación deliberadamente adversarial entre nivel y jugador: elementos reconocibles dejan de obedecer su lectura inicial, los peligros pueden activarse al cruzar umbrales y el conocimiento adquirido después de morir se convierte en la principal herramienta de progreso [cite]. El valor de este enfoque no reside únicamente en sorprender, sino en construir una secuencia de **hipótesis, fallo, comprensión y reintento**.

Aspectos transferibles a Syntax Error:

- La sorpresa funciona mejor cuando el segundo intento permite anticiparla.
- Una muerte inmediata puede resultar aceptable si el reinicio es rápido y la causa queda clara.
- La inversión de una regla debe estar limitada en espacio o tiempo para que el jugador pueda aprenderla.
- La dificultad puede surgir de reinterpretar elementos ya conocidos, no solo de aumentar velocidad o precisión.

Riesgo de adaptación: encadenar sorpresas sin separación puede convertir el aprendizaje en memorización opaca. Syntax Error debería comunicar cada “bug” mediante una señal visual, un mensaje contextual o un patrón consistente después de su primera activación.

### 1.2 Cat Mario (Syobon Action)

Cat Mario toma la gramática visual de un plataformas familiar y subvierte expectativas concretas: bloques ocultos alteran trayectorias, superficies aparentemente seguras dejan de serlo y amenazas convencionales producen resultados no convencionales [cite]. El humor emerge del contraste entre una presentación inocente y una consecuencia mecánica hostil.

Aspectos transferibles a Syntax Error:

- Usar una silueta conocida para representar una plataforma y revelar después un estado `undefined` crea una equivalencia temática comprensible.
- Una trampa secundaria puede castigar la reacción automática a una primera trampa, siempre que ambas formen una secuencia legible.
- La anticipación visual puede ser mínima en el primer encuentro y más explícita tras la muerte.
- El tono cómico puede reducir frustración si el mensaje reconoce la causa real del fallo.

Riesgo de adaptación: ocultar demasiada información puede parecer arbitrariedad. La sorpresa inicial no debería impedir que el jugador formule una estrategia concreta para el siguiente intento.

### 1.3 Trap Adventure 2

Trap Adventure 2 concentra trampas en espacios pequeños y explora cadenas donde superar un peligro modifica el contexto del siguiente [cite]. La dificultad proviene de combinar posicionamiento, timing y conocimiento previo. La densidad produce espectáculo, pero también incrementa el coste cognitivo de identificar qué acción causó la muerte.

Aspectos transferibles a Syntax Error:

- Las cadenas deben dividirse en unidades de aprendizaje: una idea principal por tramo y una variación posterior.
- Una trampa secundaria debe responder a una acción previsible, no a cualquier acción posible.
- Los checkpoints y el respawn rápido son parte del equilibrio, no simples comodidades.
- La cámara, el encuadre y el orden de activación deben permitir atribuir la muerte a una causa.

Riesgo de adaptación: una cadena larga sin checkpoint obliga a repetir acciones ya dominadas y desplaza la dificultad desde la comprensión hacia la resistencia.

### 1.4 Give Up

Give Up estructura su desafío alrededor de la repetición, la escalada visible y una invitación metanarrativa a abandonar [cite]. El juego convierte la frustración esperada en parte de la conversación con el jugador, mientras conserva señales de progreso y una ruta clara de reintento.

Aspectos transferibles a Syntax Error:

- Los mensajes de muerte pueden actuar como narrador técnico: explicar, bromear y registrar progreso.
- La repetición se tolera mejor cuando cada intento comienza con poca latencia y existe evidencia de avance.
- El metahumor debe acompañar al sistema, no ocultar información necesaria.
- La interfaz puede reconocer el número de intentos sin avergonzar ni bloquear al jugador.

Riesgo de adaptación: el sarcasmo repetitivo pierde eficacia. Los mensajes deberían variar por causa de muerte y contexto, con una alternativa neutral accesible.

## 2. Traducción temática: errores de software como reglas jugables

La siguiente tabla separa la metáfora de software de su posible expresión mecánica. Las equivalencias son propuestas de diseño, no una afirmación de que el comportamiento del lenguaje de programación deba simularse literalmente.

| Error o concepto de software | Equivalencia jugable | Señal legible | Riesgo principal |
| --- | --- | --- | --- |
| Referencia `null` o `undefined` | Plataforma que pierde colisión al resolverse su estado | Parpadeo, etiqueta `undefined`, pérdida progresiva de opacidad | Caída percibida como arbitraria |
| Mutación de estado | Controles horizontales invertidos tras un evento concreto | Cambio de iconos y aviso `controls mutated` | Conflicto con el controlador del jugador |
| Error de precisión de punto flotante | Umbral de salto reducido de forma explícita y acotada | Lectura de valor redondeado y marca del umbral | Exigir precisión no visible |
| Garbage collection | Sweep que elimina entidades marcadas según un orden estable | Barrido visible y lista de objetos candidatos | Resultado diferente entre intentos |
| Thread freeze | Congelación simulada de una entidad o subsistema mediante estado temporal | Overlay `main thread busy` y cuenta regresiva | Bloquear el hilo principal real |
| Coerción de tipos | Transformación determinista de propiedades o roles de objetos | Operación visible, por ejemplo `"1" + 1 → "11"` | Cambio impredecible o difícil de explicar |
| Race condition simulada | Dos eventos programados cuyo orden está definido por el nivel | Indicadores de cola y resolución | Presentarla como azar en vez de secuencia diseñada |

**Criterio transversal:** la implementación debe ser determinista. Un mismo estado inicial y la misma secuencia de entradas deben producir el mismo resultado. En particular, “coerción aleatoria” se reemplaza por **coerción determinista**, seleccionada por configuración del nivel, identificador estable o secuencia explícita.

## 3. Propuestas de mecánicas

### 3.1 Null/undefined platform

Una plataforma comienza con apariencia válida y, al cruzar un activador inequívoco, pasa por estados visuales antes de perder su colisión. El primer encuentro puede conservar sorpresa, pero la transición debe permitir atribuir la caída a la plataforma.

Secuencia propuesta:

1. Estado `defined`: colisión y apariencia normales.
2. Estado `resolving`: señal visual breve y etiqueta temática.
3. Estado `undefined`: se retira la capacidad de sostener al jugador.
4. En respawn: se restaura el estado inicial del tramo.

Decisiones para prototipo:

- Activación por zona o contacto, nunca por temporización oculta no relacionada.
- Ventana de advertencia configurable y reproducible.
- Restauración completa al reintentar.
- Mensaje de muerte específico si la caída procede de esta plataforma.

### 3.2 Mutación de controles y vectores invertidos

La inversión horizontal representa una mutación inesperada de estado. Debe activarse por un evento visible y tener una salida definida: fin de sección, switch correcto, checkpoint o respawn.

La arquitectura actual ya dispone de `player.setControlsInverted(...)` y de un pipeline de entrada con orden explícito. El prototipo debe usar esa API y evitar una segunda lectura de teclado. La mutación no debe invertir verticalmente la gravedad ni modificar directamente `player.vel.y`.

Para accesibilidad, se recomienda:

- aviso visual persistente mientras dure la inversión;
- opción para aumentar el tiempo de anticipación;
- alternativa de asistencia que reduzca la duración o permita practicar el tramo;
- reinicio de la mutación durante respawn.

### 3.3 Precisión de salto y punto flotante

La idea temática consiste en mostrar que una pequeña diferencia numérica altera un resultado de colisión o alcance. No debe depender de deriva accidental del motor, del framerate ni de comparar floats por igualdad exacta.

Una adaptación controlada podría reducir explícitamente un parámetro local —por ejemplo, el impulso de un salto de prueba— mediante un multiplicador fijo y mostrar el valor resultante. Sin embargo, esconder esa reducción y exigir al jugador descubrirla por ensayo produce una causa de fallo poco legible. Por ese motivo, la variante **salto de precisión oculto** queda descartada en la priorización actual.

Si el concepto se recupera, debería convertirse en un reto visible de calibración o en una demostración breve, no en una modificación silenciosa del controlador global.

### 3.4 GC Sweep determinista

El GC Sweep amplía la metáfora del recolector: un barrido identifica objetos marcados como candidatos y los procesa en un orden estable. El resultado no depende de selección aleatoria ni del orden incidental de iteración del runtime.

Reglas propuestas:

- El nivel declara los candidatos y una clave de orden estable.
- El barrido muestra primero qué entidades están marcadas.
- La eliminación ocurre en pasos temporizados mediante una máquina de estados.
- El jugador conoce qué objetos son seguros antes de que el barrido alcance su posición.
- Respawn y reinicio restauran la misma lista y el mismo orden.

La mecánica actual `garbageCollector` ya usa una máquina determinista de inactividad. Un futuro Sweep debería extender ese patrón puro y comprobable, no introducir un segundo temporizador global ni depender de `Math.random()`.

### 3.5 Thread freeze simulado

El juego puede representar un bloqueo congelando de forma selectiva una plataforma, un enemigo, el input transformado o una secuencia de animación. La implementación real debe continuar actualizando el loop, el menú de pausa, el sistema de muerte y el reintento.

El freeze debe modelarse como estado con duración acumulada por `dt`. Quedan excluidos los bucles ocupados, esperas síncronas y cualquier operación que bloquee el main thread. El jugador debe conservar una ruta de muerte/respawn o liberación; la simulación no puede dejar la partida sin capacidad de reintento.

### 3.6 Coerción de tipos determinista

La coerción convierte un objeto a un rol diferente según una regla declarada. Ejemplos: una cantidad numérica mostrada como texto concatena en vez de sumar, o una plataforma etiquetada como `truthy` activa un switch específico.

La selección debe ser determinista:

- por ID del objeto;
- por tabla declarativa del nivel;
- por contador de activaciones reiniciado con el tramo; o
- por una secuencia semilla/configuración almacenada y visible para pruebas.

No se propone una “coerción aleatoria”. El objetivo es que el jugador aprenda la regla y pueda repetir la solución.

### 3.7 Trampa secundaria

La trampa secundaria responde a la evasión más probable de una trampa primaria. Por ejemplo, saltar para evitar una plataforma `undefined` activa un bloque superior; en el siguiente intento, el jugador dispone de una ruta alternativa legible.

Límites recomendados:

- Como máximo una respuesta secundaria nueva por unidad de aprendizaje.
- Separación temporal o espacial suficiente para identificar ambas causas.
- La segunda trampa no debe activarse durante el estado de muerte ni impedir el respawn.
- Tras revelarse, debe conservar el mismo activador y resultado.

## 4. Narrativa y metahumor

Syntax Error puede presentar el nivel como un programa defectuoso que insiste en culpar al usuario. La voz narrativa funciona mejor cuando combina tres capas:

1. **Diagnóstico:** identifica la causa mecánica real (`TypeError: platform is undefined`).
2. **Remate:** añade una observación breve (`Funciona en la máquina del nivel.`).
3. **Ayuda implícita:** sugiere qué cambió (`La referencia se invalida después del trigger azul.`).

Ejemplos de mensajes conceptuales:

| Contexto | Mensaje principal | Pista opcional |
| --- | --- | --- |
| Caída por plataforma undefined | `TypeError: no puedes pisar undefined` | `La referencia cambia al cruzar el marcador.` |
| Controles invertidos | `State mutated successfully. Tú, no tanto.` | `Los vectores horizontales están invertidos.` |
| GC Sweep | `Objeto alcanzable marcado para recolección.` | `Observa el orden del barrido antes de avanzar.` |
| Freeze simulado | `Main thread ocupado fingiendo trabajar.` | `El bloqueo termina cuando vence el temporizador visible.` |
| Coerción | `Resultado válido, tipo equivocado.` | `La conversión sigue la etiqueta del objeto.` |

El humor no debe reemplazar la causa de muerte. Debe existir una opción de mensajes reducidos o neutrales, y ningún texto debe retrasar, capturar o deshabilitar el reintento.

## 5. Principios de equilibrio y criterios de diseño

### 5.1 Determinismo

- La configuración del nivel, el estado inicial y la misma secuencia de entradas producen la misma activación de trampas.
- Los temporizadores usan tiempo de juego (`dt`) con límites explícitos.
- Los reinicios restauran mutaciones, candidatos del GC, plataformas y trampas secundarias.
- El orden de operaciones se declara; no depende de azar implícito ni del orden incidental de colecciones.

### 5.2 Causa de muerte legible

- Cada muerte registra una fuente contextual diferenciable.
- El feedback identifica la mecánica responsable, no solo muestra `FATAL ERROR` genérico.
- Si dos trampas pueden causar la muerte en la misma ventana, la prioridad de atribución se define de antemano.
- La señal posterior a la primera muerte permite anticipar la misma trampa en el siguiente intento.

### 5.3 Respawn rápido

- Se conserva el objetivo actual de reinicio breve; el código existente usa un retraso de 0,25 s.
- Ninguna animación, mensaje o efecto de trampa extiende por su cuenta el retraso de respawn.
- El estado del jugador y de la mecánica se restablece de forma coordinada.

### 5.4 Intervalo entre trampas

- Un tramo introduce una idea principal antes de combinarla con otra.
- Como punto de partida para prototipos, debe existir al menos una ventana de decisión completa entre revelaciones; el valor exacto se ajustará mediante prueba de juego.
- Una trampa secundaria se separa lo suficiente para que el jugador distinga el activador primario del secundario.
- No se encadenan muertes inevitables durante invulnerabilidad o durante el retorno del control.

### 5.5 Accesibilidad

- Las señales críticas no dependen únicamente del color; combinan forma, texto, icono o movimiento.
- Los avisos y mensajes admiten una presentación reducida o neutral.
- Las mutaciones de controles disponen de señal persistente y una alternativa de asistencia configurable.
- Los efectos visuales intensos deben respetar opciones de reducción de movimiento y parpadeo.
- La solución no debe exigir audio como único canal de información.

### 5.6 No bloquear el reintento

- El botón o acción de reintento permanece disponible durante trampas, feedback y freeze simulado.
- Las mecánicas cancelan o reinician sus estados al respawn.
- Ninguna propuesta usa espera síncrona, bucle ocupado o bloqueo del main thread.
- Los overlays no capturan input de manera que impida pausa, salida o reintento.

## 6. Matriz priorizada de ideas

La prioridad refleja valor esperado, encaje arquitectónico y coste/riesgo de validación. Los estados indican decisión de investigación, no compromiso de implementación.

| Prioridad | ID | Idea | Estado | Valor esperado | Riesgo o condición |
| ---: | --- | --- | --- | --- | --- |
| 1 | GP-01 | Mensajes de muerte contextuales | **Recomendada** | Refuerza metahumor y hace legible la causa de fallo | Requiere mapear fuentes de muerte a mensajes y pistas |
| 2 | GP-02 | Plataforma `undefined` | **Prototipo** | Traducción directa del tema a una trampa aprendible | Debe señalizar transición y restaurarse al respawn |
| 3 | GP-03 | Trampa secundaria | **Prototipo** | Añade sorpresa masocore sin introducir otro sistema global | Limitar densidad y separar causas |
| 4 | GP-05 | Vectores invertidos | **Prototipo** | Aprovecha la API existente de inversión de controles | No duplicar input ni alterar gravedad vertical |
| 5 | GP-04 | GC Sweep determinista | **Futuro** | Extiende una metáfora ya presente con comportamiento comprobable | Requiere diseño declarativo y orden estable |
| 6 | GP-06 | Coerción de tipos | **Exploración** | Potencial narrativo y de puzle | Necesita una regla visual simple; evitar aleatoriedad |
| 7 | GP-07 | Salto de precisión oculto | **Descartada** | Representa errores numéricos | Causa poco legible y riesgo de dificultad dependiente de precisión invisible |

## 7. Pseudocódigo conceptual

> **Importante:** los snippets de esta sección son **pseudocódigo conceptual**. Expresan estados y contratos de diseño; no son código JavaScript/KAPLAY listo para copiar.

### 7.1 Plataforma undefined

```text
PSEUDOCÓDIGO CONCEPTUAL

state = DEFINED
warningElapsed = 0

onPlayerCrossesTrigger(triggerId):
    if triggerId == configuredTrigger and state == DEFINED:
        state = RESOLVING
        showLabel("undefined")

onUpdate(dt):
    if state == RESOLVING:
        warningElapsed += clamp(dt, 0, maxFrameStep)
        setOpacity(interpolate(1.0, 0.25, warningElapsed / warningDuration))
        if warningElapsed >= warningDuration:
            state = UNDEFINED
            disablePlatformCollision()

onRespawn():
    state = DEFINED
    warningElapsed = 0
    enablePlatformCollision()
    setOpacity(1.0)
```

### 7.2 Mutación de controles sin duplicar input

```text
PSEUDOCÓDIGO CONCEPTUAL

onMutationTrigger():
    player.setControlsInverted(true)
    showPersistentControlIndicator("horizontal vectors inverted")

onSectionResolvedOrRespawn():
    player.setControlsInverted(false)
    hideControlIndicator()
```

### 7.3 GC Sweep determinista

```text
PSEUDOCÓDIGO CONCEPTUAL

candidates = levelConfig.gcCandidates
orderedCandidates = stableSort(candidates, by = [sweepOrder, objectId])
state = WARNING
index = 0
elapsed = 0

onUpdate(dt):
    elapsed += clamp(dt, 0, maxFrameStep)

    if state == WARNING and elapsed >= warningDuration:
        state = SWEEPING
        elapsed = 0

    if state == SWEEPING and elapsed >= stepDuration:
        collect(orderedCandidates[index])
        index += 1
        elapsed = 0
        if index == length(orderedCandidates):
            state = COMPLETE

onRespawn():
    restoreAll(orderedCandidates)
    state = WARNING
    index = 0
    elapsed = 0
```

### 7.4 Thread freeze no bloqueante

```text
PSEUDOCÓDIGO CONCEPTUAL

freezeState = INACTIVE
remaining = 0

startSimulatedFreeze(duration):
    freezeState = ACTIVE
    remaining = duration
    freezeSelectedSubsystems()
    keepRetryAndPauseAvailable()

onUpdate(dt):
    if freezeState == ACTIVE:
        remaining = max(0, remaining - clamp(dt, 0, maxFrameStep))
        updateFreezeOverlay(remaining)
        if remaining == 0:
            unfreezeSelectedSubsystems()
            freezeState = INACTIVE

onRespawn():
    unfreezeSelectedSubsystems()
    freezeState = INACTIVE
    remaining = 0
```

### 7.5 Reducción explícita y controlada de precisión

```text
PSEUDOCÓDIGO CONCEPTUAL

baseJumpImpulse = configuredBaseImpulse
precisionFactor = configuredFixedFactor
reducedImpulse = roundToDeclaredPrecision(baseJumpImpulse * precisionFactor)

showDiagnostic(baseJumpImpulse, precisionFactor, reducedImpulse)
applyLocalChallengeImpulse(reducedImpulse)
```

Este modelo evita depender de errores flotantes emergentes. El factor, el redondeo y el alcance de la modificación se declaran explícitamente y permanecen constantes durante el intento.

## 8. Adaptación a la arquitectura real

Las siguientes notas son obligatorias para cualquier prototipo derivado de este documento:

1. **Usar el contexto `k`:** las entidades, componentes, temporizadores visuales y vectores deben construirse con el contexto KAPLAY que reciben escenas y sistemas. No se debe asumir una API global de KAPLAY.
2. **No duplicar input del jugador:** `playerComponent(k)` ya lee el teclado y mantiene un pipeline `raw-input → warning-delay → merge-inversion → movement`. Las nuevas mecánicas deben usar `setControlsInverted(...)`, `setInputGate(...)` o una extensión acordada de ese contrato.
3. **No duplicar la inversión de Merge:** `mergeBarrier` ya activa `player.setControlsInverted(true)` cuando corresponde. Una nueva mutación debe coordinar propiedad y reset del efecto, no volver a leer teclas ni aplicar una segunda inversión matemática.
4. **No bloquear el main thread:** un thread freeze se simula con una máquina de estados actualizada por `k.dt()`. Se excluyen bucles ocupados, esperas síncronas y temporizadores que impidan procesar pausa, muerte o reintento.
5. **No usar gravedad global:** `body()` es la fuente de verdad de velocidad vertical, gravedad, salto y resolución de colisiones. Las trampas no deben cambiar la gravedad global ni integrar verticalmente al jugador por segunda vez.
6. **GC Sweep determinista:** los candidatos y su orden deben proceder de configuración declarativa y claves estables. No usar `Math.random()` ni el orden incidental de creación de objetos como regla jugable.
7. **Floating-point controlado:** cualquier reducción debe ser explícita, local, acotada y reproducible. Debe definir factor, redondeo/tolerancia y restauración; no comparar floats mediante igualdad exacta ni explotar deriva dependiente de framerate.
8. **Integración con muerte y respawn:** las trampas deben llamar al contrato de muerte con una fuente contextual y suscribirse al evento de respawn para restaurar estado. No deben crear un sistema paralelo de muerte.
9. **Pausa y jerarquía:** los controladores de gameplay deben respetar la raíz pausable existente para que temporizadores, colisiones y feedback permanezcan sincronizados.

## 9. Estrategia de prototipado y evaluación

Para cada idea en estado **Prototipo**, conviene construir un tramo aislado con instrumentación mínima:

- ID de la trampa activada y fuente de muerte;
- tiempo desde respawn hasta activación y muerte;
- número de reintentos por tramo;
- estado completo restaurado después de respawn;
- comprobación automatizada del determinismo de la máquina pura, cuando exista;
- prueba de accesibilidad de señales sin depender únicamente de color o audio.

La evaluación debe distinguir entre:

- **sorpresa útil:** el jugador puede explicar la muerte y proponer una acción diferente;
- **precisión exigente:** la solución se entiende, pero requiere ejecución;
- **arbitrariedad:** el jugador no identifica una relación estable entre acción y resultado.

Solo las dos primeras categorías deberían avanzar. Si una trampa cae en arbitrariedad, debe ganar señalización, simplificar su secuencia o descartarse.

## 10. Fuentes pendientes y límites de publicación

Este documento conserva marcadores **[cite]** en afirmaciones históricas o comparativas que requieren respaldo externo. Antes de una publicación académica, memoria formal o material que presente el análisis como investigación bibliográfica, cada marcador debe sustituirse por una referencia verificable y adecuadamente formateada.

Trabajo pendiente de fuentes:

- verificar autoría, fecha, versión y contexto histórico de IWBTG;
- documentar la edición de Cat Mario/Syobon Action analizada;
- identificar una fuente primaria o análisis verificable de Trap Adventure 2;
- identificar una fuente primaria o análisis verificable de Give Up;
- distinguir observaciones obtenidas por juego directo de afirmaciones procedentes de fuentes secundarias;
- citar documentación técnica oficial cuando una futura implementación dependa de comportamiento específico de KAPLAY.

No se incluyen citas bibliográficas ni URLs no verificadas. Los marcadores **[cite]** no deben permanecer en una versión destinada a publicación académica. La descripción de la arquitectura de Syntax Error procede de la inspección del código del proyecto y debe actualizarse si cambian `playerComponent`, `mergeBarrier`, `garbageCollector` o `deathRespawn`.
