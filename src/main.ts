import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type Inputs = {
  throttleUp: boolean;
  throttleDown: boolean;
  brake: boolean;
  yawL: boolean; yawR: boolean;
  pitchU: boolean; pitchD: boolean;
  rollL: boolean; rollR: boolean;
  detachCargo: boolean;
  detonateCargo: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const SCALE = {
  STATION_SIZE: 0.6,
  MAX_SPEED: 6.5,  // 3 km/s (3000 m/s)
  RENDER_SCALE: 0.001,
};

const toRender = (km: number) => km * SCALE.RENDER_SCALE;
const toKm = (units: number) => units / SCALE.RENDER_SCALE;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

renderer.domElement.tabIndex = 1;
renderer.domElement.focus();

const startMessage = document.getElementById('start-message');
const splashScreen = document.getElementById('splash-screen');

// Handle splash screen dismissal
let splashDismissed = false;

function dismissSplash() {
  if (!splashDismissed && splashScreen) {
    splashDismissed = true;
    splashScreen.classList.add('hidden');
    renderer.domElement.focus();
    if (startMessage) startMessage.classList.add('hidden');
  }
}

// Dismiss splash on any key press
window.addEventListener('keydown', () => {
  if (!splashDismissed) {
    dismissSplash();
  }
}, { once: false });

// Dismiss splash on click (after splash is gone, normal click behavior resumes)
document.addEventListener('click', () => {
  if (!splashDismissed) {
    dismissSplash();
  }
});

renderer.domElement.addEventListener('click', () => {
  renderer.domElement.focus();
  if (startMessage) startMessage.classList.add('hidden');
});

window.addEventListener('keydown', () => {
  if (startMessage && !startMessage.classList.contains('hidden')) {
    startMessage.classList.add('hidden');
  }
}, { once: true });

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000510, 0.000008);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50000);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.9,   // strength
  0.6,   // radius
  0.85   // threshold — only bright pixels bloom
);
composer.addPass(bloomPass);

// === ADD THIS: Background Music ===
const backgroundMusic = new Audio('/tbs_elite.mp3');
backgroundMusic.volume = 0.3; // 20% volume (adjust 0.0 to 1.0)
backgroundMusic.loop = true;

// Start music when user interacts (browsers require user interaction first)
let musicStarted = false;
function startMusic() {
  if (!musicStarted) {
    backgroundMusic.play().catch(err => console.log("Music play failed:", err));
    musicStarted = true;
  }
}

// Start music on first keypress or click
window.addEventListener('keydown', startMusic, { once: true });
window.addEventListener('click', startMusic, { once: true });
// === END ADD ===

// === ADD THIS: Radio Voice with Effect ===
function playRadioVoice(filename: string) {
  const audio = new Audio(filename);
  audio.volume = 0.7;
  
  // Create radio effect using Web Audio API
  try {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = context.createMediaElementSource(audio);
    
    // Add radio-like filtering
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3000; // Cut high frequencies
    
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 300; // Cut low frequencies
    
    // Add slight gain for radio effect
    const gainNode = context.createGain();
    gainNode.gain.value = 1.2;
    
    // Connect: source -> highpass -> lowpass -> gain -> output
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gainNode);
    gainNode.connect(context.destination);
  } catch (err) {
    console.log("Radio effect not available, playing without effect");
  }
  
audio.play().catch(err => console.log("Radio voice failed:", err));
}

// Sound effects using Web Audio API
function playWhooshSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Whoosh: sweep from low to high frequency
    oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.3);
    
    // Fade out
    gainNode.gain.setValueAtTime(0.6, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (err) {
    console.log("Whoosh sound failed:", err);
  }
}

function playLaserZapSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Laser zap: high pitch sweep down
    oscillator.frequency.setValueAtTime(2000, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.15);
    
    // Sharp attack, quick fade
    gainNode.gain.setValueAtTime(0.7, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.15);
} catch (err) {
    console.log("Laser zap sound failed:", err);
  }
}

// Screen shake effect
function screenShake(intensity: number, duration: number) {
  const startTime = Date.now();
  const originalPos = camera.position.clone();
  
  const shakeInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / duration;
    
    if (progress >= 1) {
      camera.position.copy(originalPos);
      clearInterval(shakeInterval);
      return;
    }
    
    const currentIntensity = intensity * (1 - progress);
    camera.position.x = originalPos.x + (Math.random() - 0.5) * currentIntensity;
    camera.position.y = originalPos.y + (Math.random() - 0.5) * currentIntensity;
    camera.position.z = originalPos.z + (Math.random() - 0.5) * currentIntensity;
  }, 16);
}

// Stars
{
  const starGeo = new THREE.BufferGeometry();
  const count = 5000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const r = 20000 + Math.random() * 20000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    
    const colorType = Math.random();
    if (colorType < 0.7) {
      colors[i * 3 + 0] = 0.8 + Math.random() * 0.2;
      colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
      colors[i * 3 + 2] = 1.0;
    } else if (colorType < 0.9) {
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.6 + Math.random() * 0.2;
    } else {
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.2;
      colors[i * 3 + 2] = 0.2;
    }
  }
  
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  
  const starMat = new THREE.PointsMaterial({ 
    size: 2, 
    sizeAttenuation: false, 
    vertexColors: true,
    transparent: true,
    opacity: 0.9
  });
  scene.add(new THREE.Points(starGeo, starMat));
}

const ambient = new THREE.AmbientLight(0x1a2233, 0.3);
scene.add(ambient);

const sunLight = new THREE.PointLight(0xffffee, 4.0, 0, 2);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// Asteroids
{
  const asteroidGeo = new THREE.BufferGeometry();
  const count = 1000;
  const positions = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 300 + Math.random() * 400;
    const height = (Math.random() - 0.5) * 100;
    
    positions[i * 3 + 0] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  
  asteroidGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  
  const asteroidMat = new THREE.PointsMaterial({
    color: 0x999999,
    size: 2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6
  });
  
  scene.add(new THREE.Points(asteroidGeo, asteroidMat));
}

// Station 1 - at 166,000 km (2nd radar ring)
const station1 = new THREE.Group();
{
  const scale = toRender(SCALE.STATION_SIZE * 100);
  
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(scale * 0.7, scale * 0.15, 32, 80),
    new THREE.MeshStandardMaterial({ 
      color: 0x99aadd,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x112244,
      emissiveIntensity: 0.3
    })
  );
  ring.rotation.x = Math.PI / 2;
  station1.add(ring);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.15, scale * 0.15, scale * 0.7, 32),
    new THREE.MeshStandardMaterial({ 
      color: 0x7788aa,
      roughness: 0.4,
      metalness: 0.7
    })
  );
  hub.rotation.z = Math.PI / 2;
  station1.add(hub);
  
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(scale * 0.03, 12, 12),
      new THREE.MeshBasicMaterial({ 
        color: i % 2 === 0 ? 0x00ff88 : 0x0088ff,
        fog: false
      })
    );
    light.position.set(Math.cos(angle) * scale * 0.7, 0, Math.sin(angle) * scale * 0.7);
    station1.add(light);
  }
  
  station1.position.set(-toRender(166000), 0, 0);
}
scene.add(station1);

// Station 2 - at 166,000 km (2nd radar ring)
const station2 = new THREE.Group();
{
  const scale = toRender(SCALE.STATION_SIZE * 200);
  
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(scale * 1.2, scale * 0.25, 48, 96),
    new THREE.MeshStandardMaterial({
      color: 0xaa8866,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0x443322,
      emissiveIntensity: 0.4
    })
  );
  ring.rotation.x = Math.PI / 2;
  station2.add(ring);
  
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.3, scale * 0.3, scale * 1.5, 48),
    new THREE.MeshStandardMaterial({
      color: 0x998877,
      roughness: 0.4,
      metalness: 0.8
    })
  );
  hub.rotation.z = Math.PI / 2;
  station2.add(hub);
  
