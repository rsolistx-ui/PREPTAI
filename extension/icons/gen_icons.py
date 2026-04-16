#!/usr/bin/env python3
"""
Generate PREPT AI extension icons that match the real logo:
  • very dark navy background
  • off-white / cream P letterform
  • small right-pointing play-arrow cutout inside the bowl
Uses only stdlib (struct + zlib).
"""
import struct, zlib, math, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SIZES = [16, 32, 48, 128]

# ── Brand colours ─────────────────────────────────────────────────────────────
BG = (13,  11,  20)    # #0d0b14  very dark navy (logo background)
FG = (240, 237, 228)   # #f0ede4  off-white / cream P (logo foreground)

# ── P shape — all coords on a virtual 512 × 512 canvas ───────────────────────
#
#   The P is the UNION of:
#     1. A tall rectangular stem (left side)
#     2. A full circle (upper-right)  — only the part right of stem_l matters
#
#   Minus the play-arrow (right-pointing triangle) cut from the bowl.
#
#   The circle is internally tangent to the stem right edge, so the union
#   gives a clean straight left edge on the bowl — exactly as in the logo.

STEM_L, STEM_R = 118, 194       # stem left / right  x
STEM_T, STEM_B = 55,  452       # stem top  / bottom y

BOWL_CX = STEM_R + 105          # = 299  bowl circle centre x
BOWL_CY = STEM_T + 105          # = 160  bowl circle centre y
BOWL_R  = 105                   # bowl radius  (= BOWL_CX - STEM_R, tangent)

# Play-arrow: right-pointing triangle, centred inside the bowl
ARR_LX  = 252                   # left-edge x of both base vertices
ARR_TY  = 100                   # top-left  vertex y
ARR_BY  = 196                   # bottom-left vertex y
ARR_APX = 340                   # apex x  (right point)
ARR_APY = (ARR_TY + ARR_BY) // 2  # = 148  apex y  (vertically centred)


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _sign(ax, ay, bx, by, cx, cy):
    return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)


def _in_arrow(px, py):
    """True if (px,py) is inside the play-arrow triangle."""
    d1 = _sign(px, py, ARR_LX, ARR_TY,  ARR_APX, ARR_APY)
    d2 = _sign(px, py, ARR_APX, ARR_APY, ARR_LX, ARR_BY)
    d3 = _sign(px, py, ARR_LX, ARR_BY,  ARR_LX, ARR_TY)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def coverage(px, py):
    """
    Coverage value  0.0 (background) … 1.0 (cream P)
    for a point (px, py) on the 512 × 512 virtual canvas.
    """
    in_stem = (STEM_L <= px <= STEM_R) and (STEM_T <= py <= STEM_B)

    bd = (px - BOWL_CX) ** 2 + (py - BOWL_CY) ** 2
    in_bowl = (bd <= BOWL_R ** 2)

    if not (in_stem or in_bowl):
        return 0.0  # background

    # Arrow cutout sits entirely inside the bowl (right of stem right edge)
    if px > STEM_R and _in_arrow(px, py):
        return 0.0  # arrow = background shows through

    return 1.0  # cream P


# ── PNG writer (stdlib only) ──────────────────────────────────────────────────

def _chunk(tag, body):
    crc = zlib.crc32(tag + body) & 0xFFFFFFFF
    return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', crc)


def write_png(path, w, h, rgba):
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * w * 4: (y + 1) * w * 4])
    data = (b'\x89PNG\r\n\x1a\n'
            + _chunk(b'IHDR', ihdr)
            + _chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + _chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)
    print(f'  {path}  ({len(data):,} bytes)')


# ── Render with 4 × 4 supersampling ──────────────────────────────────────────

SS = 4   # sub-samples per axis (16 total per output pixel)

def render(size):
    scale = 512.0 / size
    out = []
    for y in range(size):
        for x in range(size):
            acc = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    vx = (x + (sx + 0.5) / SS) * scale
                    vy = (y + (sy + 0.5) / SS) * scale
                    acc += coverage(vx, vy)
            t = acc / (SS * SS)
            r = int(BG[0] + (FG[0] - BG[0]) * t + 0.5)
            g = int(BG[1] + (FG[1] - BG[1]) * t + 0.5)
            b = int(BG[2] + (FG[2] - BG[2]) * t + 0.5)
            out.extend([r, g, b, 255])
    return out


# ── Main ──────────────────────────────────────────────────────────────────────

print('Generating PREPT AI extension icons …')
for size in SIZES:
    pix  = render(size)
    path = os.path.join(SCRIPT_DIR, f'icon{size}.png')
    write_png(path, size, size, pix)
print('Done.')
