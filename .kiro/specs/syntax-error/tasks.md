# Plan de Implementación: Syntax Error

## Resumen

Plan de implementación para "Syntax Error", un plataformas 2D troll con temática de programación construido con KAPLAY.js y Vite. El plan sigue 15 tareas incrementales que construyen el juego desde el scaffolding inicial hasta la integración final.

## Tareas

- [x] 1. Scaffolding del proyecto (create-kaplay + Vite)
  - [x] 1.1 Inicializar proyecto con create-kaplay y configurar Vite
    - Ejecutar `npx create-kaplay syntax-error` para generar la estructura base
    - Configurar Vite con hot reload y soporte ESM
    - Crear estructura de directorios: `src/scenes/`, `src/components/`, `src/mechanics/`, `src/systems/`, `src/levels/`, `src/assets/`
    - Crear archivo `src/main.js` con inicialización de KAPLAY (`kaplay()`)
    - Crear `src/constants.js` con constantes del juego (velocidad, gravedad, dimensiones)
    - Verificar que `npm run dev` levanta el servidor y muestra canvas de KAPLAY
    - _Requisitos: 20.1, 20.2, 20.3_

- [x] 2. Personaje `;` con movimiento responsivo
  - [x] 2.1 Implementar componente Player con movimiento horizontal y salto
    - Crear `src/components/player.js` con el componente custom del jugador
    - Implementar movimiento horizontal a 300px/s con teclas A/D y flechas
    - Implementar desaceleración al soltar tecla (<=100ms hasta detenerse)
    - Implementar salto con altura variable (corte de velocidad al soltar tecla)
    - Implementar Coyote Time (80ms) y Jump Buffer (100ms)
    - Aplicar gravedad constante y colisión con plataformas sólidas
    - Actualizar posición con delta time (independiente del frame rate)
    - Crear escena temporal de prueba con plataformas para verificar el movimiento
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Escribir property test: Movimiento independiente del frame rate
    - **Property 12: Movimiento Independiente del Frame Rate**
    - Verificar que para todo dt positivo, distancia = speed * dt (±1px)
    - **Valida: Requisitos 1.1, 1.2, 1.6**

  - [ ]* 2.3 Escribir property test: Coyote Time como ventana temporal
    - **Property 4: Coyote Time como Ventana Temporal**
    - Verificar que si t < 80ms permite salto, si t >= 80ms lo rechaza
    - **Valida: Requisitos 2.3, 2.5**

- [x] 3. Habilidad "Comentar Código"
  - [x] 3.1 Implementar sistema de habilidad Comment Code
    - Crear `src/components/commentAbility.js` con lógica de la habilidad
    - Activación con Shift o C, duración 0.5s, cooldown 2s
    - Estado "comentado": opacidad 50%, escala de grises, prefijo `// ;`
    - Inmunidad a obstáculos lógicos durante estado comentado
    - Desactivar colisión con plataformas sólidas pero mantener gravedad
    - Implementar indicador visual de cooldown
    - Manejar caso de finalización dentro de plataforma (reposicionar arriba)
    - Cancelar estado sin cooldown si el jugador muere durante comentario
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 3.2 Escribir property test: Inmunidad durante estado comentado
    - **Property 5: Inmunidad durante Estado Comentado**
    - Verificar que toda colisión con obstáculo lógico es ignorada en estado comentado
    - **Valida: Requisitos 3.3, 5.4, 7.4, 8.4**