station2.position.set(toRender(166000), 0, 0);
}
scene.add(station2);

// Derelict Ship (50,000 km away) - Star Destroyer style
const derelictShip = new THREE.Group();
{
  const scale = 0.3;
  
  // Main triangular hull (wedge shape)
  const hullGeo = new THREE.ConeGeometry(scale * 0.8, scale * 2, 3);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x445566,
    roughness: 0.85,
    metalness: 0.6,
    emissive: 0x223344,
    emissiveIntensity: 0.1
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.rotation.z = Math.PI / 2;
  derelictShip.add(hull);
  
  // Command tower on top
  const towerGeo = new THREE.BoxGeometry(scale * 0.15, scale * 0.3, scale * 0.2);
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x556677,
    roughness: 0.8,
    metalness: 0.7,
    emissive: 0x334455,
    emissiveIntensity: 0.15
  });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.set(-scale * 0.4, scale * 0.15, 0);
  derelictShip.add(tower);
  
  // Bridge dome
  const bridgeGeo = new THREE.SphereGeometry(scale * 0.08, 16, 16);
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x667788,
    roughness: 0.6,
    metalness: 0.8,
    emissive: 0x445566,
    emissiveIntensity: 0.2
  });
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(-scale * 0.4, scale * 0.3, 0);
  derelictShip.add(bridge);
  
  // Engine blocks (damaged, no glow)
  for (let i = 0; i < 3; i++) {
    const engineGeo = new THREE.BoxGeometry(scale * 0.1, scale * 0.15, scale * 0.1);
    const engineMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      roughness: 0.9,
      metalness: 0.4
    });
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.position.set(
      scale * 0.9,
      scale * 0.05,
      (i - 1) * scale * 0.25
    );
    derelictShip.add(engine);
  }
  
  // Damage effects - broken panels
  for (let i = 0; i < 8; i++) {
    const debrisGeo = new THREE.BoxGeometry(
      scale * (0.05 + Math.random() * 0.1),
      scale * (0.02 + Math.random() * 0.05),
      scale * (0.05 + Math.random() * 0.1)
    );
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      roughness: 0.95,
      metalness: 0.3
    });
    const debris = new THREE.Mesh(debrisGeo, debrisMat);
    debris.position.set(
      (Math.random() - 0.5) * scale * 1.5,
      (Math.random() - 0.5) * scale * 0.3,
      (Math.random() - 0.5) * scale * 0.8
    );
    debris.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    derelictShip.add(debris);
  }
  
  // Dim emergency lights (red/orange)
  const emergencyLight1 = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.02, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 0.6,
      fog: false
    })
  );
  emergencyLight1.position.set(-scale * 0.3, scale * 0.1, scale * 0.1);
  derelictShip.add(emergencyLight1);
  
  const emergencyLight2 = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.02, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.4,
      fog: false
    })
  );
  emergencyLight2.position.set(scale * 0.2, scale * 0.05, -scale * 0.15);
  derelictShip.add(emergencyLight2);
  
  derelictShip.position.set(toRender(50000), toRender(-8000), toRender(15000));
  derelictShip.rotation.set(0.5, 1.2, 0.8);
}
scene.add(derelictShip);

// Debris Field (80,000 km away)
const debrisField = new THREE.Group();
{
  // Large damaged station piece
  const mainDebris = new THREE.Mesh(
    new THREE.TorusGeometry(toRender(200), toRender(50), 16, 32),
    new THREE.MeshStandardMaterial({
      color: 0x666677,
      roughness: 0.8,
      metalness: 0.6,
      emissive: 0x111122,
      emissiveIntensity: 0.05
    })
  );
  mainDebris.rotation.set(0.5, 1.2, 0.3);
  debrisField.add(mainDebris);
  
  // Small debris pieces (30 pieces in cluster)
  for (let i = 0; i < 30; i++) {
    const debrisPiece = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.random() * 0.05 + 0.02,
        Math.random() * 0.05 + 0.02,
        Math.random() * 0.05 + 0.02
      ),
      new THREE.MeshStandardMaterial({
        color: 0x777788,
        roughness: 0.9,
        metalness: 0.4
      })
    );
    debrisPiece.position.set(
      (Math.random() - 0.5) * toRender(5000),
      (Math.random() - 0.5) * toRender(5000),
      (Math.random() - 0.5) * toRender(5000)
    );
    debrisPiece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    debrisField.add(debrisPiece);
  }
  
  debrisField.position.set(toRender(-80000), toRender(12000), toRender(-25000));
}
scene.add(debrisField);

// Ship — Space Refuse Collector MK-IV (visible chase-cam model)
const ship = new THREE.Group();
{
  const s = 0.04;

  const hullPaint = new THREE.MeshStandardMaterial({
    color: 0x5a5040,         // dirty olive utility
    roughness: 0.75,
    metalness: 0.55,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x222428,
    roughness: 0.6,
    metalness: 0.85,
  });
  const hazard = new THREE.MeshStandardMaterial({
    color: 0xd0a020,         // weathered hazard yellow
    roughness: 0.6,
    metalness: 0.4,
    emissive: 0x553300,
    emissiveIntensity: 0.2,
  });
  const cockpitGlass = new THREE.MeshBasicMaterial({ color: 0xffd070, fog: false });
  const exhaust = new THREE.MeshBasicMaterial({ color: 0xff8833, fog: false });

  // Main chassis — boxy industrial body
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(s * 1.2, s * 0.5, s * 0.7),
    hullPaint
  );
  // The ship's forward direction is -Z (camera sits behind at +Z),
  // so the long axis goes along Z.
  chassis.rotation.y = Math.PI / 2;
  ship.add(chassis);

  // Cockpit pod jutting forward (cone)
  const cockpit = new THREE.Mesh(
    new THREE.CylinderGeometry(s * 0.18, s * 0.22, s * 0.45, 8),
    hullPaint
  );
  cockpit.rotation.x = Math.PI / 2;
  cockpit.position.set(0, s * 0.1, -s * 0.7);
  ship.add(cockpit);

  // Cockpit windshield (emissive warm glow)
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(s * 0.28, s * 0.08, s * 0.18),
    cockpitGlass
  );
  windshield.position.set(0, s * 0.18, -s * 0.78);
  ship.add(windshield);

  // Cargo clamp under the chassis (holds the bio-waste container)
  const clamp = new THREE.Mesh(
    new THREE.BoxGeometry(s * 0.9, s * 0.1, s * 0.5),
    darkMetal
  );
  clamp.position.set(0, -s * 0.3, 0);
  ship.add(clamp);

  // Bio-waste container — visible while attached (hide via main mission flag)
  const cargo = new THREE.Mesh(
    new THREE.BoxGeometry(s * 0.7, s * 0.35, s * 0.45),
    hazard
  );
  cargo.position.set(0, -s * 0.5, 0);
  cargo.name = "attached-cargo";
  ship.add(cargo);

  // Hazard stripe on cargo
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(s * 0.71, s * 0.06, s * 0.46),
    darkMetal
  );
  stripe.position.set(0, -s * 0.5, 0);
  stripe.name = "attached-cargo";
  ship.add(stripe);

  // Twin chunky engine nacelles at the back
  for (const side of [1, -1]) {
    const nacelle = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.13, s * 0.15, s * 0.55, 12),
      darkMetal
    );
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * s * 0.35, 0, s * 0.5);
    ship.add(nacelle);

    // Exhaust glow
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(s * 0.09, 12, 12),
      exhaust
    );
    glow.position.set(side * s * 0.35, 0, s * 0.75);
    ship.add(glow);

    // Plume
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(s * 0.11, s * 0.9, 10),
      new THREE.MeshBasicMaterial({
        color: 0xff6622,
        transparent: true,
        opacity: 0.5,
        fog: false,
      })
    );
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(side * s * 0.35, 0, s * 1.2);
    ship.add(plume);
  }

  // Antenna mast on top
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(s * 0.015, s * 0.015, s * 0.5, 6),
    darkMetal
  );
  mast.position.set(s * 0.3, s * 0.4, s * 0.2);
  ship.add(mast);

  // Wing-edge nav lights (red port, green starboard)
  const navPort = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.04, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3344, fog: false })
  );
  navPort.position.set(-s * 0.6, 0, 0);
  ship.add(navPort);

  const navStbd = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.04, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x33ff66, fog: false })
  );
  navStbd.position.set(s * 0.6, 0, 0);
  ship.add(navStbd);
}
scene.add(ship);

