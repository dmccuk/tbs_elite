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
// Real-world inspired scales
const SCALE = {
  PLANET_RADIUS: 6400,      // km (Earth-sized)
  PLANET_ORBIT: 150000,     // km from sun (1 AU = 150 million km, scaled down)
  STATION_SIZE: 0.5,        // km (500m station)
  STATION_ORBIT: 400,       // km from planet
  SUN_RADIUS: 50,           // km (visual, not realistic)
  
  // Speed constants
  MAX_SPEED_NORMAL: 0.5,    // km/s (500 m/s)
  MAX_SPEED_SUPERCRUISE: 100, // km/s (100 km/s)
  
  // Display scale factor (for rendering)
  RENDER_SCALE: 0.01,       // Scale everything down 100x for rendering
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

// ==================== PLANET ====================
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(toRender(SCALE.PLANET_RADIUS), 64, 64),
  new THREE.MeshStandardMaterial({ 
    color: 0x2288ff,
    roughness: 0.8,
    metalness: 0.1,
    emissive: 0x001133,
    emissiveIntensity: 0.2
  })
);
planet.receiveShadow = true;
planet.castShadow = true;
scene.add(planet);

// Atmosphere shader
const atmosphereGeo = new THREE.SphereGeometry(toRender(SCALE.PLANET_RADIUS * 1.02), 64, 64);
const atmosphereMat = new THREE.ShaderMaterial({
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
planet.add(atmosphere);

// Add some cloud detail
const cloudGeo = new THREE.SphereGeometry(toRender(SCALE.PLANET_RADIUS * 1.005), 64, 64);
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.2,
  roughness: 1.0,
  metalness: 0.0
});
const clouds = new THREE.Mesh(cloudGeo, cloudMat);
planet.add(clouds);

// ==================== STATION ====================
const station = new THREE.Group();
{
  const stationScale = toRender(SCALE.STATION_SIZE);
  
  // Main ring (bigger and more detailed)
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
  ring.castShadow = true;
  ring.receiveShadow = true;

  // Hub cylinder
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
  hub.castShadow = true;
  hub.receiveShadow = true;

  // Solar panels
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(stationScale * 0.3, stationScale * 0.02, stationScale * 0.5),
      new THREE.MeshStandardMaterial({ 
        color: 0x1a2a4a,
        roughness: 0.2,
        metalness: 0.9,
        emissive: 0x0a1a3a,
        emissiveIntensity: 0.2
      })
    );
    panel.position.set(
      Math.cos(angle) * stationScale * 1.2,
      0,
      Math.sin(angle) * stationScale * 1.2
    );
    panel.lookAt(0, 0, 0);
    station.add(panel);
  }

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
    station.add(light);
    
    const pointLight = new THREE.PointLight(
      i % 2 === 0 ? 0x00ff88 : 0x0088ff,
      0.3,
      stationScale * 5
    );
    pointLight.position.copy(light.position);
    station.add(pointLight);
  }

  // Navigation beacon
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(stationScale * 0.05, 16, 16),
    new THREE.MeshBasicMaterial({ 
      color: 0xffaa00,
      fog: false
    })
  );
  beacon.position.set(0, 0, stationScale * 1.5);
  station.add(beacon);

  const beaconLight = new THREE.PointLight(0xffaa00, 1.0, stationScale * 10);
  beaconLight.position.copy(beacon.position);
  station.add(beaconLight);

  station.add(ring, hub);
}
scene.add(station);

