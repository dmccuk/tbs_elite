import * as THREE from "three";

type Inputs = {
  throttleUp: boolean;
  throttleDown: boolean;
  brake: boolean;
  boost: boolean;
  yawL: boolean; yawR: boolean;
  pitchU: boolean; pitchD: boolean;
  rollL: boolean; rollR: boolean;
  flightAssist: boolean;
  supercruise: boolean;
  freeLook: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ==================== SCALE CONSTANTS ====================
const SCALE = {
  // Solar system (scaled for gameplay)
  SUN_RADIUS: 100,           // km (visual)
  STATION_SIZE: 0.5,         // km (500m station)
  
  // Planet data (simplified to 3 planets)
  PLANETS: [
    { name: "Earth", radius: 6400, orbit: 150000, color: 0x2288ff, speed: 0.0001, hasStation: true },
    { name: "Mars", radius: 3400, orbit: 228000, color: 0xcd5c5c, speed: 0.00005, hasStation: false },
    { name: "Jupiter", radius: 71000, orbit: 778000, color: 0xc88b3a, speed: 0.00001, hasStation: true }
  ],
  
  // Asteroid belt (between Mars and Jupiter)
  ASTEROID_BELT: {
    count: 800,
    innerRadius: 300000,
    outerRadius: 600000,
    speed: 0.00003
  },
  
  // Speed constants
  MAX_SPEED_NORMAL: 1.0,    // km/s (1000 m/s)
  MAX_SPEED_BOOST: 5.0,     // km/s (5000 m/s)
  MAX_SPEED_SUPERCRUISE: 1000, // km/s (1000 km/s for interplanetary)
  
  // Display scale factor
  RENDER_SCALE: 0.001,       // Scale everything down 1000x for rendering
};

// Convert km to render units
const toRender = (km: number) => km * SCALE.RENDER_SCALE;
// Convert render units to km
const toKm = (units: number) => units / SCALE.RENDER_SCALE;

// Setup renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Make canvas focusable and focus it immediately
renderer.domElement.tabIndex = 1;
renderer.domElement.focus();

// Get start message element
const startMessage = document.getElementById('start-message');

// Click on canvas to focus it and hide message
renderer.domElement.addEventListener('click', () => {
  renderer.domElement.focus();
  if (startMessage) {
    startMessage.classList.add('hidden');
  }
});

// Hide message on any key press
window.addEventListener('keydown', () => {
  if (startMessage && !startMessage.classList.contains('hidden')) {
    startMessage.classList.add('hidden');
  }
}, { once: true });

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000510, 0.000008);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50000);

// ==================== BACKGROUND STARS ====================
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
    
    // Varied star colors
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

// ==================== LIGHTING ====================
const ambient = new THREE.AmbientLight(0x1a2233, 0.3);
scene.add(ambient);

const sunLight = new THREE.PointLight(0xffffee, 4.0, 0, 2);
sunLight.position.set(0, 0, 0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x4488ff, 0.6);
rimLight.position.set(500, 200, -500);
scene.add(rimLight);

// ==================== THE SUN ====================
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(toRender(SCALE.SUN_RADIUS), 32, 32),
  new THREE.MeshBasicMaterial({ 
    color: 0xffdd88,
    fog: false 
  })
);
scene.add(sun);

// Sun corona glow
const coronaGeo = new THREE.SphereGeometry(toRender(SCALE.SUN_RADIUS * 1.2), 32, 32);
const coronaMat = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 }
  },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      vec3 glow = vec3(1.0, 0.8, 0.3) * intensity;
      gl_FragColor = vec4(glow, intensity * 0.8);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  fog: false
});
const corona = new THREE.Mesh(coronaGeo, coronaMat);
sun.add(corona);

// ==================== SOLAR SYSTEM (3 PLANETS) ====================
const planets: THREE.Group[] = [];
const planetData: any[] = [];

