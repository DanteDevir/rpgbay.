"""Generate original RPG BAY icon assets using only Python standard library."""
from pathlib import Path
import struct
import zlib

OUT = Path(__file__).parent / 'src-tauri/icons'
OUT.mkdir(parents=True, exist_ok=True)

def inside(x, y, points):
    found = False
    j = len(points) - 1
    for i, (px, py) in enumerate(points):
        qx, qy = points[j]
        if (py > y) != (qy > y) and x < (qx-px)*(y-py)/(qy-py)+px:
            found = not found
        j = i
    return found

def make_png(size):
    lines = []
    left = [(48, 72), (124, 91), (124, 191), (48, 169)]
    right = [(132, 91), (208, 72), (208, 169), (132, 191)]
    for row in range(size):
        line = bytearray([0])
        for col in range(size):
            x, y = col * 256 / size, row * 256 / size
            rgba = (14 + int(y/24), 24 + int(x/24), 44 + int(y/16), 255)
            if inside(x, y, left): rgba = (117, 100, 239, 255)
            if inside(x, y, right): rgba = (76, 205, 219, 255)
            if 123 <= x <= 133 and 97 <= y <= 193: rgba = (227, 240, 255, 255)
            if 66 <= x <= 106 and any(abs(y-(base + (x-66)*0.25)) < 2 for base in [104, 125, 146]): rgba = (224, 229, 255, 255)
            if 150 <= x <= 190 and any(abs(y-(base - (x-150)*0.25)) < 2 for base in [114, 135, 156]): rgba = (215, 253, 255, 255)
            line.extend(rgba)
        lines.append(line)
    def chunk(name, body):
        return struct.pack('>I', len(body)) + name + body + struct.pack('>I', zlib.crc32(name + body) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(lines), 9)) + chunk(b'IEND', b'')

png = make_png(256)
(OUT / 'icon.png').write_bytes(png)
(OUT / '128x128.png').write_bytes(make_png(128))
(OUT / 'icon.ico').write_bytes(struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22) + png)
(OUT / 'icon.icns').write_bytes(b'icns' + struct.pack('>I', len(png)+16) + b'ic08' + struct.pack('>I', len(png)+8) + png)
