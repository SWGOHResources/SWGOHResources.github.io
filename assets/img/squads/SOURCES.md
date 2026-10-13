# Squad planner game assets

UI sprites are original named NGUI atlas exports; Unity rectangles, slice borders and mirror flags are retained in ../atlases/index.json. The compact squad row follows inventoryui_squadslatbase and inventoryui_squadtile: SquadListItemFrame, 1010×206 reference bounds, 20–24 px reference labels and 28 px upgrade badges.

Original fonts were extracted from shared_resourcecontainer: TradeGothicLTCom-BdCn20 and FuturaCom-Bold. They are served locally from assets/fonts.

The expanded character cards render actual Unity character meshes and textures in WebGL. AssetStudioMod exports the rigged FBX; FBX2glTF converts it to GLB. Source bundle names, asset version, sizes and SHA-256 hashes are recorded in assets/data/game-models.json. Model surfaces use opaque albedo and ignore vertex-color effect masks, matching the role of these channels in the game's custom shaders. The web lighting is an approximation of the game renderer.

The unmodified Zeta PNG from https://game-assets.swgoh.gg/textures/tex.skill_zeta.png is embedded in zeta.svg.

Zeta counts and planned GP use swgoh-utils/gamedata revision 8d86d7002e8cab5839f04540d93ac303db078517. GP assumes level 85, gear XIII, six level-15 6E mods, max base skills, the selected relic/stars/Omicrons and an unlocked Galactic Legend ultimate. It does not represent a player's roster. Power values and the ×1.5 floor formula were checked against swgoh-utils/swgoh-stat-calc.

Game models, textures, UI art and fonts belong to their respective owners.

The squad backdrop is the unmodified decoded `light_bg` Texture2D (the cantina variant, 256 × 128) from the installed Unity 6000.3.17f1 client’s `SWGoH_Data/resources.assets`. It is the actual blurred cantina/holotable image, not a video crop or recreated illustration. Native IL2CPP metadata version 39 was read with Cpp2IL pre-release.21; recovered UI root settings use 1280 × 720, fit-height/auto-detect scaling and a widescreen threshold of 1.7. `inventoryui_squadtile` specifies a 0.498 opacity for the squad-row frame.