// Create 3 planets
SCALE.PLANETS.forEach((pData, index) => {
  const planetGroup = new THREE.Group();
  
  // Planet sphere
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(toRender(pData.radius), 32, 32),
    new THREE.MeshStandardMaterial({
      color: pData.color,
      roughness: 0.8,
      metalness: 0.1,
      emissive: pData.color,
      emissiveIntensity: 0.05
    })
  );
  planet.receiveShadow = true;
  planet.castShadow = true;
  planetGroup.add(planet);
  
  // Add atmosphere for Earth and Mars
  if (index === 0 || index === 1) {
    const atmosphereGeo = new THREE.SphereGeometry(toRender(pData.radius * 1.02), 32, 32);
    const atmosphereMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          vec3 atmosphere = vec3(0.3, 0.6, 1.0) * intensity;
          gl_FragColor = vec4(atmosphere, intensity * 0.5);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    planetGroup.add(atmosphere);
  }
  
  // Add clouds to Earth
  if (index === 0) {
    const cloudGeo = new THREE.SphereGeometry(toRender(pData.radius * 1.005), 32, 32);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      roughness: 1.0,
      metalness: 0.0
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    planetGroup.add(clouds);
  }
  
  scene.add(planetGroup);
  planets.push(planetGroup);
  planetData.push({ ...pData, group: planetGroup, planet: planet });
});

// ==================== ASTEROID BELT ====================
{
  const asteroidGeo = new THREE.BufferGeometry();
  const count = SCALE.ASTEROID_BELT.count;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = SCALE.ASTEROID_BELT.innerRadius + 
                   Math.random() * (SCALE.ASTEROID_BELT.outerRadius - SCALE.ASTEROID_BELT.innerRadius);
    const height = (Math.random() - 0.5) * 10000;
    
    positions[i * 3 + 0] = Math.cos(angle) * toRender(radius);
    positions[i * 3 + 1] = toRender(height);
    positions[i * 3 + 2] = Math.sin(angle) * toRender(radius);
    sizes[i] = 1 + Math.random() * 3;
  }
  
  asteroidGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  asteroidGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  
  const asteroidMat = new THREE.PointsMaterial({
    color: 0x999999,
    size: 2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6
  });
  
  const asteroidField = new THREE.Points(asteroidGeo, asteroidMat);
  scene.add(asteroidField);
}

// ==================== STATIONS ====================
const stations: THREE.Group[] = [];

// Earth station
const earthStation = new THREE.Group();
{
  const stationScale = toRender(SCALE.STATION_SIZE * 100);
  
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(stationScale * 0.7, stationScale * 0.15, 32, 80),
    new THREE.MeshStandardMaterial({ 
      color: 0x99aadd,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x112244,
      emissiveIntensity: 0.3
    })
  );
  ring.rotation.x = Math.PI / 2;
  earthStation.add(ring);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(stationScale * 0.15, stationScale * 0.15, stationScale * 0.7, 32),
    new THREE.MeshStandardMaterial({ 
      color: 0x7788aa,
      roughness: 0.4,
      metalness: 0.7,
      emissive: 0x0a0f1a,
      emissiveIntensity: 0.4
    })
  );
  hub.rotation.z = Math.PI / 2;
  earthStation.add(hub);
  
  // Docking lights
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(stationScale * 0.03, 12, 12),
      new THREE.MeshBasicMaterial({ 
        color: i % 2 === 0 ? 0x00ff88 : 0x0088ff,
        fog: false
      })
    );
    light.position.set(
      Math.cos(angle) * stationScale * 0.7,
      0,
      Math.sin(angle) * stationScale * 0.7
    );
    earthStation.add(light);
  }
}
scene.add(earthStation);
stations.push(earthStation);

