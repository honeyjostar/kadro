<p align="center">
  <img src="docs/brand/banner.png" alt="Kadro — a free video editor with AI" width="100%">
</p>

<p align="center">
  <a href="https://github.com/honeyjostar/kadro/releases/latest"><img src="https://img.shields.io/github/v/release/honeyjostar/kadro?label=version&color=ff3d7f" alt="Version"></a>
  <a href="https://github.com/honeyjostar/kadro/releases"><img src="https://img.shields.io/github/downloads/honeyjostar/kadro/total?label=downloads&color=15131a" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-15131a" alt="Windows 10 and 11">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-15131a" alt="GPL-3.0 license"></a>
</p>

<h1 align="center">Kadro</h1>

<p align="center"><b>A free video editor for Windows with AI features that run right on your computer.</b><br>
Editing for TikTok, Reels, Shorts and YouTube: Auto Video to the beat, Script to Video, 181 transitions, 54 effects, 47 filters, shader plugins,
animated text, 3D objects, perspective, auto captions and offline caption translation, background removal, clean voice, 19 templates.
Export up to 4K with no watermark, no subscription and no sign-up.</p>

<p align="center"><b><a href="https://github.com/honeyjostar/kadro/releases/latest">⬇ Download Kadro for Windows</a></b> — the installer is <code>Kadro-Setup-X.Y.Z.exe</code> under <b>Assets</b>.<br>
<a href="README.md">Русский</a> · <a href="docs/BUILD.md">Building from source</a> (in Russian)</p>

> [!IMPORTANT]
> The app is the installer on the Releases page. The green **Code → Download ZIP** button gets the source code for developers —
> there is no app in it.

The interface is available in **English and Russian**: Kadro picks the language of your Windows on first run, and you can switch it any time
in **Settings → Language**. The detailed guide ([docs/GUIDE.md](docs/GUIDE.md)) and plugin docs are in Russian for now; this page covers the essentials.

## Everything runs on your computer

Kadro is a regular desktop app, not a website. Your videos are never uploaded anywhere: editing, export and all AI tools run on your
CPU and graphics card. The internet is needed only once — to download a speech recognition model, a voice or a translation model the first
time you use it, and to check for updates (you can turn that off).

## What it can do

**Auto Video and Script to Video**
- Choose videos, photos and music — Kadro finds the best parts (sharp, bright, steady, with motion, no repeats) and cuts them exactly to the beat; 10 styles including **Velocity**, Beat flash, 3D zoom and Text on the beat; shorter shots where the music is loud, a cut right on the **drop**, “Another take”.
- **Repeat an edit from a video** (like CapCut templates): pick a video you like — Kadro finds its cuts, flashes and zooms, takes its music and puts your footage into the same slots.
- Paste a script — Kadro splits it into scenes, voices them (6 offline voices), picks shots from your footage and adds captions that match the text.

**Editing**
- Magnetic main track, overlays (picture in picture), text, music — as many tracks as you need; split, trim, reorder, multi-select.
- **Markers** (key M) with names and colors; they become YouTube chapters and chapters inside the exported MP4.
- Frame formats 9:16, 16:9, 1:1, 4:5, 3:4, 4:3, 21:9; resolution 720p–4K, 24–60 fps; opens almost any video, photo and audio file.
- **Collect project into a folder** with media, fonts and plugins — on another computer everything is found and installed by itself; **shortcuts window** (F1).
- Groups, keyframes, masks, chroma key with an **eraser and restore brush**, blend modes, perspective tilt and corner pinning, 3D objects (GLB, GLTF, OBJ, STL, FBX).
- Speed 0.25×–4× with pitch kept, speed curves, smooth slow motion with generated frames, reverse, freeze frame.

**Transitions, effects, color**
- 181 transitions, including 123 shaders from [gl-transitions](https://gl-transitions.com); 54 effects; 47 filters; curves, HSL, your own LUTs.
- **Plugin catalog** with live previews and one-click install; your own GLSL transitions and effects — drop a `.glsl` file into the window.

**Text, captions, sound, AI**
- 122 fonts plus **your own fonts** (drop `.ttf` / `.otf` into the window) and all Windows fonts; 13 text animations, karaoke word highlight.
- **Preview a track** before putting it on the timeline.
- Auto captions (Russian, English and 23 more languages), **offline caption translation** (Russian ⇄ English built in; to English, Russian, Ukrainian, German, Spanish,
  French, Italian, Chinese, Arabic — others via English), replacing the original or as two lines.
- Background removal without a green screen, clean voice, remove pauses, stabilization, auto reframe, face retouch, text-to-speech.
- Voice recording, voice effects, beat detection and snapping cuts to the beat.

**Publishing**
- Safe zones for TikTok, Reels and Shorts in the player and a pre-publish check.
- MP4 (H.264) export, NVIDIA NVENC acceleration; autosaved drafts, `.kadro` projects.
- **Auto-update** and **Report a bug** (a ready GitHub issue with version and log — you see everything before sending).

## System requirements

- Windows 10 or 11, 64-bit
- 8 GB RAM (16 GB is better for 4K and background removal)
- About 1 GB of disk space plus optional AI models (speech recognition up to 0.5 GB, translation ~165 MB per direction)
- A graphics card is optional; NVIDIA speeds up export

## Install

1. Download `Kadro-Setup-X.Y.Z.exe` from [Releases](https://github.com/honeyjostar/kadro/releases/latest).
2. Run it. If Windows shows “Windows protected your PC”, click **More info → Run anyway** (the installer has no paid code signature).
3. Kadro installs into `%LOCALAPPDATA%\Programs\Kadro` (no administrator rights needed) and adds shortcuts to the desktop and the Start menu.

The portable version is the `Kadro-X.Y.Z-portable.zip` file: unpack it anywhere and run `Kadro.exe`. The installed version updates itself.

## Quick start

1. Drop videos and photos into the window (or **Add files**).
2. Split with **S**, delete with **Delete**, drag clips to reorder.
3. On the left — text, captions, effects, transitions, filters, AI, templates, 3D. On the right — settings of the selected clip.
4. **Export** (Ctrl+E) — choose the quality and the folder.

| Key | Action |
|---|---|
| Space | play / pause |
| S or Ctrl+B | split at playhead |
| Delete | delete selected |
| Ctrl+D | duplicate clip |
| Ctrl / Shift + click, Ctrl+A | select several clips / all |
| Ctrl+Z / Ctrl+Y | undo / redo |
| Ctrl+G / Ctrl+Shift+G | group / ungroup |
| Ctrl+Shift+C / Ctrl+Shift+V | copy / paste clip settings |
| ← → | by frame (with Shift — by second) |
| Home / End | to the start / end |
| M | marker at playhead |
| Shift+M / Ctrl+Shift+M | next / previous marker |
| Ctrl+wheel, + / − | timeline zoom |
| Ctrl+S / Ctrl+E | save project / export |

## Contributing

Found a bug or have an idea — **Settings → Help → Report a bug** in Kadro, or open an [issue](https://github.com/honeyjostar/kadro/issues).
Made a transition or effect? Send it to the [plugin catalog](community-plugins). Translations of the interface live in
[`src/shared/i18n/en.json`](src/shared/i18n/en.json) — improvements are welcome.

## License

Kadro is free software under the **GNU GPL v3 or later** ([LICENSE](LICENSE)). Third-party components and models — [THIRD_PARTY.md](THIRD_PARTY.md).
