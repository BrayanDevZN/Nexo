import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineLoop,
  LineSegments,
  Matrix4,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Path,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { journey, stations as homeStations, type Station } from "@/lib/journey";
import { NEXO_LEFT, NEXO_RIGHT } from "./nexoShape";

// Nexo's purples, from deep ink to pale lavender.
const INK = new Color("#2a1450");
const DEEP = new Color("#4c1d95");
const VIOLET = new Color("#6d28d9"); // --primary
const BRIGHT = new Color("#8b5cf6"); // --highlight
const LAVENDER = new Color("#c4b5fd");
const MIST = 0xf3ecff;
const SPACING = 16; // distance between stations along z

/** Shared by every material: the clock that drives the scanning light, and the point-size scale. */
const clock = { value: 0 };
const pointScale = { value: 800 };

type Piece = { group: Group; update: (t: number, dt: number) => void };

// ---- materials ---------------------------------------------------------------------------------

const LINE_VERTEX = /* glsl */ `
  varying float vDepth;
  varying vec3 vPos;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
// A band of light sweeps through every wireframe, so the lines look charged rather than drawn.
const LINE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uPulse;
  uniform float uOpacity;
  uniform float uStrength;
  varying float vDepth;
  varying vec3 vPos;
  void main() {
    float band = sin(dot(vPos, vec3(0.85, 0.55, 0.7)) * 1.05 - uTime * 1.25);
    float pulse = smoothstep(0.78, 1.0, band) * uStrength;
    vec3 color = mix(uColor, uPulse, pulse);
    float alpha = (uOpacity + pulse * 0.5) * (1.0 - smoothstep(11.0, 30.0, vDepth));
    gl_FragColor = vec4(color, alpha);
  }
`;
function lineMaterial(color: Color, opacity = 0.62, strength = 1) {
  return new ShaderMaterial({
    uniforms: {
      uTime: clock,
      uColor: { value: color },
      uPulse: { value: BRIGHT },
      uOpacity: { value: opacity },
      uStrength: { value: strength },
    },
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

const POINT_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uBreath;
  uniform vec2 uFade;
  varying float vAlpha;
  void main() {
    vec3 p = position * (1.0 + uBreath * sin(uTime * 0.9 + dot(position, vec3(1.3, 2.1, 1.7)) * 1.2));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uSize * uScale / depth, 28.0);
    float phase = dot(position, vec3(12.9898, 78.233, 37.719));
    vAlpha = (0.6 + 0.4 * sin(uTime * 1.6 + phase)) * (1.0 - smoothstep(uFade.x, uFade.y, depth)) * smoothstep(0.4, 2.0, depth);
  }
`;
const POINT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d) * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;
function pointMaterial(color: Color, size: number, opacity = 0.9, breath = 0, fade: [number, number] = [11, 30]) {
  return new ShaderMaterial({
    uniforms: {
      uTime: clock,
      uScale: pointScale,
      uColor: { value: color },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uBreath: { value: breath },
      uFade: { value: new Vector2(fade[0], fade[1]) },
    },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

// Glass: almost clear in the middle, bright at the rim, like a lit pane seen at an angle.
const GLASS_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const GLASS_FRAGMENT = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uRim;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDepth;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    float shimmer = 0.85 + 0.15 * sin(uTime * 1.4 + vNormal.y * 4.0);
    vec3 color = mix(uInner, uRim, f);
    float alpha = (0.05 + f * 0.6 * shimmer) * uOpacity * (1.0 - smoothstep(11.0, 30.0, vDepth));
    gl_FragColor = vec4(color, alpha);
  }
`;
function glass(geometry: BufferGeometry, opacity = 1) {
  return new Mesh(
    geometry,
    new ShaderMaterial({
      uniforms: { uTime: clock, uInner: { value: LAVENDER }, uRim: { value: VIOLET }, uOpacity: { value: opacity } },
      vertexShader: GLASS_VERTEX,
      fragmentShader: GLASS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
}

let haloTexture: CanvasTexture | undefined;
/** A big soft violet light behind an object. */
function halo(size: number, opacity: number) {
  if (!haloTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(139, 92, 246, 0.55)");
    gradient.addColorStop(0.45, "rgba(124, 58, 237, 0.16)");
    gradient.addColorStop(1, "rgba(109, 40, 217, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    haloTexture = new CanvasTexture(canvas);
  }
  const sprite = new Sprite(new SpriteMaterial({ map: haloTexture, transparent: true, opacity, depthWrite: false, fog: false, blending: AdditiveBlending }));
  sprite.scale.setScalar(size);
  sprite.position.z = -0.5;
  return sprite;
}

// ---- geometry helpers --------------------------------------------------------------------------

function circle(radius: number, material: ShaderMaterial, segments = 128) {
  const points: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }
  return new LineLoop(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3)), material);
}

/** Tick marks around a circle, like a gauge or a dial: every fifth one longer. */
function ticks(radius: number, count: number, length: number, material: ShaderMaterial) {
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const reach = radius + (i % 5 === 0 ? length : length * 0.45);
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0, Math.cos(angle) * reach, Math.sin(angle) * reach, 0);
  }
  return new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3)), material);
}

function wire(geometry: BufferGeometry, material: ShaderMaterial, threshold = 1) {
  return new LineSegments(new EdgesGeometry(geometry, threshold), material);
}

function fibonacci(count: number, radius: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    return new Vector3(Math.cos(i * golden) * r, y, Math.sin(i * golden) * r).multiplyScalar(radius);
  });
}

function dot(radius = 0.11, color: Color = VIOLET) {
  return new Mesh(new SphereGeometry(radius, 16, 16), new MeshBasicMaterial({ color }));
}

// ---- the seven pieces --------------------------------------------------------------------------