// Jupiter station (bigger)
const jupiterStation = new THREE.Group();
{
  const stationScale = toRender(SCALE.STATION_SIZE * 200);
  
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(stationScale * 1.2, stationScale * 0.25, 48, 96),
    new THREE.MeshStandardMaterial({
      color: 0xaa8866,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0x443322,
      emissiveIntensity: 0.4
    })
  );
  ring.rotation.x = Math.PI / 2;
  jupiterStation.add(ring);
  
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(stationScale * 0.3, stationScale * 0.3, stationScale * 1.5, 48),
    new THREE.MeshStandardMaterial({
      color: 0x998877,
      roughness: 0.4,
      metalness: 0.8,
      emissive: 0x332211,
      emissiveIntensity: 0.5
    })
  );
  hub.rotation.z = Math.PI / 2;
  jupiterStation.add(hub);
  
  // Lights
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(stationScale * 0.05, 16, 16),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff6600 : 0x00ff88,
        fog: false
      })
    );
    light.position.set(
      Math.cos(angle) * stationScale * 1.2,
      0,
      Math.sin(angle) * stationScale * 1.2
    );
    jupiterStation.add(light);
  }
}
scene.add(jupiterStation);
stations.push(jupiterStation);

// ==================== SHIP ====================
const ship = new THREE.Group();
{
  const shipScale = 0.03;
  
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(shipScale * 0.4, shipScale * 2.5, 16),
    new THREE.MeshStandardMaterial({ 
      color: 0x1a1a2e,
      roughness: 0.4,
      metalness: 0.9,
      emissive: 0x0a0a15,
      emissiveIntensity: 0.2
    })
  );
  body.rotation.x = Math.PI / 2;
  body.visible = false; // First-person view

  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(shipScale * 0.25, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ 
      color: 0x2244aa,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x1133ff,
      emissiveIntensity: 0.3
    })
  );
  cockpit.position.set(0, 0, shipScale * 1.0);
  cockpit.rotation.x = -Math.PI / 2;
  cockpit.visible = false;

  const wingL = new THREE.Mesh(
    new THREE.BoxGeometry(shipScale * 1.5, shipScale * 0.08, shipScale * 0.5),
    new THREE.MeshStandardMaterial({ 
      color: 0x2a3a5a,
      roughness: 0.5,
      metalness: 0.7
    })
  );
  wingL.position.set(-shipScale * 0.85, 0, 0);
  wingL.visible = false;

  const wingR = new THREE.Mesh(
    new THREE.BoxGeometry(shipScale * 1.5, shipScale * 0.08, shipScale * 0.5),
    new THREE.MeshStandardMaterial({ 
      color: 0x2a3a5a,
      roughness: 0.5,
      metalness: 0.7
    })
  );
  wingR.position.set(shipScale * 0.85, 0, 0);
  wingR.visible = false;

  ship.add(body, cockpit, wingL, wingR);
}
scene.add(ship);

// Ship starting position - near Earth
const earthData = SCALE.PLANETS[0]; // Earth
const startDistance = toRender(earthData.radius + 25000); // 25000km altitude
ship.position.set(toRender(earthData.orbit) + startDistance, 0, 0);
ship.lookAt(toRender(earthData.orbit), 0, 0);

// ==================== CAMERA SETUP ====================
camera.position.set(0, 0.3, 0.8);
ship.add(camera);

// ==================== RADAR & JUMP SYSTEM ====================
let radarZoomLevel = 0;
const radarZoomLevels = [5000, 50000, 500000, 5000000]; // km
let jumpTarget = 0; // 0=Earth, 1=Mars, 2=Jupiter
let jumpMenuOpen = false;
let isJumping = false;
let jumpFade = 0;

// ==================== INPUT HANDLING ====================
const inputs: Inputs = {
  throttleUp: false, throttleDown: false, brake: false, boost: false,
  yawL: false, yawR: false, pitchU: false, pitchD: false, rollL: false, rollR: false,
  flightAssist: false, supercruise: false, freeLook: false
};

let flightAssistOn = true;
let supercruiseActive = false;

