# Project state

- Phase 1 complete. The 14 input CSVs were verified and 13 supplemental NASA Horizons requests retained. The build carries 27 binary datasets with 194,707 records.
- Phase 2 complete. The second website revision gives the light-day milestone a prominent opening, adds direct journey and Jupiter entrances, and uses paired hourly ephemerides for a close-up. Chromium WebGL loaded the official GLB and passed camera rotation, probe switching, timeline, play/pause, event navigation, Journey, scale and 390 px mobile layout checks. Desktop and mobile evidence are in the delivery folder.
- Phase 3 complete. Rendered and fully decoded a silent 90-second H.264 MP4 at 1920×1080, 30 fps, 2,700 frames. The bilingual SRT has ten cues. Ten scenes were visually inspected from extracted frames. One 3840×2160 frame was rendered to verify the 4K option.
- Phase 4 complete. The original delivery is archived under `deliverables/` in the NASA-Voyager repository. Actions builds the interactive website for GitHub Pages. Branch publishing serves source HTML and can race with Actions. Select GitHub Actions as the Pages source for a durable production build.

Resume with `npm ci && npm test && npm run build`, followed by `node scripts/web-test.mjs`. The same visitor checks can run against the public Pages URL using the `VOYAGER_TEST_URL` environment variable. Regenerate data and video using README commands.
