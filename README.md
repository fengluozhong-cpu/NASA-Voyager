# NASA-Voyager

**Voyager — 49 Years Into the Unknown**

旅行者：飞向未知的 49 年。Explore NASA/JPL trajectories for both Voyagers in a shared interactive atlas and documentary-style film.

## 完整交付资料

[完整清单](deliverables/README.md) · [源码备份](deliverables/01-source/voyager-explorer-source.zip) · [静态网站构建](deliverables/02-website/voyager-explorer-static.zip) · [原始轨迹数据](deliverables/03-data/voyager_horizons_data.zip) · [90 秒视频](deliverables/04-video/voyager-49-years.mp4) · [科学验证报告](docs/VALIDATION.md)

以上归档对应首发版本。新版首屏、木星飞掠和补采星历见当前分支。[打开网站](https://fengluozhong-cpu.github.io/NASA-Voyager/)

## Run

Node 22+ and npm. The checked-in vector cache, NASA GLB and archive images make a NASA API connection optional at runtime.

```sh
npm ci
npm test
npm run dev
npm run build
```

Explore has an epoch slider, rate control, orbit camera, two probes with independent visibility and tracking, and Sun/Earth range, light time and velocity. Journey follows ten events with archival imagery and scripted cameras. The site includes source and scale disclosures.

## Data

```sh
python scripts/prepare.py --archive /path/to/voyager_horizons_data.zip
python -m pip install -r scripts/requirements.txt
python scripts/fetch_horizons.py --out data/raw/updated
```

`prepare.py` verifies the input checksums, fetches matching Horizons planetary vectors, adds short launch and recent extensions, retains server JSON under `data/raw/responses`, and rebuilds the binary manifest. Reuse raw responses by preserving that directory. To refresh the original archive, include the newly collected `data/` directory at the root of a ZIP and pass it to `prepare.py`. The workflow pins the historical cutoff to the project release. More recent dates require updating the cutoff in the Python and JavaScript sources. The archive includes separate 2050 model predictions. The atlas displays the 1977–2026 mission range.

## Video

Install Chromium, FFmpeg with H.264, and a CJK font such as Noto Sans CJK. The optional `CHROMIUM` variable sets the Chromium executable. Output includes a silent MP4 with built-in bilingual titles and a generated SRT.

```sh
npm run build
npm run video -- --width 1920 --height 1080 --fps 30 --out artifacts/voyager.mp4
npm run video -- --width 3840 --height 2160 --fps 30 --out artifacts/voyager-4k.mp4
npm run video -- --start 12 --duration 8 --width 1280 --height 720 --out artifacts/jupiter.mp4
```

`src/timeline.js` defines the 90-second storyboard. `src/scene.js` is used by both the interactive atlas and the film. Running `node scripts/web-test.mjs` after building runs desktop and mobile Chromium and writes evidence screenshots.

## Deployment

GitHub Pages workflow is in `.github/workflows/pages.yml`. Select **GitHub Actions** as the Pages source for the repository. Pushing main runs tests, builds and uploads the site. To serve without Actions, publish the contents of `dist/` directly in a static host or on a Pages branch.

[Validation](docs/VALIDATION.md) · [Decisions](docs/DECISIONS.md) · [Asset credits](docs/ASSET_SOURCES.md) · [Project status](docs/PROJECT_STATE.md)