// ==================== SHIP ====================
const ship = new THREE.Group();
{
  const shipScale = 0.03; // 30 meter ship
  
  // Main body
  const bodyGeo = new THREE.ConeGeometry(shipScale * 0.4, shipScale * 2.5, 16);
  const bodyMat = new THREE.MeshStandardMaterial({ 
    color: 0x1a1a2e,
    roughness: 0.4,
    metalness: 0.9,
    emissive: 0x0a0a15,
    emissiveIntensity: 0.2
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;

  // Cockpit
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

  // Wings
  const wingGeo = new THREE.BoxGeometry(shipScale * 1.5, shipScale * 0.08, shipScale * 0.5);
  const wingMat = new THREE.MeshStandardMaterial({ 
    color: 0x2a3a5a,
    roughness: 0.5,
    metalness: 0.7,
    emissive: 0x0f1a2a,
    emissiveIntensity: 0.2
  });
  
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-shipScale * 0.85, 0, 0);
  wingL.castShadow = true;

  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(shipScale * 0.85, 0, 0);
  wingR.castShadow = true;

  // Wing lights
  const wingLightL = new THREE.Mesh(
    new THREE.SphereGeometry(shipScale * 0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000, fog: false })
  );
  wingLightL.position.set(-shipScale * 1.5, 0, 0);

  const wingLightR = new THREE.Mesh(
    new THREE.SphereGeometry(shipScale * 0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, fog: false })
  );
  wingLightR.position.set(shipScale * 1.5, 0, 0);

  // Engine glow
  const engineGlow = new THREE.Mesh(
    new THREE.SphereGeometry(shipScale * 0.25, 16, 16),
    new THREE.MeshBasicMaterial({ 
      color: 0x3388ff,
      transparent: true,
      opacity: 0.8,
      fog: false
    })
  );
  engineGlow.position.set(0, 0, -shipScale * 1.4);

  const engineLight = new THREE.PointLight(0x3388ff, 1.0, shipScale * 10);
  engineLight.position.set(0, 0, -shipScale * 1.4);

  ship.add(body, cockpit, wingL, wingR, wingLightL, wingLightR, engineGlow, engineLight);
}
scene.add(ship);

// Ship starting position - 100km from planet surface
// NOTE: We need to position AFTER planet updates in animate loop!
// For now, start at planet's initial position
const startDistance = toRender(SCALE.PLANET_RADIUS + 400);
// Position relative to planet's orbit (at t=0, planet is at PLANET_ORBIT on X axis)
ship.position.set(
  toRender(SCALE.PLANET_ORBIT) + startDistance,
  0,
  0
);
ship.lookAt(toRender(SCALE.PLANET_ORBIT), 0, 0);

// ==================== CAMERA SETUP ====================
camera.position.set(0, 0.3, 0.8);
ship.add(camera);

// ==================== ENGINE PARTICLES ====================
let engineParticles: THREE.Points;
{
  const particleCount = 80;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const ages = new Float32Array(particleCount);
  
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = -0.04;
    ages[i] = Math.random();
  }
  
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute("age", new THREE.BufferAttribute(ages, 1));
  
  const particleMat = new THREE.PointsMaterial({
    size: 0.015,
    color: 0x3388ff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  
  engineParticles = new THREE.Points(particleGeo, particleMat);
  ship.add(engineParticles);
}

// ==================== INPUT HANDLING ====================
const inputs: Inputs = {
  throttleUp: false, throttleDown: false, brake: false, boost: false,
  yawL: false, yawR: false, pitchU: false, pitchD: false, rollL: false, rollR: false,
  flightAssist: false, supercruise: false, freeLook: false
};

let flightAssistOn = true; // Flight assist on by default

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
        supercruiseActive = !supercruiseActive;
        console.log("Supercruise:", supercruiseActive ? "ENGAGED" : "DISENGAGED");
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
  }
}

// ==================== FLIGHT MODEL - NEWTONIAN PHYSICS ====================
let throttle = 0.2;
let velocity = new THREE.Vector3(0, 0, 0); // Actual velocity vector (km/s)
let speed = 0; // Speed magnitude (km/s)
let supercruiseActive = false;

const maxAccel = 0.0005; // km/s² (0.5 m/s²)
const maxDecel = 0.001;  // km/s² (1 m/s²)
const rotationDamping = 0.92; // How quickly rotation slows
const velocityDamping = 0.9995; // Slight space friction for gameplay

const yawRate = 0.8;
const pitchRate = 0.7;
const rollRate = 1.5;

// ==================== HUD ELEMENTS ====================
const speedValue = document.getElementById("speed-value")!;
const throttleValue = document.getElementById("throttle-value")!;
const speedBar = document.getElementById("speed-bar")!;
const throttleBar = document.getElementById("throttle-bar")!;
const targetDist = document.getElementById("target-dist")!;

