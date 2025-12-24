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

const SCALE = {
  SUN_RADIUS: 100,
  STATION_SIZE: 0.5,
  MAX_SPEED_NORMAL: 1.0,
  MAX_SPEED_BOOST: 5.0,
  MAX_SPEED_SUPERCRUISE: 1000,
  RENDER_SCALE: 0.001,
};

const toRender = (km: number) => km * SCALE.RENDER_SCALE;
const toKm = (units: number) => units / SCALE.RENDER_SCALE;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

renderer.domElement.tabIndex = 1;
renderer.domElement.focus();

const startMessage = document.getElementById('start-message');

renderer.domElement.addEventListener('click', () => {
  renderer.domElement.focus();
  if (startMessage) {
    startMessage.classList.add('hidden');
  }
});

window.addEventListener('keydown', () => {
  if (startMessage && !startMessage.classList.contains('hidden')) {
    startMessage.classList.add('hidden');
  }
}, { once: true });

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000510, 0.000008);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50000);

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

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(toRender(SCALE.SUN_RADIUS), 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffdd88, fog: false })
);
scene.add(sun);

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

// Vigilant Relay
const vigilantRelay = new THREE.Group();
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
  vigilantRelay.add(ring);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.15, scale * 0.15, scale * 0.7, 32),
    new THREE.MeshStandardMaterial({ 
      color: 0x7788aa,
      roughness: 0.4,
      metalness: 0.7
    })
  );
  hub.rotation.z = Math.PI / 2;
  vigilantRelay.add(hub);
  
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
    vigilantRelay.add(light);
  }
  
  vigilantRelay.position.set(-toRender(300000), 0, 0);
}
scene.add(vigilantRelay);

// Galileo Outpost
const galileoOutpost = new THREE.Group();
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
  galileoOutpost.add(ring);
  
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.3, scale * 0.3, scale * 1.5, 48),
    new THREE.MeshStandardMaterial({
      color: 0x998877,
      roughness: 0.4,
      metalness: 0.8
    })
  );
  hub.rotation.z = Math.PI / 2;
  galileoOutpost.add(hub);
  
  galileoOutpost.position.set(toRender(300000), 0, 0);
}
scene.add(galileoOutpost);

// Ship
const ship = new THREE.Group();
{
  const shipScale = 0.03;
  
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(shipScale * 0.4, shipScale * 2.5, 16),
    new THREE.MeshStandardMaterial({ 
      color: 0x1a1a2e,
      roughness: 0.4,
      metalness: 0.9
    })
  );
  body.rotation.x = Math.PI / 2;
  body.visible = false;

  ship.add(body);
}
scene.add(ship);

ship.position.set(0, 0, 0);

camera.position.set(0, 0.3, 0.8);
ship.add(camera);

let royalYacht: THREE.Group | null = null;
let blackShip: THREE.Group | null = null;
let missionStarted = false;

function createRoyalYacht() {
  const yacht = new THREE.Group();
  const scale = 0.08;
  
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.3, scale * 0.5, scale * 3, 16),
    new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x4444ff,
      emissiveIntensity: 0.2
    })
  );
  body.rotation.z = Math.PI / 2;
  yacht.add(body);
  
  for (let i = 0; i < 3; i++) {
    const engine = new THREE.Mesh(
      new THREE.SphereGeometry(scale * 0.15, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, fog: false })
    );
    const angle = (i / 3) * Math.PI * 2;
    engine.position.set(-scale * 1.5, Math.cos(angle) * scale * 0.3, Math.sin(angle) * scale * 0.3);
    yacht.add(engine);
  }
  
  yacht.position.set(-toRender(50000), 0, toRender(5000));
  return yacht;
}

function createBlackShip() {
  const black = new THREE.Group();
  const scale = 0.06;
  
  const hull = new THREE.Mesh(
    new THREE.ConeGeometry(scale * 0.4, scale * 2.5, 8),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.7,
      metalness: 0.9
    })
  );
  hull.rotation.x = Math.PI / 2;
  black.add(hull);
  
  const engine = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.2, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0x440000,
      transparent: true,
      opacity: 0.3,
      fog: false
    })
  );
  engine.position.set(-scale * 1.3, 0, 0);
  black.add(engine);
  
  black.position.set(-toRender(55000), 0, toRender(5000));
  return black;
}

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

