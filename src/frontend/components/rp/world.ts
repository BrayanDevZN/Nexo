import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  EdgesGeometry,
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
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { journey, stations } from "@/lib/journey";

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

/** A glass core inside a faceted shell, with satellites on tilted orbits and a dial. */
function agent(): Piece {
  const group = new Group();
  group.add(halo(11, 0.65));
  const shell = wire(new IcosahedronGeometry(2.3, 1), lineMaterial(INK, 0.55));
  const lattice = wire(new IcosahedronGeometry(1.55, 0), lineMaterial(VIOLET, 0.85));
  const core = glass(new IcosahedronGeometry(1.1, 2));
  const dial = new Group();
  dial.add(ticks(3.9, 96, 0.26, lineMaterial(DEEP, 0.45)));
  dial.rotation.x = 1.15;
  group.add(shell, lattice, core, dial);
  const orbits: { holder: Group; satellite: Mesh; radius: number; speed: number }[] = [];
  [0.4, 1.2, 2.1].forEach((tilt, index) => {
    const holder = new Group();
    holder.rotation.set(tilt, index, 0);
    const radius = 3.1 + index * 0.35;
    holder.add(circle(radius, lineMaterial(INK, 0.35)));
    const satellite = dot(0.1 + index * 0.02, index === 1 ? BRIGHT : VIOLET);
    holder.add(satellite);
    group.add(holder);
    orbits.push({ holder, satellite, radius, speed: 0.7 + index * 0.25 });
  });
  return {
    group,
    update: (t) => {
      shell.rotation.set(t * 0.09, t * 0.18, 0);
      lattice.rotation.set(-t * 0.2, -t * 0.35, 0);
      core.rotation.y = t * 0.3;
      core.scale.setScalar(1 + Math.sin(t * 1.4) * 0.05);
      dial.rotation.z = t * 0.15;
      orbits.forEach(({ satellite, radius, speed }) => satellite.position.set(Math.cos(t * speed) * radius, Math.sin(t * speed) * radius, 0));
    },
  };
}

/** A ribbon of glass blocks along a wave with light moving through it: steps handing work on. */
function flow(): Piece {
  const group = new Group();
  group.add(halo(12, 0.55));
  const curve = (u: number) => new Vector3((u - 0.5) * 8.6, Math.sin(u * Math.PI * 2) * 1.4, Math.cos(u * Math.PI * 2) * 1.1);
  const boxes: Group[] = [];
  for (let i = 0; i < 7; i++) {
    const block = new Group();
    const geometry = new BoxGeometry(0.85, 0.85, 0.85);
    block.add(glass(geometry), wire(geometry, lineMaterial(i % 3 === 1 ? VIOLET : INK, 0.85)));
    block.position.copy(curve(i / 6));
    group.add(block);
    boxes.push(block);
  }
  const path: number[] = [];
  for (let i = 0; i <= 160; i++) {
    const p = curve(i / 160);
    path.push(p.x, p.y, p.z);
  }
  group.add(new Line(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(path, 3)), lineMaterial(VIOLET, 0.7)));
  // Data packets: a stream of small lights running along the ribbon.
  const packets = 70;
  const stream = new Points(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(new Float32Array(packets * 3), 3)), pointMaterial(BRIGHT, 0.14, 1));
  stream.frustumCulled = false;
  group.add(stream);
  return {
    group,
    update: (t) => {
      group.rotation.y = Math.sin(t * 0.25) * 0.4;
      boxes.forEach((box, index) => box.rotation.set(t * 0.3 + index * 0.4, t * 0.45 + index * 0.6, 0));
      const position = stream.geometry.getAttribute("position");
      for (let i = 0; i < packets; i++) {
        const p = curve((t * 0.1 + i / packets) % 1);
        position.setXYZ(i, p.x, p.y, p.z);
      }
      position.needsUpdate = true;
    },
  };
}

/** A network of lit nodes on a sphere, joined to their neighbours, with a glass heart. */
function systems(): Piece {
  const group = new Group();
  group.add(halo(12, 0.6));
  const nodes = fibonacci(52, 2.7);
  const edges: number[] = [];
  nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => {
    if (a.distanceTo(b) < 1.7) edges.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }));
  const net = new Group();
  net.add(
    new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(edges, 3)), lineMaterial(INK, 0.5)),
    new Points(new BufferGeometry().setFromPoints(nodes), pointMaterial(VIOLET, 0.2, 1)),
  );
  const heart = glass(new IcosahedronGeometry(0.85, 2));
  const ring = circle(3.3, lineMaterial(DEEP, 0.35));
  ring.rotation.x = 1.2;
  group.add(net, heart, ring);
  return {
    group,
    update: (t) => {
      net.rotation.y = t * 0.16;
      net.rotation.z = Math.sin(t * 0.2) * 0.2;
      heart.rotation.set(t * 0.4, t * 0.3, 0);
      heart.scale.setScalar(1 + Math.sin(t * 1.5) * 0.08);
      ring.rotation.z = t * 0.2;
    },
  };
}

