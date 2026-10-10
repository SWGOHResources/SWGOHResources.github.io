import importlib.util
import unittest
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('atlas', Path(__file__).parents[1] / 'scripts/extract-atlas-sprites.py')
atlas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlas)


class AtlasCrops(unittest.TestCase):
    def test_metadata_keeps_disconnected_parts_and_excludes_neighbours(self):
        image = Image.new('RGBA', (8, 4))
        image.putpixel((2, 1), (255, 255, 255, 255))
        image.putpixel((4, 2), (255, 255, 255, 255))
        image.putpixel((5, 1), (255, 0, 0, 255))
        crop = atlas.crop_sprite(image, dict(name='two_parts', x=2, y=1, width=3, height=2))
        self.assertEqual(crop.size, (3, 2))
        self.assertEqual(crop.getpixel((0, 0)), (255, 255, 255, 255))
        self.assertEqual(crop.getpixel((2, 1)), (255, 255, 255, 255))
        self.assertNotIn((255, 0, 0, 255), list(crop.getdata()))

    def test_invalid_rectangles_fail_instead_of_silently_padding(self):
        image = Image.new('RGBA', (4, 4))
        for x, width in [(-1, 2), (3, 2), (0, 0)]:
            with self.assertRaises(ValueError):
                atlas.crop_sprite(image, dict(name='invalid', x=x, y=0, width=width, height=2))


if __name__ == '__main__':
    unittest.main()