// Hide the attached cargo meshes once the player launches it
function hideAttachedCargo() {
  ship.traverse((obj) => {
    if (obj.name === "attached-cargo") obj.visible = false;
  });
}

ship.position.set(0, 0, 0);

camera.position.set(0, 0.3, 0.8);
ship.add(camera);

// Mission variables
let royalYacht: THREE.Group | null = null;
let blackShip: THREE.Group | null = null;
let cargoContainer: THREE.Group | null = null;
let cargoVelocity = new THREE.Vector3();
let missionStarted = false;
let cargoDetached = false;
let cargoDetonated = false;
let blackShipDamaged = false;
let missionComplete = false;
let missileTimer = 0;
const missiles: THREE.Group[] = [];
let rendezvousPoint: THREE.Group | null = null;
let rendezvousReached = false;
let playerIsTarget = false;
let playerDeathTimer = 0;

function createRoyalYacht() {
  const yacht = new THREE.Group();
  const scale = 0.08;

  // Forward hull section — slimmer, polished royal silver
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8e8,
    roughness: 0.18,
    metalness: 0.95,
    emissive: 0x223355,
    emissiveIntensity: 0.15,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x99aabb,
    roughness: 0.25,
    metalness: 0.9,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd070,
    roughness: 0.25,
    metalness: 0.95,
    emissive: 0xaa7722,
    emissiveIntensity: 0.4,
  });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false });
  const navRed = new THREE.MeshBasicMaterial({ color: 0xff3344, fog: false });
  const navGreen = new THREE.MeshBasicMaterial({ color: 0x33ff66, fog: false });

  // Aft hull (wider, holds engines)
  const aftHull = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.32, scale * 0.4, scale * 1.6, 20),
    hullMat
  );
  aftHull.rotation.z = Math.PI / 2;
  aftHull.position.set(-scale * 1.2, 0, 0);
  yacht.add(aftHull);

  // Mid hull (tapers)
  const midHull = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.22, scale * 0.32, scale * 1.8, 20),
    hullMat
  );
  midHull.rotation.z = Math.PI / 2;
  midHull.position.set(scale * 0.3, 0, 0);
  yacht.add(midHull);

  // Forward hull (slimmer)
  const fwdHull = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.15, scale * 0.22, scale * 1.0, 20),
    hullMat
  );
  fwdHull.rotation.z = Math.PI / 2;
  fwdHull.position.set(scale * 1.7, 0, 0);
  yacht.add(fwdHull);

  // Sleek nose cone
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(scale * 0.15, scale * 0.5, 20),
    hullMat
  );
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(scale * 2.45, 0, 0);
  yacht.add(nose);

  // Bridge tower on top (faceted with glowing window strip)
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(scale * 0.5, scale * 0.18, scale * 0.28),
    hullMat
  );
  bridge.position.set(scale * 0.4, scale * 0.32, 0);
  yacht.add(bridge);

  const bridgeWindow = new THREE.Mesh(
    new THREE.BoxGeometry(scale * 0.42, scale * 0.05, scale * 0.22),
    windowMat
  );
  bridgeWindow.position.set(scale * 0.4, scale * 0.38, 0);
  yacht.add(bridgeWindow);

  // Hull window strips (rows of small emissive boxes along the side)
  for (let i = 0; i < 8; i++) {
    const winL = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 0.06, scale * 0.025, scale * 0.025),
      windowMat
    );
    winL.position.set(scale * (-0.4 + i * 0.18), scale * 0.05, scale * 0.28);
    yacht.add(winL);
    const winR = winL.clone();
    winR.position.z = -scale * 0.28;
    yacht.add(winR);
  }

  // Swept wing fins (port and starboard)
  for (const side of [1, -1]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 0.9, scale * 0.04, scale * 0.4),
      accentMat
    );
    fin.position.set(-scale * 0.8, 0, side * scale * 0.55);
    yacht.add(fin);

    // Nav light at wingtip
    const navMat = side === 1 ? navGreen : navRed;
    const navLight = new THREE.Mesh(
      new THREE.SphereGeometry(scale * 0.05, 8, 8),
      navMat
    );
    navLight.position.set(-scale * 0.4, 0, side * scale * 0.78);
    yacht.add(navLight);
  }

  // Engine bells — 3 across the back, blue plasma glow
  for (let i = -1; i <= 1; i++) {
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(scale * 0.13, scale * 0.16, scale * 0.25, 16),
      accentMat
    );
    housing.rotation.z = Math.PI / 2;
    housing.position.set(-scale * 2.05, 0, i * scale * 0.22);
    yacht.add(housing);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(scale * 0.11, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x66bbff, fog: false })
    );
    glow.position.set(-scale * 2.18, 0, i * scale * 0.22);
    yacht.add(glow);

    // Plasma cone
    const plasma = new THREE.Mesh(
      new THREE.ConeGeometry(scale * 0.1, scale * 0.9, 12),
      new THREE.MeshBasicMaterial({
        color: 0x3388ff,
        transparent: true,
        opacity: 0.55,
        fog: false,
      })
    );
    plasma.rotation.z = Math.PI / 2;
    plasma.position.set(-scale * 2.7, 0, i * scale * 0.22);
    yacht.add(plasma);
  }

  // Antenna mast forward of bridge
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.012, scale * 0.012, scale * 0.4, 8),
    accentMat
  );
  antenna.position.set(scale * 1.2, scale * 0.4, 0);
  yacht.add(antenna);

  // Royal crest — small gold disc on the bridge front
  const crest = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.06, scale * 0.06, scale * 0.01, 16),
    goldMat
  );
  crest.rotation.z = Math.PI / 2;
  crest.position.set(scale * 0.66, scale * 0.32, 0);
  yacht.add(crest);

  // Ventral keel fin
  const keel = new THREE.Mesh(
    new THREE.BoxGeometry(scale * 1.0, scale * 0.18, scale * 0.04),
    accentMat
  );
  keel.position.set(-scale * 0.2, -scale * 0.3, 0);
  yacht.add(keel);

  yacht.position.set(-toRender(50000), 0, toRender(5000));
  return yacht;
}

function createRendezvousBeacon() {
  const beacon = new THREE.Group();
  
  // Pulsing green sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshBasicMaterial({ 
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
      fog: false
    })
  );
  beacon.add(sphere);
  
  // Outer ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.03, 16, 32),
    new THREE.MeshBasicMaterial({ 
      color: 0x00ff88,
      transparent: true,
      opacity: 0.6,
      fog: false
    })
  );
  ring.rotation.x = Math.PI / 2;
  beacon.add(ring);
  
  // Position near Royal Yacht (5000 km away from player)
  beacon.position.set(toRender(5000), 0, 0);
  
  return beacon;
}

