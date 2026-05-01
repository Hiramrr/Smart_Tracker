# 🎨 Design Prompt — Miyu Tracker Landing Page

## Objetivo
Genera el HTML + CSS + JS completo de una landing page de una sola página
para un proyecto de análisis de estadísticas competitivas de **Fortnite** y
**League of Legends**. La página debe ser completamente responsiva, moderna y
minimalista.

---

## Stack tecnológico
- HTML5 semántico
- CSS3 con variables custom (sin frameworks externos)
- JavaScript vanilla (sin dependencias)
- Google Fonts: `Space Grotesk` (headings) + `Space Mono` (código/tags)

---

## Design Tokens

```css
:root {
  /* Colores */
  --bg:         #F2EFE9;   /* crema/off-white */
  --surface:    #FFFFFF;
  --text:       #1A1A2E;   /* navy oscuro */
  --text-muted: #6B6B8A;
  --accent:     #7B5EA7;   /* violeta principal */
  --accent-dim: #C4B5E0;   /* violeta claro */
  --border:     #E0DDD7;

  /* Tipografía */
  --font-sans: 'Space Grotesk', sans-serif;
  --font-mono: 'Space Mono', monospace;

  /* Espaciado */
  --radius: 12px;
  --section-gap: 120px;
}
```

---

## Estructura de secciones (en orden)

### 1. NAV
- Fondo transparente sobre `--bg`
- Izquierda: logotipo `>_ hiramrr.` en `font-mono`, bold
- Centro-derecha: links de texto plano: `proyecto`, `fuentes`, `dashboard`, `docs`
  - El link activo tiene un subrayado violeta grueso debajo
- Extremo derecho: botón pill `🐙 GitHub` con borde `--text` y fondo blanco
- `position: sticky; top: 0; z-index: 100;`

---

### 2. HERO
Layout: dos columnas (60/40). Padding top `80px`.

**Columna izquierda:**
- Tag pequeño: `[ fortnite & league of legends stats ]`
  - Fuente mono, tamaño 13px, color `--text-muted`, sin fondo, solo texto entre brackets
- H1 en dos líneas:
- Tamaño: `clamp(40px, 6vw, 72px)`, weight 700
- "el juego." en color `--accent`
- Párrafo subtítulo: 16px, color `--text-muted`, max-width 380px
- Dos CTAs:
- Primario: `conoce el proyecto →` — fondo `--text`, texto blanco, padding `14px 28px`, border-radius `8px`
- Secundario: `ver fuentes` — solo texto con subrayado animado en hover

**Columna derecha:**
- Dos elementos flotantes posicionados con `position: absolute` dentro de un contenedor relativo:
- Llama de Fortnite (svg o img placeholder circular con gradiente violeta)
- Logo de League of Legends (círculo oscuro con la "L" estilizada)
- Añadir decoradores: `+` pequeños, puntos y líneas curvas SVG en `--accent-dim`
- Efecto: `animation: float 6s ease-in-out infinite` con `translateY(-12px)`

---

### 3. FEATURE STRIP
- Fondo `--surface`, borde top y bottom `1px solid --border`
- 4 columnas en flex, separadas por bordes verticales
- Items:
1. `+` icon — "Enfocado en rendimiento. Impulsado por **datos**." (datos en violeta)
2. 📊 — **métricas clave** / "Win rate, KDA, daño, visión, posiciones y más."
3. 🛡 — **análisis competitivo** / "Comparativas, leaderboards y seguimiento."
4. 🔄 — **actualizaciones constantes** / "Datos actualizados desde APIs oficiales."
- Padding `32px 48px`

---

### 4. DATA SOURCES
Layout: columna izquierda (texto) + dos tarjetas derecha.

**Texto izquierdo:**
- Tag: `[ fuentes de datos ]`
- H2: "múltiples fuentes, datos confiables."
- Párrafo: 15px, muted
- Link: `ver todas las fuentes →` en violeta

**Tarjeta FORTNITE** (fondo blanco, border `--border`, radius `--radius`):
- Header: círculo violeta con "F" blanca + label "FORTNITE" en mayúsculas
- Lista con checkmarks violetas:
- Estadísticas de jugadores
- Torneos y leaderboards
- Historial de partidas
- Objetos y cosméticos
- Footer: pill button `+ 4 fuentes` con borde

**Tarjeta LEAGUE OF LEGENDS** (igual estructura):
- Header: círculo oscuro con logo LoL + "LEAGUE OF LEGENDS"
- Lista:
- Ranked y leaderboards
- Historial de partidas
- Datos de campeones
- Partidas en tiempo real
- Footer: pill `Riot Games API`

---

### 5. WHAT YOU CAN DO
- Tag: `[ qué puedes hacer ]`
- H2: "convierte datos en **ventaja**." (ventaja en violeta)
- Párrafo descripción
- Link: `explorar dashboard →`
- 4 columnas de features (iconos outline + título + descripción):
1. 👥 **compara jugadores** — "Compara rendimiento entre jugadores, equipos o regiones con métricas clave."
2. 📈 **sigue tu evolución** — "Visualiza tu progreso a lo largo del tiempo y detecta patrones de mejora."
3. 🏆 **torneos y rankings** — "Explora torneos, rankings y estadísticas competitivas actualizadas."
4. 🎯 **decisiones informadas** — "Usa datos reales para tomar mejores decisiones dentro y fuera del juego."

---

### 6. CTA FINAL
- Fondo `--bg`, dos columnas
- H2: "hecho por jugadores, para **jugadores**." (jugadores en violeta)
- Derecha: párrafo + botón `ver en GitHub →` (fondo `--text`, texto blanco, flecha)
- Decoradores: mismas líneas curvas SVG del hero

---

### 7. FOOTER
- Borde top `--border`
- Izquierda: `>_ hiramrr.` + "© 2024 hiramrr. todos los derechos reservados."
- Derecha: links `docs`, `privacidad`, `contacto`
- Fondo `--bg`

---

## Interacciones CSS

```css
/* Hover en links nav */
nav a:hover { color: var(--accent); }

/* Float animation para hero graphics */
@keyframes float {
0%, 100% { transform: translateY(0); }
50%       { transform: translateY(-14px); }
}

/* Hover tarjetas */
.card:hover {
box-shadow: 0 8px 32px rgba(123, 94, 167, 0.12);
transform: translateY(-4px);
transition: all 0.3s ease;
}

/* CTA primario hover */
.btn-primary:hover {
background: var(--accent);
transition: background 0.2s ease;
}
```

---

## Responsividad

| Breakpoint | Cambios |
|---|---|
| `< 1024px` | Hero pasa a 1 columna, ocultar gráfico derecho |
| `< 768px` | Nav colapsa a hamburger menu, feature strip a 2 cols |
| `< 480px` | Todo en 1 col, fuente H1 reduce a 32px |

---

## Notas adicionales
- Usar `scroll-behavior: smooth`
- Aplicar `font-feature-settings: "ss01"` para Space Grotesk
- Los decoradores `+` y puntos se generan con `::before`/`::after` en CSS
- Sin imágenes externas: usar SVG inline o CSS shapes para el llama y logo LoL
- La paleta completa debe sentirse **editorial**, como una revista de esports
