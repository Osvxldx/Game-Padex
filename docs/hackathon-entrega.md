# Entrega — Hackathon Kiro AI

Este documento contiene textos listos para copiar en el formulario, el guion del video y una estructura de diapositivas. Los datos marcados como **CONFIRMAR** no deben enviarse hasta validarlos.

## 1. Respuestas para el formulario

### Nombre(s) del/de los participante(s)

**Osvaldo C. Zamora — CONFIRMAR nombre legal/preferido**

### Correo(s) del/de los participante(s)

**osvalo.zamo@gmail.com — CONFIRMAR que no falta la letra “d” en “osvalo”**

### Título del proyecto

**Syntax Error**

### Descripción del proyecto

Syntax Error es un plataformas 2D web que convierte errores y frustraciones del desarrollo de software en mecánicas jugables. El jugador controla un punto y coma (`;`) a través de cinco niveles: un Garbage Collector que elimina objetos inactivos, conflictos de merge que alteran los controles, un Stack Overflow que repite movimientos y genera clones, warnings que añaden latencia y un nivel de Producción que combina todo. Su habilidad Comment Code transforma temporalmente al personaje en `// ;` para atravesar amenazas lógicas. La experiencia combina humor técnico, dificultad progresiva, checkpoints, reintentos rápidos, cinco temas visuales y progreso persistente en el navegador.

### Reto o vertical

**Videojuegos**

### ¿Qué problema soluciona su proyecto?

Los errores de programación suelen presentarse como conceptos abstractos y frustrantes, mientras muchos juegos educativos sacrifican diversión para explicar contenido técnico. Syntax Error reduce esa distancia al convertir Garbage Collection, Merge Conflicts, Stack Overflow y Warning Fatigue en reglas que se comprenden jugando. Para el jugador, ofrece un plataformas desafiante pero justo: cada fallo produce aprendizaje, el respawn rápido evita castigos innecesarios y los checkpoints mantienen el ritmo. Para estudiantes y desarrolladores, transforma experiencias reconocibles del oficio en una forma accesible, memorable y humorística de explorar sus consecuencias.

### ¿Por qué debería ser el ganador? ¿Cuáles son sus mayores fortalezas?

Syntax Error destaca porque tema, narrativa y mecánicas forman un único sistema: los errores de software no son decoración, sino las reglas que el jugador debe dominar. Su curva de dificultad introduce una idea por nivel y culmina combinándolas en Producción, logrando un reto exigente pero alcanzable mediante controles precisos, coyote time, jump buffer, checkpoints, vidas infinitas y una habilidad táctica con cooldown.

La propuesta también tiene una base de ingeniería poco común para un juego de hackathon: arquitectura modular y dirigida por eventos, niveles declarativos, persistencia local, cinco temas, audio configurable y validación automatizada del bundle real. Actualmente pasan 190 pruebas; el smoke test recorre las mecánicas en Chrome, verifica persistencia y resoluciones hasta 4K, y mide 741 ms de carga y 12.4 MB de heap. Kiro fue esencial para trabajar desde requisitos y diseño hasta tareas trazables y propiedades de correctitud. El resultado no es solo una idea original: es un producto web funcional, mantenible y preparado para despliegue continuo.

### Repositorio público

https://github.com/Osvxldx/Game-Padex

**Estado comprobado:** público. Antes de entregar, subir el README raíz y los cambios finales a la rama pública.

### Demo en línea

**PENDIENTE — no enviar una URL hasta verificarla en una ventana privada.**

Opciones:

1. **Recomendada para sumar AWS:** desplegar con AWS Amplify Hosting y usar la URL `https://<id>.amplifyapp.com` que genere el servicio.
2. GitHub Pages: `https://osvxldx.github.io/Game-Padex/` devuelve 404 al 27 de julio de 2026 porque Pages no está habilitado y la versión final sigue en `develop`.

### Video de presentación

Adjuntar el archivo final, máximo 5 minutos. Guion detallado en la sección 3.

### Presentación o diapositivas

Opcional, pero recomendable. Estructura en la sección 4.

### Términos y condiciones

Marcar únicamente después de leer las bases completas: **He leído y acepto los términos y condiciones**.

### Comentarios adicionales

Syntax Error se desarrolló con un flujo spec-driven en Kiro: requisitos con criterios verificables, diseño de arquitectura, planificación incremental y trazabilidad de implementación. El repositorio incluye los documentos de la spec, diagramas Mermaid, pruebas unitarias y basadas en propiedades, smoke test del bundle real y automatización de build/despliegue. El juego no recopila datos personales y guarda el progreso únicamente en LocalStorage.

## Diagnóstico frente a los criterios

Esta es una estimación estratégica, no una calificación oficial del jurado.