/** Three interlocked sets of rings (the opening's logo) with a dial around them and a light inside. */
function rings(): Piece {
  const group = new Group();
  group.add(halo(13, 0.7));
  const sets: Group[] = [];
  [-2.1, 0, 2.1].forEach((x, index) => {
    const set = new Group();
    set.position.x = x;
    [2.1, 1.75, 1.4].forEach((radius, k) => set.add(circle(radius, lineMaterial(index === 1 ? VIOLET : INK, index === 1 ? 0.9 : 0.55 + k * 0.05))));
    group.add(set);
    sets.push(set);
  });
  const dial = ticks(3.3, 120, 0.28, lineMaterial(DEEP, 0.5));
  const core = glass(new SphereGeometry(0.55, 32, 32));
  const spark = dot(0.07, BRIGHT);
  group.add(dial, core, spark);
  return {
    group,
    update: (t) => {
      group.rotation.y = Math.sin(t * 0.35) * 0.55;
      group.rotation.x = Math.sin(t * 0.22) * 0.18;
      sets.forEach((set, index) => (set.rotation.y = Math.sin(t * 0.5 + index) * 0.28));
      dial.rotation.z = t * 0.12;
      core.scale.setScalar(1 + Math.sin(t * 1.6) * 0.12);
      spark.position.set(Math.cos(t * 1.1) * 3.3, Math.sin(t * 1.1) * 3.3, 0);
    },
  };
}

const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Grows from nothing at `start`, over `length` seconds, easing out with a small overshoot. */
const pop = (time: number, start: number, length = 0.5) => {
  const k = clamp01((time - start) / length);
  return ease(k) * (1 + Math.sin(k * Math.PI) * 0.12);
};

/** A glass slab with its outline. */
function slab(width: number, height: number, depth: number, color: Color = INK, opacity = 0.85) {
  const geometry = new BoxGeometry(width, height, depth);
  const holder = new Group();
  holder.add(glass(geometry), wire(geometry, lineMaterial(color, opacity)));
  return holder;
}