// ==================== ANIMATION LOOP ====================
const clock = new THREE.Clock();
let angularVelocity = new THREE.Euler(0, 0, 0); // Ship rotation velocity

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  // Update shader uniforms
  (coronaMat.uniforms.time as any).value = elapsed;
  (atmosphereMat.uniforms.time as any).value = elapsed;

  // Orbit planet around sun (slow)
  const t = elapsed * 0.01;
  planet.position.set(
    Math.cos(t) * toRender(SCALE.PLANET_ORBIT),
    Math.sin(t * 0.1) * toRender(SCALE.PLANET_ORBIT * 0.05),
    Math.sin(t) * toRender(SCALE.PLANET_ORBIT)
  );
  planet.rotation.y += dt * 0.1;
  clouds.rotation.y += dt * 0.15;

  // Station orbits planet
  const st = elapsed * 0.05;
  const stationOrbitDist = toRender(SCALE.STATION_ORBIT);
  station.position.set(
    planet.position.x + Math.cos(st) * stationOrbitDist,
    planet.position.y + toRender(10),
    planet.position.z + Math.sin(st) * stationOrbitDist
  );
  station.rotation.y += dt * 0.2;

  // ==================== NEWTONIAN FLIGHT CONTROLS ====================
  // Throttle control
  if (inputs.throttleUp) throttle += dt * 0.4;
  if (inputs.throttleDown) throttle -= dt * 0.4;
  throttle = clamp(throttle, 0, 1);

  // Current max speed based on mode
  const currentMaxSpeed = supercruiseActive ? SCALE.MAX_SPEED_SUPERCRUISE : SCALE.MAX_SPEED_NORMAL;
  const targetSpeed = currentMaxSpeed * throttle * (inputs.boost ? 1.5 : 1.0);

  // Get ship's forward direction
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
  
  // Apply thrust in forward direction
  if (flightAssistOn) {
    // Flight assist: auto-brake when below target speed
    const currentForwardSpeed = velocity.dot(forward);
    const speedDiff = targetSpeed - currentForwardSpeed;
    
    if (speedDiff > 0) {
      velocity.addScaledVector(forward, maxAccel * dt * 60);
    } else if (speedDiff < 0) {
      velocity.addScaledVector(forward, -maxDecel * dt * 60);
    }
  } else {
    // No flight assist: pure thrust
    if (throttle > 0.01) {
      velocity.addScaledVector(forward, maxAccel * throttle * dt * 60);
    }
  }

  // Braking
  if (inputs.brake) {
    if (flightAssistOn) {
      // Full stop brake
      velocity.multiplyScalar(1 - (maxDecel * 2 * dt * 60) / (velocity.length() + 0.001));
    } else {
      // Reverse thrust
      velocity.addScaledVector(forward, -maxDecel * dt * 60);
    }
  }

  // Speed limiting
  speed = velocity.length();
  if (speed > currentMaxSpeed && flightAssistOn) {
    velocity.normalize().multiplyScalar(currentMaxSpeed);
    speed = currentMaxSpeed;
  }

  // Apply velocity to position (converting km/s to render units)
  ship.position.addScaledVector(velocity, dt * 60 * SCALE.RENDER_SCALE);

  // Slight velocity damping for gameplay
  velocity.multiplyScalar(velocityDamping);

  // ==================== ROTATION WITH ANGULAR VELOCITY ====================
  const yaw = (inputs.yawR ? 1 : 0) - (inputs.yawL ? 1 : 0);
  const pitch = (inputs.pitchD ? 1 : 0) - (inputs.pitchU ? 1 : 0);
  const roll = (inputs.rollR ? 1 : 0) - (inputs.rollL ? 1 : 0);

  // Apply rotation inputs to angular velocity
  angularVelocity.y += yaw * yawRate * dt;
  angularVelocity.x += pitch * pitchRate * dt;
  angularVelocity.z -= roll * rollRate * dt;

  // Apply damping to angular velocity
  angularVelocity.x *= rotationDamping;
  angularVelocity.y *= rotationDamping;
  angularVelocity.z *= rotationDamping;

  // Apply angular velocity to ship rotation
  ship.rotateY(angularVelocity.y * dt * 60);
  ship.rotateX(angularVelocity.x * dt * 60);
  ship.rotateZ(angularVelocity.z * dt * 60);

  // ==================== ENGINE PARTICLES ====================
  const particlePositions = engineParticles.geometry.attributes.position.array as Float32Array;
  const particleAges = engineParticles.geometry.attributes.age.array as Float32Array;
  
  for (let i = 0; i < particleAges.length; i++) {
    particleAges[i] += dt * (3 + speed * 2);
    
    if (particleAges[i] > 1) {
      particleAges[i] = 0;
      particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 0.02;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      particlePositions[i * 3 + 2] = -0.04;
    } else {
      particlePositions[i * 3 + 2] -= dt * (0.5 + speed * 0.1);
    }
  }
  
  engineParticles.geometry.attributes.position.needsUpdate = true;
  engineParticles.geometry.attributes.age.needsUpdate = true;

  // ==================== HUD UPDATES ====================
  const distToStation = toKm(ship.position.distanceTo(station.position));
  const distToPlanet = toKm(ship.position.distanceTo(planet.position)) - SCALE.PLANET_RADIUS;
  
  // Display speed in m/s and km/s
  const speedMS = Math.round(speed * 1000);
  speedValue.textContent = speedMS < 1000 ? 
    `${speedMS}` : 
    `${(speed).toFixed(1)}k`;
  
  throttleValue.textContent = Math.round(throttle * 100).toString();
  
  // Distance in km
  targetDist.textContent = distToStation < 10 ? 
    `${(distToStation * 1000).toFixed(0)}m` : 
    `${distToStation.toFixed(1)}km`;
  
  // Update bars
  speedBar.style.width = `${(speed / currentMaxSpeed) * 100}%`;
  throttleBar.style.width = `${throttle * 100}%`;
  
  if (inputs.boost || supercruiseActive) {
    throttleBar.classList.add("boost");
  } else {
    throttleBar.classList.remove("boost");
  }

  // Update radar
  updateRadar();

  renderer.render(scene, camera);
}