- [x] 4. Sistema de escenas y navegación (Menú, Level Select, Settings)
  - [x] 4.1 Implementar escena de Menú Principal
    - Crear `src/scenes/menu.js` con opciones: Jugar, Selección de Nivel, Configuración
    - Navegación por teclado entre opciones
    - Transición a la escena correspondiente al seleccionar
    - _Requisitos: 13.1, 13.2_

  - [x] 4.2 Implementar escena de Selección de Nivel
    - Crear `src/scenes/levelSelect.js` con vista de los 5 niveles
    - Mostrar estados visuales: completado, desbloqueado, bloqueado
    - Nivel 1 desbloqueado por defecto, demás bloqueados
    - Mensaje de 2s al intentar seleccionar nivel bloqueado
    - _Requisitos: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 4.3 Implementar escena de Configuración
    - Crear `src/scenes/settings.js` con controles de volumen y selección de tema
    - Sliders de música y SFX (0.0 a 1.0, incrementos de 0.1)
    - Selector de tema visual entre los 5 temas
    - Aplicar cambios en <100ms sin confirmación
    - Retornar a la pantalla de origen (menú o pausa)
    - _Requisitos: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 4.4 Implementar menú de pausa y sistema de muerte/reaparición
    - Implementar pausa con Escape: congelar lógica, mostrar menú
    - Opciones de pausa: Continuar, Reiniciar Nivel, Configuración, Volver al Menú
    - Implementar sistema de muerte: señal visual, reaparición en <500ms
    - Invulnerabilidad de 1s post-reaparición con parpadeo visual
    - Reintentos infinitos sin límite de vidas
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 13.5, 13.6, 13.7, 13.8_

  - [x]* 4.5 Escribir property test: Reset de estado al reaparecer
    - **Property 7: Reset de Estado al Reaparecer**
    - Verificar que tras morir: posición = checkpoint, velocidad = (0,0), cooldown disponible, warnings = 0
    - **Valida: Requisitos 4.1, 4.3, 3.9**

- [x] 5. Sistema de temas visuales (5 temas)
  - [x] 5.1 Implementar ThemeManager con los 5 temas
    - Crear `src/systems/themeManager.js`
    - Definir paletas de colores para: Terminal Retro, IDE Dark, IDE Light, Blueprint, BSOD
    - Implementar `applyTheme(themeName)` que actualiza todos los elementos visibles en <200ms
    - Integrar con todas las escenas existentes (menú, selección, configuración, juego)
    - Aplicar tema guardado al iniciar; usar "Terminal Retro" como default
    - _Requisitos: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 6. Sistema de persistencia (LocalStorage)
  - [x] 6.1 Implementar SaveManager con serialización/deserialización
    - Crear `src/systems/saveManager.js`
    - Estructura: `{levelsCompleted, currentTheme, audioVolume, memoryAddresses}`
    - Serializar a JSON, guardar en LocalStorage con clave "syntax-error-save"
    - Manejar LocalStorage inaccesible: reintentar 1 vez, notificar sin interrumpir
    - Manejar datos corruptos/inválidos: inicializar con defaults silenciosamente
    - Garantizar invariante de progresión secuencial al guardar
    - Integrar con ThemeManager y escenas existentes
    - _Requisitos: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 6.2 Escribir property test: Round-Trip de serialización
    - **Property 1: Round-Trip de Serialización del Estado**
    - Verificar que `deserialize(serialize(state))` === state para todo estado válido
    - Usar fast-check con generadores de GameState arbitrarios
    - **Valida: Requisitos 12.5, 12.7**

  - [ ]* 6.3 Escribir property test: Invariante de progresión secuencial
    - **Property 2: Invariante de Progresión Secuencial**
    - Verificar que si levelsCompleted[i] es true, todos los j < i también son true
    - **Valida: Requisitos 12.2, 14.2**

  - [ ]* 6.4 Escribir property test: Validación de datos inválidos
    - **Property 10: Validación de Datos Inválidos en Carga**
    - Verificar que para todo valor no-JSON o estructura inválida, se produce estado default sin excepción
    - **Valida: Requisitos 12.4, 10.6**

  - [ ]* 6.5 Escribir property test: Volumen dentro de rango válido
    - **Property 11: Volumen dentro de Rango Válido**
    - Verificar que todo volumen queda en [0.0, 1.0] redondeado a incrementos de 0.1
    - **Valida: Requisitos 11.3**

- [x] 7. Sistema de audio (SFX + música)
  - [x] 7.1 Implementar AudioManager con SFX y música por nivel
    - Crear `src/systems/audioManager.js`
    - Implementar SFX para: salto, muerte, habilidad, alerta GC, switch, trampa bucle, warning
    - Implementar música loop por nivel (6 tracks: menú + 5 niveles)
    - Volumen independiente música/SFX con persistencia vía SaveManager
    - Crossfade de 1s al cambiar de nivel
    - Manejar bloqueo de autoplay: reanudar tras primera interacción
    - Manejar fallo de carga de recurso: continuar sin ese audio
    - Crear placeholders de audio (tonos generados) para desarrollo
    - _Requisitos: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [x] 8. Checkpoint - Verificar sistemas base
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 9. Level Loader y estructura de niveles (tilemaps)
  - [x] 9.1 Implementar Level Loader con sistema de tilemaps
    - Crear `src/levels/levelLoader.js` con función para parsear tilemaps
    - Definir `src/levels/tileConfig.js` con mapeo de caracteres a componentes KAPLAY
    - Crear `src/levels/level1.js` con tilemap del Nivel 1 (Garbage Collector)
    - Implementar sistema de spawn points y checkpoints desde tilemap
    - Implementar zonas de mecánicas definidas en el tilemap
    - Crear escena `src/scenes/game.js` que carga niveles dinámicamente
    - Integrar checkpoints: activación visual, punto de reaparición
    - _Requisitos: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 20.1_