function roundedRect(width: number, height: number, radius: number, depth: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** A toothed wheel with a hole in the middle. */
function gearGeometry(teeth: number, outer: number, depth: number) {
  const root = outer * 0.82;
  const shape = new Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const corners: [number, number][] = [
      [root, 0],
      [outer, 0.18],
      [outer, 0.5],
      [root, 0.68],
    ];
    corners.forEach(([radius, at], k) => {
      const angle = a + at * step;
      if (i === 0 && k === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    });
  }
  const hole = new Path();
  hole.absarc(0, 0, outer * 0.3, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/**
 * The N of the site logo as two solid, rounded pieces with the thin channel between them, centred on the origin:
 * the left piece in pale lavender and the right one in deeper violet, like the gradient of the logo.
 */
function nexoLetter() {
  const holder = new Group();
  [
    { outline: NEXO_LEFT, inner: LAVENDER, rim: VIOLET },
    { outline: NEXO_RIGHT, inner: BRIGHT, rim: DEEP },
  ].forEach(({ outline, inner, rim }) => {
    const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
    const geometry = new ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.14, bevelSegments: 6, curveSegments: 4 });
    geometry.translate(0, 0, -0.25);
    const piece = glass(geometry, 1);
    const uniforms = (piece.material as ShaderMaterial).uniforms;
    uniforms.uInner.value = inner;
    uniforms.uRim.value = rim;
    holder.add(piece);
  });
  return holder;
}

/** The opening: the Nexo "N", a smooth rounded glass letter, floating and turning slowly with a few lights circling it. */
function monogram(): Piece {
  const group = new Group();
  group.add(halo(12, 0.7));
  const letter = new Group();
  letter.add(nexoLetter());
  const sparks = [0, 1, 2, 3].map((i) => {
    const d = dot(0.08, i % 2 ? BRIGHT : VIOLET);
    group.add(d);
    return d;
  });
  group.add(letter);
  return {
    group,
    update: (time) => {
      letter.rotation.y = time * 0.7;
      letter.position.y = Math.sin(time * 1.2) * 0.1;
      sparks.forEach((spark, i) => {
        const angle = time * (0.8 + i * 0.12) + i * 1.6;
        spark.position.set(Math.cos(angle) * 2.9, Math.sin(angle * 1.3) * 0.9, Math.sin(angle) * 2.9);
      });
    },
  };
}

/** A small floating robot that looks around, blinks and waves, with a glowing ring under it. With `orbiters`, message bubbles or documents circle it. */
function robot(orbiters?: "messages" | "documents"): Piece {
  const group = new Group();
  group.add(halo(11, 0.7));
  const figure = new Group();
  group.add(figure);

  // Head: a faceted glass dome with a dark visor, two eyes, ears and an antenna.
  const head = new Group();
  head.position.y = 1.25;
  const dome = new Group();
  dome.scale.set(1.25, 1, 1.05);
  const domeShape = new IcosahedronGeometry(1, 2);
  dome.add(glass(domeShape), wire(new IcosahedronGeometry(1.02, 1), lineMaterial(INK, 0.55), 1));
  const visorShape = roundedRect(1.7, 0.7, 0.34, 0.2);
  const visor = new Group();
  visor.add(glass(visorShape, 1), wire(visorShape, lineMaterial(VIOLET, 0.95), 20));
  visor.position.set(0, 0.05, 0.92);
  const eyes = [-0.4, 0.4].map((x) => {
    const eye = dot(0.12, BRIGHT);
    eye.position.set(x, 0.05, 1.08);
    return eye;
  });
  const ears = [-1, 1].map((side) => {
    const geometry = new CylinderGeometry(0.3, 0.3, 0.18, 24);
    const ear = new Group();
    ear.add(glass(geometry), wire(geometry, lineMaterial(VIOLET, 0.9), 20));
    ear.rotation.z = Math.PI / 2;
    ear.position.set(side * 1.3, 0, 0);
    return ear;
  });
  const stem = new Line(new BufferGeometry().setFromPoints([new Vector3(0, 0.98, 0), new Vector3(0, 1.55, 0)]), lineMaterial(INK, 0.9, 0));
  const bulb = dot(0.13, BRIGHT);
  bulb.position.y = 1.65;
  head.add(dome, visor, ...eyes, ...ears, stem, bulb);

  // Body: a glass capsule with a glowing chest light.
  const bodyShape = new CapsuleGeometry(0.72, 0.75, 6, 20);
  const body = new Group();
  body.add(glass(bodyShape), wire(bodyShape, lineMaterial(INK, 0.7), 20));
  body.position.y = -0.85;
  const chest = circle(0.28, lineMaterial(VIOLET, 1, 0));
  chest.position.set(0, 0.15, 0.74);
  const heart = dot(0.12, BRIGHT);
  heart.position.set(0, 0.15, 0.76);
  body.add(chest, heart);

  // Arms hang from the shoulders; the right one waves.
  const arm = (side: -1 | 1) => {
    const holder = new Group();
    holder.position.set(side * 1.0, -0.45, 0);
    const geometry = new CapsuleGeometry(0.17, 0.75, 4, 12);
    const limb = new Group();
    limb.add(glass(geometry), wire(geometry, lineMaterial(VIOLET, 0.9), 20));
    limb.position.y = -0.55;
    holder.add(limb);
    return holder;
  };
  const left = arm(-1);
  const right = arm(1);

  // A glowing ring under it, instead of legs.
  const ringA = circle(1.2, lineMaterial(VIOLET, 0.9, 1));
  const ringB = circle(1.7, lineMaterial(DEEP, 0.45, 0));
  [ringA, ringB].forEach((ring) => {
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -2.25;
  });
  const sparks = [0, 1, 2].map((i) => {
    const d = dot(0.07, i === 1 ? BRIGHT : VIOLET);
    group.add(d);
    return d;
  });
  figure.add(head, body, left, right);
  group.add(ringA, ringB);

  // Messages or documents travelling around it.
  const count = 5;
  const around = orbiters
    ? Array.from({ length: count }, (_, i) => {
        const holder = new Group();
        if (orbiters === "messages") {
          const geometry = roundedRect(1.35, 0.66, 0.26, 0.14);
          holder.add(glass(geometry, 1), wire(geometry, lineMaterial(i % 2 ? VIOLET : INK, 0.9), 20));
          holder.add(
            new LineSegments(new BufferGeometry().setFromPoints([new Vector3(-0.45, 0.1, 0.1), new Vector3(0.35, 0.1, 0.1), new Vector3(-0.45, -0.1, 0.1), new Vector3(0.1, -0.1, 0.1)]), lineMaterial(VIOLET, 0.8, 0)),
          );
        } else {
          holder.add(sheet(0.95, 1.25, i % 2 ? VIOLET : INK));
        }
        group.add(holder);
        return { holder, i };
      })
    : [];

  return {
    group,
    update: (t) => {
      figure.position.y = Math.sin(t * 1.2) * 0.14;
      figure.rotation.y = Math.sin(t * 0.5) * 0.5;
      head.rotation.set(Math.sin(t * 0.7) * 0.08, Math.sin(t * 0.9) * 0.25, Math.sin(t * 0.6) * 0.06);
      // Blinks every few seconds.
      const blink = (t % 4) > 3.85 ? 0.1 : 1;
      eyes.forEach((eye) => (eye.scale.y = blink));
      bulb.scale.setScalar(1 + Math.sin(t * 4) * 0.25);
      heart.scale.setScalar(1 + Math.sin(t * 2.4) * 0.25);
      left.rotation.z = 0.15 + Math.sin(t * 1.2) * 0.08;
      right.rotation.z = -2.5 + Math.sin(t * 5) * 0.35;
      ringA.scale.setScalar(1 + Math.sin(t * 1.2) * 0.06);
      ringB.scale.setScalar(1 + ((t * 0.5) % 1) * 0.15);
      around.forEach(({ holder, i }) => {
        const angle = t * 0.5 + (i * Math.PI * 2) / count;
        holder.position.set(Math.cos(angle) * 2.85, 0.2 + Math.sin(angle * 2 + i) * 0.45, Math.sin(angle) * 2.2);
        holder.rotation.set(Math.sin(t + i) * 0.15, Math.cos(angle) * -0.5, Math.sin(t * 0.8 + i) * 0.12);
        holder.scale.setScalar(0.85 + Math.sin(angle) * 0.15);
      });
      sparks.forEach((spark, i) => {
        const angle = t * (0.9 + i * 0.25) + i * 2.1;
        spark.position.set(Math.cos(angle) * 1.7, -2.25 + Math.sin(angle * 1.5) * 0.25, Math.sin(angle) * 1.7);
      });
    },
  };
}

/** Smart automation: gears that mesh and turn one another, lights riding the rims. Work that runs by itself. */
function flow(): Piece {
  const group = new Group();
  group.add(halo(12, 0.55));
  const specs = [
    { teeth: 16, outer: 1.8, at: [-1.5, -0.2], color: INK, turn: 1 },
    { teeth: 10, outer: 1.15, at: [1.2, 0.5], color: VIOLET, turn: -1 },
    { teeth: 12, outer: 1.35, at: [2.1, -1.6], color: INK, turn: 1 },
  ];
  const gears = specs.map(({ teeth, outer, at, color, turn }, index) => {
    const holder = new Group();
    const geometry = gearGeometry(teeth, outer, 0.4);
    holder.add(glass(geometry), wire(geometry, lineMaterial(color, 0.9), 20));
    const light = dot(0.1, BRIGHT);
    light.position.set(outer * 0.6, 0, 0.25);
    holder.add(light);
    holder.position.set(at[0], at[1], 0);
    holder.rotation.z = index === 1 ? Math.PI / teeth : 0;
    group.add(holder);
    return { holder, speed: (turn * 0.6 * 10) / teeth, base: holder.rotation.z };
  });
  return {
    group,
    update: (t) => {
      group.rotation.y = Math.sin(t * 0.25) * 0.45;
      group.rotation.x = 0.2 + Math.sin(t * 0.2) * 0.08;
      gears.forEach(({ holder, speed, base }) => (holder.rotation.z = base + t * speed));
    },
  };
}

/** AI inside your systems: a glowing core wired to a database, an app, a spreadsheet, e-mail and a server, with data moving in both directions. */
function systems(): Piece {
  const group = new Group();
  group.add(halo(12, 0.6));
  const heart = glass(new IcosahedronGeometry(0.9, 2));
  const lattice = wire(new IcosahedronGeometry(1.2, 0), lineMaterial(VIOLET, 0.9));
  group.add(heart, lattice);

  const database = () => {
    const holder = new Group();
    for (let i = 0; i < 3; i++) {
      const geometry = new CylinderGeometry(0.62, 0.62, 0.3, 28);
      const disc = new Group();
      disc.add(glass(geometry), wire(geometry, lineMaterial(i === 1 ? VIOLET : INK, 0.9), 20));
      disc.position.y = (i - 1) * 0.38;
      holder.add(disc);
    }
    return holder;
  };
  const app = () => {
    const holder = slab(1.5, 1.05, 0.1);
    [0, 1, 2].forEach((i) => {
      const d = dot(0.045, i === 0 ? BRIGHT : VIOLET);
      d.position.set(-0.55 + i * 0.16, 0.38, 0.07);
      holder.add(d);
    });
    const body = slab(1.2, 0.45, 0.08, VIOLET, 0.8);
    body.position.set(0, -0.12, 0.06);
    holder.add(body);
    return holder;
  };
  const sheet = () => {
    const holder = slab(1.3, 1.3, 0.1);
    const lines: number[] = [];
    for (let i = 1; i < 4; i++) {
      const v = -0.65 + (i * 1.3) / 4;
      lines.push(v, -0.65, 0.07, v, 0.65, 0.07, -0.65, v, 0.07, 0.65, v, 0.07);
    }
    holder.add(new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(lines, 3)), lineMaterial(VIOLET, 0.8, 0)));
    return holder;
  };
  const mail = () => {
    const holder = slab(1.5, 1.0, 0.1);
    const flap = [-0.75, 0.5, 0.07, 0, -0.1, 0.07, 0, -0.1, 0.07, 0.75, 0.5, 0.07];
    holder.add(new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(flap, 3)), lineMaterial(VIOLET, 0.9, 0)));
    return holder;
  };
  const server = () => {
    const holder = new Group();
    for (let i = 0; i < 3; i++) {
      const unit = slab(1.4, 0.32, 0.7, i === 1 ? VIOLET : INK);
      unit.position.y = (i - 1) * 0.42;
      const led = dot(0.04, BRIGHT);
      led.position.set(0.5, (i - 1) * 0.42, 0.37);
      holder.add(unit, led);
    }
    return holder;
  };
  const kinds = [database, app, sheet, mail, server];
  const radius = 3.1;
  const nodes = kinds.map((make, index) => {
    const angle = (index / kinds.length) * Math.PI * 2 + Math.PI / 2;
    const holder = make();
    const home = new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.85, Math.sin(index * 2) * 0.5);
    holder.position.copy(home);
    group.add(holder);
    group.add(new Line(new BufferGeometry().setFromPoints([new Vector3(), home]), lineMaterial(DEEP, 0.45, 1)));
    const packet = dot(0.08, BRIGHT);
    const back = dot(0.06, VIOLET);
    group.add(packet, back);
    return { holder, home, packet, back, index };
  });
  return {
    group,
    update: (t) => {
      group.rotation.y = Math.sin(t * 0.3) * 0.5;
      group.rotation.x = Math.sin(t * 0.2) * 0.15;
      heart.rotation.set(t * 0.4, t * 0.3, 0);
      heart.scale.setScalar(1 + Math.sin(t * 1.5) * 0.08);
      lattice.rotation.set(-t * 0.3, -t * 0.45, 0);
      nodes.forEach(({ holder, home, packet, back, index }) => {
        holder.rotation.y = Math.sin(t * 0.7 + index) * 0.5;
        holder.position.y = home.y + Math.sin(t * 0.8 + index * 1.3) * 0.12;
        packet.position.copy(home).multiplyScalar((t * 0.35 + index * 0.2) % 1);
        back.position.copy(home).multiplyScalar(1 - ((t * 0.35 + index * 0.2 + 0.5) % 1));
      });
    },
  };
}

