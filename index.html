<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>The Black Ship — Vigilia System</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      html, body {
        height: 100%;
        overflow: hidden;
        background: #000;
        font-family: 'Share Tech Mono', monospace;
      }
      
      canvas {
        display: block;
        outline: none;
      }
      
      canvas:focus {
        outline: 2px solid rgba(0, 255, 136, 0.3);
      }
      
      /* Scanline effect overlay */
      #scanlines {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        background: linear-gradient(
          transparent 50%,
          rgba(0, 255, 136, 0.02) 50%
        );
        background-size: 100% 4px;
        z-index: 1;
        opacity: 0.3;
        animation: scanline 8s linear infinite;
      }
      
      @keyframes scanline {
        0% { transform: translateY(0); }
        100% { transform: translateY(4px); }
      }
      
      /* CRT vignette */
      #vignette {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        background: radial-gradient(
          circle at center,
          transparent 0%,
          transparent 60%,
          rgba(0, 0, 0, 0.3) 100%
        );
        z-index: 1;
      }
      
      /* Main HUD container */
      #hud {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
        color: #00ff88;
        text-shadow: 0 0 8px rgba(0, 255, 136, 0.7);
      }
      
      /* Top left status panel */
      #status-panel {
        position: absolute;
        left: 20px;
        top: 20px;
        border: 2px solid #00ff88;
        background: rgba(0, 0, 0, 0.8);
        padding: 12px 16px;
        box-shadow: 
          0 0 20px rgba(0, 255, 136, 0.3),
          inset 0 0 20px rgba(0, 255, 136, 0.05);
        animation: flicker 3s infinite;
      }
      
      @keyframes flicker {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.97; }
      }
      
      #status-panel .title {
        font-family: 'Orbitron', sans-serif;
        font-weight: 900;
        font-size: 16px;
        letter-spacing: 2px;
        margin-bottom: 8px;
        color: #00ff88;
        text-transform: uppercase;
      }
      
      #status-panel .data {
        font-size: 13px;
        line-height: 1.6;
        color: #88ffcc;
      }
      
      #status-panel .warning {
        color: #ffaa00;
        text-shadow: 0 0 8px rgba(255, 170, 0, 0.7);
      }
      
      /* Top right instruments */
      #instruments {
        position: absolute;
        right: 20px;
        top: 20px;
        display: flex;
        gap: 16px;
      }
      
      .instrument {
        border: 2px solid #00ff88;
        background: rgba(0, 0, 0, 0.8);
        padding: 12px;
        min-width: 120px;
        text-align: center;
        box-shadow: 
          0 0 20px rgba(0, 255, 136, 0.3),
          inset 0 0 20px rgba(0, 255, 136, 0.05);
      }
      
      .instrument-label {
        font-size: 10px;
        opacity: 0.7;
        margin-bottom: 4px;
        letter-spacing: 1px;
      }
      
      .instrument-value {
        font-family: 'Orbitron', sans-serif;
        font-size: 24px;
        font-weight: 700;
        line-height: 1;
      }
      
      .instrument-unit {
        font-size: 11px;
        opacity: 0.8;
        margin-top: 2px;
      }
      
      /* Bottom center crosshair */
      #crosshair {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
      }
      
      #crosshair::before,
      #crosshair::after {
        content: '';
        position: absolute;
        background: #00ff88;
        box-shadow: 0 0 6px rgba(0, 255, 136, 0.8);
      }
      
      #crosshair::before {
        left: 50%;
        top: 0;
        width: 2px;
        height: 100%;
        transform: translateX(-50%);
      }
      
      #crosshair::after {
        left: 0;
        top: 50%;
        width: 100%;
        height: 2px;
        transform: translateY(-50%);
      }
      
      .crosshair-corner {
        position: absolute;
        width: 15px;
        height: 15px;
        border: 2px solid #00ff88;
        box-shadow: 0 0 6px rgba(0, 255, 136, 0.8);
      }
      
      .crosshair-corner:nth-child(1) {
        top: 0;
        left: 0;
        border-right: none;
        border-bottom: none;
      }
      
      .crosshair-corner:nth-child(2) {
        top: 0;
        right: 0;
        border-left: none;
        border-bottom: none;
      }
      
      .crosshair-corner:nth-child(3) {
        bottom: 0;
        left: 0;
        border-right: none;
        border-top: none;
      }
      
      .crosshair-corner:nth-child(4) {
        bottom: 0;
        right: 0;
        border-left: none;
        border-top: none;
      }
      
      /* Bottom HUD bar */
      #bottom-bar {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 30px;
        align-items: flex-end;
      }
      
      .bar-section {
        text-align: center;
      }
      
      .bar-label {
        font-size: 10px;
        opacity: 0.7;
        margin-bottom: 4px;
        letter-spacing: 1px;
      }
      
      .bar-container {
        width: 140px;
        height: 20px;
        border: 2px solid #00ff88;
        background: rgba(0, 0, 0, 0.8);
        position: relative;
        overflow: hidden;
      }
      
      .bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #00ff88, #00cc66);
        box-shadow: 0 0 10px rgba(0, 255, 136, 0.6);
        transition: width 0.2s ease-out;
      }
      
      .bar-fill.boost {
        background: linear-gradient(90deg, #ffaa00, #ff6600);
        box-shadow: 0 0 10px rgba(255, 170, 0, 0.6);
        animation: pulse 0.3s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      /* Controls hint */
      #controls {
        position: absolute;
        bottom: 20px;
        left: 20px;
        font-size: 11px;
        opacity: 0.6;
        line-height: 1.8;
        max-width: 300px;
        background: rgba(0, 0, 0, 0.6);
        padding: 10px;
        border: 1px solid rgba(0, 255, 136, 0.3);
      }
      
      #controls .key {
        display: inline-block;
        background: rgba(0, 255, 136, 0.2);
        padding: 2px 6px;
        border-radius: 3px;
        font-weight: 700;
        margin: 0 2px;
      }
      
      /* Target info */
      #target-info {
        position: absolute;
        right: 20px;
        bottom: 20px;
        border: 2px solid #00ff88;
        background: rgba(0, 0, 0, 0.8);
        padding: 12px;
        min-width: 200px;
        box-shadow: 
          0 0 20px rgba(0, 255, 136, 0.3),
          inset 0 0 20px rgba(0, 255, 136, 0.05);
      }
      
      #target-info .target-name {
        font-family: 'Orbitron', sans-serif;
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 6px;
        color: #ffaa00;
        text-shadow: 0 0 8px rgba(255, 170, 0, 0.7);
      }
      
      #target-info .target-data {
        font-size: 12px;
        line-height: 1.6;
        color: #88ffcc;
      }
      
      /* Click to start message */
      #start-message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Orbitron', sans-serif;
        font-size: 24px;
        font-weight: 700;
        color: #00ff88;
        text-shadow: 0 0 20px rgba(0, 255, 136, 0.8);
        text-align: center;
        pointer-events: none;
        animation: pulse-message 2s ease-in-out infinite;
        z-index: 100;
      }
      
      @keyframes pulse-message {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
      
      #start-message.hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div id="scanlines"></div>
    <div id="vignette"></div>
    
    <!-- Click to start message -->
    <div id="start-message">
      CLICK TO START<br>
      <span style="font-size: 16px; font-weight: 400;">Then use W/S/Arrows/Q/E</span>
    </div>
    
    <div id="hud">
      <!-- Top left status -->
      <div id="status-panel">
        <div class="title">Vigilia System</div>
        <div class="data">
          <div>House Emerald Territory</div>
          <div class="warning">⚠ Border Zone Active</div>
          <div style="margin-top: 8px;">Transponder: <span style="color: #ff4444;">BLACK</span></div>
          <div>Permit: "Relief Courier"</div>
        </div>
      </div>
      
      <!-- Top right instruments -->
      <div id="instruments">
        <div class="instrument">
          <div class="instrument-label">SPEED</div>
          <div class="instrument-value" id="speed-value">0</div>
          <div class="instrument-unit">m/s</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">THROTTLE</div>
          <div class="instrument-value" id="throttle-value">20</div>
          <div class="instrument-unit">%</div>
        </div>
      </div>
      
      <!-- Center crosshair -->
      <div id="crosshair">
        <div class="crosshair-corner"></div>
        <div class="crosshair-corner"></div>
        <div class="crosshair-corner"></div>
        <div class="crosshair-corner"></div>
      </div>
      
      <!-- Bottom bar with speed/throttle -->
      <div id="bottom-bar">
        <div class="bar-section">
          <div class="bar-label">VELOCITY</div>
          <div class="bar-container">
            <div class="bar-fill" id="speed-bar"></div>
          </div>
        </div>
        <div class="bar-section">
          <div class="bar-label">POWER</div>
          <div class="bar-container">
            <div class="bar-fill" id="throttle-bar"></div>
          </div>
        </div>
      </div>
      
      <!-- Controls -->
      <div id="controls">
        <span class="key">W</span>/<span class="key">S</span> Throttle
        <span class="key">↑</span>/<span class="key">↓</span> Pitch
        <span class="key">←</span>/<span class="key">→</span> Yaw<br>
        <span class="key">Q</span>/<span class="key">E</span> Roll
        <span class="key">Space</span> Brake
        <span class="key">Shift</span> Boost
      </div>
      
      <!-- Target info -->
      <div id="target-info">
        <div class="target-name" id="target-name">VIGILANT RELAY</div>
        <div class="target-data">
          <div>Distance: <span id="target-dist">0</span>m</div>
          <div>Type: Orbital Station</div>
          <div style="margin-top: 4px; color: #00ff88;">⬤ Docking Available</div>
        </div>
      </div>
    </div>
    
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
