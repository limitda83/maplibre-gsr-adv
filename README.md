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
- `required`: `{ map, image, bounds }` (필수)
- `common`: `{ imageUnscale?, speedRange?, colorRamp?, cssVarPrefix?, layerOptions? }`
- `advanced`: `{ interleaved?, layerTuning? }`
- `setSpeedRange([min, max])`
- `setColorRamp([[stop, [r,g,b,a]], ...])`
- `setLayerOptions({ ... })`
- `setCommonOptions({ ... })`
- `setAdvancedOptions({ ... })`
- `destroy()`

### Layer Tuning (advanced.layerTuning)

`layerTuning`은 엔진 레벨 파라미터입니다. 기본 사용자에게는 `common.layerOptions`만 권장합니다.

- `frameRate` (default: `30`)
- `colorRampWidth` (default: `256`)
- `speedGamma` (default: `0.75`)
- `epsilon` (default: `1e-6`)
- `zoomBase` (default: `7`)
- `zoomChangeFactor` (default: `4`)
- `mercatorMaxLat` (default: `85.051129`)

### Backward Compatibility

기존 flat 생성자 입력도 계속 동작합니다.

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

## Build

```bash
npm install
npm run build
```

Publish the `dist/` artifacts to npm or GitHub Packages.