/** Custom software: a screen assembling itself (sidebar, cards, a chart), its layers floating apart and back together. */
function software(): Piece {
  const group = new Group();
  group.add(halo(11, 0.55));
  const parts: { holder: Group; layer: number; start: number; home: Vector3 }[] = [];
  const add = (holder: Group, x: number, y: number, layer: number, start: number) => {
    const home = new Vector3(x, y, 0);
    holder.position.copy(home);
    group.add(holder);
    parts.push({ holder, layer, start, home });
    return holder;
  };
  add(slab(5, 3.4, 0.16), 0, 0, 0, 0);
  const title = slab(5, 0.4, 0.1, VIOLET);
  add(title, 0, 1.5, 1, 0.5);
  [0, 1, 2].forEach((i) => {
    const d = dot(0.07, i === 0 ? BRIGHT : VIOLET);
    d.position.set(-2.2 + i * 0.22, 1.5, 0.12);
    group.add(d);
  });
  add(slab(1.1, 2.5, 0.1), -1.85, -0.2, 1, 1.0);
  add(slab(1.55, 0.95, 0.1, VIOLET), -0.15, 0.7, 2, 1.5);
  add(slab(1.55, 0.95, 0.1), 1.65, 0.7, 2, 1.8);
  const bars = [0.5, 0.9, 0.65, 1.15, 0.8].map((h, i) => {
    const bar = slab(0.26, h, 0.1, i === 3 ? VIOLET : INK);
    add(bar, 0.1 + i * 0.5, -0.55 - (1.15 - h) / 2 - 0.1, 2, 2.2 + i * 0.25);
    return bar;
  });
  return {
    group,
    update: (t) => {
      const time = t % 9;
      const fade = 1 - ease(clamp01((time - 8) / 0.8));
      group.rotation.y = Math.sin(t * 0.35) * 0.65;
      group.rotation.x = -0.12 + Math.sin(t * 0.27) * 0.1;
      const open = 0.5 + 0.5 * Math.sin(t * 0.7);
      parts.forEach(({ holder, layer, start, home }) => {
        holder.scale.setScalar(Math.max(0.001, pop(time, start) * (layer === 0 ? 1 : fade || 0.001)));
        holder.position.set(home.x, home.y, layer * 0.18 + layer * open * 0.55);
      });
      // The chart bars keep rising and falling once they have appeared.
      bars.forEach((bar, i) => (bar.scale.y = bar.scale.x * (0.75 + 0.25 * Math.sin(t * 1.3 + i))));
    },
  };
}

