# Technical decisions

- Keep a static Vite build with Three.js, OrbitControls, GLTFLoader and browser-native UI. The small codebase needs no app state framework. The relative Vite base works under a GitHub Pages repository path.
- Use the supplied archive as the spacecraft baseline. Supplemental Horizons queries obtain the eight planets, V2 early coverage, and hourly Earth and probe positions through 2026-11-19 TDB. Query and response digests accompany the packed files. Supplemental original responses are gzipped in the raw evidence bundle.
- Keep positions and velocity components as little-endian Float64 km and km/s with JD TDB. Apply a right-handed axis rotation and AU conversion only in the scene. The Three.js scene receives [ecliptic X, ecliptic Z, −ecliptic Y].
- Interpolate linearly between bracketing epochs. Prefer hours for events and the recent window. Do not interpolate across the first available epoch. TDB to UTC uses the IERS leap history through 2017 plus the small periodic TT/TDB term. Web display is at day resolution.
- Compute Earth distance directly from same-epoch heliocentric positions. Use available hourly Earth samples through the one light-day threshold. Divide the geometric range by the defined speed of light for the displayed delay.
- Keep display cosmetics distinct from science. The presentation scale enlarges bodies and probes. Scientific scale uses body radii in AU and probe marker glyphs. Orbit rings are circular guides, the heliopause is an illustrative 120-AU sphere and model orientation is artistic.
- Generate film frames with the exact deployed web scene and shared shot definitions. A Chromium runner supplies deterministic `frame / fps` time and FFmpeg streams silent H.264. This avoids maintaining a second Three.js scene.
