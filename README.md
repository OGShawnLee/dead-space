# 🛸 Dead Space: Sector Protocol (Three.js Prototype)

> Prototipo jugable de un **Survival Horror en tercera persona** inspirado en el clásico *Dead Space*. Construido con **HTML5, CSS3, JavaScript ES Modules y Three.js**, ejecutándose a 60 FPS estables sin dependencias de librerías pesadas ni assets externos descargados.

---

## 📋 Índice
1. [Visión General y Filosofía de Diseño](#-visión-general-y-filosofía-de-diseño)
2. [Características Principales](#-características-principales)
3. [Arquitectura del Proyecto (ES Modules)](#-arquitectura-del-proyecto-es-modules)
4. [Mecánicas del Juego](#-mecánicas-del-juego)
   - [Interfaz Diegética (RIG y Hologramas)](#interfaz-diegética-rig-y-hologramas)
   - [Combate y Desmembramiento Quirúrgico](#combate-y-desmembramiento-quirúrgico)
   - [Inteligencia Artificial y Línea de Visión (LoS)](#inteligencia-artificial-y-línea-de-visión-los)
   - [Cámara Over-The-Shoulder](#cámara-over-the-shoulder)
   - [Audio Procedural con Web Audio API](#audio-procedural-con-web-audio-api)
5. [Controles](#-controles)
6. [Cómo Ejecutar el Proyecto](#-cómo-ejecutar-el-proyecto)
7. [Hoja de Ruta (Roadmap)](#-hoja-de-ruta-roadmap)

---

## 🌌 Visión General y Filosofía de Diseño

El jugador encarna a un ingeniero atrapado en los oscuros y claustrofóbicos pasillos de una nave minera abandonada, infestada por **Necromorfos**. El objetivo es explorar la nave, gestionar suministros (munición y botiquines) y abrirse paso hasta la **Cápsula de Escape**.

### Reglas Inquebrantables de Implementación:
- **Cero Assets Externos**: No se utilizan modelos 3D (`.gltf`, `.obj`) ni imágenes precargadas (`.png`, `.jpg`). Todo el entorno y los personajes están modelados a partir de **geometrías primitivas** (cajas, cilindros, conos, planos) y texturas generadas procedimentalmente en tiempo de ejecución mediante `CanvasTexture`.
- **Cero Audio Externo**: Ningún archivo `.mp3` o `.wav`. Cada disparo, alarido, pisada, latido y chirrido es generado en tiempo real con la **Web Audio API** mediante osciladores, filtros y síntesis FM.
- **Rendimiento a 60 FPS**: Renderizado optimizado mediante mallas modulares, iluminación calculada por distancias de atenuación y sombras suaves PCF.

---

## ⚡ Características Principales

- **Desmembramiento Táctico**: Disparar al torso de los enemigos produce un daño mínimo. Cortar brazos, piernas o cabezas es la única forma efectiva de neutralizarlos.
- **RIG de Salud 3D Real**: Sensor de vida de Isaac modelado como una columna vertebral 3D luminosa con 6 vértebras en relieve que cambian de color (Cian $\rightarrow$ Ámbar $\rightarrow$ Rojo crítico) y proyectan luz sobre su traje.
- **Munición Holográfica Flotante**: Proyección de plasma flotante anclada al arma que muestra las cargas restantes en tiempo real.
- **IA Sensorial Realista**: Los enemigos no tienen visión a través de muros ("wall-hack"). Detectan al jugador por línea de visión directa, sonido de pasos cercanos o cuando el haz de la linterna los alumbra.
- **Generación Procedural de la Nave**: Mazmorra basada en cuadrícula 2D extruida a 3D con pasillos metálicos estrechos, tuberías, luces rojas intermitentes y niebla volumétrica claustrofóbica.

---

## 📁 Arquitectura del Proyecto (ES Modules)

El código está desacoplado bajo principios de alta cohesión y responsabilidad única:

```text
dead-space/
├── index.html                   # Interfaz semántica, scanlines CRT y modales
├── style.css                    # Estética industrial, scanlines, animaciones y HUD
├── game.js                      # Punto de entrada limpio (Bootstrap del motor)
├── README.md                    # Documentación técnica completa
└── src/
    ├── core/
    │   ├── Engine.js            # Bucle de juego, escena, renderizado y estado global
    │   ├── InputManager.js      # Captura de periféricos, teclado y ratón
    │   └── SoundSystem.js       # Sintetizador procedural con Web Audio API
    ├── graphics/
    │   ├── TextureFactory.js    # Generador CanvasTexture (metal, piel, rejillas, holo)
    │   └── BloodParticleSystem.js # Emisor de partículas de sangre y salpicaduras
    ├── world/
    │   ├── ShipLevel.js         # Generación del laberinto 3D, luces y terminal de escape
    │   ├── LineOfSight.js       # Comprobación de colisión y visibilidad por raycast
    │   └── GibPart.js           # Física cinemática de extremidades amputadas
    ├── entities/
    │   ├── Player.js            # Isaac Clarke: Espina RIG 3D, linterna y Cortador de Plasma
    │   └── Necromorph.js        # Enemigo Slasher: hitboxes de miembros y desmembramiento
    └── camera/
        └── ThirdPersonCamera.js # Cámara sobre el hombro con interpolación y anti-clipping
```

---

## 🕹️ Mecánicas del Juego

### Interfaz Diegética (RIG y Hologramas)
Fiel al diseño de *Dead Space*, la información de supervivencia no satura la pantalla con barras artificiales, sino que se integra en el propio mundo del juego:
1. **Espina Dorsal del Traje (RIG)**: 6 vértebras tridimensionales iluminadas en la espalda de Isaac.
   - **$100\% - 75\%$**: Azul Cian brillante (`#00f0ff`).
   - **$74\% - 40\%$**: Ámbar de advertencia (`#ff9900`).
   - **$< 25\%$**: Rojo pulsante crítico (`#ff1a1a`), acompañado de latidos del corazón de baja frecuencia en el audio.
2. **Proyección Holográfica de Células de Plasma**: Panel digital semi-transparente que flota sobre el Cortador de Plasma mostrando el conteo `cargador / reserva`.

### Combate y Desmembramiento Quirúrgico
Cada Necromorfo cuenta con una jerarquía de colisionadores independientes:
- **Torso**: Absorbe disparos con un daño irrelevante (10 HP).
- **Extremidades (Brazos y Piernas - 25 HP)**: El Cortador de Plasma inflige 35 de daño por impacto a las extremidades, **cercenándolas limpiamente de 1 solo tiro bien apuntado**.
- **Amputación de ambos brazos**: El enemigo **queda completamente desarmado** (su daño de ataque pasa a 0), tambalea en agonía y se desangra hasta morir en pocos segundos.
- **Amputación de piernas**:
  - 1 pierna: Cojera severa con velocidad reducida al $50\%$.
  - 2 piernas: Cae al suelo y se convierte en **Crawler**, arrastrándose lentamente con sus garras.
- **Decapitación**: Impacto crítico mortal instantáneo.

### Inteligencia Artificial y Línea de Visión (LoS)
El módulo `LineOfSight.js` evalúa si hay mamparos interrumpiendo la línea recta entre los ojos del Necromorfo y el torso de Isaac:
- **A oscuras**: Rango de visión de 5 metros en línea directa; detección auditiva a menos de 2.2 metros.
- **Con linterna encendida**: Rango de hasta 11 metros, **únicamente si el jugador está orientando el foco hacia el enemigo**.
- **Disparos**: El estruendo de un disparo alerta a las criaturas en un radio de 10 metros que tengan ruta de acceso.

### Cámara Over-The-Shoulder
- Cámara fijada detrás del hombro derecho con interpolación suave (`lerp`).
- **Modo Apuntar**: Al mantener el Clic Derecho, la cámara reduce su distancia al hombro, el campo de visión se contrae de $70^\circ$ a $50^\circ$ y el paso del personaje se ralentiza para permitir disparos de precisión.
- **Protección contra colisiones**: Un rayo de detección previene que la cámara atraviese las paredes del laberinto.

### Audio Procedural con Web Audio API
- **Cortador de Plasma**: Onda diente de sierra con barrido exponencial de $1100\text{ Hz}$ a $70\text{ Hz}$ mezclada con ruido blanco filtrado en paso banda para la ionización.
- **Recarga Metálica**: Secuencia bifásica de impactos metálicos resonantes ($1400\text{ Hz}$ y $520\text{ Hz}$).
- **Desmembramiento**: Onda distorsionada a $320\text{ Hz}$ combinada con un estallido sordo de bajas frecuencias simulando la rotura de hueso y carne.
- **Gruñidos y Chillidos**: Síntesis FM con modulación de frecuencia a $40\text{ Hz}$ y barridos estridentes al iniciar la persecución.
- **Monitor Cardíaco**: Doble pulsación sub-grave (*lub-dub*) que incrementa su frecuencia cuando la vida de Isaac baja del $40\%$.

---

## 🎮 Controles

| Entrada | Acción |
| :--- | :--- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Desplazamiento relativo a la orientación |
| <kbd>Ratón</kbd> | Orientación del cuerpo (Eje Y) y cabeceo de mira |
| <kbd>Clic Derecho (Mantener)</kbd> | Modo apuntar (Zoom al hombro + mira láser) |
| <kbd>Clic Izquierdo</kbd> | Disparar rayo de plasma |
| <kbd>Shift Izquierdo</kbd> | Correr / sprint |
| <kbd>R</kbd> | Recargar cargador de plasma |
| <kbd>Q</kbd> | Inyectar botiquín (+50 de vida al RIG) |
| <kbd>F</kbd> | Encender / apagar la linterna táctica |
| <kbd>Escape</kbd> | Pausar y liberar el cursor del ratón |

---

## 🚀 Cómo Ejecutar el Proyecto

Debido a que el proyecto utiliza **JavaScript ES Modules nativos** (`import` / `export`), los navegadores modernos restringen la apertura directa mediante doble clic (`file:///`) por políticas de seguridad CORS. Requiere servirse mediante un servidor HTTP local.

### Opción 1: Con Python (Rápido y sin instalación adicional)
Abre una terminal en la carpeta del proyecto y ejecuta:
```bash
python -m http.server 8080
```
Luego abre en tu navegador: **[http://localhost:8080](http://localhost:8080)**.

### Opción 2: Con Node.js
```bash
npx serve .
```

### Opción 3: Con Visual Studio Code
Instala la extensión **Live Server**, haz clic derecho sobre `index.html` y selecciona **"Open with Live Server"**.

---

## 🛠️ Hoja de Ruta (Roadmap)

Ideas y características planificadas para próximas versiones:
- [ ] **Módulo de Éxtasis (*Stasis*)**: Proyectil temporal para ralentizar enemigos al $10\%$ durante 5 segundos.
- [ ] **Pisotón de Isaac (*The Isaac Stomp*)**: Golpe demoledor con <kbd>Espacio</kbd> para rematar enemigos en el suelo y abrir cajas de loot.
- [ ] **Rotación del Cañón (Horizontal / Vertical)**: Alternancia del modo de disparo del Cortador de Plasma con <kbd>T</kbd>.
- [ ] **Nuevos Necromorfos**:
  - *Exploder*: Criatura con saco explosivo reactivo en el brazo.
  - *Leaper*: Enemigo reptador con cola afilada capaz de saltar grandes distancias.
- [ ] **Secciones de Gravedad Cero y Descompresión**: Salto entre mamparos y temporizador de oxígeno sin sonido atmosférico.

---

*Desarrollado como prototipo técnico de alta fidelidad en WebGL y Three.js.*