/** A sheet of paper with a few lines of text. */
function sheet(width = 1.2, height = 1.6, color: Color = INK) {
  const holder = slab(width, height, 0.03, color, 0.85);
  const lines: number[] = [];
  for (let i = 0; i < 4; i++) {
    const y = height * (0.3 - i * 0.18);
    lines.push(-width * 0.35, y, 0.025, width * (i === 3 ? 0.1 : 0.35), y, 0.025);
  }
  holder.add(new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(lines, 3)), lineMaterial(VIOLET, 0.7, 0)));
  return holder;
}

/** The accounting opening: the Nexo "N" at the centre with coins and documents circling it, tied together by a thin ring. */
function nexoBooks(): Piece {
  const group = new Group();
  group.add(halo(13, 0.7));
  const letter = new Group();
  letter.add(nexoLetter());
  letter.scale.setScalar(0.8);
  const orbit = new Group();
  orbit.rotation.x = 1.1;
  orbit.add(circle(3.2, lineMaterial(VIOLET, 0.7, 1)));
  const dial = ticks(3.9, 100, 0.24, lineMaterial(DEEP, 0.35));
  dial.rotation.x = 1.1;
  const items = [0, 1, 2, 3, 4, 5].map((i) => {
    const holder = new Group();
    if (i % 2 === 0) {
      const geometry = new CylinderGeometry(0.34, 0.34, 0.09, 28);
      holder.add(glass(geometry, 1), wire(geometry, lineMaterial(VIOLET, 0.95), 20));
    } else {
      holder.add(sheet(0.8, 1.05, i === 1 ? VIOLET : INK));
    }
    group.add(holder);
    return { holder, i };
  });
  group.add(letter, orbit, dial);
  return {
    group,
    update: (time) => {
      letter.rotation.y = time * 0.7;
      letter.position.y = Math.sin(time * 1.2) * 0.08;
      dial.rotation.z = time * 0.1;
      items.forEach(({ holder, i }) => {
        const angle = time * 0.55 + (i * Math.PI * 2) / items.length;
        // Points on the tilted orbit ring, so the coins and sheets travel along it.
        const x = Math.cos(angle) * 3.2;
        const flat = Math.sin(angle) * 3.2;
        holder.position.set(x, flat * Math.cos(1.1), flat * Math.sin(1.1));
        holder.rotation.set(time * 1.5 + i, angle + Math.PI / 2, i % 2 === 0 ? Math.PI / 2 : 0);
        if (i % 2 === 1) holder.rotation.set(0, angle + Math.PI / 2, Math.sin(time + i) * 0.3);
      });
    },
  };
}

/** Organised documents: loose sheets fall from above into three folders, one after another. */
function archive(): Piece {
  const group = new Group();
  group.add(halo(12, 0.6));
  const folders = [-2.3, 0, 2.3].map((x, i) => {
    const holder = new Group();
    holder.add(slab(1.8, 1.3, 0.3, i === 1 ? VIOLET : INK, 0.9));
    const tab = slab(0.7, 0.2, 0.3, i === 1 ? VIOLET : INK, 0.9);
    tab.position.set(-0.55, 0.75, 0);
    const label = new Line(new BufferGeometry().setFromPoints([new Vector3(-0.5, -0.1, 0.17), new Vector3(0.4, -0.1, 0.17)]), lineMaterial(VIOLET, 0.8, 0));
    holder.add(tab, label);
    holder.position.set(x, -1.6, 0);
    group.add(holder);
    return holder;
  });
  const count = 9;
  const sheets = Array.from({ length: count }, (_, i) => {
    const holder = sheet(0.85, 1.1, i % 3 === 1 ? VIOLET : INK);
    group.add(holder);
    return { holder, i, startX: ((i * 37) % 7) * 0.9 - 2.7, target: folders[i % 3].position.x };
  });
  return {
    group,
    update: (t) => {
      group.rotation.y = Math.sin(t * 0.3) * 0.4;
      group.rotation.x = 0.15;
      folders.forEach((folder, i) => (folder.position.y = -1.6 + Math.max(0, Math.sin(t * 2 + i * 2)) * 0.03));
      sheets.forEach(({ holder, i, startX, target }) => {
        const u = (t * 0.16 + i / count) % 1;
        const k = ease(u);
        // Drifts down from a loose pile above, turns to face front as it goes in, shrinks into the folder.
        holder.position.set(startX + (target - startX) * k + Math.sin(u * 6 + i) * 0.25 * (1 - k), 2.6 + (-1.0 - 2.6) * k, 0.2);
        holder.rotation.set(0, 0, (1 - k) * Math.sin(i * 2.1) * 1.2);
        holder.scale.setScalar(Math.max(0.001, 1 - ease(clamp01((u - 0.82) / 0.18)) * 0.9));
      });
    },
  };
}

