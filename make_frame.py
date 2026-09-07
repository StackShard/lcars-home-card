import zlib, struct

W, H = 320, 180
rows = []
for y in range(H):
    if y < 20:
        base = (16, 18, 24)
    elif y < 60:
        base = (30, 40, 52)
    elif y < 140:
        base = (22, 26, 34)
    else:
        base = (12, 13, 16)
    row = b""
    for x in range(W):
        if 120 <= x <= 200 and 40 <= y <= 150:
            c = (234, 177, 140)
        elif x % 40 < 2 and 60 <= y < 140:
            c = (131, 189, 210)
        else:
            c = base
        row += bytes(c)
    rows.append(b"\x00" + row)
raw = b"".join(rows)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(raw, 9))
png += chunk(b"IEND", b"")
with open("frame.png", "wb") as handle:
    handle.write(png)
print("wrote frame.png", len(png), "bytes")