function createBlackShip() {
  const black = new THREE.Group();
  const scale = 0.07;

  const darkHullMat = new THREE.MeshStandardMaterial({
    color: 0x0c0d12,
    roughness: 0.55,
    metalness: 0.85,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c24,
    roughness: 0.45,
    metalness: 0.9,
    emissive: 0x220000,
    emissiveIntensity: 0.15,
  });
  const redGlow = new THREE.MeshBasicMaterial({ color: 0xff2a00, fog: false });
  const ember = new THREE.MeshBasicMaterial({ color: 0xff7733, fog: false });

  // Long forward-swept main hull (faceted, low-poly menacing wedge)
  const mainHull = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.08, scale * 0.45, scale * 2.6, 6),
    darkHullMat
  );
  mainHull.rotation.z = -Math.PI / 2;
  black.add(mainHull);

  // Upper spine plate (raised dorsal armour)
  const dorsal = new THREE.Mesh(
    new THREE.BoxGeometry(scale * 2.0, scale * 0.18, scale * 0.5),
    plateMat
  );
  dorsal.position.set(-scale * 0.2, scale * 0.22, 0);
  black.add(dorsal);

  // Lower belly plate
  const belly = new THREE.Mesh(
    new THREE.BoxGeometry(scale * 1.6, scale * 0.14, scale * 0.7),
    plateMat
  );
  belly.position.set(-scale * 0.3, -scale * 0.22, 0);
  black.add(belly);

  // Sensor / cockpit slit (thin red glowing line forward)
  const slit = new THREE.Mesh(
    new THREE.BoxGeometry(scale * 0.04, scale * 0.04, scale * 0.32),
    redGlow
  );
  slit.position.set(scale * 0.95, scale * 0.05, 0);
  black.add(slit);

  // Twin forward weapon mounts (top + bottom)
  for (const sign of [1, -1]) {
    const mount = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 0.18, scale * 0.1, scale * 0.18),
      plateMat
    );
    mount.position.set(scale * 0.55, sign * scale * 0.32, 0);
    black.add(mount);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(scale * 0.025, scale * 0.025, scale * 0.6, 8),
      darkHullMat
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(scale * 0.85, sign * scale * 0.32, 0);
    black.add(barrel);
  }

  // Port / starboard wings (swept back, angular)
  for (const side of [1, -1]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 0.9, scale * 0.06, scale * 0.55),
      plateMat
    );
    wing.position.set(-scale * 0.5, 0, side * scale * 0.55);
    wing.rotation.y = side * 0.25;
    black.add(wing);

    // Wingtip missile pod
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 0.45, scale * 0.12, scale * 0.16),
      plateMat
    );
    pod.position.set(-scale * 0.55, scale * 0.02, side * scale * 0.85);
    black.add(pod);

    // Missile tube tips glowing faint red
    for (let i = -1; i <= 1; i += 2) {
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 0.025, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4422, fog: false })
      );
      tip.position.set(-scale * 0.3, scale * 0.02, side * scale * 0.85 + i * scale * 0.05);
      black.add(tip);
    }
  }

  // Twin engine pods at the back — fierce red glow
  for (const side of [1, -1]) {
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(scale * 0.16, scale * 0.2, scale * 0.5, 12),
      plateMat
    );
    housing.rotation.z = Math.PI / 2;
    housing.position.set(-scale * 1.45, 0, side * scale * 0.32);
    black.add(housing);

    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(scale * 0.11, scale * 0.11, scale * 0.1, 12),
      ember
    );
    inner.rotation.z = Math.PI / 2;
    inner.position.set(-scale * 1.7, 0, side * scale * 0.32);
    black.add(inner);

    // Plume
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(scale * 0.13, scale * 1.4, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.55,
        fog: false,
      })
    );
    plume.rotation.z = Math.PI / 2;
    plume.position.set(-scale * 2.4, 0, side * scale * 0.32);
    black.add(plume);
  }

  // Dorsal antenna spike
  const spike = new THREE.Mesh(
    new THREE.ConeGeometry(scale * 0.025, scale * 0.4, 6),
    darkHullMat
  );
  spike.position.set(-scale * 0.2, scale * 0.55, 0);
  black.add(spike);

  black.position.set(-toRender(75000), 0, toRender(5000));
  return black;
}

function createMissile(fromPos: THREE.Vector3, toPos: THREE.Vector3) {
  const missile = new THREE.Group();
  
const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8),
    new THREE.MeshBasicMaterial({ 
      color: 0xff3300, 
      fog: false,
      emissive: 0xff3300,
      emissiveIntensity: 0.8
    })
  );
  body.rotation.z = Math.PI / 2;
  missile.add(body);
  
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6600, fog: false })
  );
  glow.position.set(-0.04, 0, 0);
  missile.add(glow);
  
  missile.position.copy(fromPos);
  
  const direction = new THREE.Vector3().subVectors(toPos, fromPos).normalize();
  const speed = toRender(3000);
  (missile as any).velocity = direction.multiplyScalar(speed);
  (missile as any).lifeTime = 0;
  
  return missile;
}

function fireMissileVolley() {
  if (!blackShip || !royalYacht || blackShipDamaged) return;
  
  const volleySize = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < volleySize; i++) {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      0
    );
    const targetPos = royalYacht.position.clone().add(offset);
    const missile = createMissile(blackShip.position.clone(), targetPos);
    missiles.push(missile);
    scene.add(missile);
  }
}

function firePlayerMissiles() {
  if (!blackShip || !playerIsTarget) return;
  
  const volleySize = 5 + Math.floor(Math.random() * 5);  // More missiles!
  for (let i = 0; i < volleySize; i++) {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    );
    const targetPos = ship.position.clone().add(offset);
    const missile = createMissile(blackShip.position.clone(), targetPos);
    (missile as any).targetingPlayer = true;
    missiles.push(missile);
    scene.add(missile);
  }
}

function destroyPlayer() {
  // Create massive explosion on player
  const playerExplosion = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 1.0,
      fog: false
    })
  );
  playerExplosion.position.copy(ship.position);
  scene.add(playerExplosion);
  
  // Animate explosion
  let explosionTime = 0;
  const explosionInterval = setInterval(() => {
    explosionTime += 0.016;
    playerExplosion.scale.setScalar(1 + explosionTime * 8);
    (playerExplosion.material as THREE.MeshBasicMaterial).opacity = 1.0 - explosionTime * 0.8;
    
    if (explosionTime > 1.5) {
      scene.remove(playerExplosion);
      clearInterval(explosionInterval);
      
      // Show final message
      showAlert("HULL BREACH. SYSTEMS CRITICAL. ALL HANDS LOST.", 5000);
      setTimeout(() => {
        showAlert("GAME OVER. Press [R] to Retry Mission.", 10000);
      }, 5000);
    }
  }, 16);
  
  // Screen shake on death
  let shakeTime = 0;
  const shakeInterval = setInterval(() => {
    shakeTime += 0.016;
    const intensity = 0.5 * (1 - shakeTime / 2);
    camera.position.x = (Math.random() - 0.5) * intensity;
    camera.position.y = 0.3 + (Math.random() - 0.5) * intensity;
    camera.position.z = 0.8 + (Math.random() - 0.5) * intensity;
    
    if (shakeTime > 2) {
      camera.position.set(0, 0.3, 0.8);
      clearInterval(shakeInterval);
    }
  }, 16);
}

function showAlert(message: string, duration: number = 3000) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  if (alertBox && alertMessage) {
    alertMessage.textContent = message;
    alertBox.classList.add('visible');
    setTimeout(() => {
      alertBox.classList.remove('visible');
    }, duration);
  }
}

