import {MapboxOverlay} from '@deck.gl/mapbox';
import {ParticleAdvLayer} from './particle-adv-layer';

export const DEFAULT_RAMP_STOPS = [0.0, 0.5, 1.0, 1.5];
export const DEFAULT_RAMP_FALLBACK_COLORS = ['#5ea5fc', '#91ffab', '#ffd070', '#ff6b6b'];

export const DEFAULT_LAYER_OPTIONS = {
  id: 'maplibre-gsr-adv-particle',
  numParticles: 9000,
  maxAge: 80,
  speedFactor: 200,
  width: 1.9,
  opacity: 0.9,
  colorScale: 1.0,
  color: [255, 255, 255],
  animate: true,
};

function hexToRgba(hex, fallback) {
  const text = `${hex}`.trim();
  const parsed = /^#([0-9a-fA-F]{6})$/.exec(text);
  if (!parsed) return fallback;
  const value = Number.parseInt(parsed[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function getCssColor(css, index, cssVarPrefix, fallback) {
  const cssHex = css.getPropertyValue(`--${cssVarPrefix}-${index}`);
  return hexToRgba(cssHex, fallback);
}

export function getDefaultRampFromCss(options = {}) {
  const {cssVarPrefix = 'adv-ramp'} = options;
  const css = getComputedStyle(document.documentElement);
  return DEFAULT_RAMP_STOPS.map((stop, i) => {
    const fallback = hexToRgba(DEFAULT_RAMP_FALLBACK_COLORS[i], [255, 255, 255, 255]);
    return [stop, getCssColor(css, i, cssVarPrefix, fallback)];
  });
}

export class MapLibreGsrAdv {
  constructor({map, image, imageUnscale, bounds, speedRange = [0, 0.45], colorRamp, layerOptions = {}, cssVarPrefix = 'adv-ramp'}) {
    if (!map) throw new Error('map is required');
    if (!image) throw new Error('image is required');
    if (!bounds) throw new Error('bounds is required');

    this.map = map;
    this.common = {image, imageUnscale, bounds, speedRange};
    this.layerOptions = {...DEFAULT_LAYER_OPTIONS, ...layerOptions};
    this.colorRamp = colorRamp || getDefaultRampFromCss({cssVarPrefix});

    this.overlay = new MapboxOverlay({interleaved: false, layers: []});
    this.map.addControl(this.overlay);
    this.render();
  }

  render() {
    const layer = new ParticleAdvLayer({
      ...this.layerOptions,
      image: this.common.image,
      imageUnscale: this.common.imageUnscale,
      bounds: this.common.bounds,
      speedRange: this.common.speedRange,
      colorRamp: this.colorRamp,
    });

    this.overlay.setProps({layers: [layer]});
  }

  setSpeedRange(speedRange) {
    this.common.speedRange = speedRange;
    this.render();
  }

  setColorRamp(colorRamp) {
    this.colorRamp = [...colorRamp].sort((a, b) => a[0] - b[0]);
    this.render();
  }

  setLayerOptions(layerOptions) {
    this.layerOptions = {...this.layerOptions, ...layerOptions};
    this.render();
  }

  destroy() {
    if (this.overlay) {
      this.map.removeControl(this.overlay);
      this.overlay = null;
    }
  }
}
