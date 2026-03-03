import {LineLayer} from '@deck.gl/layers';
import {isWebGL2, Buffer, Texture2D, Transform} from '@luma.gl/core';
import updateTransformVs from 'deck.gl-particle/src/particle-layer-update-transform.vs.glsl';

const FPS = 30;
const COLOR_RAMP_WIDTH = 256;
const DEFAULT_COLOR = [255, 255, 255, 255];
const DEFAULT_RAMP = [
  [0.0, [94, 165, 252, 255]],
  [0.45, [145, 255, 171, 255]],
  [0.75, [255, 208, 112, 255]],
  [1.0, [255, 107, 107, 255]],
];

function modulo(x, y) {
  return ((x % y) + y) % y;
}

function wrapLongitude(lng, minLng) {
  let wrapped = modulo(lng + 180, 360) - 180;
  if (typeof minLng === 'number' && wrapped < minLng) {
    wrapped += 360;
  }
  return wrapped;
}

function isViewportGlobe() {
  return false;
}

function getViewportGlobeCenter() {
  return null;
}

function getViewportGlobeRadius() {
  return null;
}

function getViewportBounds(viewport) {
  if (!viewport?.getBounds) return null;
  if (isViewportGlobe(viewport)) return null;
  const bounds = viewport.getBounds();
  const minLng = bounds[2] - bounds[0] < 360 ? wrapLongitude(bounds[0]) : -180;
  const maxLng = bounds[2] - bounds[0] < 360 ? wrapLongitude(bounds[2], minLng) : 180;
  const minLat = Math.max(bounds[1], -85.051129);
  const maxLat = Math.min(bounds[3], 85.051129);
  return [minLng, minLat, maxLng, maxLat];
}

const defaultProps = {
  ...LineLayer.defaultProps,

  image: {type: 'image', value: null, async: true},
  imageUnscale: {type: 'array', value: null},

  numParticles: {type: 'number', min: 1, max: 1000000, value: 5000},
  maxAge: {type: 'number', min: 1, max: 255, value: 100},
  speedFactor: {type: 'number', min: 0, max: 1, value: 1},

  color: {type: 'color', value: DEFAULT_COLOR},
  colorRamp: {type: 'array', value: DEFAULT_RAMP, compare: true},
  speedRange: {type: 'array', value: [0, 30], compare: true},
  colorScale: {type: 'number', value: 1},
  width: {type: 'number', value: 1},
  animate: true,

  bounds: {type: 'array', value: [-180, -90, 180, 90], compare: true},
  wrapLongitude: true,
};

function createColorRampData(colorRamp) {
  const data = new Uint8Array(COLOR_RAMP_WIDTH * 4);
  const sorted = [...colorRamp].sort((a, b) => a[0] - b[0]);

  for (let i = 0; i < COLOR_RAMP_WIDTH; i++) {
    const t = i / (COLOR_RAMP_WIDTH - 1);
    let c = sorted[0][1];

    for (let j = 0; j < sorted.length - 1; j++) {
      const [t0, c0] = sorted[j];
      const [t1, c1] = sorted[j + 1];
      if (t >= t0 && t <= t1) {
        const lt = (t - t0) / Math.max(t1 - t0, 1e-6);
        c = [
          Math.round(c0[0] + (c1[0] - c0[0]) * lt),
          Math.round(c0[1] + (c1[1] - c0[1]) * lt),
          Math.round(c0[2] + (c1[2] - c0[2]) * lt),
          Math.round((c0[3] ?? 255) + ((c1[3] ?? 255) - (c0[3] ?? 255)) * lt),
        ];
        break;
      }
    }

    if (t > sorted[sorted.length - 1][0]) {
      c = sorted[sorted.length - 1][1];
    }

    data[i * 4] = c[0];
    data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = c[3] ?? 255;
  }

  return data;
}

export class ParticleAdvLayer extends LineLayer {
  getShaders() {
    return {
      ...super.getShaders(),
      inject: {
        'vs:#decl': `
          varying float drop;
          varying vec4 vSpeedColor;
          const vec2 DROP_POSITION = vec2(0);
          uniform sampler2D advColorRampTexture;
          uniform vec2 advSpeedRange;
          uniform float advColorScale;
          uniform float advZoomCompensation;
        `,
        'vs:#main-start': `
          drop = float(instanceSourcePositions.xy == DROP_POSITION || instanceTargetPositions.xy == DROP_POSITION);
          float speed = distance(instanceTargetPositions.xy, instanceSourcePositions.xy) * advColorScale * advZoomCompensation;
          float denom = max(advSpeedRange.y - advSpeedRange.x, 0.000001);
          float speedNorm = clamp((speed - advSpeedRange.x) / denom, 0.0, 1.0);
          speedNorm = pow(speedNorm, 0.75);
          vSpeedColor = texture2D(advColorRampTexture, vec2(speedNorm, 0.5));
        `,
        'fs:#decl': `
          varying float drop;
          varying vec4 vSpeedColor;
        `,
        'fs:#main-start': `
          if (drop > 0.5) discard;
        `,
        'fs:DECKGL_FILTER_COLOR': `
          color = vSpeedColor;
          color.a *= geometry.uv.x;
        `,
      },
    };
  }

