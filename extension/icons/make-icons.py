#!/usr/bin/env python3
"""
Generate extension icons from logo-source.png using stdlib only (no PIL).
Run: python3 extension/icons/make-icons.py
"""
import struct, zlib, math, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE     = os.path.join(SCRIPT_DIR, 'logo-source.png')
SIZES      = [16, 32, 48, 128]

# ─── PNG reader ───────────────────────────────────────────────────────────────

def read_png(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'Not a PNG'

    chunks = {}
    i = 8
    while i < len(data):
        length = struct.unpack('>I', data[i:i+4])[0]
        tag    = data[i+4:i+8]
        body   = data[i+8:i+8+length]
        chunks.setdefault(tag, []).append(body)
        i += 12 + length

    ihdr   = chunks[b'IHDR'][0]
    width  = struct.unpack('>I', ihdr[0:4])[0]
    height = struct.unpack('>I', ihdr[4:8])[0]
    bit_depth   = ihdr[8]
    color_type  = ihdr[9]
    interlace   = ihdr[12]

    assert interlace == 0,    'Interlaced PNG not supported'
    assert bit_depth == 8,    f'Only 8-bit depth supported (got {bit_depth})'
    assert color_type in (2, 6), f'Only RGB/RGBA supported (got color_type={color_type})'

    channels = 4 if color_type == 6 else 3

    raw_idat = b''.join(chunks[b'IDAT'])
    raw      = zlib.decompress(raw_idat)

    stride = 1 + width * channels   # 1 filter byte + pixel data per row
    pixels = []
    for y in range(height):
        row_start = y * stride
        filt      = raw[row_start]
        row       = list(raw[row_start+1 : row_start+1+width*channels])

        # Apply PNG filter
        if filt == 1:   # Sub
            for x in range(channels, len(row)):
                row[x] = (row[x] + row[x-channels]) & 0xFF
        elif filt == 2: # Up
            if y > 0:
                prev = pixels[(y-1)*width*channels : y*width*channels] if pixels else [0]*len(row)
                # prev is already flat list
                prev_row = pixels[-(width*channels):]
                for x in range(len(row)):
                    row[x] = (row[x] + prev_row[x]) & 0xFF
        elif filt == 3: # Average
            prev_row = pixels[-(width*channels):] if y > 0 else [0]*len(row)
            for x in range(len(row)):
                a = row[x-channels] if x >= channels else 0
                b = prev_row[x] if y > 0 else 0
                row[x] = (row[x] + (a + b) // 2) & 0xFF
        elif filt == 4: # Paeth
            prev_row = pixels[-(width*channels):] if y > 0 else [0]*len(row)
            for x in range(len(row)):
                a = row[x-channels] if x >= channels else 0
                b = prev_row[x] if y > 0 else 0
                c = prev_row[x-channels] if (y > 0 and x >= channels) else 0
                p  = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if pa<=pb and pa<=pc else (b if pb<=pc else c)
                row[x] = (row[x] + pr) & 0xFF

        pixels.extend(row)

    # Return (width, height, channels, flat list of bytes)
    return width, height, channels, pixels

# ─── PNG writer ───────────────────────────────────────────────────────────────

def png_chunk(tag, body):
    crc = zlib.crc32(tag + body) & 0xffffffff
    return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', crc)

def write_png(path, width, height, rgba_flat):
    """rgba_flat: flat list of (r,g,b,a) bytes, row by row."""
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    raw  = bytearray()
    for y in range(height):
        raw.append(0)  # filter: None
        base = y * width * 4
        raw.extend(rgba_flat[base:base + width*4])
    data = (b'\x89PNG\r\n\x1a\n' +
            png_chunk(b'IHDR', ihdr) +
            png_chunk(b'IDAT', zlib.compress(bytes(raw), 9)) +
            png_chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)
    print(f'  Wrote {path}  ({len(data):,} bytes)')

# ─── Lanczos-like downsampler (box filter for simplicity, still sharp) ────────

def downsample(src_w, src_h, src_ch, src_pixels, dst_w, dst_h):
    """Area-averaging downsample → RGBA output."""
    sx = src_w / dst_w
    sy = src_h / dst_h
    out = []

    def get_src(x, y, c):
        x = max(0, min(src_w-1, x))
        y = max(0, min(src_h-1, y))
        idx = (y * src_w + x) * src_ch + c
        return src_pixels[idx]

    def get_rgba(x, y):
        if src_ch == 4:
            return (get_src(x,y,0), get_src(x,y,1), get_src(x,y,2), get_src(x,y,3))
        return (get_src(x,y,0), get_src(x,y,1), get_src(x,y,2), 255)

    for dy in range(dst_h):
        y0, y1 = dy*sy, (dy+1)*sy
        for dx in range(dst_w):
            x0, x1 = dx*sx, (dx+1)*sx
            # Sample all source pixels that overlap this output pixel
            r=g=b=a=count=0
            iy0, iy1 = int(math.floor(y0)), int(math.ceil(y1))
            ix0, ix1 = int(math.floor(x0)), int(math.ceil(x1))
            for iy in range(iy0, iy1+1):
                wy = min(iy+1,y1)-max(iy,y0)
                if wy <= 0: continue
                for ix in range(ix0, ix1+1):
                    wx = min(ix+1,x1)-max(ix,x0)
                    if wx <= 0: continue
                    w = wx * wy
                    pr,pg,pb,pa = get_rgba(ix, iy)
                    r+=pr*w; g+=pg*w; b+=pb*w; a+=pa*w; count+=w
            if count > 0:
                out += [int(r/count), int(g/count), int(b/count), int(a/count)]
            else:
                out += [0,0,0,255]
    return out

# ─── Main ─────────────────────────────────────────────────────────────────────

if not os.path.exists(SOURCE):
    print(f'ERROR: {SOURCE} not found.')
    print('Save your logo PNG as extension/icons/logo-source.png then re-run.')
    exit(1)

print(f'Reading {SOURCE} ...')
src_w, src_h, src_ch, src_pixels = read_png(SOURCE)
print(f'  Source: {src_w}x{src_h}, {src_ch} channels')

for size in SIZES:
    out_pixels = downsample(src_w, src_h, src_ch, src_pixels, size, size)
    out_path   = os.path.join(SCRIPT_DIR, f'icon{size}.png')
    write_png(out_path, size, size, out_pixels)

print('All icons generated from your real logo.')
