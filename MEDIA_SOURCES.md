# Homepage animated previews

These previews are derived from the authors' original project demonstrations. They are encoded as muted H.264 MP4 loops with JPEG posters for browser compatibility and reduced-motion display.

## SkeletonLLM

- Source gallery: https://wangzy01.github.io/SkeletonLLM/
- Source animation: `SkeletonLLM/assets/gifs/000024.gif` (Handstand).
- One uninterrupted animation shows the person standing, bending to place their hands on the floor, performing a handstand, and returning to standing. The original speed and complete 6.5-second sequence are preserved; no other clip is composited or concatenated.
- Black margins are cropped to a 320 × 320 square at (36, 60), preserving the motion extent across all frames. The preview runs at 20 fps, and its poster is extracted at 3 seconds.
- Output: `images/skeletonllm-preview.mp4` and `images/skeletonllm-preview.jpg`.

## MP1

- Source section: [Robustness to Clutter and Lighting](https://mp1-2254.github.io/).
- Top / Clutter 1: https://mp1-2254.github.io/assets/video/add/1.mp4
- Bottom / Lighting: https://mp1-2254.github.io/assets/video/add/4.mp4
- The demonstrations play at their original speed, stacked vertically. The bottom 80 pixels of each 1280 × 720 source are cropped to remove the table edge. The composite is 320 × 320 pixels, 15 fps, and approximately 38.13 seconds long; the shorter clutter sequence loops. Audio is removed.
- Output: `images/mp1-preview.mp4` and `images/mp1-preview.jpg`.

## PePNet publication preview (2026-10-29)

- `images/pepnet-figure1.png`: Figure 1 from the user-provided accepted manuscript `tip-ieee.pdf`, page 2. Both application panels and their labels are retained; the caption and adjacent Figure 2 are excluded.
- Paper: https://ieeexplore.ieee.org/abstract/document/11623406/
- Public manuscript record: https://research.lancaster-university.uk/en/publications/pepnet-pose-enhanced-point-cloud-network-for-lidar-based-human-ac/
- Rendered directly from the PDF at 3200px page height, with the figure region x=200, y=348, width=952, height=444. No generated or redrawn content.

## Profile photograph (2026-10-29)

- `images/wzy-harbour.jpg`: user-provided IMG_2852.JPG, web-optimized to 1800 × 1200 JPEG. Original retained outside the published site. EXIF/XMP, IPTC and comment metadata removed; ICC color profile retained.
- Circular display framing is CSS-only: full photo-column width (original A option size, restored 2026-10-30), with the source image at width 227%, left -4%, top -35%. No generated or retouched content.