// ==================== RADAR SYSTEM ====================
const radarCanvas = document.getElementById("radar-canvas") as HTMLCanvasElement | null;
const radarCtx = radarCanvas?.getContext("2d") || null;
const radarRadius = 85;
const radarRange = 500; // km

const radarObjects = [
  { name: "Vigilia Prime", ref: planet, type: "planet", color: "#3388ff" },
  { name: "Vigilant Relay", ref: station, type: "station", color: "#00ff88" },
  { name: "Sun", ref: sun, type: "star", color: "#ffdd88" }
];

function updateRadar() {
  if (!radarCtx || !radarCanvas) return;
  
  // Clear and fill background
  radarCtx.fillStyle = "rgba(0, 20, 15, 0.5)";
  radarCtx.fillRect(0, 0, 180, 180);
  
  // Draw ship center dot
  radarCtx.fillStyle = "#00ff88";
  radarCtx.beginPath();
  radarCtx.arc(90, 90, 3, 0, Math.PI * 2);
  radarCtx.fill();
  
  // Draw range rings
  radarCtx.strokeStyle = "rgba(0, 255, 136, 0.2)";
  radarCtx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    radarCtx.beginPath();
    radarCtx.arc(90, 90, (radarRadius / 3) * i, 0, Math.PI * 2);
    radarCtx.stroke();
  }
  
  // Draw objects
  radarObjects.forEach(obj => {
    const relPos = obj.ref.position.clone().sub(ship.position);
    const distKm = toKm(relPos.length());
    if (distKm > radarRange) return;
    
    const radarScale = radarRadius / radarRange;
    const x = 90 + (relPos.x * radarScale * 100);
    const y = 90 - (relPos.z * radarScale * 100);
    
    radarCtx.fillStyle = obj.color;
    radarCtx.beginPath();
    radarCtx.arc(x, y, 3, 0, Math.PI * 2);
    radarCtx.fill();
  });
  
  // Sweeping radar line
  const sweepAngle = (clock.elapsedTime * 2) % (Math.PI * 2);
  radarCtx.strokeStyle = "rgba(0, 255, 136, 0.3)";
  radarCtx.lineWidth = 1;
  radarCtx.beginPath();
  radarCtx.moveTo(90, 90);
  radarCtx.lineTo(
    90 + Math.cos(sweepAngle) * radarRadius,
    90 + Math.sin(sweepAngle) * radarRadius
  );
  radarCtx.stroke();
}

animate();

// ==================== WINDOW RESIZE ====================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