/** The accountant decides: a balance with the prepared documents on one pan and the approval on the other. */
function balance(): Piece {
  const group = new Group();
  group.add(halo(12, 0.6));
  const base = new CylinderGeometry(1.1, 1.3, 0.25, 32);
  const baseMesh = new Group();
  baseMesh.add(glass(base), wire(base, lineMaterial(INK, 0.9), 20));
  baseMesh.position.y = -2.3;
  const stemGeometry = new CylinderGeometry(0.1, 0.14, 3.7, 16);
  const stem = new Group();
  stem.add(glass(stemGeometry), wire(stemGeometry, lineMaterial(VIOLET, 0.9), 20));
  stem.position.y = -0.45;
  const beam = new Group();
  beam.position.y = 1.45;
  beam.add(slab(4.6, 0.16, 0.16, VIOLET));
  const pivot = dot(0.2, BRIGHT);
  pivot.position.y = 1.45;
  group.add(baseMesh, stem, pivot, beam);
  const pan = (x: number, load: "docs" | "approval") => {
    const hanger = new Group();
    hanger.position.set(x, 0, 0);
    const chains = new LineSegments(
      new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(-0.9, -1.7, 0), new Vector3(0, 0, 0), new Vector3(0.9, -1.7, 0), new Vector3(0, 0, 0), new Vector3(0, -1.7, 0.6)]),
      lineMaterial(INK, 0.6, 0),
    );
    const disc = new CylinderGeometry(1.05, 0.9, 0.14, 32);
    const plate = new Group();
    plate.add(glass(disc), wire(disc, lineMaterial(INK, 0.9), 20));
    plate.position.y = -1.75;
    hanger.add(chains, plate);
    if (load === "docs") {
      [0, 1, 2].forEach((i) => {
        const paper = sheet(0.7, 0.9, i === 1 ? VIOLET : INK);
        paper.rotation.set(-Math.PI / 2 + 0.2, 0, i * 0.5);
        paper.position.set((i - 1) * 0.12, -1.55 + i * 0.07, (i - 1) * 0.1);
        hanger.add(paper);
      });
    } else {
      const orb = glass(new SphereGeometry(0.5, 24, 24));
      orb.position.y = -1.1;
      const check = new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute([-0.22, 0, 0.52, -0.06, -0.17, 0.52, -0.06, -0.17, 0.52, 0.26, 0.2, 0.52], 3)), lineMaterial(VIOLET, 1, 0));
      check.position.y = -1.1;
      hanger.add(orb, check);
    }
    beam.add(hanger);
    return hanger;
  };
  const left = pan(-2.3, "docs");
  const right = pan(2.3, "approval");
  return {
    group,
    update: (t) => {
      group.rotation.y = Math.sin(t * 0.3) * 0.45;
      group.rotation.x = 0.08;
      const tilt = Math.sin(t * 0.7) * 0.1;
      beam.rotation.z = tilt;
      // The pans hang straight whatever the angle of the beam.
      [left, right].forEach((hanger) => (hanger.rotation.z = -tilt));
    },
  };
}

/** How it works: steps going up, and a light that climbs them one at a time to the flag on the last. */
function stages(count = 4): Piece {
  const group = new Group();
  group.add(halo(13, 0.55));
  const tops: Vector3[] = [];
  Array.from({ length: count }, (_, i) => i).forEach((i) => {
    const height = (3.6 * (i + 1)) / count;
    const step = slab(1.5, height, 1.5, i === count - 1 ? VIOLET : INK, 0.9);
    step.position.set((i - (count - 1) / 2) * 1.65, -1.9 + height / 2, 0);
    group.add(step);
    tops.push(new Vector3(step.position.x, -1.9 + height + 0.25, 0));
  });
  const pole = new Line(new BufferGeometry().setFromPoints([tops[count - 1].clone().add(new Vector3(0, -0.25, 0)), tops[count - 1].clone().add(new Vector3(0, 1.4, 0))]), lineMaterial(VIOLET, 0.9, 0));
  const pennant = new LineLoop(
    new BufferGeometry().setFromPoints([tops[count - 1].clone().add(new Vector3(0, 1.4, 0)), tops[count - 1].clone().add(new Vector3(0.8, 1.1, 0)), tops[count - 1].clone().add(new Vector3(0, 0.8, 0))]),
    lineMaterial(BRIGHT, 0.95, 0),
  );
  const climber = dot(0.2, BRIGHT);
  const trail = glass(new SphereGeometry(0.32, 20, 20), 0.8);
  group.add(pole, pennant, climber, trail);
  return {
    group,
    update: (t) => {
      const hops = count - 1;
      const total = hops + 3;
      const time = t % total;
      group.rotation.y = -0.5 + Math.sin(t * 0.3) * 0.3;
      group.rotation.x = 0.12;
      // One hop a second, then a rest on the top while the flag waves.
      const hop = Math.min(hops - 1, Math.floor(time));
      const f = time < hops ? time - hop : 1;
      const from = tops[hop];
      const to = tops[hop + 1];
      climber.position.lerpVectors(from, to, ease(f));
      climber.position.y += Math.sin(Math.min(f, 1) * Math.PI) * (time < hops ? 0.9 : 0);
      const gone = ease(clamp01((time - (total - 0.7)) / 0.6));
      climber.scale.setScalar(Math.max(0.001, 1 - gone));
      trail.position.copy(climber.position);
      trail.scale.setScalar(Math.max(0.001, (1 + Math.sin(t * 5) * 0.12) * (1 - gone)));
      pennant.rotation.y = Math.sin(t * 3) * 0.35;
      pennant.position.x = tops[count - 1].x * (1 - Math.cos(pennant.rotation.y));
      pennant.position.z = Math.sin(pennant.rotation.y) * -tops[count - 1].x;
    },
  };
}

/** A sphere of lit points that breathes, with a glass heart. */
function orb(): Piece {
  const group = new Group();
  group.add(halo(13, 0.7));
  const cloud = new Points(new BufferGeometry().setFromPoints(fibonacci(1500, 2.9)), pointMaterial(INK, 0.075, 0.9, 0.05));
  const heart = glass(new IcosahedronGeometry(1.1, 1));
  const lattice = wire(new IcosahedronGeometry(1.35, 0), lineMaterial(VIOLET, 0.9));
  const band = circle(3.5, lineMaterial(DEEP, 0.4));
  band.rotation.x = 1.4;
  group.add(cloud, heart, lattice, band);
  return {
    group,
    update: (t) => {
      cloud.rotation.y = t * 0.1;
      heart.rotation.set(t * 0.3, t * 0.4, 0);
      lattice.rotation.set(-t * 0.35, -t * 0.5, 0);
      band.rotation.z = t * 0.18;
    },
  };
}

