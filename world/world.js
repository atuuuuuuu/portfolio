// The 3D version: a sunny Frutiger Aero world you walk around in.
// You are "Aero", a little glossy robot. Around a lake (with the favicon spinning above it) are four glass
// plazas, one per section, each with a big glossy 3D icon (the real app icons for the projects).
// Walk onto a plaza, click it, or use the top bar to open its section.
// Extras: grass that sways and parts around you, trees, flowers, butterflies, a jumping fish,
// Windows 7 style aurora swooshes in the sky, soap bubbles to pop, depth-of-field blur and glow.
// Without WebGL (or if three.js can't load) the 'live' class comes off and the plain text version is the page.

const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;

const ZONES = [   // left to right, as seen from the start; angle from straight ahead (north), in degrees
  { key: 'about', angle: -70, top: '#6fe3ff', bottom: '#0a84ff', glyph: 'person', ring: '#2fc6ff' },
  { key: 'projects', angle: -22, ring: '#8a7dff' },
  { key: 'experience', angle: 22, top: '#ffd76a', bottom: '#ff8a00', glyph: 'cap', ring: '#ffb020' },
  { key: 'contact', angle: 70, top: '#a6f27f', bottom: '#14b45f', glyph: 'mail', ring: '#2fd36a' },
];
const APPS = [   // the projects plaza: the icons as they are on GitHub; crop = the square inside the PNG
  { key: 'convrt', src: '../assets/icons/convrt.png', crop: [50, 50, 412], top: '#2a74cc', bottom: '#0a3f8c' },
  { key: 'scrollr', src: '../assets/icons/scrollr.png', crop: [50, 50, 412], top: '#f8a072', bottom: '#e8396b' },
  { key: 'unpacked', src: '../assets/icons/unpacked.png', crop: [0, 0, 512], top: '#262d36', bottom: '#0f1216' },
];
const ZONE_R = 19;       // plazas sit on this circle around the lake
const PATH_R = 14;       // the round path
const LAKE_R = 11.5;     // water edge
const SHORE = 12.7;      // how close to the middle you can walk
const ENTER = 3.4;       // standing this close to a plaza's middle opens it
const PIXELS = .5;       // scene pixels per CSS pixel