window.addEventListener("keydown", (e) => setKey(e.code, true));
window.addEventListener("keyup", (e) => setKey(e.code, false));

function setKey(code: string, down: boolean) {
  switch (code) {
    case "KeyW": inputs.throttleUp = down; break;
    case "KeyS": inputs.throttleDown = down; break;
    case "Space": inputs.brake = down; break;
    case "ShiftLeft":
    case "ShiftRight": inputs.boost = down; break;
    case "ArrowLeft": inputs.yawR = down; break;
    case "ArrowRight": inputs.yawL = down; break;
    case "ArrowUp": inputs.pitchU = down; break;
    case "ArrowDown": inputs.pitchD = down; break;
    case "KeyQ": inputs.rollL = down; break;
    case "KeyE": inputs.rollR = down; break;
    case "KeyF": 
      if (down) {
        flightAssistOn = !flightAssistOn;
        console.log("Flight Assist:", flightAssistOn ? "ON" : "OFF");
      }
      break;
    case "KeyJ":
      if (down) {
        if (jumpMenuOpen && supercruiseActive && !isJumping) {
          // Execute jump
          initiateJump();
        } else {
          supercruiseActive = !supercruiseActive;
          console.log("Supercruise:", supercruiseActive ? "ENGAGED" : "DISENGAGED");
        }
      }
      break;
    case "KeyH":
      if (down) {
        const helpMenu = document.getElementById("help-menu");
        if (helpMenu) {
          helpMenu.classList.toggle("visible");
        }
      }
      break;
    case "KeyR":
      if (down) {
        radarZoomLevel = (radarZoomLevel + 1) % radarZoomLevels.length;
        console.log(`Radar zoom: ${radarZoomLevels[radarZoomLevel]}km`);
      }
      break;
    case "KeyM":
      if (down) {
        jumpMenuOpen = !jumpMenuOpen;
        console.log("Jump menu:", jumpMenuOpen ? "OPEN" : "CLOSED");
      }
      break;
    case "Digit1":
      if (down && jumpMenuOpen) {
        jumpTarget = 0;
        console.log("Jump target: Earth");
      }
      break;
    case "Digit2":
      if (down && jumpMenuOpen) {
        jumpTarget = 1;
        console.log("Jump target: Mars");
      }
      break;
    case "Digit3":
      if (down && jumpMenuOpen) {
        jumpTarget = 2;
        console.log("Jump target: Jupiter");
      }
      break;
  }
}

function initiateJump() {
  isJumping = true;
  jumpFade = 0;
  console.log(`Jumping to ${SCALE.PLANETS[jumpTarget].name}...`);
}

// ==================== FLIGHT MODEL ====================
let throttle = 0.2;
let velocity = new THREE.Vector3(0, 0, 0);
let speed = 0;

const yawRate = 0.3;
const pitchRate = 0.3;
const rollRate = 0.65;
const rotationDamping = 0.92;

// ==================== HUD ELEMENTS ====================
const speedValue = document.getElementById("speed-value")!;
const throttleValue = document.getElementById("throttle-value")!;
const speedBar = document.getElementById("speed-bar")!;
const throttleBar = document.getElementById("throttle-bar")!;
const targetDist = document.getElementById("target-dist")!;