/** Layers of glass blocks that slide apart and settle: software built piece by piece. */
function software(): Piece {
  const group = new Group();
  group.add(halo(11, 0.55));
  const blocks: Group[] = [];
  for (let layer = 0; layer < 4; layer++) {
    for (let k = 0; k < (layer === 3 ? 1 : 4); k++) {
      const size = layer === 3 ? 1.3 : 1.1;
      const geometry = new BoxGeometry(size, 0.6, size);
      const block = new Group();
      block.add(glass(geometry), wire(geometry, lineMaterial(layer === 2 && k === 1 ? VIOLET : INK, 0.9)));
      block.userData = { layer, k };
      group.add(block);
      blocks.push(block);
    }
  }
  return {
    group,
    update: (t) => {
      group.rotation.y = t * 0.2;
      group.rotation.x = 0.45;
      const open = (Math.sin(t * 0.6) + 1) / 2;
      blocks.forEach((block) => {
        const { layer, k } = block.userData as { layer: number; k: number };
        const spread = layer === 3 ? 0 : 0.7 + open * 0.8;
        block.position.set(
          (k % 2 === 0 ? -1 : 1) * spread,
          (layer - 1.5) * (0.8 + open * 0.45),
          (k < 2 ? -1 : 1) * spread,
        );
      });
    },
  };
}

/** Four concentric rings, one per stage, each turning at its own pace, with a dial on the last. */
function stages(): Piece {
  const group = new Group();
  group.add(halo(13, 0.55));
  const turning: Group[] = [];
  [1.0, 1.9, 2.8, 3.7].forEach((radius, index) => {
    const ring = new Group();
    ring.add(circle(radius, lineMaterial(index === 3 ? VIOLET : INK, index === 3 ? 0.85 : 0.55)));
    const dotMesh = dot(0.1 + index * 0.015, index % 2 ? BRIGHT : VIOLET);
    dotMesh.position.x = radius;
    ring.add(dotMesh);
    if (index === 3) ring.add(ticks(radius + 0.35, 140, 0.24, lineMaterial(DEEP, 0.45)));
    group.add(ring);
    turning.push(ring);
  });
  const core = glass(new SphereGeometry(0.45, 32, 32));
  group.add(core);
  group.rotation.x = 1.0;
  return {
    group,
    update: (t) => {
      turning.forEach((ring, index) => (ring.rotation.z = t * (0.5 - index * 0.1) * (index % 2 ? -1 : 1)));
      group.rotation.y = Math.sin(t * 0.2) * 0.4;
      core.scale.setScalar(1 + Math.sin(t * 1.8) * 0.15);
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

const builders = { rings, agent, flow, systems, software, stages, orb };

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
export function createWorld(canvas: HTMLCanvasElement, options: { lite: boolean; reduced: boolean }) {
  const renderer = new WebGLRenderer({ canvas, antialias: !options.lite, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0xffffff, 0);
  const scene = new Scene();
  scene.fog = new Fog(MIST, 9, 26);
  const camera = new PerspectiveCamera(50, 1, 0.1, 80);

  // Where each piece sits: beside the text on wide screens, centred above it on a phone (set in resize).
  const layout = { fit: 1, lift: 0, distance: 9, portrait: false };
  // How far each piece reaches from its centre (the ribbon is the widest); on a phone this sets its scale.
  const reach = (index: number) => (stations[index].scene === "flow" ? 5.3 : 4.5);
  const fitOf = (index: number) => (layout.portrait ? layout.fit * (4.5 / reach(index)) : 1);
  const sideOf = (index: number) => (stations[index].side === "left" ? 3.6 : stations[index].side === "right" ? -3.6 : 0);
  const place = (piece: Piece, index: number) => piece.group.position.set(layout.portrait ? 0 : sideOf(index), layout.lift, -index * SPACING);

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
      layout.fit = MathUtils.clamp(Math.min((halfWidth * 0.9) / 4.5, (halfHeight * 0.4) / 4.5), 0.35, 1);
      layout.lift = halfHeight * 0.4;
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

    const base = Math.min(Math.floor(shown), pieces.length - 2);
    const t = options.reduced ? 0 : MathUtils.clamp(shown - base, 0, 1);
    const moving = t > 0.015 && t < 0.985;
    pieces.forEach((piece, index) => {
      if (options.reduced) {
        piece.group.visible = Math.abs(index - shown) < 2.6;
        if (piece.group.visible) piece.update(time, dt);
        return;
      }
      // The shape in front dissolves in the first half of the move; the next one forms in the second.
      const here = index === base;
      const next = index === base + 1;
      piece.group.visible = here || next;
      if (!piece.group.visible) return;
      piece.group.scale.setScalar(fitOf(index) * (here ? 1 - smooth(MathUtils.clamp(t / 0.45, 0, 1)) : smooth(MathUtils.clamp((t - 0.55) / 0.45, 0, 1))));
      piece.update(time, dt);
    });
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