| Criterio | Estado actual | Fortalezas | Brecha prioritaria |
| --- | ---: | --- | --- |
| Game design / impacto (30%) | **27/30 estimado** | Curva de cinco niveles, mecánicas coherentes, reto justo, asistencia de salto, checkpoints y respawn rápido. | Añadir al video evidencia breve de juego real o playtesting; evitar presentar las ideas futuras del documento de investigación como implementadas. |
| Innovación (30%) | **27/30 estimado** | Errores de software convertidos en reglas y Comment Code como habilidad transversal. | Los assets y el audio son minimalistas; la demo debe hacer visible la interacción entre mecánicas para que la innovación no quede solo en la explicación. |
| Software y entregables (30%) | **24/30 hoy; 29/30 con demo pública** | Juego completo, 190 pruebas, build, smoke de Chrome, CI, arquitectura y documentación. | La URL pública devuelve 404 y el nuevo README aún no está en GitHub. Video y URL funcional son obligatorios. |
| Kiro y AWS (10%) | **6/10 hoy; 9/10 con Amplify activo** | Spec de Kiro completa y trazable; build spec de Amplify preparado. | Una configuración no demuestra uso real de AWS. Hace falta un deployment exitoso y mostrarlo en arquitectura/video. |

**Estimación total:** aproximadamente **84/100 en el estado publicable actual** y **92/100 o más** después de subir los cambios, desplegar en AWS Amplify y presentar una demo clara. La acción con mayor retorno es obtener y verificar la URL pública; después, grabar el video siguiendo el guion.

## 2. Mensaje central para el jurado

> En Syntax Error, los bugs no interrumpen el juego: son el juego. Convertimos cuatro dolores universales del desarrollo en un plataformas justo, progresivo y técnicamente verificable.

Tres ideas que deben repetirse durante la presentación:

1. **Coherencia:** cada concepto técnico produce una regla jugable distinta.
2. **Reto justo:** sorpresa, aprendizaje y reintento rápido; no dificultad arbitraria.
3. **Producto verificable:** cinco niveles completos, 190 pruebas, smoke real y proceso spec-driven con Kiro.

## 3. Guion del video — 4:40 máximo

### 0:00–0:20 — Hook

**Visual:** título, menú y corte rápido de las cuatro mecánicas.

**Narración:**

> ¿Qué pasaría si un Garbage Collector, un merge conflict o un stack overflow dejaran de ser mensajes de error y se convirtieran en obstáculos? Esto es Syntax Error, un plataformas 2D donde controlas al punto y coma que intenta sobrevivir hasta Producción.

### 0:20–0:50 — Problema y propuesta

**Visual:** jugador moviéndose, muriendo y reapareciendo en checkpoint.

**Narración:**

> Los conceptos de programación suelen ser abstractos y muchos juegos educativos explican más de lo que dejan experimentar. Nosotros los convertimos en reglas que se entienden jugando. Diseñamos una experiencia masocore justa: el juego puede sorprenderte, pero cada muerte debe enseñarte algo y permitir un reintento inmediato.

### 0:50–2:30 — Demo funcional

Usar cortes rápidos; no intentar jugar niveles completos.

**0:50–1:10 — Controles y Comment Code**

> El personaje tiene salto variable, coyote time y jump buffer para mantener precisión. Con Shift o C activamos Comment Code: durante medio segundo pasamos de `;` a `// ;` y evitamos obstáculos lógicos, pero debemos administrar un cooldown de dos segundos.

**1:10–1:30 — Nivel 1**

> En Garbage Collector, quedarnos inactivos por cinco segundos nos vuelve un objeto sin referencias y somos eliminados.

**1:30–1:50 — Nivel 2**

> En Merge Conflict resolvemos switches para abrir barreras. Elegir mal invierte nuestros controles y obliga a adaptarnos.

**1:50–2:10 — Nivel 3**

> Stack Overflow captura los últimos dos segundos de movimiento, los repite y crea clones hasta producir un RangeError. Comment Code también funciona como escape táctico.

**2:10–2:30 — Niveles 4 y 5**

> Los warnings ignorados agregan latencia progresiva al input. Finalmente, Producción reúne todas las mecánicas y comprueba que el jugador realmente aprendió cada sistema.

### 2:30–3:10 — Diseño e impacto

**Visual:** selección de niveles, checkpoints, HUD y cambio de tema.

**Narración:**

> La dificultad crece por combinación, no solo por velocidad. Cada nivel enseña una regla, introduce variaciones y conserva checkpoints, vidas infinitas y feedback visual. Cinco temas, configuración de audio y progreso persistente permiten adaptar la experiencia. El humor técnico conecta con desarrolladores y, al mismo tiempo, vuelve memorables conceptos que normalmente solo aparecen como errores.

### 3:10–4:00 — Arquitectura, Kiro y AWS

**Visual:** diagrama del README; después mostrar brevemente requirements.md, design.md, tasks.md, pruebas y workflow.

**Narración:**

