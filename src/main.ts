import * as THREE from "three";

type Inputs = {
  throttleUp: boolean;
  throttleDown: boolean;
  brake: boolean;
  boost: boolean;
  yawL: boolean; yawR: boolean;
  pitchU: boolean; pitchD: boolean;
  rollL: boolean; rollR: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

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
scene.fog = new THREE.FogExp2(0x000510, 0.00015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);

// ==================== BACKGROUND STARS ====================
{
  const starGeo = new THREE.BufferGeometry();
  const count = 3000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const r = 8000 + Math.random() * 8000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    
    // Varied star colors
    const colorType = Math.random();
    if (colorType < 0.7) {
      // White/blue stars
      colors[i * 3 + 0] = 0.8 + Math.random() * 0.2;
      colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
      colors[i * 3 + 2] = 1.0;
    } else if (colorType < 0.9) {
      // Yellow stars
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.6 + Math.random() * 0.2;
    } else {
      // Red stars
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.2;
      colors[i * 3 + 2] = 0.2;
    }
  }
  
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  
  const starMat = new THREE.PointsMaterial({ 
    size: 3, 
    sizeAttenuation: false, 
    vertexColors: true,
    transparent: true,
    opacity: 0.9
  });
  scene.add(new THREE.Points(starGeo, starMat));
}

// ==================== LIGHTING ====================
const ambient = new THREE.AmbientLight(0x1a2233, 0.4);
scene.add(ambient);

const sunLight = new THREE.PointLight(0xffffee, 3.5, 0, 2);
sunLight.position.set(0, 0, 0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
scene.add(sunLight);

// Rim light for dramatic effect
const rimLight = new THREE.DirectionalLight(0x4488ff, 0.8);
rimLight.position.set(500, 200, -500);
scene.add(rimLight);

// ==================== THE SUN ====================
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(80, 32, 32),
  new THREE.MeshBasicMaterial({ 
    color: 0xffdd88,
    fog: false 
  })
);
scene.add(sun);

// Sun corona glow
const coronaGeo = new THREE.SphereGeometry(95, 32, 32);
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
const planetOrbitRadius = 1200;
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(85, 48, 48),
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
const atmosphereGeo = new THREE.SphereGeometry(88, 48, 48);
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

// ==================== STATION ====================
const station = new THREE.Group();
{
  // Main ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(35, 8, 24, 64),
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
    new THREE.CylinderGeometry(8, 8, 35, 24),
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

  // Docking lights
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 12),
      new THREE.MeshBasicMaterial({ 
        color: i % 2 === 0 ? 0x00ff88 : 0x0088ff,
        fog: false
      })
    );
    light.position.set(
      Math.cos(angle) * 35,
      0,
      Math.sin(angle) * 35
    );
    station.add(light);
    
    // Point light for each docking light
    const pointLight = new THREE.PointLight(
      i % 2 === 0 ? 0x00ff88 : 0x0088ff,
      0.5,
      50
    );
    pointLight.position.copy(light.position);
    station.add(pointLight);
  }

  // Navigation beacon
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 16, 16),
    new THREE.MeshBasicMaterial({ 
      color: 0xffaa00,
      fog: false
    })
  );
  beacon.position.set(0, 0, 45);
  station.add(beacon);

  const beaconLight = new THREE.PointLight(0xffaa00, 1.5, 80);
  beaconLight.position.copy(beacon.position);
  station.add(beaconLight);

  station.add(ring, hub);
}
scene.add(station);

// ==================== SHIP ====================
const ship = new THREE.Group();
{
  // Main body - sleeker needle design
  const bodyGeo = new THREE.ConeGeometry(3.5, 22, 16);
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

  // Cockpit window
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
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
  cockpit.position.set(0, 0, 8);
  cockpit.rotation.x = -Math.PI / 2;

  // Wings
  const wingGeo = new THREE.BoxGeometry(12, 1, 4);
  const wingMat = new THREE.MeshStandardMaterial({ 
    color: 0x2a3a5a,
    roughness: 0.5,
    metalness: 0.7,
    emissive: 0x0f1a2a,
    emissiveIntensity: 0.2
  });
  
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-7, 0, 0);
  wingL.castShadow = true;

  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(7, 0, 0);
  wingR.castShadow = true;

  // Wing lights
  const wingLightL = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000, fog: false })
  );
  wingLightL.position.set(-12, 0, 0);

  const wingLightR = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, fog: false })
  );
  wingLightR.position.set(12, 0, 0);

  // Engine glow
  const engineGlow = new THREE.Mesh(
    new THREE.SphereGeometry(2, 16, 16),
    new THREE.MeshBasicMaterial({ 
      color: 0x3388ff,
      transparent: true,
      opacity: 0.8,
      fog: false
    })
  );
  engineGlow.position.set(0, 0, -12);

  // Engine light
  const engineLight = new THREE.PointLight(0x3388ff, 1.5, 30);
  engineLight.position.set(0, 0, -12);

  ship.add(body, cockpit, wingL, wingR, wingLightL, wingLightR, engineGlow, engineLight);
}
scene.add(ship);

// Ship starting position
ship.position.set(planetOrbitRadius + 250, 60, 0);
ship.lookAt(0, 0, 0);

// ==================== CAMERA SETUP ====================
camera.position.set(0, 18, 50);
ship.add(camera);

