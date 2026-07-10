#!/usr/bin/env python3
"""Small dependency-free perceptual guard for KeepDir screenshot baselines."""

from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_png(path: Path) -> tuple[int, int, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"invalid PNG signature: {path}")

    offset = len(PNG_SIGNATURE)
    idat = bytearray()
    palette: list[tuple[int, int, int]] = []
    transparency = b""
    width = height = bit_depth = color_type = interlace = None

    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", payload)
        elif kind == b"PLTE":
            palette = [tuple(payload[index : index + 3]) for index in range(0, len(payload), 3)]
        elif kind == b"tRNS":
            transparency = payload
        elif kind == b"IDAT":
            idat.extend(payload)
        elif kind == b"IEND":
            break

    if None in (width, height, bit_depth, color_type, interlace):
        raise ValueError(f"missing IHDR: {path}")
    if bit_depth != 8 or interlace != 0 or color_type not in (0, 2, 3, 4, 6):
        raise ValueError(f"unsupported PNG format in {path}: depth={bit_depth}, color={color_type}, interlace={interlace}")

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    row_bytes = width * channels
    raw = zlib.decompress(bytes(idat))
    previous = bytearray(row_bytes)
    cursor = 0
    pixels: list[tuple[int, int, int]] = []

    def paeth(a: int, b: int, c: int) -> int:
        estimate = a + b - c
        distances = (abs(estimate - a), abs(estimate - b), abs(estimate - c))
        return (a, b, c)[distances.index(min(distances))]

    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        row = bytearray(raw[cursor : cursor + row_bytes])
        cursor += row_bytes
        for index, value in enumerate(row):
            left = row[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 1:
                row[index] = (value + left) & 255
            elif filter_type == 2:
                row[index] = (value + up) & 255
            elif filter_type == 3:
                row[index] = (value + ((left + up) // 2)) & 255
            elif filter_type == 4:
                row[index] = (value + paeth(left, up, upper_left)) & 255
            elif filter_type != 0:
                raise ValueError(f"unsupported PNG filter {filter_type}: {path}")

        for index in range(0, row_bytes, channels):
            sample = row[index : index + channels]
            if color_type == 0:
                red = green = blue = sample[0]
                alpha = 255
            elif color_type == 2:
                red, green, blue = sample
                alpha = 255
            elif color_type == 3:
                palette_index = sample[0]
                red, green, blue = palette[palette_index]
                alpha = transparency[palette_index] if palette_index < len(transparency) else 255
            elif color_type == 4:
                red = green = blue = sample[0]
                alpha = sample[1]
            else:
                red, green, blue, alpha = sample
            pixels.append(tuple(round(channel * alpha / 255 + 255 * (1 - alpha / 255)) for channel in (red, green, blue)))
        previous = row

    return width, height, pixels


def sample(width: int, height: int, pixels: list[tuple[int, int, int]], size: int = 64) -> list[tuple[int, int, int]]:
    return [
        pixels[min(height - 1, y * height // size) * width + min(width - 1, x * width // size)]
        for y in range(size)
        for x in range(size)
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("actual", type=Path)
    parser.add_argument("reference", type=Path)
    parser.add_argument("--max-difference", type=float, default=0.30)
    args = parser.parse_args()

    actual = sample(*read_png(args.actual))
    reference = sample(*read_png(args.reference))
    difference = sum(abs(a - b) for left, right in zip(actual, reference) for a, b in zip(left, right)) / (len(actual) * 3 * 255)
    status = "OK" if difference <= args.max_difference else "FAIL"
    print(f"{status} visual difference {difference:.4f} <= {args.max_difference:.4f}: {args.actual.name} vs {args.reference.name}")
    return 0 if difference <= args.max_difference else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(2)