- [ ] 10. Mecánica #1: Garbage Collector
  - [ ] 10.1 Implementar mecánica Recolector de Basura para Nivel 1
    - Crear `src/mechanics/garbageCollector.js`
    - Timer de inactividad de 5 segundos: si no hay input de movimiento, eliminar jugador
    - Reiniciar timer al presionar tecla de movimiento
    - Animación progresiva del robot acercándose (proporcional al timer)
    - Pausar timer durante estado "comentado", reanudar al finalizar
    - Reiniciar timer a 0 tras muerte/reaparición
    - Crear tilemap completo del Nivel 1 con plataformas en movimiento
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 10.2 Escribir property test: Reinicio de timer por actividad
    - **Property 9: Reinicio de Timer por Actividad**
    - Verificar que toda tecla de movimiento con t < 5s reinicia el timer a 0
    - **Valida: Requisitos 5.1, 5.2**

- [ ] 11. Mecánica #2: Merge Barrier
  - [x] 11.1 Implementar mecánica Barrera Merge para Nivel 2
    - Crear `src/mechanics/mergeBarrier.js`
    - Muros que bloquean físicamente hasta activar switch correcto
    - 2-4 switches por sección, exactamente 1 correcto
    - Switch correcto: abrir muro con señal visual de resolución
    - Switch incorrecto: invertir controles horizontales por el resto del nivel
    - Inversión idempotente (no se acumula ni cancela con más switches incorrectos)
    - Inversión persiste tras muerte, se restablece solo al completar/reiniciar nivel
    - Crear tilemap del Nivel 2 con al menos 3 secciones de conflicto
    - Crear `src/levels/level2.js`
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x]* 11.2 Escribir property test: Idempotencia de inversión de controles
    - **Property 6: Idempotencia de Inversión de Controles**
    - Verificar que múltiples activaciones incorrectas equivalen a una sola inversión
    - **Valida: Requisitos 6.3, 6.4**

- [x] 12. Mecánica #3: Bucle Infinito
  - [x] 12.1 Implementar mecánica Bucle Infinito para Nivel 3
    - Crear `src/mechanics/infiniteLoop.js`
    - Registrar últimos 2 segundos de movimiento del jugador
    - Al entrar en zona de bucle: atrapar jugador, repetir movimiento en ciclo
    - Generar clon fantasma por cada iteración (retraso de 100ms acumulativo)
    - Máximo 10 clones, al alcanzarlo: mostrar "RangeError: Maximum call stack size exceeded" 1.5s
    - Teletransportar al inicio del Nivel 3 y eliminar clones
    - Estado "comentado" previene activación de trampa
    - Activar habilidad durante bucle: liberar jugador y eliminar clones
    - Crear tilemap del Nivel 3 con zonas de bucle
    - Crear `src/levels/level3.js`
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 13. Mecánica #4: Warnings
  - [ ] 13.1 Implementar mecánica Sistema de Warnings para Nivel 4
    - Crear `src/mechanics/warningSystem.js`
    - Colisión con señal ⚠️ incrementa contador de warnings
    - Retardo de input: `t_delay = 50ms * (1 + 0.15 * N)` para N warnings
    - Mostrar contador de warnings en la interfaz del nivel
    - Estado "comentado" previene registro de colisiones con señales
    - Reset de warnings a 0 al morir o completar nivel
    - Cap de 20 warnings máximo (no incrementar más allá)
    - Crear tilemap del Nivel 4 con señales ⚠️ distribuidas
    - Crear `src/levels/level4.js`
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 13.2 Escribir property test: Fórmula monotónica de retardo
    - **Property 3: Fórmula Monotónica de Retardo de Warnings**
    - Verificar que para todo N >= 0 y M > N, retardo(M) > retardo(N)
    - **Valida: Requisitos 8.2**

  - [ ]* 13.3 Escribir property test: Límite máximo de warnings
    - **Property 8: Límite Máximo de Warnings**
    - Verificar que el contador nunca excede 20 y colisiones adicionales no incrementan
    - **Valida: Requisitos 8.6**