  initializeState() {
    const {gl} = this.context;
    if (!isWebGL2(gl)) {
      throw new Error('WebGL 2 is required');
    }

    super.initializeState({});
    this._setupTransformFeedback();

    const attributeManager = this.getAttributeManager();
    attributeManager.remove(['instanceSourcePositions', 'instanceTargetPositions', 'instanceColors', 'instanceWidths']);
  }

  updateState({props, oldProps, changeFlags}) {
    const {numParticles, maxAge, color, width, colorRamp} = props;
    super.updateState({props, oldProps, changeFlags});

    if (!numParticles || !maxAge || !width) {
      this._deleteTransformFeedback();
      return;
    }

    if (
      numParticles !== oldProps.numParticles ||
      maxAge !== oldProps.maxAge ||
      color[0] !== oldProps.color[0] ||
      color[1] !== oldProps.color[1] ||
      color[2] !== oldProps.color[2] ||
      color[3] !== oldProps.color[3] ||
      width !== oldProps.width ||
      colorRamp !== oldProps.colorRamp
    ) {
      this._setupTransformFeedback();
    }
  }

  finalizeState() {
    this._deleteTransformFeedback();
    super.finalizeState();
  }

  draw({uniforms}) {
    const {gl} = this.context;
    if (!isWebGL2(gl)) return;

    const {initialized} = this.state;
    if (!initialized) return;

    const {animate} = this.props;
    const {
      sourcePositions,
      targetPositions,
      sourcePositions64Low,
      targetPositions64Low,
      colors,
      widths,
      model,
      colorRampTexture,
    } = this.state;

    model.setAttributes({
      instanceSourcePositions: sourcePositions,
      instanceTargetPositions: targetPositions,
      instanceSourcePositions64Low: sourcePositions64Low,
      instanceTargetPositions64Low: targetPositions64Low,
      instanceColors: colors,
      instanceWidths: widths,
    });

    const {viewport} = this.context;
    const {colorScale, speedRange, speedFactor} = this.props;
    const zoomCompensation = (2 ** ((viewport?.zoom ?? 0) + 7)) / Math.max(speedFactor || 1, 1e-6);

    super.draw({
      uniforms: {
        ...uniforms,
        advColorRampTexture: colorRampTexture,
        advSpeedRange: speedRange || [0, 30],
        advColorScale: colorScale,
        advZoomCompensation: zoomCompensation,
      },
    });

    if (animate) this.requestStep();
  }

  _setupTransformFeedback() {
    const {gl} = this.context;
    if (!isWebGL2(gl)) return;

    const {initialized} = this.state;
    if (initialized) this._deleteTransformFeedback();

    const {numParticles, maxAge, color, width, colorRamp} = this.props;

    const numInstances = numParticles * maxAge;
    const numAgedInstances = numParticles * (maxAge - 1);
    const sourcePositions = new Buffer(gl, new Float32Array(numInstances * 3));
    const targetPositions = new Buffer(gl, new Float32Array(numInstances * 3));
    const sourcePositions64Low = new Float32Array([0, 0, 0]);
    const targetPositions64Low = new Float32Array([0, 0, 0]);
    const colors = new Buffer(
      gl,
      new Float32Array(
        new Array(numInstances)
          .fill(undefined)
          .map((_, i) => {
            const age = Math.floor(i / numParticles);
            return [color[0], color[1], color[2], (color[3] ?? 255) * (1 - age / maxAge)].map((d) => d / 255);
          })
          .flat(),
      ),
    );
    const widths = new Float32Array([width]);

    const rampData = createColorRampData(colorRamp || DEFAULT_RAMP);
    const colorRampTexture = new Texture2D(gl, {
      width: COLOR_RAMP_WIDTH,
      height: 1,
      data: rampData,
      parameters: {
        [gl.TEXTURE_MIN_FILTER]: gl.LINEAR,
        [gl.TEXTURE_MAG_FILTER]: gl.LINEAR,
        [gl.TEXTURE_WRAP_S]: gl.CLAMP_TO_EDGE,
        [gl.TEXTURE_WRAP_T]: gl.CLAMP_TO_EDGE,
      },
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      mipmaps: false,
    });

    const transform = new Transform(gl, {
      sourceBuffers: { sourcePosition: sourcePositions },
      feedbackBuffers: { targetPosition: targetPositions },
      feedbackMap: { sourcePosition: 'targetPosition' },
      vs: updateTransformVs,
      elementCount: numParticles,
    });

    this.setState({
      initialized: true,
      numInstances,
      numAgedInstances,
      sourcePositions,
      targetPositions,
      sourcePositions64Low,
      targetPositions64Low,
      colors,
      widths,
      transform,
      colorRampTexture,
    });
  }