/** Shrinks a piece around its centre. The world scales the outer group itself (phones), so the size is set on an inner one. */
function fitted(build: () => Piece, size: number): () => Piece {
  return () => {
    const piece = build();
    const outer = new Group();
    piece.group.scale.setScalar(size);
    outer.add(piece.group);
    return { group: outer, update: piece.update };
  };
}

const builders = {
  rings,
  robot: fitted(() => robot(), 0.95),
  robotChat: fitted(() => robot("messages"), 0.74),
  robotDocs: fitted(() => robot("documents"), 0.74),
  monogram: fitted(monogram, 0.85),
  flow: fitted(flow, 0.7),
  systems: fitted(systems, 0.6),
  software: fitted(software, 0.72),
  stages: fitted(() => stages(4), 0.52),
  stages3: fitted(() => stages(3), 0.52),
  nexoBooks: fitted(nexoBooks, 0.85),
  archive: fitted(archive, 0.78),
  balance: fitted(balance, 0.72),
  orb,
};

// ---- the cubes that carry one shape into the next ----------------------------------------------

const CUBES = 1100;

/** Deterministic pseudo-random numbers, so the cubes fly the same way on every visit. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Points that outline a piece (its lines, points and small spheres), in the piece's own space. */
function outline(group: Group, count: number, random: () => number) {
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const found: Vector3[] = [];
  group.traverse((object) => {
    if ((object as Sprite).isSprite) return;
    const geometry = (object as Mesh).geometry as BufferGeometry | undefined;
    if (!geometry) return;
    if ((object as Mesh).isMesh) {
      found.push(new Vector3().setFromMatrixPosition(object.matrixWorld).applyMatrix4(toLocal));
      return;
    }
    const position = geometry.getAttribute("position");
    if (position.count < 2) return;
    for (let i = 0; i < position.count; i++) found.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).applyMatrix4(toLocal));
  });
  // Shuffle, then take `count`: pairs each cube with an unrelated spot on the next piece.
  for (let i = found.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [found[i], found[j]] = [found[j], found[i]];
  }
  return Array.from({ length: count }, (_, i) => found[i % found.length].clone().add(new Vector3((random() - 0.5) * 0.08, (random() - 0.5) * 0.08, (random() - 0.5) * 0.08)));
}

/**
 * The scene behind the page: one object per station along a straight corridor, the camera
 * travelling through it as the visitor scrolls. The canvas is transparent so the page's purple
 * light shows through, and distant things fade into it.
 */