- [ ] 14. Checkpoint - Verificar mecánicas de niveles
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [ ] 15. Nivel 5: Producción (todas combinadas)
  - [ ] 15.1 Implementar Nivel 5 combinando todas las mecánicas
    - Crear `src/levels/level5.js` con tilemap del nivel final
    - Incluir al menos 1 instancia activa de cada mecánica: GC, Merge, Loop, Warnings
    - Estructurar con al menos 4 secciones individuales + 1 sección combinada
    - Aplicar cada mecánica independientemente según sus reglas
    - Warnings y inversión de controles persisten hasta muerte o completación
    - Al completar: registrar finalización en SaveManager, mostrar pantalla de victoria
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 16. Pulido visual, efectos y HUD
  - [ ] 16.1 Implementar HUD, efectos visuales y pulido
    - Crear `src/components/hud.js` con indicadores: cooldown, warnings, nivel actual
    - Implementar efecto de muerte (animación de desintegración/glitch)
    - Implementar efecto de activación de checkpoint (flash + partículas)
    - Implementar parpadeo de invulnerabilidad post-reaparición
    - Implementar efecto visual de cambio de tema (transición suave)
    - Implementar señal visual de conflicto para switch incorrecto (Merge)
    - Implementar animación del robot GC acercándose
    - Implementar efecto visual de clones fantasma (transparencia, trail)
    - Asegurar contraste visual suficiente entre jugador, obstáculos y fondo en todos los temas
    - _Requisitos: 3.2, 3.6, 4.5, 5.3, 6.7, 10.2, 16.4, 16.5, 19.2, 19.3_

- [ ] 17. Integración final, testing y deploy
  - [ ] 17.1 Integración completa de todos los sistemas
    - Conectar flujo completo: Menú → Selección → Juego → Pausa → Completación
    - Verificar transiciones de escena con crossfade de audio
    - Verificar persistencia end-to-end: completar nivel → reiniciar → verificar carga
    - Verificar que cambio de tema mid-level no altera estado del jugador
    - Adaptar canvas a tamaño de ventana (1280x720 a 3840x2160)
    - _Requisitos: 13.1-13.8, 17.1, 17.2, 17.3, 18.1, 18.2, 18.3_

  - [ ]* 17.2 Escribir tests de integración
    - Test de flujo completo de nivel: iniciar → checkpoint → morir → reaparecer
    - Test de persistencia end-to-end: completar nivel → LocalStorage → reiniciar → verificar
    - Test de audio + escenas: crossfade al cambiar nivel
    - Test de tema + juego: cambio mid-level sin afectar posición
    - _Requisitos: 12.3, 11.5, 10.5_

  - [ ] 17.3 Configurar build de producción y deploy
    - Configurar `vite build` para producción optimizada
    - Verificar carga inicial < 3 segundos
    - Verificar uso de memoria < 200 MB
    - Generar bundle estático listo para deploy
    - _Requisitos: 17.1, 17.2, 17.3_

- [ ] 18. Checkpoint final - Verificación completa
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden saltarse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los property tests validan propiedades universales de correctitud usando `fast-check`
- Los tests unitarios validan ejemplos específicos y edge cases
- El lenguaje de implementación es JavaScript (ES Modules) según el documento de diseño
- Se usa KAPLAY.js como motor de juego y Vite como bundler

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "5.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.2", "6.3", "6.4", "6.5"] },
    { "id": 5, "tasks": ["4.4", "7.1"] },
    { "id": 6, "tasks": ["4.5", "9.1"] },
    { "id": 7, "tasks": ["10.1", "11.1"] },
    { "id": 8, "tasks": ["10.2", "11.2", "12.1"] },
    { "id": 9, "tasks": ["13.1"] },
    { "id": 10, "tasks": ["13.2", "13.3", "15.1"] },
    { "id": 11, "tasks": ["16.1"] },
    { "id": 12, "tasks": ["17.1"] },
    { "id": 13, "tasks": ["17.2", "17.3"] }
  ]
}
```