function updateCargoComputer() {
  if (!cargoDetached || !cargoContainer) return;
  
  const cargoComp = document.getElementById('cargo-computer');
  const cargoDistance = document.getElementById('cargo-distance');
  const targetDistance = document.getElementById('target-distance');
  const cargoBarFill = document.getElementById('cargo-bar-fill');
  const detonationHint = document.getElementById('detonation-hint');
  
  if (!cargoComp || !cargoDistance || !targetDistance || !cargoBarFill || !detonationHint) return;
  
  const distToCargo = toKm(ship.position.distanceTo(cargoContainer.position));
  const distBlackToCargo = blackShip ? toKm(blackShip.position.distanceTo(cargoContainer.position)) : 999999;
  
  cargoDistance.textContent = `${distToCargo.toFixed(1)}km`;
  targetDistance.textContent = `${distBlackToCargo.toFixed(1)}km`;
  
  const optimalMin = 5;
  const optimalMax = 20;
  
  if (distBlackToCargo >= optimalMin && distBlackToCargo <= optimalMax) {
    cargoBarFill.style.width = '100%';
    cargoBarFill.classList.add('optimal');
    detonationHint.style.display = 'block';
  } else {
    const percentage = Math.max(0, Math.min(100, ((optimalMax - distBlackToCargo) / optimalMax) * 100));
    cargoBarFill.style.width = `${percentage}%`;
    cargoBarFill.classList.remove('optimal');
    detonationHint.style.display = 'none';
  }
}

function showMissionComplete() {
  const missionComp = document.getElementById('mission-complete');
  if (missionComp) {
    setTimeout(() => {
      missionComp.classList.add('visible');
      
      // Auto-close after 5 seconds
      setTimeout(() => {
        missionComp.classList.remove('visible');
      }, 5000);
      
      // Allow click to close immediately
      const closeHandler = () => {
        missionComp.classList.remove('visible');
        missionComp.removeEventListener('click', closeHandler);
      };
      missionComp.addEventListener('click', closeHandler);
    }, 3000);
  }
}

function showMissionFailed() {
  const missionFail = document.getElementById('mission-failed');
  if (missionFail) {
    setTimeout(() => {
      missionFail.classList.add('visible');
      
      // Auto-close after 10 seconds
      setTimeout(() => {
        missionFail.classList.remove('visible');
      }, 10000);
      
      // Allow click to close immediately
      const closeHandler = () => {
        missionFail.classList.remove('visible');
        missionFail.removeEventListener('click', closeHandler);
      };
      missionFail.addEventListener('click', closeHandler);
    }, 9000);
  }
}

const inputs: Inputs = {
  throttleUp: false, throttleDown: false, brake: false,
  yawL: false, yawR: false, pitchU: false, pitchD: false, rollL: false, rollR: false,
  detachCargo: false, detonateCargo: false
};

window.addEventListener("keydown", (e) => setKey(e.code, true));
window.addEventListener("keyup", (e) => setKey(e.code, false));

function setKey(code: string, down: boolean) {
  switch (code) {
    case "KeyW": inputs.throttleUp = down; break;
    case "KeyS": inputs.throttleDown = down; break;
    case "Space": inputs.brake = down; break;
    case "ArrowLeft": inputs.yawR = down; break;
    case "ArrowRight": inputs.yawL = down; break;
    case "ArrowUp": inputs.pitchU = down; break;
    case "ArrowDown": inputs.pitchD = down; break;
    case "KeyQ": inputs.rollL = down; break;
    case "KeyE": inputs.rollR = down; break;
    case "KeyR":
      if (down && missionComplete) {
        location.reload();
      }
    case "KeyH":
      if (down) {
        const helpMenu = document.getElementById("help-menu");
        if (helpMenu) helpMenu.classList.toggle("visible");
      }
      break;
      case "KeyX":
        if (down && !cargoDetached && missionStarted && blackShip) {
          cargoDetached = true;
          hideAttachedCargo();
          playWhooshSound();
          screenShake(0.03, 300);
          
          cargoContainer = new THREE.Group();
          const containerMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.03, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.5 })
          );
          cargoContainer.add(containerMesh);
          cargoContainer.position.copy(ship.position);
          
          // Visual launch effect - enhanced bright trail
          const launchTrail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.04, 0.8, 12),
            new THREE.MeshBasicMaterial({ 
              color: 0xffaa00, 
              transparent: true, 
              opacity: 0.9,
              fog: false 
            })
          );
          const launchDirection = new THREE.Vector3().subVectors(blackShip.position, ship.position).normalize();
          launchTrail.position.copy(ship.position).addScaledVector(launchDirection, 0.2);
          launchTrail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), launchDirection);
          scene.add(launchTrail);
          
          // Animate trail moving forward and fading
          let trailTime = 0;
          const trailInterval = setInterval(() => {
            trailTime += 0.016;
            launchTrail.position.addScaledVector(launchDirection, 0.05);
            (launchTrail.material as THREE.MeshBasicMaterial).opacity = 0.8 - (trailTime * 2);
            
            if (trailTime > 0.4) {
              scene.remove(launchTrail);
              clearInterval(trailInterval);
            }
          }, 16);
        
        // Inherit ship velocity + boost toward target
        cargoVelocity.copy(velocity);
        const toBlackShip = new THREE.Vector3().subVectors(blackShip.position, ship.position).normalize();
        const boost = toBlackShip.multiplyScalar(toRender(1500));
        cargoVelocity.add(boost);
        
        scene.add(cargoContainer);
        
        const cargoStatus = document.getElementById('cargo-status');
        const cargoState = document.getElementById('cargo-state');
        const cargoTrajectory = document.getElementById('cargo-trajectory');
        const cargoComp = document.getElementById('cargo-computer');
        if (cargoStatus) cargoStatus.textContent = "Cargo: DETACHED";
        if (cargoState) cargoState.textContent = "DETACHED";
        if (cargoTrajectory) cargoTrajectory.textContent = "INTERCEPT";
        if (cargoComp) cargoComp.classList.add('visible');
        
        console.log("Cargo ejected on intercept trajectory!");
      }
      break;
    case "KeyC":
      if (down && cargoDetached && !cargoDetonated && cargoContainer) {
        cargoDetonated = true;
        playLaserZapSound();
        
        // Green laser
        const laserGeo = new THREE.BufferGeometry();
        const laserPositions = new Float32Array([
          ship.position.x, ship.position.y, ship.position.z,
          cargoContainer.position.x, cargoContainer.position.y, cargoContainer.position.z
        ]);
        laserGeo.setAttribute('position', new THREE.BufferAttribute(laserPositions, 3));
        const laserMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 3, fog: false });
        const laser = new THREE.Line(laserGeo, laserMat);
        scene.add(laser);
        setTimeout(() => scene.remove(laser), 100);
        
        // Explosion
        const explosionPos = cargoContainer.position.clone();
        const explosion = new THREE.Mesh(
          new THREE.SphereGeometry(5, 32, 32),
          new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.9,
            fog: false
          })
        );
        explosion.position.copy(explosionPos);
        scene.add(explosion);
        
        scene.remove(cargoContainer);
        
        // Check damage
        if (blackShip && !blackShipDamaged) {
          const distToExplosion = toKm(blackShip.position.distanceTo(explosionPos));
          if (distToExplosion < 10000) {
            blackShipDamaged = true;
            showAlert("HOSTILE VESSEL DAMAGED! Enemy initiating emergency jump!");
            playRadioVoice('/voice_redford_damaged.mp3');
            
            setTimeout(() => {
              if (blackShip) {
                scene.remove(blackShip);
                blackShip = null;
              }
              missionComplete = true;
              
              // Delay complete voice so damaged voice finishes first (8 second delay)
              setTimeout(() => {
                playRadioVoice('/voice_redford_complete.mp3');
                
                // Spawn rendezvous point after voice starts
                setTimeout(() => {
                  rendezvousPoint = createRendezvousBeacon();
                  scene.add(rendezvousPoint);
                  showAlert("RENDEZVOUS COORDINATES RECEIVED: Set course for waypoint.", 5000);
                }, 3000);
              }, 8000);
              
              showMissionComplete();
            }, 2000);
          } else {
            showAlert(`Detonation too far! Distance: ${distToExplosion.toFixed(1)}km (need <10000km)`, 3000);
            playRadioVoice('/voice_redford_failed.mp3');
            
            // Black Ship threatens player
            setTimeout(() => {
              showAlert("INCOMING TRANSMISSION FROM HOSTILE VESSEL", 2000);
            }, 9000);
            
            setTimeout(() => {
              showAlert("You just made a BIG mistake, garbage hauler. You're a traitor to House Cayston. Prepare to die.", 5000);
            }, 11000);
            
            // Show mission failed screen and destroy yacht
            setTimeout(() => {
              if (royalYacht) {
                // Create explosion effect on yacht
                const yachtExplosion = new THREE.Mesh(
                  new THREE.SphereGeometry(3, 32, 32),
                  new THREE.MeshBasicMaterial({
                    color: 0xff3300,
                    transparent: true,
                    opacity: 0.9,
                    fog: false
                  })
                );
                yachtExplosion.position.copy(royalYacht.position);
                scene.add(yachtExplosion);
                
                // Animate yacht explosion
                let yachtExplosionTime = 0;
                const yachtExplosionInterval = setInterval(() => {
                  yachtExplosionTime += 0.016;
                  yachtExplosion.scale.setScalar(1 + yachtExplosionTime * 5);
                  (yachtExplosion.material as THREE.MeshBasicMaterial).opacity = 0.9 - yachtExplosionTime;
                  
                  if (yachtExplosionTime > 1.0) {
                    scene.remove(yachtExplosion);
                    clearInterval(yachtExplosionInterval);
                  }
                }, 16);
                
                // Remove yacht
                scene.remove(royalYacht);
                royalYacht = null;
              }
              
              missionComplete = true;
              
              // Black Ship now targets player
              playerIsTarget = true;
              playerDeathTimer = 0;
              
              showMissionFailed();
            }, 17000);  // Changed from 2000 to 11000 (after all messages)
          }
        }
        
        let explosionTime = 0;
        const explosionInterval = setInterval(() => {
          explosionTime += 0.016;
          explosion.scale.setScalar(1 + explosionTime * 4);
          (explosion.material as THREE.MeshBasicMaterial).opacity = 0.9 - explosionTime;
          
          if (explosionTime > 1.2) {
            scene.remove(explosion);
            clearInterval(explosionInterval);
          }
        }, 16);
        
        const cargoComp = document.getElementById('cargo-computer');
        if (cargoComp) {
          setTimeout(() => cargoComp.classList.remove('visible'), 2000);
        }
      }
      break;
  }
}

