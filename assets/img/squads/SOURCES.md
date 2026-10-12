# Squad planner artwork

Portraits use the existing generated portrait atlas. UI sprites use the original named exports in ../atlases; their Unity rectangles, mirror metadata and checksums are recorded in ../atlases/index.json.

zeta.svg embeds the unmodified PNG from https://game-assets.swgoh.gg/textures/tex.skill_zeta.png in an SVG image wrapper. The wrapper allows the original raster bytes to be checked in through text-only file tooling; it does not redraw the artwork.

The initial assets/data/squad-zetas.json counts come from units.json.br and skill.json at swgoh-utils/gamedata revision 8d86d7002e8cab5839f04540d93ac303db078517, matching squad-planner.json. Future data builds include zetaCount in each character; the sidecar supplies counts for the existing snapshot. Counts represent maximum-tier Zetas, not an imported player roster.

The UI uses Barlow Condensed as a web font substitute; an original game font is not included.