// ==================== ENGINE PARTICLES ====================
let engineParticles: THREE.Points;
{
  const particleCount = 50;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const ages = new Float32Array(particleCount);
  
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = -12;
    velocities[i * 3 + 0] = 0;
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = 0;
    ages[i] = Math.random();
  }
  
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
  particleGeo.setAttribute("age", new THREE.BufferAttribute(ages, 1));
  
  const particleMat = new THREE.PointsMaterial({
    size: 1.5,
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
};

window.addEventListener("keydown", (e) => setKey(e.code, true));
window.addEventListener("keyup", (e) => setKey(e.code, false));

function setKey(code: string, down: boolean) {
  switch (code) {
    case "KeyW": inputs.throttleUp = down; break;
    case "KeyS": inputs.throttleDown = down; break;
    case "Space": inputs.brake = down; break;
    case "ShiftLeft":
    case "ShiftRight": inputs.boost = down; break;
    case "ArrowLeft": inputs.yawL = down; break;
    case "ArrowRight": inputs.yawR = down; break;
    case "ArrowUp": inputs.pitchU = down; break;
    case "ArrowDown": inputs.pitchD = down; break;
    case "KeyQ": inputs.rollL = down; break;
    case "KeyE": inputs.rollR = down; break;
  }
}

// ==================== FLIGHT MODEL ====================
let throttle = 0.2;
let speed = 0;
const maxSpeed = 280;
const accel = 100;
const brakeDecel = 200;
const yawRate = 1.2;
const pitchRate = 1.0;
const rollRate = 2.4;

// ==================== HUD ELEMENTS ====================
const speedValue = document.getElementById("speed-value")!;
const throttleValue = document.getElementById("throttle-value")!;
const speedBar = document.getElementById("speed-bar")!;
const throttleBar = document.getElementById("throttle-bar")!;
const targetDist = document.getElementById("target-dist")!;

// ==================== ANIMATION LOOP ====================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  // Update shader uniforms
  (coronaMat.uniforms.time as any).value = elapsed;
  (atmosphereMat.uniforms.time as any).value = elapsed;

  // Orbit planet around sun
  const t = elapsed * 0.04;
  planet.position.set(
    Math.cos(t) * planetOrbitRadius,
    Math.sin(t * 0.3) * 80,
    Math.sin(t) * planetOrbitRadius
  );
  planet.rotation.y += dt * 0.2;

  // Station orbits planet
  const st = elapsed * 0.15;
  station.position.set(
    planet.position.x + Math.cos(st) * 200,
    planet.position.y + 20,
    planet.position.z + Math.sin(st) * 200
  );
  station.rotation.y += dt * 0.3;

  // ==================== FLIGHT CONTROLS ====================
  // Throttle
  if (inputs.throttleUp) throttle += dt * 0.4;
  if (inputs.throttleDown) throttle -= dt * 0.4;
  throttle = clamp(throttle, 0, 1);

  // Target speed
  const boostMul = inputs.boost ? 1.8 : 1.0;
  const targetSpeed = maxSpeed * throttle * boostMul;

  // Acceleration
  const a = accel * (inputs.boost ? 1.5 : 1.0);
  if (speed < targetSpeed) speed = Math.min(targetSpeed, speed + a * dt);
  else speed = Math.max(targetSpeed, speed - a * dt);

  // Braking
  if (inputs.brake) speed = Math.max(0, speed - brakeDecel * dt);

  // Rotation
  const yaw = (inputs.yawR ? 1 : 0) - (inputs.yawL ? 1 : 0);
  const pitch = (inputs.pitchD ? 1 : 0) - (inputs.pitchU ? 1 : 0);
  const roll = (inputs.rollR ? 1 : 0) - (inputs.rollL ? 1 : 0);

  ship.rotateY(yaw * yawRate * dt);
  ship.rotateX(pitch * pitchRate * dt);
  ship.rotateZ(-roll * rollRate * dt);

  // Forward movement
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
  ship.position.addScaledVector(forward, speed * dt);

  // ==================== ENGINE PARTICLES ====================
  const particlePositions = engineParticles.geometry.attributes.position.array as Float32Array;
  const particleAges = engineParticles.geometry.attributes.age.array as Float32Array;
  
  for (let i = 0; i < particleAges.length; i++) {
    particleAges[i] += dt * (2 + speed / 100);
    
    if (particleAges[i] > 1) {
      // Reset particle
      particleAges[i] = 0;
      particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 2;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2;
      particlePositions[i * 3 + 2] = -12;
    } else {
      // Move particle backward
      particlePositions[i * 3 + 2] -= dt * (20 + speed / 5);
    }
  }
  
  engineParticles.geometry.attributes.position.needsUpdate = true;
  engineParticles.geometry.attributes.age.needsUpdate = true;

  // ==================== HUD UPDATES ====================
  const distToStation = ship.position.distanceTo(station.position);
  
  speedValue.textContent = Math.round(speed).toString();
  throttleValue.textContent = Math.round(throttle * 100).toString();
  targetDist.textContent = Math.round(distToStation).toString();
  
  speedBar.style.width = `${(speed / maxSpeed) * 100}%`;
  throttleBar.style.width = `${throttle * 100}%`;
  
  if (inputs.boost) {
    throttleBar.classList.add("boost");
  } else {
    throttleBar.classList.remove("boost");
  }

  renderer.render(scene, camera);
}

animate();

// ==================== WINDOW RESIZE ====================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