// Mobile Controls Setup
if ('ontouchstart' in window) {
  console.log("Mobile device detected - setting up touch controls");
  
  // Joystick variables
  let joystickActive = false;
  let joystickStartX = 0;
  let joystickStartY = 0;
  
  // Joystick touch handler
  const joystickOuter = document.querySelector('.joystick-outer') as HTMLElement;
  const joystickInner = document.getElementById('joystick-left-inner') as HTMLElement;
  
  if (joystickOuter && joystickInner) {
    joystickOuter.addEventListener('touchstart', (e) => {
      e.preventDefault();
      joystickActive = true;
      const touch = e.touches[0];
      const rect = joystickOuter.getBoundingClientRect();
      joystickStartX = rect.left + rect.width / 2;
      joystickStartY = rect.top + rect.height / 2;
    });
    
    joystickOuter.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!joystickActive) return;
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - joystickStartX;
      const deltaY = touch.clientY - joystickStartY;
      
      // Limit joystick movement
      const maxDistance = 35;
      const distance = Math.min(maxDistance, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
      const angle = Math.atan2(deltaY, deltaX);
      
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      
      joystickInner.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      
      // Map to controls (normalized -1 to 1)
      const normalizedX = deltaX / maxDistance;
      const normalizedY = deltaY / maxDistance;
      
      // Yaw (left/right)
      inputs.yawL = normalizedX < -0.3;
      inputs.yawR = normalizedX > 0.3;
      
      // Pitch (up/down)
      inputs.pitchU = normalizedY < -0.3;
      inputs.pitchD = normalizedY > 0.3;
    });
    
    const endJoystick = () => {
      joystickActive = false;
      joystickInner.style.transform = 'translate(-50%, -50%)';
      inputs.yawL = false;
      inputs.yawR = false;
      inputs.pitchU = false;
      inputs.pitchD = false;
    };
    
    joystickOuter.addEventListener('touchend', endJoystick);
    joystickOuter.addEventListener('touchcancel', endJoystick);
  }
  
  // Button handlers
  const btnThrottleUp = document.getElementById('btn-throttle-up');
  const btnThrottleDown = document.getElementById('btn-throttle-down');
  const btnBrake = document.getElementById('btn-brake');
  const btnDetach = document.getElementById('btn-detach');
  const btnDetonate = document.getElementById('btn-detonate');
  
  if (btnThrottleUp) {
    btnThrottleUp.addEventListener('touchstart', (e) => {
      e.preventDefault();
      inputs.throttleUp = true;
    });
    btnThrottleUp.addEventListener('touchend', () => inputs.throttleUp = false);
  }
  
  if (btnThrottleDown) {
    btnThrottleDown.addEventListener('touchstart', (e) => {
      e.preventDefault();
      inputs.throttleDown = true;
    });
    btnThrottleDown.addEventListener('touchend', () => inputs.throttleDown = false);
  }
  
  if (btnBrake) {
    btnBrake.addEventListener('touchstart', (e) => {
      e.preventDefault();
      inputs.brake = true;
    });
    btnBrake.addEventListener('touchend', () => inputs.brake = false);
  }
  
  if (btnDetach) {
    btnDetach.addEventListener('touchstart', (e) => {
      e.preventDefault();
      setKey('KeyX', true);
      setTimeout(() => setKey('KeyX', false), 100);
    });
  }
  
  if (btnDetonate) {
    btnDetonate.addEventListener('touchstart', (e) => {
      e.preventDefault();
      setKey('KeyC', true);
      setTimeout(() => setKey('KeyC', false), 100);
    });
  }
}

let throttle = 0.2;
let velocity = new THREE.Vector3(0, 0, 0);
let speed = 0;

const yawRate = 0.2;
const pitchRate = 0.2;
const rollRate = 0.45;
const rotationDamping = 0.92;

const speedValue = document.getElementById("speed-value")!;
const throttleValue = document.getElementById("throttle-value")!;
const targetDist = document.getElementById("target-dist")!;

