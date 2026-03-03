import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/ramp.css';
import {fromUrl} from 'geotiff';
import {MapLibreGsrAdv} from '../src/maplibre-gsr-adv.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

async function tiffToVelocityTexture(tiffUrl) {
  const tiff = await fromUrl(tiffUrl);
  const image = await tiff.getImage();
  const [u, v] = await image.readRasters({samples: [0, 1]});
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const width = image.getWidth();
  const height = image.getHeight();

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < u.length; i++) {
    const uu = u[i];
    const vv = v[i];
    if (!Number.isFinite(uu) || !Number.isFinite(vv)) continue;
    if (uu < minVal) minVal = uu;
    if (vv < minVal) minVal = vv;
    if (uu > maxVal) maxVal = uu;
    if (vv > maxVal) maxVal = vv;
  }

  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal === maxVal) {
    throw new Error('Invalid TIFF values: cannot infer imageUnscale range');
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < u.length; i++) {
    const uu = u[i];
    const vv = v[i];
    const p = i * 4;

    if (!Number.isFinite(uu) || !Number.isFinite(vv)) {
      pixels[p + 0] = 0;
      pixels[p + 1] = 0;
      pixels[p + 2] = 0;
      pixels[p + 3] = 0;
      continue;
    }

    pixels[p + 0] = Math.round(clamp01((uu - minVal) / (maxVal - minVal)) * 255);
    pixels[p + 1] = Math.round(clamp01((vv - minVal) / (maxVal - minVal)) * 255);
    pixels[p + 2] = 0;
    pixels[p + 3] = 255;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: false});
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);

  return {
    image: canvas,
    bounds: [minX, minY, maxX, maxY],
    imageUnscale: [minVal, maxVal],
  };
}

function setStatus(text) {
  const node = document.getElementById('status');
  node.textContent = text;
}

async function main() {
  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [137.5, 39.0],
    zoom: 4.5,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', async () => {
    try {
      const {image, bounds, imageUnscale} = await tiffToVelocityTexture('./data/myocean_rea_2023010112.tif');
      const centerLng = (bounds[0] + bounds[2]) / 2;
      const centerLat = (bounds[1] + bounds[3]) / 2;
      map.setCenter([centerLng, centerLat]);

      new MapLibreGsrAdv({
        required: {
          map,
          image,
          bounds,
        },
        common: {
          imageUnscale,
          speedRange: [0, 0.3],
          layerOptions: {
            numParticles: 3000,
            maxAge: 45,
            speedFactor: 220,
            width: 1.2,
            opacity: 0.35,
            colorScale: 0.5,
          },
        },
      });

      setStatus(`Loaded: bbox=${bounds.join(', ')} / unscale=[${imageUnscale[0].toFixed(4)}, ${imageUnscale[1].toFixed(4)}]`);
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  });
}

main();
