# Game reconstruction findings

The squad planner uses extracted original assets, not generated character images.
No player roster API or account backend is part of this work. GP is calculated
from the cached game tables and the planner's uniform upgrade assumptions.

## Sources and reproducible model pipeline

- Client asset version: `100052`, Windows/ETC bundles on the game's public CDN.
- Data commit: `8d86d7002e8cab5839f04540d93ac303db078517` in
  https://github.com/swgoh-utils/gamedata.
- Manifest and asset extraction reference:
  https://github.com/MarTrepodi/swgoh-asset-extractor.
- Rig export: AssetStudioModCLI v0.19.0 from
  https://github.com/aelurum/AssetStudio/releases/tag/v0.19.0.
- FBX conversion: FBX2glTF v0.9.7 from
  https://github.com/facebookincubator/FBX2glTF/releases/tag/v0.9.7.

Run `node scripts/prepare-game-models.mjs --work <temporary-directory>
--exporter <AssetStudioModCLI.exe> --converter <FBX2glTF.exe>` to regenerate all
characters and packs. The script downloads the original bundles and their
declared dependencies, exports animator rigs, converts to GLB, removes shader
mask vertex colors, and keeps one idle animation when exported. Hashed packs
contain complete GLB records; the browser requests each selected model's byte
range. All 341 character IDs are covered. Tests verify each range, GLB header,
checksum, rig and embedded textures.

The manifest is protobuf; entry dependencies are field 9. Download URLs use the
client asset version directory, not each record's content hash. Match bundle
names case-insensitively. Original `unitPrefab` names identify each model.

## UI evidence

`inventoryui_squadtile` and `inventoryui_squadslatbase` contain the original
SquadListItemFrame, anchors, dimensions, font references, sprite names and
colors. The compact row reference is 1010 by 206, with labels around 20–24 and
badges around 28 game units. Expanded cards use the original unit models;
compact cards and roster controls use the portrait atlas and original relic,
Zeta, Omicron and Galactic Legend overlays. The game fonts are
TradeGothicLTCom-BdCn20 and FuturaCom-Bold from shared_resourcecontainer.

## Rendering limits to investigate next

Models retain original meshes, bones and textures. The browser approximates
Unity's lighting and materials. Texture alpha and vertex colors are shader
effect channels, so applying them as ordinary transparency/albedo corrupts
the preview. Opaque double-sided materials currently show the base body.
Effect meshes are hidden for the planner. Rig scale can be about 0.018 units;
camera clipping distances must scale with the model bounds.

The export preserves available transform idle clips. Humanoid Avatar muscle
animations need further decoding/retargeting before animation parity can be
claimed. The planner currently frames the upper body using its bounds, whereas
the game has per-character camera/pose metadata. Study that metadata and the
original shaders next. This is asset and prefab reconstruction, not a recovered
complete game implementation.

## Local evidence for the separate browser reconstruction task

Original recording:
`C:\Users\Actia\Downloads\Recording 2026-10-12 231719.mp4`.
Temporary extraction workspace:
`C:\Users\Actia\AppData\Local\Temp\swgoh-model-work`.
It contains manifest.json, original bundles, all character FBX exports and GLBs,
the AssetStudio and converter tools, and JSON dumps of char_draphra_pre,
inventoryui_squadtile and inventoryui_squadslatbase. The cantina environment
bundle and shared shader/animation/resource bundles were also downloaded.

Next scope: build an isolated browser prototype of the cantina, character
details, roster, squad selection and a battle scene using those original assets.
Inspect prefab hierarchy, animation controllers, cameras, shaders and cached
ability/stat tables before implementing each screen. Verify what is understood
and mark unknown behavior in development notes, keeping diagnostic prose out
of the visible UI. Work toward broader game behavior incrementally; official
live accounts and server-side game systems are not implemented by this asset
pipeline.

## Installed client findings

The installed client is `C:\\Program Files\\EA Games\\SWGoH`, Unity 6000.3.17f1, IL2CPP metadata version 39. Cpp2IL pre-release.21 successfully maps 199,578 method definitions and writes class/field definitions to the temporary work folder’s `native-cpp2il/DiffableCs`. Those C# methods have empty bodies; they are metadata evidence, not recovered implementations. REA is installed in `rea-cli` in the same work folder, with its repository and documentation in `rea`. Native decompilation needs a supported Ghidra/JDK provider.

The exact squad backdrop is `light_bg`, the 256 by 128 cantina Texture2D in `SWGoH_Data/resources.assets`. It was extracted directly and saved as `assets/img/squads/cantina-background.png`. The UI root in the inventory prefab is 1280 by 720, fitHeight enabled, autoDetectFit enabled, threshold 1.7. SquadListItemFrame opacity is 0.498, so its fill must allow the original backdrop to show through. The unit-preview cameras in the installed prefab use a 25 degree field of view. Leadership belongs on the roster side of squad selection; it does not occupy a character model cell.

Two textures share the name `light_bg`: a 1024×512 blue modal backdrop and the 256×128 pre-blurred cantina backdrop. Identify the correct texture by dimensions and visual comparison; a name-only lookup is insufficient.
