# maplibre-gsr-adv

Particle advection layer library for MapLibre.

- `MapLibre + deck.gl` integration
- Velocity-based color ramp
- Default color palette controlled by CSS variables

## Install

```bash
npm install maplibre-gsr-adv @deck.gl/core @deck.gl/layers @deck.gl/mapbox @luma.gl/core maplibre-gl
```

## Quick Start

```js
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gsr-adv/ramp.css';
import {MapLibreGsrAdv} from 'maplibre-gsr-adv';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [135, 39],
  zoom: 3,
});

const image = await loadImage('/generated/wind_texture.png');
const meta = await fetch('/generated/wind_meta.json').then((r) => r.json());

const adv = new MapLibreGsrAdv({
  map,
  image,
  imageUnscale: meta.imageUnscale,
  bounds: meta.bbox,
  speedRange: [0, 0.45],
  layerOptions: {
    numParticles: 9000,
    maxAge: 80,
    speedFactor: 200,
    width: 1.9,
    opacity: 0.9,
    colorScale: 1.0,
  },
});

adv.setSpeedRange([0, 0.35]);
adv.setLayerOptions({numParticles: 12000});
```

## CSS Ramp Colors

Copy or override `src/ramp.css` to change the default colors.

```css
:root {
  --adv-ramp-0: #5ea5fc;
  --adv-ramp-1: #91ffab;
  --adv-ramp-2: #ffd070;
  --adv-ramp-3: #ff6b6b;
}
```

## API

- `new MapLibreGsrAdv({ map, image, imageUnscale, bounds, speedRange?, colorRamp?, layerOptions?, cssVarPrefix? })`
- `setSpeedRange([min, max])`
- `setColorRamp([[stop, [r,g,b,a]], ...])`
- `setLayerOptions({ ... })`
- `destroy()`

## Build

```bash
npm install
npm run build
```

Publish the `dist/` artifacts to npm or GitHub Packages.
