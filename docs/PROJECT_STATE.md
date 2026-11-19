# Project state

- Phase 1 complete. The 14 input CSVs were verified and 12 supplemental NASA Horizons requests retained. The build carries 26 binary datasets with 194,562 records.
- Phase 2 complete locally. Chromium WebGL loaded the official GLB and passed camera rotation, probe switching, timeline, play/pause, event navigation, Journey, scale and 390 px mobile layout checks. Desktop and mobile evidence are in the delivery folder.
- Phase 3 complete. Rendered and fully decoded a silent 90-second H.264 MP4 at 1920×1080, 30 fps, 2,700 frames. The bilingual SRT has ten cues. Ten scenes were visually inspected from extracted frames. One 3840×2160 frame was rendered to verify the 4K option.
- Phase 4 source, test, data, static build and Pages workflow complete. GitHub creation returned HTTP 403 from the current integration. The GitHub account browser session also requires login. The independent project is committed locally and ready to push to an authorized repository. There is no verified public Pages URL.

Resume with `npm ci && npm test && npm run build`, then `node scripts/web-test.mjs`. Regenerate data and video using README commands. Once a writable repository is supplied, use the workflow on main and verify the resulting Pages URL and assets.