// ==================== ANIMATION LOOP ====================
const clock = new THREE.Clock();
let angularVelocity = new THREE.Euler(0, 0, 0);
let initialized = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  // Update shader uniforms
  (coronaMat.uniforms.time as any).value = elapsed;

  // Orbit planets
  planetData.forEach((pData) => {
    const t = elapsed * pData.speed;
    pData.group.position.set(
      Math.cos(t) * toRender(pData.orbit),
      Math.sin(t * 0.1) * toRender(pData.orbit * 0.05),
      Math.sin(t) * toRender(pData.orbit)
    );
    pData.group.rotation.y += dt * 0.1;
  });

  // Initialize ship
  if (!initialized) {
    const earthPlanet = planetData[0];
    ship.position.copy(earthPlanet.group.position);
    ship.position.x += startDistance;
    ship.lookAt(earthPlanet.group.position);
    initialized = true;
  }
  
  // Position stations
  const earthPlanet = planetData[0];
  const st = elapsed * 0.0001;
  earthStation.position.set(
    earthPlanet.group.position.x + Math.cos(st) * toRender(50000),
    earthPlanet.group.position.y + toRender(10),
    earthPlanet.group.position.z + Math.sin(st) * toRender(50000)
  );
  earthStation.rotation.y += dt * 0.05;
  
  const jupiterPlanet = planetData[2];
  jupiterStation.position.set(
    jupiterPlanet.group.position.x + Math.cos(st * 0.5) * toRender(150000),
    jupiterPlanet.group.position.y,
    jupiterPlanet.group.position.z + Math.sin(st * 0.5) * toRender(150000)
  );
  jupiterStation.rotation.y += dt * 0.03;

  // Handle jump
  if (isJumping) {
    jumpFade += dt * 2;
    if (jumpFade > 2) {
      // Teleport to target
      const target = planetData[jumpTarget];
      const offset = toRender(target.radius + 50000);
      ship.position.copy(target.group.position);
      ship.position.x += offset;
      ship.lookAt(target.group.position);
      velocity.set(0, 0, 0);
      speed = 0;
      isJumping = false;
      jumpFade = 0;
      jumpMenuOpen = false;
    }
  }

  // Flight controls (only if not jumping)
  if (!isJumping) {
    if (inputs.throttleUp) throttle += dt * 0.4;
    if (inputs.throttleDown) throttle -= dt * 0.4;
    throttle = clamp(throttle, 0, 1);

    const currentMaxSpeed = supercruiseActive ? SCALE.MAX_SPEED_SUPERCRUISE : SCALE.MAX_SPEED_NORMAL;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
    const boostMultiplier = inputs.boost ? (SCALE.MAX_SPEED_BOOST / SCALE.MAX_SPEED_NORMAL) : 1.0;
    const targetSpeed = currentMaxSpeed * throttle * boostMultiplier;
    
    velocity.copy(forward).multiplyScalar(targetSpeed);
    
    if (inputs.brake) {
      velocity.multiplyScalar(0.1);
    }
    
    speed = velocity.length();
    ship.position.addScaledVector(velocity, dt * 60 * SCALE.RENDER_SCALE);

    // Rotation
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
  }

  // HUD Updates
  const distToStation = toKm(ship.position.distanceTo(earthStation.position));
  const distToPlanet = toKm(ship.position.distanceTo(earthPlanet.group.position)) - earthPlanet.radius;
  
  const speedMS = Math.round(speed * 1000);
  speedValue.textContent = speedMS < 1000 ? `${speedMS}` : `${(speed).toFixed(1)}k`;
  throttleValue.textContent = Math.round(throttle * 100).toString();
  targetDist.textContent = distToStation < 10 ? `${(distToStation * 1000).toFixed(0)}m` : `${distToStation.toFixed(1)}km`;
  
  if (inputs.boost || supercruiseActive) {
    throttleBar.classList.add("boost");
  } else {
    throttleBar.classList.remove("boost");
  }

  updateRadar();
  drawPlanetMarkers();
  drawJumpMenu();
  drawJumpFade();

  renderer.render(scene, camera);
}

// ==================== RADAR SYSTEM ====================
const radarCanvas = document.getElementById("radar-canvas") as HTMLCanvasElement | null;
const radarCtx = radarCanvas?.getContext("2d") || null;
const radarRadius = 85;

