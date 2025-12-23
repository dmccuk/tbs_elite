# 🚀 The Black Ship - Vigilia System

An Elite 1984-inspired space flight simulator built with Three.js and TypeScript. Fly through the Vigilia system, a border territory under House Emerald control where "relief couriers" navigate dangerous trade routes.

![Elite-style space flight game](https://img.shields.io/badge/Genre-Space%20Sim-blue)
![Built with Three.js](https://img.shields.io/badge/Built%20with-Three.js-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)

## 🎮 Features

- **Classic Elite-style Flight Model** - Newtonian physics with yaw, pitch, roll, throttle control
- **Retro-Futuristic HUD** - CRT scanlines, monospace fonts, and glowing green displays
- **3D Solar System** - Orbiting planet, rotating space station, and dynamic sun
- **Advanced Graphics** - Custom shaders for atmospheric effects, engine particles, dynamic lighting
- **GitHub Pages Ready** - Deploy and play in your browser instantly

## 🕹️ Controls

| Key | Action |
|-----|--------|
| **W / S** | Increase / Decrease Throttle |
| **Arrow Up / Down** | Pitch Up / Down |
| **Arrow Left / Right** | Yaw Left / Right |
| **Q / E** | Roll Left / Right |
| **Space** | Brake |
| **Shift** | Boost |

## 🚀 Quick Start

### Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/black-ship-vigilia.git
cd black-ship-vigilia

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## 🌐 Deploy to GitHub Pages

1. **Create a new GitHub repository** named `black-ship-vigilia`

2. **Update `vite.config.ts`** with your repo name:
   ```typescript
   const repoName = "black-ship-vigilia"; // Change to your repo name
   ```

3. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Source: **GitHub Actions**

4. **Push your code**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/black-ship-vigilia.git
   git push -u origin main
   ```

5. **Wait for deployment** - The GitHub Action will automatically build and deploy
   - Your game will be live at: `https://YOUR_USERNAME.github.io/black-ship-vigilia/`

## 🌌 Lore: The Vigilia System

### System Overview
**Vigilia System** is a border territory controlled by House Emerald, serving as a "neutral" relief corridor between major trade routes. The system is known for its "flexible" inspection policies and convenient documentation procedures.

### Key Locations

**Vigilia Prime** (The Blue Planet)
- Habitable world with extensive ocean coverage
- Population: ~2.3 million (mostly mining and logistics)
- Known for lax customs enforcement

**Vigilant Relay** (Orbital Station)
- Ring-type station with rotating habitat sections
- Primary function: "Relief cargo" processing
- Secondary function: Everything else
- Notable feature: Green docking lights that are "always operational"

### Current Situation
The Vigilia system sits on the border between House Emerald territory and contested space. Official records show it as a humanitarian relief hub. Unofficial records would show considerably more interesting cargo manifests.

As a "relief courier" with a BLACK transponder and temporary permit, you're exactly the kind of pilot who keeps Vigilia's economy running.

## 🛠️ Technical Details

### Built With
- **Three.js** - 3D graphics engine
- **TypeScript** - Type-safe JavaScript
- **Vite** - Lightning-fast build tool

### Performance
- 60 FPS on modern browsers
- WebGL with hardware acceleration
- Optimized particle systems
- Shadow mapping for realistic lighting

### Code Structure
```
src/
├── main.ts          # Main game loop, physics, rendering
index.html           # Game UI and HUD elements
vite.config.ts       # Build configuration
```

## 🎯 Roadmap

### Phase 1: Core Flight (Current)
- ✅ Basic flight model
- ✅ Ship controls
- ✅ HUD display
- ✅ Simple solar system

### Phase 2: Elite Features (Next)
- [ ] Target selection system
- [ ] Scanner/radar display
- [ ] Docking mechanics
- [ ] Hyperspace jump animation

### Phase 3: Gameplay
- [ ] Multiple star systems
- [ ] Trading system
- [ ] Mission framework
- [ ] Combat basics

### Phase 4: Universe
- [ ] Procedural systems
- [ ] Economy simulation
- [ ] Faction reputation
- [ ] Ship upgrades

## 🤝 Contributing

This is a learning project inspired by Elite (1984). Feel free to fork and experiment!

## 📜 License

MIT License - Feel free to use this code for your own space adventures

## 🙏 Acknowledgments

- **Elite (1984)** by David Braben and Ian Bell - The original space trading game
- **Three.js** community for amazing 3D web graphics
- **House Emerald** for their "flexible" border policies

---

*"In space, no one can hear you smuggle."*
