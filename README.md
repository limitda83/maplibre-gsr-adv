# maplibre-gsr-adv

MapLibre 기반 파티클 어드벡션 레이어 라이브러리입니다.

- `MapLibre + deck.gl` 조합
- 유속 기반 컬러 램프
- CSS 변수로 기본 컬러 팔레트 제어

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

// 필요 시 런타임 제어
adv.setSpeedRange([0, 0.35]);
adv.setLayerOptions({numParticles: 12000});
```

## CSS Ramp Colors

`src/ramp.css`를 복사하거나 오버라이드해서 기본 컬러를 바꿉니다.

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

`dist/` 산출물을 npm publish 또는 GitHub package로 배포하면 됩니다.