function updateRadar() {
  if (!radarCtx || !radarCanvas) return;
  
  const radarRange = radarZoomLevels[radarZoomLevel];
  
  radarCtx.fillStyle = "rgba(0, 20, 15, 0.5)";
  radarCtx.fillRect(0, 0, 180, 180);
  
  // Ship center
  radarCtx.fillStyle = "#00ff88";
  radarCtx.beginPath();
  radarCtx.arc(90, 90, 3, 0, Math.PI * 2);
  radarCtx.fill();
  
  // Range rings
  radarCtx.strokeStyle = "rgba(0, 255, 136, 0.2)";
  radarCtx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    radarCtx.beginPath();
    radarCtx.arc(90, 90, (radarRadius / 3) * i, 0, Math.PI * 2);
    radarCtx.stroke();
  }
  
  // Draw objects
  const objectsToDraw = [
    { name: "Sun", ref: sun, color: "#ffdd88", label: "SUN" },
    ...planetData.map(p => ({ name: p.name, ref: p.group, color: p.color === 0x2288ff ? "#2288ff" : p.color === 0xcd5c5c ? "#cd5c5c" : "#c88b3a", label: "PLT" })),
    { name: "Earth Station", ref: earthStation, color: "#ff6600", label: "STA" },
    { name: "Jupiter Station", ref: jupiterStation, color: "#ff8800", label: "STA" }
  ];
  
  objectsToDraw.forEach(obj => {
    const relPos = obj.ref.position.clone().sub(ship.position);
    const distKm = toKm(relPos.length());
    
    if (distKm > radarRange) return;
    
    const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
    const shipRight = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
    
    const forwardDist = relPos.dot(shipForward);
    const rightDist = relPos.dot(shipRight);
    
    const radarScale = radarRadius / radarRange;
    const x = 90 + (rightDist * radarScale * 100);
    const y = 90 - (forwardDist * radarScale * 100);
    
    radarCtx.fillStyle = obj.color;
    radarCtx.beginPath();
    radarCtx.arc(x, y, 4, 0, Math.PI * 2);
    radarCtx.fill();
    
    radarCtx.font = "7px monospace";
    radarCtx.fillText(obj.label, x + 6, y + 3);
  });
  
  // Radar range label
  radarCtx.fillStyle = "#00ff88";
  radarCtx.font = "10px monospace";
  radarCtx.fillText(`${radarRange}km`, 5, 175);
  
  // Sweep line
  const sweepAngle = (clock.elapsedTime * 2) % (Math.PI * 2);
  radarCtx.strokeStyle = "rgba(0, 255, 136, 0.3)";
  radarCtx.lineWidth = 1;
  radarCtx.beginPath();
  radarCtx.moveTo(90, 90);
  radarCtx.lineTo(90 + Math.cos(sweepAngle) * radarRadius, 90 + Math.sin(sweepAngle) * radarRadius);
  radarCtx.stroke();
}

// ==================== PLANET MARKERS ====================
function drawPlanetMarkers() {
  const canvas = renderer.domElement;
  let overlay = document.getElementById('planet-marker-canvas') as HTMLCanvasElement;
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'planet-marker-canvas';
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
  
  // Draw planet markers
  planetData.forEach((pData) => {
    const planetPos = pData.group.position.clone();
    planetPos.project(camera);
    
    if (planetPos.z > 1) return;
    
    const x = (planetPos.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-planetPos.y * 0.5 + 0.5) * canvas.clientHeight;
    
    if (x < 0 || x > canvas.clientWidth || y < 0 || y > canvas.clientHeight) return;
    
    const dist = toKm(ship.position.distanceTo(pData.group.position));
    
    // Draw marker
    const colorMap: any = { 0x2288ff: '#2288ff', 0xcd5c5c: '#cd5c5c', 0xc88b3a: '#ff8800' };
    ctx.strokeStyle = colorMap[pData.color] || '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '12px Orbitron, monospace';
    ctx.fillText(pData.name.toUpperCase(), x + 35, y - 5);
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.fillText(`${dist.toFixed(0)}km`, x + 35, y + 8);
  });
  
  // Draw station markers
  [
    { station: earthStation, name: "VIGILANT RELAY", color: '#ff6600' },
    { station: jupiterStation, name: "GALILEO OUTPOST", color: '#ff8800' }
  ].forEach(({ station, name, color }) => {
    const stationPos = station.position.clone();
    stationPos.project(camera);
    
    if (stationPos.z > 1) return;
    
    const x = (stationPos.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-stationPos.y * 0.5 + 0.5) * canvas.clientHeight;
    
    if (x < 0 || x > canvas.clientWidth || y < 0 || y > canvas.clientHeight) return;
    
    const dist = toKm(ship.position.distanceTo(station.position));
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = color;
    ctx.font = '14px Orbitron, monospace';
    ctx.fillText(name, x + 50, y - 10);
    ctx.font = '12px Share Tech Mono, monospace';
    ctx.fillText(`${dist.toFixed(1)}km`, x + 50, y + 5);
  });
}

