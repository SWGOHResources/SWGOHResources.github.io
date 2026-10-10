"""Export named NGUI sprites from original SWGOH Unity bundles.

Requires UnityPy and Pillow. Pass bundles downloaded by the asset extractor:
  python scripts/extract-atlas-sprites.py BUNDLE ... --output assets/img/atlases

Use the atlas's actual material texture and mSprites rectangles. Never infer
bounds from connected pixels: those guesses split disconnected parts and
merge neighbouring sprites. Export source pixels without scaling or tinting;
record padding, borders and rendering mirror flags for consumers in index.json.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path


def filename(name):
    result = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name).rstrip(' .')
    if not result or result in {'.', '..'}:
        raise ValueError(f'Invalid sprite name: {name!r}')
    return result


def crop_sprite(image, sprite):
    x, y, width, height = [sprite[k] for k in ('x', 'y', 'width', 'height')]
    if any(type(v) is not int for v in (x, y, width, height)):
        raise ValueError(f'Non-integer rectangle: {sprite["name"]}')
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > image.width or y + height > image.height:
        raise ValueError(f'Out-of-bounds rectangle: {sprite["name"]}')
    return image.crop((x, y, x + width, y + height))


def export_bundle(bundle, output):
    import UnityPy

    env = UnityPy.load(str(bundle))
    objects = {obj.path_id: obj for obj in env.objects}
    result = []
    destinations = set()
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour':
            continue
        atlas = obj.read_typetree()
        sprites = atlas.get('mSprites')
        if not sprites:
            continue
        material = objects[atlas['material']['m_PathID']].read_typetree()
        envs = material['m_SavedProperties']['m_TexEnvs']
        textures = dict(envs) if isinstance(envs, list) else envs
        texture = objects[textures['_MainTex']['m_Texture']['m_PathID']].read()
        image = texture.image.convert('RGBA')
        # Use a separate alpha texture only when the material explicitly
        # references one; do not guess masks from visually similar filenames.
        mask_info = textures.get('_AlphaTex') or textures.get('_MaskTex')
        if mask_info and mask_info['m_Texture']['m_PathID']:
            mask = objects[mask_info['m_Texture']['m_PathID']].read().image.convert('RGB')
            if mask.size != image.size:
                raise ValueError(f'Mask dimensions differ: {atlas["m_Name"]}')
            from PIL import Image
            alpha = Image.new('L', image.size)
            alpha.putdata([(r + g + b) // 3 for r, g, b in mask.getdata()])
            image.putalpha(alpha)
        atlas_name = atlas['m_Name']
        for sprite in sprites:
            relative = Path(filename(atlas_name)) / (filename(sprite['name']) + '.png')
            if str(relative).casefold() in destinations:
                raise ValueError(f'Duplicate sprite destination: {relative}')
            destinations.add(str(relative).casefold())
            cropped = crop_sprite(image, sprite)
            target = output / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            cropped.save(target)
            result.append({
                'atlas': atlas_name, 'name': sprite['name'],
                'path': relative.as_posix(), 'texture': texture.m_Name,
                'metadata': sprite,
                'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            })
    if not result:
        raise ValueError(f'No named NGUI sprites in {bundle.name}')
    return {'bundle': bundle.name, 'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest(), 'sprites': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundles', nargs='+', type=Path)
    parser.add_argument('--output', type=Path, default=Path('assets/img/atlases'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    sources = [export_bundle(bundle, args.output) for bundle in args.bundles]
    paths = [s['path'].casefold() for source in sources for s in source['sprites']]
    if len(paths) != len(set(paths)):
        raise ValueError('Different bundles produced the same sprite path')
    manifest = {'schemaVersion': 1, 'coordinates': 'top-left pixels', 'sources': sources}
    (args.output / 'index.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(paths)} named sprites from {len(sources)} bundles')


if __name__ == '__main__':
    main()
