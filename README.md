# 🌬️ WindSim — Aerodynamic Simulation Lab

A real-time, physics-accurate wind simulation built entirely with vanilla HTML/CSS/JavaScript — no frameworks, no backend, no cost to host.

**Live Demo:** `https://<your-username>.github.io/windsim`

---

## What It Does

WindSim lets you simulate how wind interacts with everyday objects using real aerodynamic physics. You can control wind speed, direction, and turbulence, then watch how different objects respond — and download the telemetry data as a CSV.

**Physics model:**
- **Aerodynamic drag:** `F = ½ρCdAv²` — the real equation used in fluid mechanics
- **Gravity:** `F = mg` (9.81 m/s²)
- **Turbulence:** Stochastic wind variation modelled per-frame
- **Bounce:** Coefficient of restitution on ground collision
- **Air density:** 1.225 kg/m³ (sea level, 15°C)

---

## Objects

| Object | Mass | Drag Coeff (Cd) | Frontal Area |
|--------|------|-----------------|--------------|
| Autumn Leaf | 3 g | 1.80 | 30 cm² |
| Feather | 1 g | 2.00 | 20 cm² |
| Tennis Ball | 58 g | 0.47 | 34.6 cm² |
| Paper Ball | 5 g | 1.20 | 40 cm² |
| Umbrella | 500 g | 1.80 | 2800 cm² |
| Soccer Ball | 430 g | 0.25 | 380 cm² |

---

## Controls

| Control | What it does |
|---------|-------------|
| Wind Speed | 0–60 m/s with Beaufort scale label |
| Direction | -75° (upward) to +75° (downward) |
| Turbulence | Random wind fluctuation intensity |
| Object Select | Switch physics body mid-simulation |
| Gravity toggle | Enable/disable gravitational acceleration |
| Force Vectors | Show drag, gravity, and velocity arrows |
| Export CSV | Download full telemetry at 20 Hz |

**Keyboard shortcuts:** `Space` = pause/resume · `R` = reset object

---

## Telemetry CSV Format

The exported CSV records at 20 Hz and includes:

```
time_s, object, x_m, height_m, velocity_x_ms, velocity_y_ms, speed_ms,
drag_force_N, net_force_N, acceleration_ms2,
wind_speed_ms, wind_dir_deg, turbulence_pct, eff_wind_ms
```

---

## Deploying to GitHub Pages (free hosting)

```bash
# 1. Create a new repo on github.com named "windsim"

# 2. Clone it locally
git clone https://github.com/<your-username>/windsim.git
cd windsim

# 3. Copy index.html into the folder, then push
git add index.html README.md
git commit -m "feat: initial WindSim release"
git push origin main

# 4. Go to repo Settings → Pages → Source: Deploy from main branch /root
# Your site will be live at https://<your-username>.github.io/windsim
```

That's it. No build step, no dependencies, no server.

---

## Tech Stack

- **Vanilla JavaScript** — Canvas 2D API for rendering
- **Physics:** Custom Euler integrator, real SI units throughout
- **Fonts:** Rajdhani + JetBrains Mono (Google Fonts)
- **Hosting:** GitHub Pages (free)
- **Zero dependencies**

---

## License

MIT — use it however you want.