async function start() {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/OrbitControls.js');
  const { RoundedBoxGeometry } = await import('three/addons/RoundedBoxGeometry.js');
  const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
  const { BokehPass } = await import('three/addons/postprocessing/BokehPass.js');
  const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
  const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const C = (hex) => new THREE.Color(hex);
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const canvas = document.getElementById('world');
  canvas.tabIndex = -1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no WebGL');
  // A light pixel look, like late-2000s graphics: drawn at half the screen's resolution, scaled up crisply (CSS: pixelated).
  renderer.setPixelRatio(PIXELS);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfeeff, 80, 260);
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 1200);
  const sunDir = V(.5, .65, .45).normalize();
  const time = { value: 0 };

  // ---------- Sky: a gradient dome with a sun; it is also what every glossy surface reflects ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir }, low: { value: C('#e3f7ff') }, mid: { value: C('#4fb4ff') }, top: { value: C('#0b5fd0') } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `
      uniform vec3 sunDir, low, mid, top; varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 col = mix(low, mid, smoothstep(0., .25, h));
        col = mix(col, top, smoothstep(.25, .95, h));
        float s = max(dot(normalize(vDir), sunDir), 0.);
        col += vec3(1., .95, .8) * (pow(s, 900.) * 6. + pow(s, 12.) * .35);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), skyMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMat));
  envScene.add(new THREE.Mesh(new THREE.CircleGeometry(49, 48).rotateX(-Math.PI / 2).translate(0, -3, 0), new THREE.MeshBasicMaterial({ color: 0x4cb24a })));
  scene.environment = pmrem.fromScene(envScene, .02).texture;

  // Aurora swooshes, like the Windows 7 wallpaper: long glowing ribbons that wave slowly across the sky.
  const auroraMat = (a, b, phase) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, a: { value: C(a) }, b: { value: C(b) }, phase: { value: phase } },
    vertexShader: `uniform float uTime, phase; varying vec2 vUv;
      void main() {
        vUv = uv; vec3 p = position;
        p.y += sin(p.x * .018 + uTime * .12 + phase) * 9. + sin(p.x * .05 + phase * 2.) * 2.5;
        p.z += cos(p.x * .012 + uTime * .08 + phase) * 18.;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 a, b; varying vec2 vUv;
      void main() {
        float edge = smoothstep(0., .45, vUv.y) * smoothstep(1., .55, vUv.y) * smoothstep(0., .15, vUv.x) * smoothstep(1., .85, vUv.x);
        float streak = .55 + .45 * sin(vUv.x * 60. + vUv.y * 6. - uTime * .6);
        gl_FragColor = vec4(mix(a, b, vUv.y) * edge * streak * .55, 1.);
      }`,
  });
  [['#7dff9a', '#d8fff0', 0, 46, -120], ['#5fe0ff', '#ffffff', 2.1, 36, -135], ['#c4ff6a', '#7dffd0', 4.2, 56, -150]].forEach(([a, b, ph, y, z]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(420, 16, 220, 1), auroraMat(a, b, ph));
    m.position.set(0, y, z); m.rotation.z = -.08 + ph * .02;
    scene.add(m);
  });

  // ---------- Light ----------
  scene.add(new THREE.HemisphereLight(0xcdefff, 0x5aa84a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .03;
  scene.add(sun, sun.target);

  // ---------- Ground: a meadow around a lake, hills further out ----------
  const groundHeight = (x, z) => {
    const r = Math.hypot(x, z);
    const hills = 2.2 * Math.sin(x * .06 + 1) * Math.cos(z * .05) + 1.2 * Math.sin(x * .13 + z * .09) + 2.4;
    const bumps = .25 * Math.sin(x * .3) * Math.cos(z * .27);
    return bumps * smooth(12, 16, r) + hills * smooth(30, 70, r) - 1.8 * (1 - smooth(9.5, 12.5, r));
  };
  const groundGeo = new THREE.PlaneGeometry(480, 480, 220, 220).rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position, colours = [], c = new THREE.Color();
  const sand = C('#f3e4b5'), low = C('#3aa845'), high = C('#9fdf55');
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), y = groundHeight(x, z), r = Math.hypot(x, z);
    gp.setY(i, y);
    c.copy(low).lerp(high, smooth(-.3, 5, y) * .8 + .1 * Math.sin(x * .2 + z * .17)).lerp(sand, 1 - smooth(11.6, 12.8, r));
    colours.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Water: glossy, with moving ripples (a normal map drawn here, then scrolled)
  const rippleMap = (() => {
    const n = 256, cv = Object.assign(document.createElement('canvas'), { width: n, height: n }), g = cv.getContext('2d'), img = g.createImageData(n, n);
    const h = (x, y) => Math.sin(x * .098) * Math.cos(y * .074) + .6 * Math.sin((x + y) * .147) + .4 * Math.cos((x - y * 1.3) * .221);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1), i = (y * n + x) * 4;
      img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5);
    return t;
  })();
  const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE_R + .8, 128).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x14a8f5, roughness: .06, clearcoat: 1, clearcoatRoughness: .02, transparent: true, opacity: .86, normalMap: rippleMap, normalScale: new THREE.Vector2(.25, .25), envMapIntensity: 1.5 }));
  water.position.y = -.12;
  water.receiveShadow = true;
  scene.add(water);
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(.9, 1, 64).rotateX(-Math.PI / 2);
  function ripple(x, z, size = 1) {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false }));
    m.position.set(x, -.08, z);
    scene.add(m);
    ripples.push({ m, age: 0, size });
  }

  // The path: a stone ribbon round the lake, with a spur to each plaza and one to where you start
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xf2e6c9, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 });
  function ribbon(points, width) {
    const pos = [], idx = [];
    points.forEach((p, i) => {
      const q = points[Math.min(i + 1, points.length - 1)], o = points[Math.max(i - 1, 0)];
      const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * width / 2, nz = dx / l * width / 2;
      pos.push(p.x + nx, groundHeight(p.x + nx, p.z + nz) + .04, p.z + nz, p.x - nx, groundHeight(p.x - nx, p.z - nz) + .04, p.z - nz);
      if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, pathMat); m.receiveShadow = true; scene.add(m);
  }
  ribbon(Array.from({ length: 161 }, (_, i) => { const a = i / 160 * Math.PI * 2; return V(Math.sin(a) * PATH_R, 0, Math.cos(a) * PATH_R); }), 1.7);
  const zonePos = (z) => { const a = z.angle * Math.PI / 180; return V(Math.sin(a) * ZONE_R, 0, -Math.cos(a) * ZONE_R); };
  ZONES.forEach((z) => { const p = zonePos(z); ribbon(Array.from({ length: 12 }, (_, i) => p.clone().multiplyScalar((PATH_R + (ZONE_R - 3.8 - PATH_R) * i / 11) / ZONE_R)), 1.5); });
  ribbon(Array.from({ length: 16 }, (_, i) => V(Math.sin(i * .35) * .6, 0, PATH_R + i * .8)), 1.5);
  const onPath = (x, z) => {
    const r = Math.hypot(x, z);
    if (Math.abs(r - PATH_R) < 1.3) return true;
    if (z > PATH_R && Math.abs(x) < 1.6 && z < PATH_R + 13) return true;
    return ZONES.some((zn) => { const p = zonePos(zn), t = (x * p.x + z * p.z) / (ZONE_R * ZONE_R); const d = Math.hypot(x - p.x * t, z - p.z * t); return t > .7 && t < 1.05 && d < 1.3; });
  };
  const nearZone = (x, z, d) => ZONES.some((zn) => zonePos(zn).distanceTo(V(x, 0, z)) < d);

  // ---------- Materials ----------
  const glossy = (opts) => new THREE.MeshPhysicalMaterial({ roughness: .22, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.1, ...opts });
  const white = glossy({ color: 0xffffff });
  const glow = (hex) => new THREE.MeshBasicMaterial({ color: C(hex).multiplyScalar(2.2), toneMapped: false });   // bright enough to bloom

  // ---------- Grass: thousands of blades that sway in the wind and bend away from you ----------
  const player = { pos: V(0, 0, PATH_R + 9), vy: 0, yaw: Math.PI, speed: 0, auto: null, keys: new Set() };
  const playerU = { value: player.pos };
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-.09, 0, 0, .09, 0, 0, -.065, .4, 0, .065, .4, 0, -.035, .75, 0, .035, .75, 0, 0, 1, 0], 3));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  const grassMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: time, uPlayer: playerU, root: { value: C('#1f7a28') }, tip: { value: C('#b6ee5a') } },
    vertexShader: `uniform float uTime; uniform vec3 uPlayer; varying float vH; varying float vShade;
      void main() {
        vH = position.y;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
        float bend = vH * vH;
        w.x += sin(uTime * 1.7 + w.x * .35 + w.z * .21) * .16 * bend;
        w.z += cos(uTime * 1.3 + w.z * .31) * .1 * bend;
        vec2 d = w.xz - uPlayer.xz; float k = smoothstep(1.6, 0., length(d));
        w.xz += normalize(d + 1e-4) * k * .8 * bend; w.y -= k * .3 * bend;
        vShade = .8 + .2 * sin(w.x * .7) * cos(w.z * .6);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform vec3 root, tip; varying float vH; varying float vShade;
      void main() { gl_FragColor = vec4(mix(root, tip, vH) * vShade, 1.); }`,
  });
  const GRASS = small ? 8000 : 24000;
  const grass = new THREE.InstancedMesh(blade, grassMat, GRASS);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = V(1, 1, 1), p4 = V(0, 0, 0), up = V(0, 1, 0);
  for (let i = 0, n = 0; n < GRASS && i < GRASS * 4; i++) {
    const a = Math.random() * Math.PI * 2, r = 12.3 + Math.sqrt(Math.random()) * 30, x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z) || nearZone(x, z, 4.6)) continue;
    p4.set(x, groundHeight(x, z), z); q4.setFromAxisAngle(up, Math.random() * 6.28); const h = rand(.45, 1.05); s4.set(1, h, 1);
    grass.setMatrixAt(n++, m4.compose(p4, q4, s4));
    grass.count = n;
  }
  grass.frustumCulled = false;
  scene.add(grass);

  // Flowers: little glossy heads in four colours
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12, 1), glossy({ roughness: .4 }), 700);
  const petals = ['#ff7eb6', '#ffffff', '#ffd84d', '#b98cff', '#ff9f5a'].map(C);
  for (let i = 0, n = 0; n < 700 && i < 3000; i++) {
    const a = Math.random() * Math.PI * 2, r = 12.6 + Math.random() * 26, x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z) || nearZone(x, z, 4.8)) continue;
    p4.set(x, groundHeight(x, z) + rand(.3, .6), z); s4.setScalar(rand(.7, 1.3));
    flowers.setMatrixAt(n, m4.compose(p4, q4.identity(), s4)); flowers.setColorAt(n, petals[n % petals.length]); n++;
    flowers.count = n;
  }
  scene.add(flowers);

  // Trees: a bent trunk and a cloud of round, bumpy, glossy leaf blobs, darker underneath
  const bark = new THREE.MeshStandardMaterial({ color: 0x8b5a33, roughness: .85 });
  const leafMat = glossy({ vertexColors: true, roughness: .38, clearcoat: .6 });
  function blob(radius, seed) {
    const g = new THREE.IcosahedronGeometry(radius, 4), p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + .09 * Math.sin(x * 4 + seed) * Math.sin(y * 4.3 + seed) * Math.sin(z * 3.7);
      p.setXYZ(i, x * k, y * k, z * k);
      c.copy(C('#2f8f2c')).lerp(C('#a8ea4e'), smooth(-radius, radius * .9, y)); col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    return g;
  }
  const blobs = [blob(1, 1), blob(1, 2.5), blob(1, 4)];
  function tree(x, z, size) {
    const t = new THREE.Group();
    const tg = new THREE.CylinderGeometry(.13, .26, 2.4, 10, 6).translate(0, 1.2, 0);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + .12 * tp.getY(i) ** 2 / 2.4);
    tg.computeVertexNormals();
    const trunkMesh = new THREE.Mesh(tg, bark); trunkMesh.castShadow = true; t.add(trunkMesh);
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(blobs[k % 3], leafMat), s = rand(.75, 1.15) * (k ? .85 : 1.2);
      b.scale.setScalar(s);
      b.position.set(k ? Math.cos(k * 1.6) * .8 + .25 : .3, 2.7 + (k ? rand(-.3, .5) : .3), k ? Math.sin(k * 1.6) * .8 : 0);
      b.castShadow = true; b.receiveShadow = true;
      t.add(b);
    }
    t.position.set(x, groundHeight(x, z) - .05, z);
    t.scale.setScalar(size);
    t.rotation.y = Math.random() * 6.28;
    t.userData.sway = Math.random() * 6;
    scene.add(t);
    return t;
  }
  const trees = [];
  for (let i = 0; trees.length < (small ? 26 : 44) && i < 600; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(17, 52), x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z) || nearZone(x, z, 6.5) || (Math.abs(x) < 5 && z > 12) || trees.some((t) => Math.hypot(t.position.x - x, t.position.z - z) < 4.5)) continue;
    trees.push(tree(x, z, rand(.8, 1.35)));
  }

  // Pebbles round the shore
  const stone = glossy({ color: 0xd9e4ef, roughness: .5, clearcoat: .4, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * 6.28 + rand(-.15, .15), r = rand(11.4, 12.3), g = new THREE.DodecahedronGeometry(1, 1), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * rand(.85, 1.1), p.getY(k) * rand(.6, .8), p.getZ(k) * rand(.85, 1.1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, stone); m.scale.setScalar(rand(.35, .8)); m.position.set(Math.sin(a) * r, groundHeight(Math.sin(a) * r, Math.cos(a) * r), Math.cos(a) * r);
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }

  // Clouds: clusters of soft white balls, flatter underneath
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: .5 });
  const ball = new THREE.SphereGeometry(1, 24, 16);
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Group(), a = (i / 16) * Math.PI * 2 + Math.random() * .3, r = rand(90, 150);
    cloud.position.set(Math.sin(a) * r, rand(26, 44), -Math.cos(a) * r);
    for (let k = 0; k < 9; k++) {
      const s = rand(3, 7), m = new THREE.Mesh(ball, cloudMat);
      m.scale.set(s, s * .65, s);
      m.position.set((k - 4) * 2.8 + rand(-1, 1), Math.abs(k - 4) < 2 ? rand(1, 3) : rand(-1, 1), rand(-2.5, 2.5));
      cloud.add(m);
    }
    clouds.add(cloud);
  }
  scene.add(clouds);

  // ---------- Glossy 3D icons ----------
  const shine = (() => {   // the Aero shine: a bright, fading band over the top half of every icon
    const cv = Object.assign(document.createElement('canvas'), { width: 256, height: 128 }), g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,.8)'); grad.addColorStop(1, 'rgba(255,255,255,.04)');
    g.fillStyle = grad; g.beginPath(); g.roundRect(0, 0, 256, 128, [60, 60, 120, 120]); g.fill();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  })();
  function tile({ size, depth = size * .26, top, bottom }) {
    const group = new THREE.Group(), radius = size * .18;
    const geo = new RoundedBoxGeometry(size, size, depth, 5, radius);
    const p = geo.attributes.position, col = [], a = C(top), b = C(bottom);
    for (let i = 0; i < p.count; i++) { c.copy(b).lerp(a, p.getY(i) / size + .5); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const body = new THREE.Mesh(geo, glossy({ vertexColors: true }));
    body.castShadow = true;
    group.add(body);
    for (const side of [1, -1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(size * .84, size * .42), shine);
      s.position.set(0, size * .22, side * (depth / 2 + .16));
      if (side < 0) s.rotation.y = Math.PI;
      group.add(s);
    }
    return { group, depth, radius };
  }
  function bothSides(group, make, z) {   // the same mesh on the front and (turned round) the back of a tile
    for (const side of [1, -1]) {
      const m = make();
      m.position.z = side * z;
      if (side < 0) m.rotation.y = Math.PI;
      group.add(m);
    }
  }
  const extrude = (shapes, scale) => {
    const g = new THREE.ExtrudeGeometry(shapes, { depth: .1, bevelEnabled: true, bevelThickness: .04, bevelSize: .03, bevelSegments: 3, curveSegments: 24 });
    g.center(); g.scale(scale, scale, 1);
    return g;
  };
  const GLYPHS = {
    person() {
      const head = new THREE.Shape().absarc(0, .32, .21, 0, Math.PI * 2);
      const body = new THREE.Shape(); body.moveTo(.44, -.52); body.absarc(0, -.52, .44, 0, Math.PI, false); body.closePath();
      return [head, body];
    },
    cap() {
      const top = new THREE.Shape(); top.moveTo(0, .4); top.lineTo(.66, .1); top.lineTo(0, -.2); top.lineTo(-.66, .1); top.closePath();
      const base = new THREE.Shape(); base.moveTo(-.38, -.06); base.lineTo(.38, -.06); base.lineTo(.38, -.36); base.quadraticCurveTo(0, -.54, -.38, -.36); base.closePath();
      const cord = new THREE.Shape(); cord.moveTo(.5, .06); cord.lineTo(.56, .06); cord.lineTo(.56, -.3); cord.lineTo(.5, -.3); cord.closePath();
      const tassel = new THREE.Shape().absarc(.53, -.36, .08, 0, Math.PI * 2);
      return [top, base, cord, tassel];
    },
    mail() {
      const frame = new THREE.Shape(); frame.moveTo(-.62, -.42); frame.lineTo(.62, -.42); frame.lineTo(.62, .42); frame.lineTo(-.62, .42); frame.closePath();
      const hole = new THREE.Path(); hole.moveTo(-.52, -.32); hole.lineTo(-.52, .32); hole.lineTo(.52, .32); hole.lineTo(.52, -.32); hole.closePath();
      frame.holes.push(hole);
      const flap = new THREE.Shape(); flap.moveTo(-.52, .32); flap.lineTo(0, -.04); flap.lineTo(.52, .32); flap.lineTo(.52, .19); flap.lineTo(0, -.18); flap.lineTo(-.52, .19); flap.closePath();
      return [frame, flap];
    },
  };
  function glyphIcon({ top, bottom, glyph }, size) {
    const t = tile({ size, top, bottom });
    const geo = extrude(GLYPHS[glyph](), size * .62);
    bothSides(t.group, () => { const m = new THREE.Mesh(geo, white); m.castShadow = true; return m; }, t.depth / 2 + .04);
    return t.group;
  }
  const loader = new THREE.ImageLoader();
  function appIcon(app, size) {
    const t = tile({ size, top: app.top, bottom: app.bottom });
    const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = glossy({ map: tex, transparent: true, alphaTest: .5 });
    loader.load(app.src, (img) => {
      const g = cv.getContext('2d'), [sx, sy, sw] = app.crop;
      g.beginPath(); g.roundRect(0, 0, 512, 512, 512 * (t.radius / size) * 1.1); g.clip();
      g.drawImage(img, sx, sy, sw, sw, 0, 0, 512, 512);
      tex.needsUpdate = true;
    });
    bothSides(t.group, () => new THREE.Mesh(new THREE.PlaneGeometry(size * .985, size * .985), mat), t.depth / 2 + .004);
    return t.group;
  }
  function favicon(size) {   // the favicon in 3D: an ultramarine tile with the three waves (white, pink, white) raised on it
    const t = tile({ size, top: '#4f74ff', bottom: '#1638C9' });
    const waves = [[[10, 22], [20, 13], [32, 28], [54, 18], 0xffffff], [[10, 34], [22, 26], [32, 42], [54, 32], 0xe0115f], [[10, 46], [20, 37], [32, 52], [54, 42], 0xffffff]];
    const P = ([x, y]) => V((x - 32) / 64 * size, (32 - y) / 64 * size, 0);
    const r = 2.5 / 64 * size;
    for (const [a, b, cc, d, colour] of waves) {
      const curve = new THREE.CubicBezierCurve3(P(a), P(b), P(cc), P(d));
      const mat = glossy({ color: colour });
      bothSides(t.group, () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r, 14), mat));
        for (const end of [P(a), P(d)]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat); cap.position.copy(end); g.add(cap); }
        g.traverse((m) => { m.castShadow = true; });
        return g;
      }, t.depth / 2 + r * .6);
    }
    return t.group;
  }

  // ---------- Plazas: a glossy white disc, a glowing ring, a glass plinth, a beam of light and the icon ----------
  const plazaMat = glossy({ color: 0xf7fbff, roughness: .3 });
  const glassMat = glossy({ color: 0xc8f0ff, transparent: true, opacity: .45, roughness: .05 });
  const clickables = [], spinners = [], zones = [];
  ZONES.forEach((spec, i) => {
    const group = new THREE.Group(), p = zonePos(spec);
    group.position.set(p.x, groundHeight(p.x, p.z), p.z);
    group.lookAt(0, group.position.y, 0);   // face the lake
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, .4, 72), plazaMat);
    disc.position.y = .1; disc.receiveShadow = disc.castShadow = true;
    const step = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, .25, 72), plazaMat);
    step.position.y = .4; step.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.85, .06, 12, 128).rotateX(Math.PI / 2), glow(spec.ring));
    ring.position.y = .32;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, .7, 48), glassMat);
    plinth.position.y = .87;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 5, 48, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { col: { value: C(spec.ring) }, uTime: time },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 col; uniform float uTime; varying vec2 vUv; void main() { float a = (1. - vUv.y) * .35 * (.7 + .3 * sin(vUv.x * 40. + uTime * 2.)); gl_FragColor = vec4(col * a, 1.); }',
    }));
    beam.position.y = 3.7;
    group.add(disc, step, ring, plinth, beam);
    group.userData = { key: spec.key, ring, centre: group.position.clone(), inside: false };
    const icons = spec.key === 'projects'
      ? APPS.map((app, k) => { const ic = appIcon(app, 1.6); ic.position.set((k - 1) * 2.05, 3.1 + (k === 1 ? .35 : 0), 0); ic.userData = { key: app.key, spin: k * .8 }; return ic; })
      : [Object.assign(glyphIcon(spec, 2.2), { userData: { key: spec.key, spin: i } })];
    icons.forEach((ic) => { if (spec.key !== 'projects') ic.position.set(0, 3.3, 0); ic.userData.y = ic.position.y; group.add(ic); spinners.push(ic); clickables.push(ic); });
    [disc, step, plinth].forEach((m) => clickables.push(m));
    disc.userData.key = step.userData.key = plinth.userData.key = spec.key;
    scene.add(group);
    zones.push(group);
  });

  const logo = favicon(3.6);
  logo.position.set(0, 4.2, 0);
  logo.userData = { key: 'logo' };
  scene.add(logo);
  clickables.push(logo);
  let logoBoost = 0;

  // ---------- Aero, the character ----------
  const hero = new THREE.Group(), heroBody = new THREE.Group();
  hero.add(heroBody);
  heroBody.position.y = 1.05;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.62, 48, 32), glossy({ color: 0xffffff, roughness: .15 }));
  shell.scale.set(1, .94, 1); shell.castShadow = true;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.628, 48, 32, Math.PI * .05, Math.PI * .9, Math.PI * .3, Math.PI * .36),
    glossy({ color: 0x0a2440, roughness: .05, metalness: .3 }));
  visor.scale.copy(shell.scale);
  const eyeGeo = new THREE.CapsuleGeometry(.055, .13, 6, 12), eyeMat = glow('#6ff6ff');
  const eyes = [-.17, .17].map((x) => { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(x, .06, .6); return e; });
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.6, .03, 10, 64).rotateX(Math.PI / 2), glow('#2fc6ff'));
  belt.position.y = -.14;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .32, 8).translate(0, .16, 0), white);
  antenna.position.set(0, .56, 0); antenna.rotation.z = -.15;
  const bobble = new THREE.Mesh(new THREE.SphereGeometry(.08, 16, 12), glow('#ff4f9a'));
  bobble.position.set(.05, .88, 0);
  const hands = [-1, 1].map((s) => { const h = new THREE.Mesh(new THREE.SphereGeometry(.15, 24, 16), white); h.position.set(s * .8, -.15, .05); h.castShadow = true; return h; });
  const jet = new THREE.Mesh(new THREE.CircleGeometry(.32, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  jet.position.y = -.62;
  heroBody.add(shell, visor, ...eyes, belt, antenna, bobble, ...hands, jet);
  const blobShadow = new THREE.Mesh(new THREE.CircleGeometry(.55, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a3a20, transparent: true, opacity: .25, depthWrite: false }));
  blobShadow.position.y = .05;
  hero.add(blobShadow);
  scene.add(hero);

  // ---------- Bubbles ----------
  const bubbleMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: time },
    vertexShader: `varying vec3 vN, vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; varying vec3 vN, vV;
      void main() {
        float f = 1. - abs(dot(vN, vV));
        vec3 film = .55 + .45 * cos(6.2831 * (f * 1.5 + uTime * .05 + vec3(0., .33, .67)));
        vec3 L = normalize(vec3(-.35, .55, .75));
        float spot = pow(max(dot(reflect(-L, vN), vV), 0.), 70.);
        gl_FragColor = vec4(mix(vec3(1.), film, .6) + spot * 2., .06 + pow(f, 2.2) * .7 + spot);
      }`,
  });
  const bubbleGeo = new THREE.SphereGeometry(1, 32, 16);
  const bubbles = [];
  function respawn(b, anywhere) {
    const a = Math.random() * Math.PI * 2, r = rand(2, 26);
    b.position.set(Math.sin(a) * r, anywhere ? rand(.5, 9) : -.3, Math.cos(a) * r);
    Object.assign(b.userData, { speed: rand(.35, .8), size: rand(.3, .75), phase: rand(0, 6), pop: -1 });
    b.scale.setScalar(b.userData.size);
  }
  for (let i = 0; i < 34; i++) {
    const b = new THREE.Mesh(bubbleGeo, bubbleMat);
    b.userData.key = 'bubble';
    respawn(b, true);
    b.renderOrder = 2;
    scene.add(b);
    bubbles.push(b);
    clickables.push(b);
  }
  const sparks = [];
  const sparkMat = new THREE.PointsMaterial({ color: 0xffffff, size: .16, transparent: true, depthWrite: false });
  function burst(at, colour) {
    const n = 18, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y, at.z], i * 3); vel.push(V(rand(-1, 1), rand(-.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 4))); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, sparkMat.clone());
    if (colour) p.material.color.set(colour);
    scene.add(p);
    sparks.push({ p, vel, age: 0 });
  }
  const counter = document.querySelector('.bubbles .count'), counterBox = counter?.parentElement;
  let popped = 0;
  function pop(b) {
    if (b.userData.pop >= 0) return;
    b.userData.pop = 0;
    burst(b.position);
    counter.textContent = ++popped;
    counterBox.classList.remove('pop'); void counterBox.offsetWidth; counterBox.classList.add('pop');
  }

  // ---------- Life: butterflies and a fish that jumps ----------
  const wingGeo = new THREE.CircleGeometry(.22, 16).scale(1, .7, 1).translate(.2, 0, 0);
  const butterflies = Array.from({ length: 8 }, (_, i) => {
    const b = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: ['#ff7eb6', '#ffd84d', '#7fd3ff', '#ffffff'][i % 4], side: THREE.DoubleSide, roughness: .5 });
    const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat); r.rotation.y = Math.PI;
    b.add(l, r); b.userData = { l, r, a: rand(0, 6), cx: rand(-28, 28), cz: rand(-28, 28), R: rand(3, 6), s: rand(.25, .45) };
    scene.add(b);
    return b;
  });
  const fish = new THREE.Group();
  const fishBody = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .5, 8, 16).rotateZ(Math.PI / 2), glossy({ color: 0xff8a3d }));
  const fishTail = new THREE.Mesh(new THREE.ConeGeometry(.2, .3, 3).rotateZ(-Math.PI / 2).translate(-.5, 0, 0), glossy({ color: 0xffb37a }));
  fish.add(fishBody, fishTail); fish.visible = false; scene.add(fish);
  let fishJump = null, nextFish = 3;

  // ---------- Labels ----------
  const labelBox = document.querySelector('.labels');
  const labelFor = (text, cls) => { const el = document.createElement('span'); el.className = `label ${cls || ''}`; el.textContent = text; labelBox.append(el); return el; };
  const labels = [
    ...zones.map((g) => ({ el: labelFor(document.getElementById(`${g.userData.key}-title`).textContent), obj: g, dy: 5.6, key: g.userData.key })),
    ...spinners.filter((s) => APPS.some((a) => a.key === s.userData.key)).map((s) => ({ el: labelFor(document.querySelector(`#${s.userData.key} h3`).textContent.trim(), 'small'), obj: s, dy: -1.3, key: s.userData.key })),
  ];

  // ---------- Camera: follows Aero; drag to look around, scroll to zoom ----------
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: .08, enablePan: false, minDistance: 5, maxDistance: 34, maxPolarAngle: 1.42, minPolarAngle: .5, rotateSpeed: .55 });
  const follow = () => player.pos.clone().add(V(0, 2.2, 0));
  player.pos.y = groundHeight(player.pos.x, player.pos.z);
  controls.target.copy(follow());
  camera.position.copy(controls.target).add(small ? V(0, 4.5, 19) : V(0, 3.2, 14));

  // ---------- Blur and glow ----------
  let W = 0, H = 0;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = small ? null : new BokehPass(scene, camera, { focus: 14, aperture: .0003, maxblur: .004 });
  if (bokeh) composer.addPass(bokeh);
  composer.setPixelRatio(PIXELS);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .28, .5, .96);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.fov = W < H ? 60 : 45;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Panels ----------
  const panel = document.getElementById('panel');
  const body = panel.querySelector('.panel-body');
  const title = panel.querySelector('.window-title');
  const links = [...document.querySelectorAll('.tabs a')];
  const baseTitle = document.title;
  let selected = null;
  panel.tabIndex = -1;
  function open(section, anchor) {
    const copy = section.cloneNode(true);
    copy.querySelectorAll('[id]').forEach((e) => { e.dataset.anchor = e.id; e.removeAttribute('id'); });
    copy.querySelector('h2').id = 'panel-title';
    copy.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; });
    body.replaceChildren(...copy.childNodes);
    initCopy(body);
    if (title) title.textContent = section.querySelector('h2').textContent;
    selected = section.id;
    minimise(false);
    html.classList.add('open');
    panel.hidden = false;
    requestAnimationFrame(() => {
      panel.classList.add('in');
      const el = anchor && body.querySelector(`[data-anchor="${anchor}"]`);
      body.scrollTop = el ? el.offsetTop - body.offsetTop - 12 : 0;
    });
    panel.focus({ preventScroll: true });
    links.forEach((a) => a.toggleAttribute('aria-current', a.hash === `#${section.id}`));
    document.title = `${section.querySelector('h2').textContent} · ${baseTitle}`;
    const z = zones.find((g) => g.userData.key === section.id);
    if (z.position.distanceTo(player.pos) > ENTER) player.auto = z.position.clone().multiplyScalar(1 - 2.2 / ZONE_R);   // walk over there
  }
  function close() {
    selected = null;
    player.auto = null;   // stop walking there
    minimise(false); maximise(false);
    html.classList.remove('open');
    panel.classList.remove('in');
    panel.hidden = true;
    links.forEach((a) => a.removeAttribute('aria-current'));
    document.title = baseTitle;
    canvas.focus({ preventScroll: true });
  }
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    const section = el?.closest('.sections section');
    if (section) open(section, el === section ? null : id); else if (selected) close();
  }
  const goHome = () => { history.pushState(null, '', location.pathname + location.search); route(); };
  const goTo = (key) => { if (location.hash !== `#${key}`) location.hash = key; else route(); };
  addEventListener('hashchange', route);
  panel.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); goHome(); }));
  // Minimise: the window shrinks to a button at the bottom (like the taskbar); click it to bring the window back.
  const restore = document.querySelector('.restore'), maxBtn = panel.querySelector('[data-max]');
  const minimise = (on) => {
    panel.classList.toggle('min', on);
    restore.hidden = !on;
    if (on) restore.querySelector('span').textContent = title.textContent; else panel.focus({ preventScroll: true });
  };
  const maximise = (on) => {
    panel.classList.toggle('max', on);
    maxBtn.setAttribute('aria-label', on ? 'Restore down' : 'Maximise'); maxBtn.title = maxBtn.getAttribute('aria-label');
  };
  panel.querySelector('[data-min]').addEventListener('click', () => minimise(true));
  maxBtn.addEventListener('click', () => maximise(!panel.classList.contains('max')));
  panel.querySelector('.titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('button, a')) maximise(!panel.classList.contains('max')); });
  restore.addEventListener('click', () => minimise(false));

  // ---------- Keys: WASD or arrows to walk, Shift to run, Space to jump, Esc to close ----------
  const typing = () => panel.contains(document.activeElement) && document.activeElement !== panel;
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected) { goHome(); return; }
    if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (selected && document.activeElement === panel && /Arrow/.test(e.key)) return;   // arrows scroll the open window
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(k)) {
      player.keys.add(k); player.auto = null; e.preventDefault();
      if (k === 'Space' && player.pos.y <= groundHeight(player.pos.x, player.pos.z) + .01) player.vy = 7;
    }
  });
  addEventListener('keyup', (e) => player.keys.delete(e.code));
  addEventListener('blur', () => player.keys.clear());

  // ---------- Pointer: hover, click to open, pop or walk somewhere ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hovered = null, down = null;
  const marker = new THREE.Mesh(new THREE.RingGeometry(.35, .5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(marker);
  function aim(x, y) { ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera); }
  function hit(x, y) {
    aim(x, y);
    for (const h of ray.intersectObjects(clickables, true)) {
      let o = h.object;
      while (o && !o.userData.key) o = o.parent;
      if (o) return o;
    }
    return null;
  }
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down.moved = true; canvas.classList.add('dragging'); }
    if (!down && e.pointerType === 'mouse') hovered = hit(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    if (down && !down.moved) {
      const o = hit(e.clientX, e.clientY), key = o?.userData.key;
      if (key === 'bubble') pop(o);
      else if (key === 'logo') { logoBoost = 14; burst(logo.position, 0xffd0ea); }
      else if (key) goTo(key);
      else {   // walk to where you clicked
        aim(e.clientX, e.clientY);
        const g = ray.intersectObject(ground)[0];
        if (g) { player.auto = g.point.clone(); marker.position.set(g.point.x, g.point.y + .06, g.point.z); marker.material.opacity = .9; }
      }
    }
    down = null;
  });
  canvas.addEventListener('pointerleave', () => { hovered = null; });

  // ---------- Every frame ----------
  const clock = new THREE.Clock();
  let nextRipple = 0, last = player.pos.clone();
  const wp = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), move = new THREE.Vector3();
  const toScreen = (v) => { const p = v.clone().project(camera); return p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2 ? { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H } : null; };
  const offset = { x: 0, y: 0 };
  renderer.setAnimationLoop(() => {
    const dt = Math.min(.05, clock.getDelta());
    const t = time.value += reduce ? 0 : dt;

    // walking
    const k = player.keys;
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); side.crossVectors(fwd, up);
    move.set(0, 0, 0);
    if (k.has('KeyW') || k.has('ArrowUp')) move.add(fwd);
    if (k.has('KeyS') || k.has('ArrowDown')) move.sub(fwd);
    if (k.has('KeyD') || k.has('ArrowRight')) move.add(side);
    if (k.has('KeyA') || k.has('ArrowLeft')) move.sub(side);
    if (!move.lengthSq() && player.auto) {
      move.set(player.auto.x - player.pos.x, 0, player.auto.z - player.pos.z);
      if (move.length() < .3) { player.auto = null; move.set(0, 0, 0); }
    }
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || (player.auto && player.pos.distanceTo(player.auto) > 8);
    const target = move.lengthSq() ? (running ? 10 : 6) : 0;
    player.speed += (target - player.speed) * Math.min(1, dt * 8);
    if (move.lengthSq()) {
      move.normalize();
      // around the lake, not through it: slide along the shore
      const next = player.pos.clone().addScaledVector(move, player.speed * dt);
      const r = Math.hypot(next.x, next.z);
      if (r < SHORE) next.multiplyScalar(SHORE / r);
      if (r > 60) next.multiplyScalar(60 / r);
      player.pos.x = next.x; player.pos.z = next.z;
      let d = Math.atan2(move.x, move.z) - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      player.yaw += d * Math.min(1, dt * 10);
    }
    const floor = groundHeight(player.pos.x, player.pos.z);
    player.vy -= 20 * dt;
    player.pos.y = Math.max(floor, player.pos.y + player.vy * dt);
    if (player.pos.y <= floor) player.vy = 0;
    hero.position.copy(player.pos);
    hero.rotation.y = player.yaw;
    const sf = player.speed / 10, air = player.pos.y - floor;
    heroBody.position.y = 1.05 + (reduce ? 0 : Math.sin(t * (2 + sf * 10)) * (.06 + sf * .05));
    heroBody.rotation.x = sf * .3;
    hands.forEach((h, i) => { h.position.z = .05 + Math.sin(t * 8 + i * Math.PI) * sf * .35; h.position.y = -.15 + Math.sin(t * 2 + i) * .04; });
    const blink = !reduce && (t % 4) < .12 ? .15 : 1;
    eyes.forEach((e) => { e.scale.y = blink; });
    jet.material.opacity = .35 + .25 * Math.sin(t * 20) + air * .1;
    blobShadow.position.y = floor - player.pos.y + .05; blobShadow.scale.setScalar(1 / (1 + air * .4));
    // the camera keeps its angle and follows
    const ft = follow(), delta = ft.clone().sub(controls.target);
    controls.target.add(delta); camera.position.add(delta);
    controls.update();
    sun.position.copy(player.pos).addScaledVector(sunDir, 50); sun.target.position.copy(player.pos);
    if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(ft);

    // plazas: step on one to open it
    zones.forEach((z) => {
      const d = Math.hypot(player.pos.x - z.position.x, player.pos.z - z.position.z), u = z.userData;
      if (d < ENTER && !u.inside) { u.inside = true; if (selected !== u.key) goTo(u.key); }
      if (d > ENTER + 1) u.inside = false;
      const s = 1 + (u.inside ? .06 : .02) * Math.sin(t * 4);
      u.ring.scale.set(s, 1, s);
    });

    // slide the picture sideways (or up on phones) so you can see past the open window
    const docked = selected && !panel.classList.contains('min') && !panel.classList.contains('max');
    const gx = docked && W > 760 ? -.2 * W : 0, gy = docked && W <= 760 ? .18 * H : 0, ko = reduce ? 1 : 1 - Math.exp(-dt * 4);
    offset.x += (gx - offset.x) * ko; offset.y += (gy - offset.y) * ko;
    if (Math.abs(offset.x) + Math.abs(offset.y) > .5) camera.setViewOffset(W, H, offset.x, offset.y, W, H); else camera.clearViewOffset();

    // icons, logo, nature
    logoBoost *= Math.exp(-dt * 1.2);
    logo.rotation.y += dt * (reduce ? 0 : .5 + logoBoost);
    logo.position.y = 4.2 + Math.sin(t * .9) * .25;
    const hotKey = hovered?.userData.key;
    spinners.forEach((s) => {
      s.rotation.y = Math.sin(t * .8 + s.userData.spin) * .6 + t * .3;
      s.position.y = s.userData.y + Math.sin(t * 1.2 + s.userData.spin) * .15;
      const want = s.userData.key === hotKey || s.parent.userData.key === hotKey ? 1.15 : 1;
      s.scale.setScalar(s.scale.x + (want - s.scale.x) * .15);
    });
    trees.forEach((tr) => { tr.rotation.z = Math.sin(t * .9 + tr.userData.sway) * .015; });
    if (!reduce) clouds.rotation.y += dt * .004;
    rippleMap.offset.set(t * .01, t * .006);
    butterflies.forEach((b) => {
      const u = b.userData, a = u.a + t * u.s;
      b.position.set(u.cx + Math.sin(a) * u.R, 1 + Math.sin(a * 3) * .4 + groundHeight(u.cx, u.cz), u.cz + Math.cos(a * 1.3) * u.R);
      b.rotation.y = a + Math.PI / 2;
      const f = Math.sin(t * 18 + u.a) * .9; u.l.rotation.y = f; u.r.rotation.y = Math.PI - f;
    });
    if (!reduce && t > nextFish && !fishJump) {
      const a = rand(0, 6.28), r = rand(3, 8), dir = rand(0, 6.28);
      fishJump = { x: Math.sin(a) * r, z: Math.cos(a) * r, dir, age: 0 };
      ripple(fishJump.x, fishJump.z, 1.4);
    }
    if (fishJump) {
      const j = fishJump, u = j.age / 1.1;
      fish.visible = true;
      fish.position.set(j.x + Math.cos(j.dir) * u * 2.5, -.2 + Math.sin(u * Math.PI) * 1.8, j.z + Math.sin(j.dir) * u * 2.5);
      fish.rotation.set(0, -j.dir, Math.cos(u * Math.PI) * .9);
      j.age += dt;
      if (u >= 1) { ripple(fish.position.x, fish.position.z, 1.4); fish.visible = false; fishJump = null; nextFish = t + rand(3, 7); }
    }

    // bubbles: they rise; walking into one pops it too
    bubbles.forEach((b) => {
      const u = b.userData;
      if (u.pop >= 0) {
        u.pop += dt;
        b.scale.setScalar(u.size * (1 + u.pop * 4));
        if (u.pop > .12) respawn(b, false);
        return;
      }
      if (b.position.distanceTo(hero.position.clone().add(heroBody.position)) < u.size + .65) { pop(b); return; }
      if (reduce) return;
      b.position.y += u.speed * dt;
      b.position.x += Math.sin(t * .8 + u.phase) * dt * .3;
      if (b.position.y > 16) respawn(b, false);
    });
    sparks.forEach((s) => {
      s.age += dt;
      const a = s.p.geometry.attributes.position;
      s.vel.forEach((v, i) => { a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt); v.y -= dt * 3; });
      a.needsUpdate = true;
      s.p.material.opacity = 1 - s.age / .7;
    });
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].age > .7) { scene.remove(sparks[i].p); sparks[i].p.geometry.dispose(); sparks.splice(i, 1); }
    if (!reduce && t > nextRipple) { nextRipple = t + 1.1; const a = rand(0, 6.28), r = rand(0, 10); ripple(Math.sin(a) * r, Math.cos(a) * r); }
    ripples.forEach((r) => { r.age += dt; r.m.scale.setScalar((.3 + r.age * 1.4) * r.size); r.m.material.opacity = .7 * (1 - r.age / 2.2); });
    for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].age > 2.2) { scene.remove(ripples[i].m); ripples[i].m.material.dispose(); ripples.splice(i, 1); }
    marker.material.opacity = Math.max(0, marker.material.opacity - dt * .8);
    if (player.pos.distanceTo(last) > .01) { last.copy(player.pos); html.classList.add('moved'); }

    canvas.classList.toggle('over', !!hovered);
    labels.forEach((l) => {
      l.obj.getWorldPosition(wp); wp.y += l.dy;
      const q = toScreen(wp);
      l.el.style.opacity = q && (!selected || panel.classList.contains('min')) ? 1 : 0;
      if (q) l.el.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -50%)`;
      l.el.classList.toggle('hot', l.key === hotKey || l.obj.userData.key === hotKey);
    });
    composer.render();
  });
  html.classList.add('world');
  route();
  tour(small);

  // for test/browser.mjs: where things are on screen, and what is open
  const byKey = (key) => (key === 'logo' ? logo : key === 'hero' ? hero : zones.find((g) => g.userData.key === key) || spinners.find((s) => s.userData.key === key));
  window.scene = {
    project: (key) => { const o = byKey(key); o.getWorldPosition(wp); if (zones.includes(o)) wp.y += .45; return toScreen(wp); },   // a plaza: the middle of its floor
    get selected() { return selected; },
    get popped() { return popped; },
    get player() { return player.pos.toArray(); },
    bubble: () => { const ok = (q) => q && q.y > 140 && q.y < H - 140 && q.x > 60 && q.x < W - 60; const b = bubbles.find((x) => ok(toScreen(x.position)) && x.position.distanceTo(player.pos) > 3 && x.position.distanceTo(camera.position) < 25); return b && toScreen(b.position); },
  };
}

// ---------- How to play: a short tour on the first visit (and again from the ? button) ----------
function tour(touch) {
  const box = document.querySelector('.tour');
  if (!box) return;
  const STEPS = [
    ['Welcome to Aero World', "Hi, I'm Usukhbayar. This is my portfolio as a little world. You are Aero, the robot in the middle.", 'hero'],
    ['Walk around', touch ? 'Tap anywhere on the grass and Aero walks there.' : 'Use W A S D or the arrow keys to walk. Hold Shift to run and press Space to jump. Or just click anywhere on the grass.', 'keys'],
    ['Look around', touch ? 'Drag to turn the camera. Pinch to zoom.' : 'Drag to turn the camera. Scroll to zoom in and out.', 'look'],
    ['Visit the plazas', 'Each glowing plaza is one part of my portfolio: About me, Projects, Experience and Contact. Walk onto one, click it, or use the buttons at the top.', 'plaza'],
    ['Pop the bubbles', 'Walk into bubbles or click them to pop them. Your score is at the top right. Press the ? button any time to see this again.', 'bubble'],
  ];
  const [h, text, art, step, back, next] = ['h2', '.tour-text', '.tour-art', '.tour-step', '[data-back]', '[data-next]'].map((q) => box.querySelector(q));
  let i = 0;
  const show = () => {
    const [t, p, a] = STEPS[i];
    h.textContent = t; text.textContent = p; art.dataset.art = a;
    step.textContent = `${i + 1} of ${STEPS.length}`;
    back.disabled = i === 0;
    next.textContent = i === STEPS.length - 1 ? 'Start playing' : 'Next';
  };
  const done = () => { box.hidden = true; try { localStorage.setItem('aero-tour', 'done'); } catch {} };
  const open = () => { i = 0; show(); box.hidden = false; next.focus({ preventScroll: true }); };
  next.addEventListener('click', () => { if (i < STEPS.length - 1) { i++; show(); } else done(); });
  back.addEventListener('click', () => { if (i > 0) { i--; show(); } });
  box.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', done));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
  document.querySelector('[data-tour]')?.addEventListener('click', open);
  let seen = false;
  try { seen = localStorage.getItem('aero-tour') === 'done'; } catch {}
  if (!seen && !location.hash && !/[?&]notour\b/.test(location.search)) open();
}

// ---------- Copy email (in the text version and inside the Contact window) ----------
function initCopy(root) {
  const button = root.querySelector('[data-copy]');
  const status = root.querySelector('.copy-status');
  if (!button) return;
  button.hidden = false;   // hidden in the HTML so it never shows as a dead button without JS
  const fallback = (text) => {   // older browsers and plain http: the old copy command
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
  };
  let timer;
  button.addEventListener('click', async () => {
    const text = button.dataset.copy;
    clearTimeout(timer);
    try {
      try { await navigator.clipboard.writeText(text); } catch { fallback(text); }
      status.textContent = 'Email copied.';
      timer = setTimeout(() => { status.textContent = ''; }, 4000);
    } catch {
      // stays up: the reader needs time to copy it by hand
      status.textContent = `Couldn't copy. Select the address above, or write to ${text}.`;
    }
  });
}

// Windows 7 taskbar glow: follows the cursor along a button
document.querySelectorAll('.tabs a').forEach((a) => a.addEventListener('pointermove', (e) => a.style.setProperty('--mx', `${e.clientX - a.getBoundingClientRect().left}px`)));
document.querySelectorAll('[data-year]').forEach((e) => { e.textContent = new Date().getFullYear(); });
initCopy(document.querySelector('.sections'));
if (html.classList.contains('live')) {
  start().catch((err) => { html.classList.remove('live'); console.warn('3D version off:', err.message); });
}
