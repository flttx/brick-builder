---
name: Brick Builder Prototype
description: A precise, connector-aware workbench for making two bricks feel tangible.
colors:
  graphite: "#111619"
  chrome: "#293335"
  desk: "#7d8584"
  amber: "#f6c453"
  signal-blue: "#2f79c5"
  signal-red: "#d84b43"
  paper: "#e4e9e8"
  muted: "#9ba9a8"
typography:
  title:
    fontFamily: "Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.2
  body:
    fontFamily: "Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.13em"
rounded:
  none: "0px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  circle: "50%"
spacing:
  xs: "5px"
  sm: "8px"
  md: "16px"
  lg: "32px"
components:
  tool-button:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 11px"
    height: "34px"
  debug-panel:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "17px 16px 15px"
---

# Design System: Brick Builder Prototype

## Overview

**Creative North Star: "The Digital Brick Workbench"**

The interface is a quiet digital workbench wrapped around a tactile 3D desk. Graphite controls and chalk-gray ground keep attention on the saturated physical objects; amber is reserved for focus, active tools, save state, and decisions. The visual system is canvas-first rather than a debug console or marketing surface.

The page uses hard-edged utility chrome, dense readouts, and a full-viewport work surface. Depth belongs to the Three.js scene through plastic highlights, contact shadows, and the ground grid; UI depth comes from tonal layering and a restrained ambient shadow.

**Key Characteristics:**

- Dark graphite control rail over a chalk-gray 3D desk.
- Amber as a precise state signal, not decoration.
- Rounded utility surfaces and compact, legible labels.
- Saturated blue and red procedural bricks as the visual anchors.

## Colors

The palette pairs a cool instrument shell with warm amber diagnostics and two unmistakable brick signals.

### Primary

- **Calibration Amber** (#f6c453): Selection, active tool affordances, and runtime values that need attention.

### Secondary

- **Signal Blue** (#2f79c5): The initial blue 2×4 Brick instance.
- **Signal Red** (#d84b43): The initial red 2×4 Brick instance and invalid collision signal.

### Neutral

- **Graphite** (#111619): Page background and deepest utility surface.
- **Chrome** (#293335): Interactive controls and metric cards.
- **Chalk Desk** (#7d8584): The 3D work surface.
- **Paper** (#e4e9e8): Primary UI text.
- **Muted Chrome** (#9ba9a8): Secondary labels, hints, and dividers.

**The Rare Accent Rule.** Amber marks a state change, focus, or measured decision; it does not fill ordinary surfaces.

## Typography

**Display Font:** Segoe UI (with Helvetica Neue, Arial, sans-serif fallbacks)

**Body Font:** Segoe UI (with Helvetica Neue, Arial, sans-serif fallbacks)

**Label/Mono Font:** The same system sans family, using tabular numerals where metrics are shown.

**Character:** Neutral, compact, and legible at a glance. Uppercase tracking creates a workbench instrument language without turning the prototype into a promotional page.

### Hierarchy

- **Title** (500, 16px, 1.2): Panel and workbench titles.
- **Body** (400, 11px, 1.45): Readouts, hints, and state descriptions.
- **Label** (650, 10px, 0.13em, uppercase): Section labels, status markers, and keyboard hints.

## Layout

The product has three explicit surfaces: Auth at `/login`, My Builds at `/my-builds`, and the Editor at `/projects/:id`. The Editor gives the 3D scene the full viewport, with an inset top rail, a narrow left tool rail, contextual left drawers, a selected-object toolbar, and a hidden-by-default developer drawer on the right. On narrow screens the tool rail becomes a fixed bottom bar and drawers become full-width sheets.

Spacing follows a compact 5/8/16/32px rhythm. The layout preserves a clear uninterrupted center for direct manipulation; controls are opaque enough to remain readable over the scene.

## Elevation & Depth

The system uses a hybrid of tonal layering in the UI and physically readable depth in the scene. Utility surfaces use dark tonal separation and a restrained `0 12px 32px rgba(14, 18, 19, 0.16)` ambient shadow. The scene uses PBR plastic, directional lighting, soft shadows, and a gray grid; no bloom or decorative post-processing is used.

**The Scene-First Depth Rule.** Use lighting and contact shadow to explain the bricks; keep interface elevation quiet so it never competes with manipulation.

## Shapes

UI controls and panels use 8–18px radii, with thin cool-gray borders and visible amber focus rings. The circular save-status dot is a recurring state shape; circular studs belong to the brick geometry, not the interface system.

## Components

### Buttons

- **Shape:** Compact, rounded, and touch-safe (8–14px radius, 34–46px height).
- **Tool buttons:** Chrome background, paper text, 0 11px horizontal padding.
- **Hover / Focus:** Border and text shift to calibration amber; keyboard focus adds a 2px amber outline.
- **Disabled:** Reduced opacity and a not-allowed cursor; no misleading active color.

### Cards / Containers

- **Corner Style:** 8px controls, 14px rails/drawers, 18px auth and empty states.
- **Background:** Graphite or chrome tonal surfaces.
- **Shadow Strategy:** Ambient shadow only for floating rails and panels.
- **Border:** 1px cool-gray line at low opacity.
- **Internal Padding:** 8px metric cells, 16px panel rhythm.

### Navigation

- **Style:** A compact top utility rail, not a marketing navbar. Auth and My Builds own their own lightweight top bar.
- **Typography:** Brand kicker and status in tracked uppercase labels; workbench title in sentence case.
- **States:** Live status uses a green dot; actions use amber on hover/focus.

### Signature Component

**Contextual workbench:** Parts, Bucket, Color, Settings, and Precision Connect are progressive tools opened from one manager so only one drawer is active. The save status is always visible; the developer drawer exposes runtime readouts and the required scene/performance/engine/snap/collision/assets/persistence/network/faults tabs only in development.

## Do's and Don'ts

### Do:

- **Do** keep the center viewport clear for picking and dragging.
- **Do** use amber to explain active state, candidate lock, or a focused control.
- **Do** preserve restrained dark utility chrome, rounded layers, and compact labels.
- **Do** make important state legible in text as well as color.

### Don't:

- **Don't** add gradients, bloom, marketing hero copy, or ornamental navigation to this prototype surface.
- **Don't** use emoji, icon fonts, or ambiguous glyph-only controls when an inline SVG or accessible label is available.
- **Don't** let debug layers become the default visual treatment for every brick, or expose the developer drawer in release builds.
- **Don't** replace the physical brick colors with neutral placeholder geometry.
