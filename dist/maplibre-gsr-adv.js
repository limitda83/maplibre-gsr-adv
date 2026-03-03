import { MapboxOverlay as F } from "@deck.gl/mapbox";
import { LineLayer as A } from "@deck.gl/layers";
import { isWebGL2 as f, Buffer as R, Texture2D as C, Transform as D } from "@luma.gl/core";
const M = `#version 300 es
#define SHADER_NAME particle-layer-update-transform-vertex-shader

precision highp float;

in vec3 sourcePosition;
out vec3 targetPosition;

uniform bool viewportGlobe;
uniform vec2 viewportGlobeCenter;
uniform float viewportGlobeRadius;
uniform vec4 viewportBounds;
uniform float viewportZoomChangeFactor;

uniform sampler2D bitmapTexture;
uniform vec2 imageUnscale;
uniform vec4 bounds;

uniform float numParticles;
uniform float maxAge;
uniform float speedFactor;

uniform float time;
uniform float seed;

const vec2 DROP_POSITION = vec2(0);

bool isNaN(float value) {
  return !(value <= 0. || 0. <= value);
}

// see https://stackoverflow.com/a/27228836/1823988
float atan2(float y, float x) {
  return x == 0. ? sign(y) * PI / 2. : atan(y, x);
}

// see https://github.com/chrisveness/geodesy/blob/master/latlon-spherical.js#L187
float distanceTo(vec2 from, vec2 point) {
  float y1 = radians(from.y);
  float x1 = radians(from.x);
  float y2 = radians(point.y);
  float x2 = radians(point.x);
  float dy = y2 - y1;
  float dx = x2 - x1;

  float a = sin(dy / 2.) * sin(dy / 2.) + cos(y1) * cos(y2) * sin(dx / 2.) * sin(dx / 2.);
  float c = 2. * atan2(sqrt(a), sqrt(1. - a));
  float d = EARTH_RADIUS * c;

  return d;
}

// see https://github.com/chrisveness/geodesy/blob/master/latlon-spherical.js#L360
vec2 destinationPoint(vec2 from, float dist, float bearing) {
  float d = dist / EARTH_RADIUS;
  float r = radians(bearing);

  float y1 = radians(from.y);
  float x1 = radians(from.x);

  float siny2 = sin(y1) * cos(d) + cos(y1) * sin(d) * cos(r);
  float y2 = asin(siny2);
  float y = sin(r) * sin(d) * cos(y1);
  float x = cos(d) - sin(y1) * siny2;
  float x2 = x1 + atan2(y, x);

  float lat = degrees(y2);
  float lon = degrees(x2);

  return vec2(lon, lat);
}

// longitude wrapping allows rendering in a repeated MapView
float wrapLongitude(float lng) {
  float wrappedLng = mod(lng + 180., 360.) - 180.;
  return wrappedLng;
}

float wrapLongitude(float lng, float minLng) {
  float wrappedLng = wrapLongitude(lng);
  if (wrappedLng < minLng) {
    wrappedLng += 360.;
  }
  return wrappedLng;
}

float randFloat(vec2 seed) {
  return fract(sin(dot(seed.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 randPoint(vec2 seed) {
  return vec2(randFloat(seed + 1.3), randFloat(seed + 2.1));
}

vec2 pointToPosition(vec2 point) {
  if (viewportGlobe) {
    point.x += 0.0001; // prevent generating point in the center
    float dist = sqrt(point.x) * viewportGlobeRadius;
    float bearing = point.y * 360.;
    return destinationPoint(viewportGlobeCenter, dist, bearing);
  } else {
    vec2 viewportBoundsMin = viewportBounds.xy;
    vec2 viewportBoundsMax = viewportBounds.zw;
    return mix(viewportBoundsMin, viewportBoundsMax, point);
  }
}

bool isPositionInBounds(vec2 position, vec4 bounds) {
  vec2 boundsMin = bounds.xy;
  vec2 boundsMax = bounds.zw;
  float lng = wrapLongitude(position.x, boundsMin.x);
  float lat = position.y;
  return (
    boundsMin.x <= lng && lng <= boundsMax.x &&
    boundsMin.y <= lat && lat <= boundsMax.y
  );
}

bool isPositionInViewport(vec2 position) {
  if (viewportGlobe) {
    return distanceTo(viewportGlobeCenter, position) <= viewportGlobeRadius;
  } else {
    return isPositionInBounds(position, viewportBounds);
  }
}

// bitmapTexture is in COORDINATE_SYSTEM.LNGLAT
// no coordinate conversion needed
vec2 getUV(vec2 pos) {
  return vec2(
    (pos.x - bounds[0]) / (bounds[2] - bounds[0]),
    (pos.y - bounds[3]) / (bounds[1] - bounds[3])
  );
}

bool raster_has_values(vec4 values) {
  if (imageUnscale[0] < imageUnscale[1]) {
    return values.a == 1.;
  } else {
    return !isNaN(values.x);
  }
}

vec2 raster_get_values(vec4 color) {
  if (imageUnscale[0] < imageUnscale[1]) {
    return mix(vec2(imageUnscale[0]), vec2(imageUnscale[1]), color.xy);
  } else {
    return color.xy;
  }
}

void main() {
  float particleIndex = mod(float(gl_VertexID), numParticles);
  float particleAge = floor(float(gl_VertexID) / numParticles);

  // update particles age0
  // older particles age1-age(N-1) are copied with buffer.copyData
  if (particleAge > 0.) {
    return;
  }

  if (sourcePosition.xy == DROP_POSITION) {
    // generate random position to prevent converging particles
    vec2 particleSeed = vec2(particleIndex * seed / numParticles);
    vec2 point = randPoint(particleSeed);
    vec2 position = pointToPosition(point);
    targetPosition.xy = position;
    targetPosition.x = wrapLongitude(targetPosition.x);
    return;
  }

  if (!isPositionInBounds(sourcePosition.xy, bounds)) {
    // drop out of bounds
    targetPosition.xy = DROP_POSITION;
    return;
  }

  if (!isPositionInViewport(sourcePosition.xy)) {
    // drop out of viewport
    targetPosition.xy = DROP_POSITION;
    return;
  }

  if (viewportZoomChangeFactor > 1. && mod(particleIndex, viewportZoomChangeFactor) >= 1.) {
    // drop when zooming out
    targetPosition.xy = DROP_POSITION;
    return;
  }

  if (abs(mod(particleIndex, maxAge + 2.) - mod(time, maxAge + 2.)) < 1.) {
    // drop by maxAge, +2 because only non-randomized pairs are rendered
    targetPosition.xy = DROP_POSITION;
    return;
  }

  vec2 uv = getUV(sourcePosition.xy);
  vec4 bitmapColor = texture2D(bitmapTexture, uv);

  if (!raster_has_values(bitmapColor)) {
    // drop nodata
    targetPosition.xy = DROP_POSITION;
    return;
  }

  // update position
  vec2 speed = raster_get_values(bitmapColor) * speedFactor;
  // float dist = sqrt(speed.x * speed.x + speed.y + speed.y) * 10000.;
  // float bearing = degrees(-atan2(speed.y, speed.x));
  // targetPosition.xy = destinationPoint(sourcePosition.xy, dist, bearing);
  float distortion = cos(radians(sourcePosition.y)); 
  vec2 offset = vec2(speed.x / distortion, speed.y);
  targetPosition.xy = sourcePosition.xy + offset;
  targetPosition.x = wrapLongitude(targetPosition.x);
}
`, E = 30, h = 256, N = [255, 255, 255, 255], O = [
  [0, [94, 165, 252, 255]],
  [0.45, [145, 255, 171, 255]],
  [0.75, [255, 208, 112, 255]],
  [1, [255, 107, 107, 255]]
];
function U(c, e) {
  return (c % e + e) % e;
}
function S(c, e) {
  let t = U(c + 180, 360) - 180;
  return typeof e == "number" && t < e && (t += 360), t;
}
function B() {
  return !1;
}
function G(c) {
  if (!c?.getBounds) return null;
  const e = c.getBounds(), t = e[2] - e[0] < 360 ? S(e[0]) : -180, o = e[2] - e[0] < 360 ? S(e[2], t) : 180, r = Math.max(e[1], -85.051129), n = Math.min(e[3], 85.051129);
  return [t, r, o, n];
}
const z = {
  ...A.defaultProps,
  image: { type: "image", value: null, async: !0 },
  imageUnscale: { type: "array", value: null },
  numParticles: { type: "number", min: 1, max: 1e6, value: 5e3 },
  maxAge: { type: "number", min: 1, max: 255, value: 100 },
  speedFactor: { type: "number", min: 0, max: 1, value: 1 },
  color: { type: "color", value: N },
  colorRamp: { type: "array", value: O, compare: !0 },
  speedRange: { type: "array", value: [0, 30], compare: !0 },
  colorScale: { type: "number", value: 1 },
  width: { type: "number", value: 1 },
  animate: !0,
  bounds: { type: "array", value: [-180, -90, 180, 90], compare: !0 },
  wrapLongitude: !0
};
function k(c) {
  const e = new Uint8Array(h * 4), t = [...c].sort((o, r) => o[0] - r[0]);
  for (let o = 0; o < h; o++) {
    const r = o / (h - 1);
    let n = t[0][1];
    for (let a = 0; a < t.length - 1; a++) {
      const [i, s] = t[a], [p, l] = t[a + 1];
      if (r >= i && r <= p) {
        const d = (r - i) / Math.max(p - i, 1e-6);
        n = [
          Math.round(s[0] + (l[0] - s[0]) * d),
          Math.round(s[1] + (l[1] - s[1]) * d),
          Math.round(s[2] + (l[2] - s[2]) * d),
          Math.round((s[3] ?? 255) + ((l[3] ?? 255) - (s[3] ?? 255)) * d)
        ];
        break;
      }
    }
    r > t[t.length - 1][0] && (n = t[t.length - 1][1]), e[o * 4] = n[0], e[o * 4 + 1] = n[1], e[o * 4 + 2] = n[2], e[o * 4 + 3] = n[3] ?? 255;
  }
  return e;
}
class _ extends A {
  getShaders() {
    return {
      ...super.getShaders(),
      inject: {
        "vs:#decl": `
          varying float drop;
          varying vec4 vSpeedColor;
          const vec2 DROP_POSITION = vec2(0);
          uniform sampler2D advColorRampTexture;
          uniform vec2 advSpeedRange;
          uniform float advColorScale;
          uniform float advZoomCompensation;
        `,
        "vs:#main-start": `
          drop = float(instanceSourcePositions.xy == DROP_POSITION || instanceTargetPositions.xy == DROP_POSITION);
          float speed = distance(instanceTargetPositions.xy, instanceSourcePositions.xy) * advColorScale * advZoomCompensation;
          float denom = max(advSpeedRange.y - advSpeedRange.x, 0.000001);
          float speedNorm = clamp((speed - advSpeedRange.x) / denom, 0.0, 1.0);
          speedNorm = pow(speedNorm, 0.75);
          vSpeedColor = texture2D(advColorRampTexture, vec2(speedNorm, 0.5));
        `,
        "fs:#decl": `
          varying float drop;
          varying vec4 vSpeedColor;
        `,
        "fs:#main-start": `
          if (drop > 0.5) discard;
        `,
        "fs:DECKGL_FILTER_COLOR": `
          color = vSpeedColor;
          color.a *= geometry.uv.x;
        `
      }
    };
  }
  initializeState() {
    const { gl: e } = this.context;
    if (!f(e))
      throw new Error("WebGL 2 is required");
    super.initializeState({}), this._setupTransformFeedback(), this.getAttributeManager().remove(["instanceSourcePositions", "instanceTargetPositions", "instanceColors", "instanceWidths"]);
  }
  updateState({ props: e, oldProps: t, changeFlags: o }) {
    const { numParticles: r, maxAge: n, color: a, width: i, colorRamp: s } = e;
    if (super.updateState({ props: e, oldProps: t, changeFlags: o }), !r || !n || !i) {
      this._deleteTransformFeedback();
      return;
    }
    (r !== t.numParticles || n !== t.maxAge || a[0] !== t.color[0] || a[1] !== t.color[1] || a[2] !== t.color[2] || a[3] !== t.color[3] || i !== t.width || s !== t.colorRamp) && this._setupTransformFeedback();
  }
  finalizeState() {
    this._deleteTransformFeedback(), super.finalizeState();
  }
  draw({ uniforms: e }) {
    const { gl: t } = this.context;
    if (!f(t)) return;
    const { initialized: o } = this.state;
    if (!o) return;
    const { animate: r } = this.props, {
      sourcePositions: n,
      targetPositions: a,
      sourcePositions64Low: i,
      targetPositions64Low: s,
      colors: p,
      widths: l,
      model: d,
      colorRampTexture: u
    } = this.state;
    d.setAttributes({
      instanceSourcePositions: n,
      instanceTargetPositions: a,
      instanceSourcePositions64Low: i,
      instanceTargetPositions64Low: s,
      instanceColors: p,
      instanceWidths: l
    });
    const { viewport: g } = this.context, { colorScale: v, speedRange: m, speedFactor: x } = this.props, y = 2 ** ((g?.zoom ?? 0) + 7) / Math.max(x || 1, 1e-6);
    super.draw({
      uniforms: {
        ...e,
        advColorRampTexture: u,
        advSpeedRange: m || [0, 30],
        advColorScale: v,
        advZoomCompensation: y
      }
    }), r && this.requestStep();
  }
  _setupTransformFeedback() {
    const { gl: e } = this.context;
    if (!f(e)) return;
    const { initialized: t } = this.state;
    t && this._deleteTransformFeedback();
    const { numParticles: o, maxAge: r, color: n, width: a, colorRamp: i } = this.props, s = o * r, p = o * (r - 1), l = new R(e, new Float32Array(s * 3)), d = new R(e, new Float32Array(s * 3)), u = new Float32Array([0, 0, 0]), g = new Float32Array([0, 0, 0]), v = new R(
      e,
      new Float32Array(
        new Array(s).fill(void 0).map((L, P) => {
          const w = Math.floor(P / o);
          return [n[0], n[1], n[2], (n[3] ?? 255) * (1 - w / r)].map((T) => T / 255);
        }).flat()
      )
    ), m = new Float32Array([a]), x = k(i || O), y = new C(e, {
      width: h,
      height: 1,
      data: x,
      parameters: {
        [e.TEXTURE_MIN_FILTER]: e.LINEAR,
        [e.TEXTURE_MAG_FILTER]: e.LINEAR,
        [e.TEXTURE_WRAP_S]: e.CLAMP_TO_EDGE,
        [e.TEXTURE_WRAP_T]: e.CLAMP_TO_EDGE
      },
      format: e.RGBA,
      type: e.UNSIGNED_BYTE,
      mipmaps: !1
    }), b = new D(e, {
      sourceBuffers: { sourcePosition: l },
      feedbackBuffers: { targetPosition: d },
      feedbackMap: { sourcePosition: "targetPosition" },
      vs: M,
      elementCount: o
    });
    this.setState({
      initialized: !0,
      numInstances: s,
      numAgedInstances: p,
      sourcePositions: l,
      targetPositions: d,
      sourcePositions64Low: u,
      targetPositions64Low: g,
      colors: v,
      widths: m,
      transform: b,
      colorRampTexture: y
    });
  }
  _runTransformFeedback() {
    const { gl: e } = this.context;
    if (!f(e)) return;
    const { initialized: t } = this.state;
    if (!t) return;
    const { viewport: o, timeline: r } = this.context, { image: n, imageUnscale: a, bounds: i, numParticles: s, speedFactor: p, maxAge: l } = this.props, { numAgedInstances: d, transform: u, previousViewportZoom: g, previousTime: v } = this.state, m = r.getTime();
    if (!n || m === v) return;
    const x = B(), y = G(o) || i, b = 2 ** ((g - o.zoom) * 4), L = p / 2 ** (o.zoom + 7), P = {
      viewportGlobe: x,
      viewportGlobeCenter: [0, 0],
      viewportGlobeRadius: 0,
      viewportBounds: y || i,
      viewportZoomChangeFactor: b || 0,
      bitmapTexture: n,
      imageUnscale: a || [0, 0],
      bounds: i,
      numParticles: s,
      maxAge: l,
      speedFactor: L,
      time: m,
      seed: Math.random()
    };
    u.run({ uniforms: P });
    const w = u.bufferTransform.bindings[u.bufferTransform.currentIndex].sourceBuffers.sourcePosition, T = u.bufferTransform.bindings[u.bufferTransform.currentIndex].feedbackBuffers.targetPosition;
    w.copyData({
      sourceBuffer: T,
      readOffset: 0,
      writeOffset: s * 4 * 3,
      size: d * 4 * 3
    }), u.swap(), this.state.previousViewportZoom = o.zoom, this.state.previousTime = m;
  }
  _resetTransformFeedback() {
    const { gl: e } = this.context;
    if (!f(e)) return;
    const { initialized: t } = this.state;
    if (!t) return;
    const { numInstances: o, sourcePositions: r, targetPositions: n } = this.state;
    r.subData({ data: new Float32Array(o * 3) }), n.subData({ data: new Float32Array(o * 3) });
  }
  _deleteTransformFeedback() {
    const { gl: e } = this.context;
    if (!f(e)) return;
    const { initialized: t } = this.state;
    if (!t) return;
    const { sourcePositions: o, targetPositions: r, colors: n, transform: a, colorRampTexture: i } = this.state;
    o.delete(), r.delete(), n.delete(), a.delete(), i?.delete?.(), this.setState({
      initialized: !1,
      sourcePositions: void 0,
      targetPositions: void 0,
      sourcePositions64Low: void 0,
      targetPositions64Low: void 0,
      colors: void 0,
      widths: void 0,
      transform: void 0,
      colorRampTexture: void 0
    });
  }
  requestStep() {
    const { stepRequested: e } = this.state;
    e || (this.state.stepRequested = !0, setTimeout(() => {
      this.step(), this.state.stepRequested = !1;
    }, 1e3 / E));
  }
  step() {
    this._runTransformFeedback(), this.setNeedsRedraw();
  }
  clear() {
    this._resetTransformFeedback(), this.setNeedsRedraw();
  }
}
_.layerName = "ParticleAdvLayer";
_.defaultProps = z;
const V = [0, 0.5, 1, 1.5], q = ["#5ea5fc", "#91ffab", "#ffd070", "#ff6b6b"], Z = {
  id: "maplibre-gsr-adv-particle",
  numParticles: 9e3,
  maxAge: 80,
  speedFactor: 200,
  width: 1.9,
  opacity: 0.9,
  colorScale: 1,
  color: [255, 255, 255],
  animate: !0
};
function I(c, e) {
  const t = `${c}`.trim(), o = /^#([0-9a-fA-F]{6})$/.exec(t);
  if (!o) return e;
  const r = Number.parseInt(o[1], 16);
  return [r >> 16 & 255, r >> 8 & 255, r & 255, 255];
}
function W(c, e, t, o) {
  const r = c.getPropertyValue(`--${t}-${e}`);
  return I(r, o);
}
function H(c = {}) {
  const { cssVarPrefix: e = "adv-ramp" } = c, t = getComputedStyle(document.documentElement);
  return V.map((o, r) => {
    const n = I(q[r], [255, 255, 255, 255]);
    return [o, W(t, r, e, n)];
  });
}
class Y {
  constructor({ map: e, image: t, imageUnscale: o, bounds: r, speedRange: n = [0, 0.45], colorRamp: a, layerOptions: i = {}, cssVarPrefix: s = "adv-ramp" }) {
    if (!e) throw new Error("map is required");
    if (!t) throw new Error("image is required");
    if (!r) throw new Error("bounds is required");
    this.map = e, this.common = { image: t, imageUnscale: o, bounds: r, speedRange: n }, this.layerOptions = { ...Z, ...i }, this.colorRamp = a || H({ cssVarPrefix: s }), this.overlay = new F({ interleaved: !1, layers: [] }), this.map.addControl(this.overlay), this.render();
  }
  render() {
    const e = new _({
      ...this.layerOptions,
      image: this.common.image,
      imageUnscale: this.common.imageUnscale,
      bounds: this.common.bounds,
      speedRange: this.common.speedRange,
      colorRamp: this.colorRamp
    });
    this.overlay.setProps({ layers: [e] });
  }
  setSpeedRange(e) {
    this.common.speedRange = e, this.render();
  }
  setColorRamp(e) {
    this.colorRamp = [...e].sort((t, o) => t[0] - o[0]), this.render();
  }
  setLayerOptions(e) {
    this.layerOptions = { ...this.layerOptions, ...e }, this.render();
  }
  destroy() {
    this.overlay && (this.map.removeControl(this.overlay), this.overlay = null);
  }
}
export {
  Z as DEFAULT_LAYER_OPTIONS,
  q as DEFAULT_RAMP_FALLBACK_COLORS,
  V as DEFAULT_RAMP_STOPS,
  Y as MapLibreGsrAdv,
  _ as ParticleAdvLayer,
  H as getDefaultRampFromCss
};
//# sourceMappingURL=maplibre-gsr-adv.js.map
