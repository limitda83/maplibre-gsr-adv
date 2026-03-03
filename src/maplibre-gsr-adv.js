import {MapboxOverlay} from '@deck.gl/mapbox';
import {ParticleAdvLayer} from './particle-adv-layer';

export const DEFAULT_RAMP_STOPS = [0.0, 0.5, 1.0, 1.5];
export const DEFAULT_RAMP_FALLBACK_COLORS = ['#5ea5fc', '#91ffab', '#ffd070', '#ff6b6b'];
export const DEFAULT_SPEED_RANGE = [0, 0.45];

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

export const DEFAULT_COMMON_OPTIONS = {
  imageUnscale: [0, 0],
  speedRange: DEFAULT_SPEED_RANGE,
  colorRamp: undefined,
  cssVarPrefix: 'adv-ramp',
  layerOptions: {},
};

export const DEFAULT_ADVANCED_OPTIONS = {
  interleaved: false,
  layerTuning: {},
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

function normalizeOptions(options = {}) {
  const hasTieredOptions = options.required || options.common || options.advanced;

  if (hasTieredOptions) {
    const required = options.required || {};
    const common = {...DEFAULT_COMMON_OPTIONS, ...(options.common || {})};
    const advanced = {...DEFAULT_ADVANCED_OPTIONS, ...(options.advanced || {})};
    return {required, common, advanced};
  }

  // Backward compatibility for flat constructor inputs.
  const {
    map,
    image,
    imageUnscale,
    bounds,
    speedRange = DEFAULT_SPEED_RANGE,
    colorRamp,
    layerOptions = {},
    cssVarPrefix = 'adv-ramp',
    interleaved = false,
    layerTuning = {},
  } = options;

  return {
    required: {map, image, bounds},
    common: {
      ...DEFAULT_COMMON_OPTIONS,
      imageUnscale: imageUnscale || DEFAULT_COMMON_OPTIONS.imageUnscale,
      speedRange,
      colorRamp,
      layerOptions,
      cssVarPrefix,
    },
    advanced: {
      ...DEFAULT_ADVANCED_OPTIONS,
      interleaved,
      layerTuning,
    },
  };
}

export class MapLibreGsrAdv {
  constructor(options = {}) {
    const {required, common, advanced} = normalizeOptions(options);
    const {map, image, bounds} = required;
    if (!map) throw new Error('map is required');
    if (!image) throw new Error('image is required');
    if (!bounds) throw new Error('bounds is required');

    this.map = map;
    this.required = {map, image, bounds};
    this.common = {...DEFAULT_COMMON_OPTIONS, ...common};
    this.advanced = {...DEFAULT_ADVANCED_OPTIONS, ...advanced};
    this.layerOptions = {...DEFAULT_LAYER_OPTIONS, ...this.common.layerOptions};
    this.colorRamp = this.common.colorRamp || getDefaultRampFromCss({cssVarPrefix: this.common.cssVarPrefix});

    this.overlay = new MapboxOverlay({interleaved: this.advanced.interleaved, layers: []});
    this.map.addControl(this.overlay);
    this.render();
  }

  render() {
    const layer = new ParticleAdvLayer({
      ...this.layerOptions,
      ...this.advanced.layerTuning,
      image: this.required.image,
      imageUnscale: this.common.imageUnscale,
      bounds: this.required.bounds,
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

  setCommonOptions(commonOptions = {}) {
    this.common = {...this.common, ...commonOptions};
    if (commonOptions.layerOptions) {
      this.layerOptions = {...this.layerOptions, ...commonOptions.layerOptions};
    }
    if (commonOptions.colorRamp) {
      this.colorRamp = [...commonOptions.colorRamp].sort((a, b) => a[0] - b[0]);
    } else if (commonOptions.cssVarPrefix) {
      this.colorRamp = getDefaultRampFromCss({cssVarPrefix: commonOptions.cssVarPrefix});
    }
    this.render();
  }

  setAdvancedOptions(advancedOptions = {}) {
    const nextAdvanced = {...this.advanced, ...advancedOptions};
    const interleavedChanged = nextAdvanced.interleaved !== this.advanced.interleaved;
    this.advanced = nextAdvanced;

    if (interleavedChanged) {
      this.map.removeControl(this.overlay);
      this.overlay = new MapboxOverlay({interleaved: this.advanced.interleaved, layers: []});
      this.map.addControl(this.overlay);
    }

    this.render();
  }

  destroy() {
    if (this.overlay) {
      this.map.removeControl(this.overlay);
      this.overlay = null;
    }
  }
}