> Construimos el juego en JavaScript con KAPLAY y Vite. Las escenas, mecánicas y sistemas transversales están separados; los cinco niveles son datos declarativos y LocalStorage guarda progreso y preferencias. Kiro fue parte central del desarrollo: formalizamos historias de usuario y criterios de aceptación, diseñamos la arquitectura, dividimos el trabajo en tareas trazables y convertimos invariantes como progresión, cooldown y warnings en pruebas basadas en propiedades. Para hosting, el repositorio incluye un build spec de AWS Amplify que instala, prueba y compila la aplicación antes de publicar.

**Importante:** si Amplify aún no está realmente desplegado, sustituir la última frase por:

> Dejamos preparado el build reproducible para AWS Amplify; la demo mostrada en este video corresponde al bundle final validado localmente.

### 4:00–4:25 — Evidencia funcional

**Visual:** terminal con resumen de tests, build y smoke; acercamiento a los números.

**Narración:**

> No nos quedamos en una demo manual. Pasan 190 pruebas. El smoke test controla el bundle real en Chrome, recorre las cinco mecánicas, verifica persistencia y adaptación hasta 4K, y mide 741 milisegundos de carga y 12.4 megabytes de heap, sin excepciones JavaScript.

### 4:25–4:40 — Cierre

**Visual:** completar Nivel 5 y overlay final.

**Narración:**

> Syntax Error convierte la frustración de programar en aprendizaje, estrategia y humor. Porque aquí los bugs no interrumpen el juego: son el juego.

## 4. Diapositivas — 7 slides

### Slide 1 — Syntax Error

- Logo/título y captura del personaje `;`.
- Subtítulo: “Los bugs no interrumpen el juego: son el juego”.
- Osvaldo C. Zamora — Hackathon Kiro AI.

### Slide 2 — Problema y oportunidad

- Conceptos técnicos abstractos y frustrantes.
- Juegos educativos que separan aprendizaje y diversión.
- Oportunidad: aprender reglas de software mediante interacción y humor.

### Slide 3 — Solución

- Plataformas 2D web, cinco niveles.
- Personaje `;` y habilidad `// ;` Comment Code.
- Capturas pequeñas de GC, Merge, Stack y Warnings.

### Slide 4 — Game design

- Una mecánica nueva por nivel; combinación final en Producción.
- Sorpresa → fallo legible → aprendizaje → reintento rápido.
- Coyote time, jump buffer, checkpoints, vidas infinitas y cooldown táctico.

### Slide 5 — Arquitectura y Kiro

- Diagrama: escenas → core/mecánicas/sistemas → LocalStorage.
- Requirements → Design → Tasks → Implementation → Validation.
- Mostrar rutas `.kiro/specs/syntax-error/` como evidencia.

### Slide 6 — Calidad y despliegue

- 190 pruebas aprobadas.
- Smoke del bundle real en Chrome.
- 741 ms de carga; 12.4 MB de heap; hasta 4K.
- CI y AWS Amplify Hosting. Si aún no está activo, decir “configurado para despliegue”, no “desplegado”.

### Slide 7 — Por qué Syntax Error

- Innovación temática convertida en reglas.
- Reto justo y progresivo.
- Producto web completo, modular y verificable.
- QR a demo y QR al repositorio; probar ambos antes de exportar.

## 5. Checklist obligatorio antes de enviar

- [ ] Confirmar nombre de todos los participantes.
- [ ] Confirmar el correo `osvalo.zamo@gmail.com`.
- [ ] Subir README, `amplify.yml` y versión final al repositorio público.
- [ ] Llevar la versión final a la rama elegida para deployment.
- [ ] Desplegar en AWS Amplify o habilitar GitHub Pages.
- [ ] Abrir demo y repositorio en una ventana privada.
- [ ] Probar el juego desde el enlace público, no desde localhost.
- [ ] Grabar la misma versión que verá el jurado.
- [ ] Mantener el video por debajo de 5:00 y del límite de 1 GB.
- [ ] Ocultar tokens, correos privados, consola AWS y demás información sensible.
- [ ] Exportar diapositivas a PDF y comprobar enlaces/QR.
- [ ] Leer y aceptar las bases.
- [ ] Enviar el formulario una sola vez.

## 6. Activación rápida de AWS Amplify

1. Subir los cambios a GitHub y dejar la rama final estable.
2. En AWS Amplify, seleccionar **Create new app** y conectar el repositorio `Osvxldx/Game-Padex`.
3. Elegir la rama final.
4. Configurar `AMPLIFY_MONOREPO_APP_ROOT` con el valor `syntax-error`.
5. Confirmar que Amplify detecta el `amplify.yml` de la raíz.
6. Ejecutar el deployment y revisar que tests/build terminen correctamente.
7. Abrir la URL generada, jugar al menos Nivel 1 y Nivel 5 y recargar para comprobar persistencia.
8. Añadir la URL al README, al formulario y a los QR.

Referencia oficial: [configuración de monorepos en AWS Amplify Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-configuration.html).

> Contenido de la referencia oficial reformulado para cumplir restricciones de licencia.
