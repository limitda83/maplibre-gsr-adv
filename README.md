# maplibre-gsr-adv

Particle advection layer library for MapLibre.

- `MapLibre + deck.gl` integration
- Velocity-based color ramp
- Default color palette controlled by CSS variables

## Install

```bash
npm install git+https://github.com/limitda83/maplibre-gsr-adv.git \
  @deck.gl/core @deck.gl/layers @deck.gl/mapbox @luma.gl/core maplibre-gl
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
  required: {
    map,
    image,
    bounds: meta.bbox,
  },
  common: {
    imageUnscale: meta.imageUnscale,
    speedRange: [0, 0.45],
    layerOptions: {
      numParticles: 9000,
      maxAge: 80,
      speedFactor: 200,
      width: 1.9,
      opacity: 0.9,
      colorScale: 1.0,
    },
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

- `new MapLibreGsrAdv({ required, common?, advanced? })`
- `required`: `{ map, image, bounds }` (required)
- `common`: `{ imageUnscale?, speedRange?, colorRamp?, cssVarPrefix?, layerOptions? }`
- `advanced`: `{ interleaved?, layerTuning? }`
- `setSpeedRange([min, max])`
- `setColorRamp([[stop, [r,g,b,a]], ...])`
- `setLayerOptions({ ... })`
- `setCommonOptions({ ... })`
- `setAdvancedOptions({ ... })`
- `destroy()`

### Layer Tuning (advanced.layerTuning)

`layerTuning` contains engine-level parameters. For most users, `common.layerOptions` is recommended.

- `frameRate` (default: `30`)
- `colorRampWidth` (default: `256`)
- `speedGamma` (default: `0.75`)
- `epsilon` (default: `1e-6`)
- `zoomBase` (default: `7`)
- `zoomChangeFactor` (default: `4`)
- `mercatorMaxLat` (default: `85.051129`)

### Backward Compatibility

The existing flat constructor input remains supported.

```js
new MapLibreGsrAdv({
  map,
  image,
  bounds,
  imageUnscale,
  speedRange,
  colorRamp,
  layerOptions,
  cssVarPrefix,
});
```

## License

- Main project: MIT ([LICENSE](./LICENSE))
- Third-party included/adapted code:
  - `deck.gl-particle` (MPL-2.0)
  - See [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)

## Build

```bash
npm install
npm run build
```