  _runTransformFeedback() {
    const {gl} = this.context;
    if (!isWebGL2(gl)) return;
    const {initialized} = this.state;
    if (!initialized) return;

    const {viewport, timeline} = this.context;
    const {image, imageUnscale, bounds, numParticles, speedFactor, maxAge} = this.props;
    const {numAgedInstances, transform, previousViewportZoom, previousTime} = this.state;
    const time = timeline.getTime();
    if (!image || time === previousTime) return;

    const viewportGlobe = isViewportGlobe(viewport);
    const viewportGlobeCenter = getViewportGlobeCenter(viewport);
    const viewportGlobeRadius = getViewportGlobeRadius(viewport);
    const viewportBounds = getViewportBounds(viewport) || bounds;
    const viewportZoomChangeFactor = 2 ** ((previousViewportZoom - viewport.zoom) * 4);
    const currentSpeedFactor = speedFactor / 2 ** (viewport.zoom + 7);

    const uniforms = {
      viewportGlobe,
      viewportGlobeCenter: viewportGlobeCenter || [0, 0],
      viewportGlobeRadius: viewportGlobeRadius || 0,
      viewportBounds: viewportBounds || bounds,
      viewportZoomChangeFactor: viewportZoomChangeFactor || 0,
      bitmapTexture: image,
      imageUnscale: imageUnscale || [0, 0],
      bounds,
      numParticles,
      maxAge,
      speedFactor: currentSpeedFactor,
      time,
      seed: Math.random(),
    };

    transform.run({uniforms});

    const sourcePositions = transform.bufferTransform.bindings[transform.bufferTransform.currentIndex].sourceBuffers.sourcePosition;
    const targetPositions = transform.bufferTransform.bindings[transform.bufferTransform.currentIndex].feedbackBuffers.targetPosition;
    sourcePositions.copyData({
      sourceBuffer: targetPositions,
      readOffset: 0,
      writeOffset: numParticles * 4 * 3,
      size: numAgedInstances * 4 * 3,
    });

    transform.swap();

    this.state.previousViewportZoom = viewport.zoom;
    this.state.previousTime = time;
  }

  _resetTransformFeedback() {
    const {gl} = this.context;
    if (!isWebGL2(gl)) return;
    const {initialized} = this.state;
    if (!initialized) return;
    const {numInstances, sourcePositions, targetPositions} = this.state;
    sourcePositions.subData({data: new Float32Array(numInstances * 3)});
    targetPositions.subData({data: new Float32Array(numInstances * 3)});
  }

  _deleteTransformFeedback() {
    const {gl} = this.context;
    if (!isWebGL2(gl)) return;
    const {initialized} = this.state;
    if (!initialized) return;
    const {sourcePositions, targetPositions, colors, transform, colorRampTexture} = this.state;
    sourcePositions.delete();
    targetPositions.delete();
    colors.delete();
    transform.delete();
    colorRampTexture?.delete?.();

    this.setState({
      initialized: false,
      sourcePositions: undefined,
      targetPositions: undefined,
      sourcePositions64Low: undefined,
      targetPositions64Low: undefined,
      colors: undefined,
      widths: undefined,
      transform: undefined,
      colorRampTexture: undefined,
    });
  }

  requestStep() {
    const {stepRequested} = this.state;
    if (stepRequested) return;

    this.state.stepRequested = true;
    setTimeout(() => {
      this.step();
      this.state.stepRequested = false;
    }, 1000 / FPS);
  }

  step() {
    this._runTransformFeedback();
    this.setNeedsRedraw();
  }

  clear() {
    this._resetTransformFeedback();
    this.setNeedsRedraw();
  }
}

ParticleAdvLayer.layerName = 'ParticleAdvLayer';
ParticleAdvLayer.defaultProps = defaultProps;