export function createWorld(canvas: HTMLCanvasElement, options: { lite: boolean; reduced: boolean }, stations: readonly Pick<Station, "scene" | "side">[] = homeStations) {
  const renderer = new WebGLRenderer({ canvas, antialias: !options.lite, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0xffffff, 0);
  const scene = new Scene();
  scene.fog = new Fog(MIST, 9, 26);
  const camera = new PerspectiveCamera(50, 1, 0.1, 80);

  // Where each piece sits: beside the text on wide screens, centred above it on a phone (set in resize).
  const layout = { fit: 1, lift: 0, distance: 9, portrait: false };
  // How far each piece reaches from its centre (the ribbon is the widest); on a phone this sets its scale.
  const reach = (index: number) => (stations[index].scene === "flow" ? 5.3 : (stations[index].scene === "robotChat" || stations[index].scene === "robotDocs") ? 4.7 : stations[index].scene === "robot" ? 4.3 : stations[index].scene === "nexoBooks" ? 5.3 : stations[index].scene === "monogram" ? 4.9 : 4.5);
  const fitOf = (index: number) => (layout.portrait ? layout.fit * (4.5 / reach(index)) : 1);
  const sideOf = (index: number) => (stations[index].side === "left" ? 3.6 : stations[index].side === "right" ? -3.6 : 0);
  const place = (piece: Piece, index: number) => piece.group.position.set(layout.portrait ? 0 : sideOf(index), layout.lift + (layout.portrait ? ((stations[index].scene === "robot" || stations[index].scene === "robotChat" || stations[index].scene === "robotDocs") ? 0.9 : stations[index].scene === "monogram" ? 0.35 : stations[index].scene === "nexoBooks" ? 1.2 : 0) : 0), -index * SPACING);

  const pieces = stations.map((station, index) => {
    const piece = builders[station.scene]();
    piece.group.position.set(0, 0, -index * SPACING);
    scene.add(piece.group);
    return piece;
  });

  // Fine dust spread along the whole corridor: it gives the camera something to pass through.
  const random = seeded(7);
  const dustCount = options.lite ? 700 : 1800;
  const dustPositions: number[] = [];
  for (let i = 0; i < dustCount; i++) {
    dustPositions.push((random() - 0.5) * 30, (random() - 0.5) * 16, 14 - random() * (pieces.length * SPACING + 20));
  }
  const dust = new Points(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(dustPositions, 3)), pointMaterial(BRIGHT, 0.07, 0.8, 0, [3, 24]));
  dust.frustumCulled = false;
  scene.add(dust);

  // The cubes that carry one station's shape over into the next while the camera travels between them.
  const outlines = pieces.map((piece) => outline(piece.group, CUBES, random));
  const swarm = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), CUBES);
  const scatter = Array.from({ length: CUBES }, () => new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(0.8 + random() * 2.6));
  const spin = Array.from({ length: CUBES }, () => new Vector3(random() * 6, random() * 6, random() * 6));
  const size = Array.from({ length: CUBES }, () => 0.028 + random() * 0.06);
  const palette = [INK, VIOLET, BRIGHT, LAVENDER, VIOLET, DEEP];
  for (let i = 0; i < CUBES; i++) swarm.setColorAt(i, palette[i % palette.length]);
  swarm.frustumCulled = false;
  swarm.visible = false;
  scene.add(swarm);
  const dummy = new Object3D();
  const matrixA = new Matrix4();
  const matrixB = new Matrix4();
  const fitted = new Vector3(1, 1, 1);
  const from = new Vector3();
  const to = new Vector3();
  const smooth = (x: number) => x * x * (3 - 2 * x);

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, options.lite ? 1 : 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Narrow screens: objects sit behind the text, so open the lens a little.
    camera.fov = width < 800 ? 62 : 50;
    camera.updateProjectionMatrix();
    // Portrait: shrink each piece until its widest part fits the screen, pull the camera back a little
    // and lift the piece into the upper half, since the station text sits at the bottom.
    layout.portrait = width < 800 && height > width * 0.9;
    if (layout.portrait) {
      const halfHeight = 12 * Math.tan((camera.fov * Math.PI) / 360);
      const halfWidth = halfHeight * camera.aspect;
      layout.distance = 12;
      // The widest piece reaches about 4.5 units from its centre. Keep it inside the width and inside
      // the band between the header and the text (the top ~40% of the screen).
      // The canvas is as tall as the screen with the browser bars hidden, but while they show the page only
      // has `window.innerHeight`: place everything against what can actually be seen.
      const seen = Math.min(1, window.innerHeight / height);
      layout.fit = MathUtils.clamp(Math.min((halfWidth * 0.9) / 4.5, (halfHeight * 0.36 * seen) / 4.5), 0.3, 1);
      layout.lift = halfHeight * (1 - 0.6 * seen);
    } else {
      layout.distance = 9;
      layout.fit = 1;
      layout.lift = 0;
    }
    scene.fog = new Fog(MIST, layout.portrait ? 15 : 9, layout.portrait ? 32 : 26);
    pieces.forEach(place);
    pointScale.value = (height * ratio) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };
  resize();
  window.addEventListener("resize", resize);

  let frame = 0;
  let last = performance.now();
  let time = 0;
  let shown = journey.station;
  let leaving = 0;
  const look = new Vector3();
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    // Past the corridor the canvas is hidden, otherwise its last frame would show through the page.
    const visibility = journey.active ? "visible" : "hidden";
    if (canvas.style.visibility !== visibility) canvas.style.visibility = visibility;
    if (!journey.active) return;
    time += options.reduced ? 0 : dt;
    clock.value = time;
    // Ease toward where the scroll is, so the camera glides instead of following the wheel step by step.
    shown = options.reduced ? journey.station : MathUtils.damp(shown, journey.station, 5, dt);
    const drift = options.reduced ? 0 : journey.pointer.x * 0.5;
    camera.position.set(
      Math.sin(shown * 0.9) * 0.6 + drift,
      Math.cos(shown * 0.7) * 0.25 - (options.reduced ? 0 : journey.pointer.y * 0.3),
      -shown * SPACING + layout.distance,
    );
    look.set(Math.sin(shown * 0.9) * 0.2, 0, -shown * SPACING - 4);
    camera.lookAt(look);
    // Lean into the move: the camera rolls a little while it travels and straightens when it arrives.
    if (!options.reduced) camera.rotation.z += MathUtils.clamp((journey.station - shown) * 0.05, -0.12, 0.12);

    // After the last station the shape lets go while the page scrolls on.
    leaving = options.reduced ? journey.exit : MathUtils.damp(leaving, journey.exit, 8, dt);
    if (leaving < 0.002) leaving = 0;
    const tail = pieces.length - 1;

    const base = Math.min(Math.floor(shown), pieces.length - 2);
    const t = options.reduced ? 0 : MathUtils.clamp(shown - base, 0, 1);
    const moving = t > 0.015 && t < 0.985;
    pieces.forEach((piece, index) => {
      if (options.reduced) {
        piece.group.visible = Math.abs(index - shown) < 2.6 && !(index === tail && leaving > 0.5);
        if (piece.group.visible) piece.update(time, dt);
        return;
      }
      // The shape in front dissolves in the first half of the move; the next one forms in the second.
      const here = index === base;
      const next = index === base + 1;
      piece.group.visible = here || next;
      if (!piece.group.visible) return;
      const form = here ? 1 - smooth(MathUtils.clamp(t / 0.45, 0, 1)) : smooth(MathUtils.clamp((t - 0.55) / 0.45, 0, 1));
      piece.group.scale.setScalar(fitOf(index) * (index === tail ? form * (1 - smooth(MathUtils.clamp(leaving / 0.4, 0, 1))) : form));
      piece.update(time, dt);
    });
    // After the last station the shape just shrinks away as the page scrolls on: no particles are thrown out.
    swarm.visible = moving;
    if (moving) {
      const a = pieces[base].group;
      const b = pieces[base + 1].group;
      matrixA.compose(a.position, a.quaternion, fitted.setScalar(fitOf(base)));
      matrixB.compose(b.position, b.quaternion, fitted.setScalar(fitOf(base + 1)));
      const travel = smooth(MathUtils.clamp((t - 0.12) / 0.76, 0, 1));
      const burst = Math.sin(Math.PI * t);
      for (let i = 0; i < CUBES; i++) {
        from.copy(outlines[base][i]).applyMatrix4(matrixA);
        to.copy(outlines[base + 1][i]).applyMatrix4(matrixB);
        dummy.position.lerpVectors(from, to, travel).addScaledVector(scatter[i], burst * burst);
        dummy.rotation.set(spin[i].x * t, spin[i].y * t, spin[i].z * t);
        dummy.scale.setScalar(size[i] * fitOf(base) * Math.pow(burst, 0.5));
        dummy.updateMatrix();
        swarm.setMatrixAt(i, dummy.matrix);
      }
      swarm.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    scene.traverse((object) => {
      const item = object as Mesh;
      item.geometry?.dispose?.();
      const material = item.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
    haloTexture?.dispose();
    haloTexture = undefined;
    renderer.dispose();
  };
}