const clock = new THREE.Clock();
let angularVelocity = new THREE.Euler(0, 0, 0);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  if (!missionStarted && elapsed > 30) {
    missionStarted = true;
    showAlert("EMERGENCY: Warp signatures detected in Lingering Systems!", 3000);
    playRadioVoice('/voice_redford_alert.mp3');
    
    royalYacht = createRoyalYacht();
    scene.add(royalYacht);
    
    // Show tutorial popup
    setTimeout(() => {
      const tutorialPopup = document.getElementById('tutorial-popup');
      if (tutorialPopup) {
        tutorialPopup.classList.add('visible');
        
        // Dismiss on click or keypress
        const dismissTutorial = () => {
          tutorialPopup.classList.remove('visible');
          document.removeEventListener('click', dismissTutorial);
          window.removeEventListener('keydown', dismissTutorial);
        };
        
        setTimeout(() => {
          document.addEventListener('click', dismissTutorial);
          window.addEventListener('keydown', dismissTutorial);
        }, 500);
      }
    }, 4000);
    
    setTimeout(() => {
      blackShip = createBlackShip();
      scene.add(blackShip);
      showAlert("HOSTILE VESSEL DETECTED! Royal Yacht under attack!", 4000);
    }, 2000);
  }

  // Royal Yacht: 500 m/s
  if (royalYacht) {
    const yachtSpeed = toRender(500);
    royalYacht.position.x += yachtSpeed * dt;
    royalYacht.rotation.y += dt * 0.5;
  }
  
  // Derelict ship slow tumble
  derelictShip.rotation.x += dt * 0.05;
  derelictShip.rotation.y += dt * 0.08;
  derelictShip.rotation.z += dt * 0.03;
  
  // Rendezvous beacon animation (stationary) and Royal Yacht moves toward it
  if (rendezvousPoint && royalYacht && !rendezvousReached) {
    // Pulse animation (beacon stays in place)
    const pulseScale = 1 + Math.sin(Date.now() * 0.003) * 0.2;
    rendezvousPoint.scale.setScalar(pulseScale);
    rendezvousPoint.rotation.y += dt * 2;
    
    // Royal Yacht moves toward rendezvous point
    const directionToRendezvous = new THREE.Vector3()
      .subVectors(rendezvousPoint.position, royalYacht.position)
      .normalize();
    const yachtSpeed = toRender(500); // Same 500 m/s speed
    royalYacht.position.addScaledVector(directionToRendezvous, yachtSpeed * dt);
    
    // Check if player reached rendezvous (within 1000 km)
    const distToRendezvous = toKm(ship.position.distanceTo(rendezvousPoint.position));
    if (distToRendezvous < 1000) {
      rendezvousReached = true;
      showAlert("RENDEZVOUS COMPLETE. Welcome to the fleet, Warrant Officer.", 5000);
      
      // End game after 5 seconds
      setTimeout(() => {
        showAlert("Mission Complete. Press [R] to play again.", 10000);
      }, 5000);
    }
  }
  
  // Black Ship: 600 m/s
  if (blackShip && !blackShipDamaged) {
    const chaseSpeed = toRender(800);
    
    // If player is target, chase them
    if (playerIsTarget) {
      const directionToPlayer = new THREE.Vector3()
        .subVectors(ship.position, blackShip.position)
        .normalize();
      blackShip.position.addScaledVector(directionToPlayer, chaseSpeed * dt);
      
      // Point at player
      blackShip.lookAt(ship.position);
      
      // Fire missiles at player
      missileTimer += dt;
      if (missileTimer > 1.5) {  // Faster firing
        firePlayerMissiles();
        missileTimer = 0;
      }
      
      // Check if close enough to destroy player
      const distToPlayer = toKm(blackShip.position.distanceTo(ship.position));
      if (distToPlayer < 5) {
        playerDeathTimer += dt;
        if (playerDeathTimer > 2) {
          destroyPlayer();
        }
      }
    } else {
      // Normal behavior - chase yacht
      blackShip.position.x += chaseSpeed * dt;
      blackShip.rotation.y += dt * 0.3;
      
      missileTimer += dt;
      if (missileTimer > 3.5) {
        fireMissileVolley();
        missileTimer = 0;
      }
    }
  }

  for (let i = missiles.length - 1; i >= 0; i--) {
    const missile = missiles[i];
    const vel = (missile as any).velocity;
    missile.position.addScaledVector(vel, dt);
    (missile as any).lifeTime += dt;
    
    // Check if missile hits player
    if ((missile as any).targetingPlayer && missile.position.distanceTo(ship.position) < 0.3) {
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff3300, fog: false })
      );
      flash.position.copy(missile.position);
      scene.add(flash);
      setTimeout(() => scene.remove(flash), 100);
      
      scene.remove(missile);
      missiles.splice(i, 1);
      
      // Screen shake on hit
      camera.position.x += (Math.random() - 0.5) * 0.1;
      camera.position.y += (Math.random() - 0.5) * 0.1;
      setTimeout(() => camera.position.set(0, 0.3, 0.8), 50);
      
      continue;
    }
    
    if (royalYacht && missile.position.distanceTo(royalYacht.position) < 0.5) {
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff8800, fog: false })
      );
      flash.position.copy(missile.position);
      scene.add(flash);
      setTimeout(() => scene.remove(flash), 100);
      
      scene.remove(missile);
      missiles.splice(i, 1);
      continue;
    }
    
    if ((missile as any).lifeTime > 5) {
      scene.remove(missile);
      missiles.splice(i, 1);
    }
  }

  if (cargoContainer && !cargoDetonated) {
    cargoContainer.position.addScaledVector(cargoVelocity, dt);
    cargoContainer.rotation.x += dt * 0.5;
    cargoContainer.rotation.y += dt * 0.3;
    updateCargoComputer();
  }

  if (inputs.throttleUp) throttle += dt * 0.4;
  if (inputs.throttleDown) throttle -= dt * 0.4;
  throttle = clamp(throttle, 0, 1);

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
  const targetSpeed = SCALE.MAX_SPEED * throttle;
  
  velocity.copy(forward).multiplyScalar(targetSpeed);
  
  if (inputs.brake) {
    velocity.multiplyScalar(0.1);
  }
  
  speed = velocity.length();
  ship.position.addScaledVector(velocity, dt * 60 * SCALE.RENDER_SCALE);

  const yaw = (inputs.yawR ? 1 : 0) - (inputs.yawL ? 1 : 0);
  const pitch = (inputs.pitchD ? 1 : 0) - (inputs.pitchU ? 1 : 0);
  const roll = (inputs.rollR ? 1 : 0) - (inputs.rollL ? 1 : 0);

  angularVelocity.y += yaw * yawRate * dt;
  angularVelocity.x += pitch * pitchRate * dt;
  angularVelocity.z -= roll * rollRate * dt;

  angularVelocity.x *= rotationDamping;
  angularVelocity.y *= rotationDamping;
  angularVelocity.z *= rotationDamping;

  ship.rotateY(angularVelocity.y * dt * 60);
  ship.rotateX(angularVelocity.x * dt * 60);
  ship.rotateZ(angularVelocity.z * dt * 60);

  const distToStation = toKm(ship.position.distanceTo(station1.position));
  
  const speedMS = Math.round(speed * 1000);
  speedValue.textContent = speedMS.toString();
  throttleValue.textContent = Math.round(throttle * 100).toString();
  targetDist.textContent = distToStation < 10 ? `${(distToStation * 1000).toFixed(0)}m` : `${distToStation.toFixed(0)}km`;

  updateRadar();
  drawShipMarkers();

  composer.render();
}

const radarCanvas = document.getElementById("radar-canvas") as HTMLCanvasElement | null;
const radarCtx = radarCanvas?.getContext("2d") || null;
const radarRadius = 85;
const radarRange = 500000;