let throttle = 0.2;
let velocity = new THREE.Vector3(0, 0, 0);
let speed = 0;

const yawRate = 0.3;
const pitchRate = 0.3;
const rollRate = 0.65;
const rotationDamping = 0.92;

const speedValue = document.getElementById("speed-value")!;
const throttleValue = document.getElementById("throttle-value")!;
const speedBar = document.getElementById("speed-bar")!;
const throttleBar = document.getElementById("throttle-bar")!;
const targetDist = document.getElementById("target-dist")!;

const clock = new THREE.Clock();
let angularVelocity = new THREE.Euler(0, 0, 0);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  if (!missionStarted && elapsed > 30) {
    missionStarted = true;
    console.log("⚠️ EMERGENCY WARP SIGNATURES DETECTED!");
    
    royalYacht = createRoyalYacht();
    scene.add(royalYacht);
    
    setTimeout(() => {
      blackShip = createBlackShip();
      scene.add(blackShip);
      console.log("⚠️ UNKNOWN HOSTILE VESSEL DETECTED!");
    }, 2000);
  }

  if (royalYacht) {
    const yachtSpeed = toRender(800);
    royalYacht.position.x += yachtSpeed * dt;
    royalYacht.rotation.y += dt * 0.5;
  }
  
  if (blackShip) {
    const chaseSpeed = toRender(850);
    blackShip.position.x += chaseSpeed * dt;
    blackShip.rotation.y += dt * 0.3;
  }

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

  const distToStation = toKm(ship.position.distanceTo(vigilantRelay.position));
  
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
  drawShipMarkers();

  renderer.render(scene, camera);
}

const radarCanvas = document.getElementById("radar-canvas") as HTMLCanvasElement | null;
const radarCtx = radarCanvas?.getContext("2d") || null;
const radarRadius = 85;
const radarRange = 50000;

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
    { name: "Vigilant Relay", ref: vigilantRelay, color: "#ff6600", label: "STA" },
    { name: "Galileo Outpost", ref: galileoOutpost, color: "#ff8800", label: "STA" }
  ];
  
  if (royalYacht) {
    objectsToDraw.push({ name: "Royal Yacht", ref: royalYacht, color: "#4488ff", label: "RYL" });
  }
  if (blackShip) {
    objectsToDraw.push({ name: "Unknown", ref: blackShip, color: "#ff0000", label: "HST" });
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
    const x = 90 + (rightDist * radarScale * 100);
    const y = 90 - (forwardDist * radarScale * 100);
    
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
  radarCtx.fillText(`${radarRange}km`, 5, 175);
  
  const sweepAngle = (clock.elapsedTime * 2) % (Math.PI * 2);
  radarCtx.strokeStyle = "rgba(0, 255, 136, 0.3)";
  radarCtx.lineWidth = 1;
  radarCtx.beginPath();
  radarCtx.moveTo(90, 90);
  radarCtx.lineTo(90 + Math.cos(sweepAngle) * radarRadius, 90 + Math.sin(sweepAngle) * radarRadius);
  radarCtx.stroke();
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
        ctx.fillText('ROYAL YACHT', x + 55, y - 10);
        ctx.font = '12px Share Tech Mono, monospace';
        ctx.fillText(`${dist.toFixed(1)}km`, x + 55, y + 8);
        ctx.fillText('EMERGENCY', x + 55, y + 22);
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
        ctx.fillText('UNKNOWN HOSTILE', x + 50, y - 10);
        ctx.font = '12px Share Tech Mono, monospace';
        ctx.fillText(`${dist.toFixed(1)}km`, x + 50, y + 8);
      }
    }
  }
  
  [
    { station: vigilantRelay, name: "VIGILANT RELAY", color: '#ff6600' },
    { station: galileoOutpost, name: "GALILEO OUTPOST", color: '#ff8800' }
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
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