// ==================== JUMP MENU ====================
function drawJumpMenu() {
  if (!jumpMenuOpen) return;
  
  const canvas = renderer.domElement;
  let overlay = document.getElementById('jump-menu-canvas') as HTMLCanvasElement;
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'jump-menu-canvas';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '15';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    document.body.appendChild(overlay);
  }
  
  overlay.width = canvas.clientWidth;
  overlay.height = canvas.clientHeight;
  
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw menu background
  ctx.fillStyle = 'rgba(0, 20, 15, 0.95)';
  ctx.fillRect(canvas.clientWidth / 2 - 200, canvas.clientHeight / 2 - 150, 400, 300);
  
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 3;
  ctx.strokeRect(canvas.clientWidth / 2 - 200, canvas.clientHeight / 2 - 150, 400, 300);
  
  // Title
  ctx.fillStyle = '#ffaa00';
  ctx.font = '20px Orbitron, monospace';
  ctx.fillText('═══ JUMP COMPUTER ═══', canvas.clientWidth / 2 - 150, canvas.clientHeight / 2 - 110);
  
  // Planet list
  const centerX = canvas.clientWidth / 2;
  const centerY = canvas.clientHeight / 2;
  
  SCALE.PLANETS.forEach((planet, i) => {
    const y = centerY - 50 + i * 60;
    const isSelected = jumpTarget === i;
    
    ctx.fillStyle = isSelected ? '#ffaa00' : '#00ff88';
    ctx.font = '16px Orbitron, monospace';
    ctx.fillText(`[${i + 1}] ${planet.name.toUpperCase()}`, centerX - 150, y);
    
    const dist = toKm(ship.position.distanceTo(planetData[i].group.position));
    ctx.font = '12px Share Tech Mono, monospace';
    ctx.fillText(`Distance: ${dist.toFixed(0)}km`, centerX - 150, y + 20);
  });
  
  // Instructions
  ctx.fillStyle = '#88ffcc';
  ctx.font = '12px Share Tech Mono, monospace';
  ctx.fillText('Press 1/2/3 to select target', centerX - 120, centerY + 100);
  ctx.fillText('Press J (in Supercruise) to jump', centerX - 120, centerY + 120);
  ctx.fillText('Press M to close', centerX - 120, centerY + 140);
}

// ==================== JUMP FADE EFFECT ====================
function drawJumpFade() {
  if (jumpFade === 0) return;
  
  const canvas = renderer.domElement;
  let overlay = document.getElementById('jump-fade-canvas') as HTMLCanvasElement;
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'jump-fade-canvas';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '20';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    document.body.appendChild(overlay);
  }
  
  overlay.width = canvas.clientWidth;
  overlay.height = canvas.clientHeight;
  
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Fade to white
  const opacity = jumpFade < 1 ? jumpFade : (2 - jumpFade);
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

animate();

// ==================== WINDOW RESIZE ====================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