function updateRadar() {
  if (!radarCtx || !radarCanvas) return;
  
  radarCtx.fillStyle = "rgba(0, 20, 15, 0.5)";
  radarCtx.fillRect(0, 0, 180, 180);
  
  radarCtx.fillStyle = "#00ff88";
  radarCtx.beginPath();
  radarCtx.arc(90, 90, 3, 0, Math.PI * 2);
  radarCtx.fill();
  
  radarCtx.strokeStyle = "rgba(0, 255, 136, 0.2)";
  radarCtx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    radarCtx.beginPath();
    radarCtx.arc(90, 90, (radarRadius / 3) * i, 0, Math.PI * 2);
    radarCtx.stroke();
  }
  
  const objectsToDraw: any[] = [
    { name: "Station 1", ref: station1, color: "#ff6600", label: "ST1" },
    { name: "Station 2", ref: station2, color: "#ff8800", label: "ST2" },
    { name: "Derelict", ref: derelictShip, color: "#888888", label: "DRL" }
  ];
  
  if (royalYacht) {
    objectsToDraw.push({ name: "Royal Yacht", ref: royalYacht, color: "#4488ff", label: "RYL" });
  }
  if (blackShip) {
    objectsToDraw.push({ name: "Hostile", ref: blackShip, color: "#ff0000", label: "HST" });
  }
  if (cargoContainer && !cargoDetonated) {
    objectsToDraw.push({ name: "Cargo", ref: cargoContainer, color: "#ffaa00", label: "CRG" });
  }
  if (rendezvousPoint && !rendezvousReached) {
    objectsToDraw.push({ name: "Rendezvous", ref: rendezvousPoint, color: "#00ff88", label: "RDV" });
  }
  
  objectsToDraw.forEach(obj => {
    const relPos = obj.ref.position.clone().sub(ship.position);
    const distKm = toKm(relPos.length());
    
    if (distKm > radarRange) return;
    
    const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
    const shipRight = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
    
    const forwardDist = relPos.dot(shipForward);
    const rightDist = relPos.dot(shipRight);
    
    const radarScale = radarRadius / radarRange;
    const x = 90 + (rightDist * radarScale * 1000);
    const y = 90 - (forwardDist * radarScale * 1000);
    
    radarCtx.fillStyle = obj.color;
    radarCtx.beginPath();
    radarCtx.arc(x, y, 4, 0, Math.PI * 2);
    radarCtx.fill();
    
    radarCtx.fillStyle = obj.color;
    radarCtx.font = "7px monospace";
    radarCtx.fillText(obj.label, x + 6, y + 3);
  });
  
  radarCtx.fillStyle = "#00ff88";
  radarCtx.font = "10px monospace";
  radarCtx.fillText(`${radarRange/1000}Kkm`, 5, 175);
}

function drawShipMarkers() {
  const canvas = renderer.domElement;
  let overlay = document.getElementById('ship-marker-canvas') as HTMLCanvasElement;
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'ship-marker-canvas';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '5';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    document.body.appendChild(overlay);
  }
  
  overlay.width = canvas.clientWidth;
  overlay.height = canvas.clientHeight;
  
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw stations
  [
    { station: station1, name: "STATION ALPHA", color: '#ff6600' },
    { station: station2, name: "STATION BETA", color: '#ff8800' }
  ].forEach(({ station, name, color }) => {
    const stationPos = station.position.clone();
    stationPos.project(camera);
    
    if (stationPos.z <= 1) {
      const x = (stationPos.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-stationPos.y * 0.5 + 0.5) * canvas.clientHeight;
      
      if (x >= 0 && x <= canvas.clientWidth && y >= 0 && y <= canvas.clientHeight) {
        const dist = toKm(ship.position.distanceTo(station.position));
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 35, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.font = '12px Orbitron, monospace';
        ctx.fillText(name, x + 45, y - 5);
        ctx.font = '10px Share Tech Mono, monospace';
        ctx.fillText(`${dist.toFixed(0)}km`, x + 45, y + 8);
      }
    }
  });
  
  // Draw derelict ship
  const derelictPos = derelictShip.position.clone();
  derelictPos.project(camera);
  
  if (derelictPos.z <= 1) {
    const x = (derelictPos.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-derelictPos.y * 0.5 + 0.5) * canvas.clientHeight;
    
    if (x >= 0 && x <= canvas.clientWidth && y >= 0 && y <= canvas.clientHeight) {
      const dist = toKm(ship.position.distanceTo(derelictShip.position));
      
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.stroke();
      
      // X marker for derelict
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
      
      ctx.fillStyle = '#888888';
      ctx.font = '12px Orbitron, monospace';
      ctx.fillText('DERELICT SHIP', x + 40, y - 5);
      ctx.font = '10px Share Tech Mono, monospace';
      ctx.fillText(`${dist.toFixed(1)}km`, x + 40, y + 8);
    }
  }
  
  if (royalYacht) {
    const yachtPos = royalYacht.position.clone();
    yachtPos.project(camera);
    
    if (yachtPos.z <= 1) {
      const x = (yachtPos.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-yachtPos.y * 0.5 + 0.5) * canvas.clientHeight;
      
      if (x >= 0 && x <= canvas.clientWidth && y >= 0 && y <= canvas.clientHeight) {
        const dist = toKm(ship.position.distanceTo(royalYacht.position));
        
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 45, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = '#4488ff';
        ctx.font = 'bold 16px Orbitron, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('ROYAL FAVOR', x - 55, y - 10);
        ctx.font = '12px Share Tech Mono, monospace';
        ctx.fillText(`${dist.toFixed(1)}km`, x - 55, y + 8);
        ctx.textAlign = 'left'; // Reset to default
      }
    }
  }
  
  if (blackShip) {
    const blackPos = blackShip.position.clone();
    blackPos.project(camera);
    
    if (blackPos.z <= 1) {
      const x = (blackPos.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-blackPos.y * 0.5 + 0.5) * canvas.clientHeight;
      
      if (x >= 0 && x <= canvas.clientWidth && y >= 0 && y <= canvas.clientHeight) {
        const dist = toKm(ship.position.distanceTo(blackShip.position));
        
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 40, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 10);
        ctx.lineTo(x + 10, y + 10);
        ctx.moveTo(x + 10, y - 10);
        ctx.lineTo(x - 10, y + 10);
        ctx.stroke();
        
ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 14px Orbitron, monospace';
        ctx.fillText(blackShipDamaged ? 'FLEEING' : 'UNKNOWN HOSTILE', x + 50, y - 10);
        ctx.font = '12px Share Tech Mono, monospace';
        ctx.fillText(`${dist.toFixed(1)}km`, x + 50, y + 8);  // FIXED: Added ( before `
      }
    }
  }
  
  // Rendezvous waypoint marker
  if (rendezvousPoint && !rendezvousReached) {
    const rdvPos = rendezvousPoint.position.clone();
    rdvPos.project(camera);
    
    if (rdvPos.z <= 1) {
      const x = (rdvPos.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-rdvPos.y * 0.5 + 0.5) * canvas.clientHeight;
      
      if (x >= 0 && x <= canvas.clientWidth && y >= 0 && y <= canvas.clientHeight) {
        const dist = toKm(ship.position.distanceTo(rendezvousPoint.position));
        
        // Pulsing green circle
        const pulseSize = 35 + Math.sin(Date.now() * 0.005) * 5;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
        ctx.stroke();
        
        // Crosshair
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 15, y);
        ctx.lineTo(x + 15, y);
        ctx.moveTo(x, y - 15);
        ctx.lineTo(x, y + 15);
        ctx.stroke();
        
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 16px Orbitron, monospace';
        ctx.fillText('RENDEZVOUS', x + 50, y - 10);
        ctx.font = '12px Share Tech Mono, monospace';
        ctx.fillText(`${dist.toFixed(1)}km`, x + 50, y + 8);  // FIXED: Added ( before `
      }
    }
  }
}  // ADDED: This closing brace for drawShipMarkers function

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth, window.innerHeight);
});
