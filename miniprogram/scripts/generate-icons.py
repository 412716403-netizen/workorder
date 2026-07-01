#!/usr/bin/env python3
"""【已废弃】请使用 npm run miniprogram:icons（export-lucide-icons.mjs）。"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
ICONS = os.path.join(ASSETS, 'icons')
TAB = os.path.join(ASSETS, 'tab')
MINE = os.path.join(ASSETS, 'mine')

BLUE = (47, 107, 255, 255)
GRAY = (143, 149, 158, 255)
WHITE = (255, 255, 255, 255)


def canvas(size: int, color=(0, 0, 0, 0)) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new('RGBA', (size, size), color)
    return img, ImageDraw.Draw(img)


def save(img: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')
    print('wrote', path)


def stroke(size: int) -> int:
    return max(2, size // 16)


def pad(size: int) -> int:
    return size // 6


def draw_home(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.polygon([s // 2, p, s - p, s // 2, s - p, s - p, p, s - p, p, s // 2], outline=c, width=w)
    d.rectangle([s // 2 - s // 10, s // 2, s // 2 + s // 10, s - p], outline=c, width=w)


def draw_grid(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w, g = pad(s), stroke(s), s // 5
    for row in range(2):
        for col in range(2):
            x0 = p + col * (g + g // 2)
            y0 = p + row * (g + g // 2)
            d.rounded_rectangle([x0, y0, x0 + g, y0 + g], radius=g // 5, outline=c, width=w)


def draw_scan(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w, inner = pad(s), stroke(s), s - 2 * pad(s)
    d.rounded_rectangle([p, p, p + inner, p + inner], radius=s // 10, outline=c, width=w)
    corner = inner // 4
    for x0, y0, x1, y1 in [
        (p, p, p + corner, p + w * 2),
        (p, p, p + w * 2, p + corner),
        (p + inner - corner, p, p + inner, p + w * 2),
        (p + inner - w * 2, p, p + inner, p + corner),
        (p, p + inner - w * 2, p + corner, p + inner),
        (p, p + inner - corner, p + w * 2, p + inner),
        (p + inner - corner, p + inner - w * 2, p + inner, p + inner),
        (p + inner - w * 2, p + inner - corner, p + inner, p + inner),
    ]:
        d.line([x0, y0, x1, y1], fill=c, width=w)


def draw_user(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    cx = s // 2
    d.ellipse([cx - s // 6, p, cx + s // 6, p + s // 3], outline=c, width=w)
    d.arc([p, s // 3, s - p, s - p // 3], 20, 160, fill=c, width=w)


def draw_clipboard(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p + s // 12, p + s // 8, s - p, s - p], radius=s // 12, outline=c, width=w)
    d.rounded_rectangle([s // 3, p, 2 * s // 3, p + s // 5], radius=s // 16, outline=c, width=w)
    d.line([p + s // 4, s // 2, s - p - s // 8, s // 2], fill=c, width=w)
    d.line([p + s // 4, s // 2 + s // 8, s - p - s // 4, s // 2 + s // 8], fill=c, width=w)


def draw_list(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    for i, width in enumerate([0.65, 0.5, 0.55]):
        y = p + s // 5 + i * s // 5
        d.line([p, y, p + int(s * width), y], fill=c, width=w)
        d.ellipse([p - w, y - w, p + w, y + w], fill=c)


def draw_calendar(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p, p + s // 8, s - p, s - p], radius=s // 12, outline=c, width=w)
    d.line([p, p + s // 4, s - p, p + s // 4], fill=c, width=w)
    for x in (s // 3, 2 * s // 3):
        d.line([x, p, x, p + s // 6], fill=c, width=w)


def draw_box(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.polygon([s // 2, p, s - p, p + s // 5, s - p, s - p, p, s - p, p, p + s // 5], outline=c, width=w)
    d.line([p, p + s // 5, s // 2, p + s // 3], fill=c, width=w)
    d.line([s - p, p + s // 5, s // 2, p + s // 3], fill=c, width=w)


def draw_cart(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.line([p, p + s // 4, p + s // 5, p + s // 4, p + s // 3, s - p, s - p - s // 8, s - p], fill=c, width=w)
    d.ellipse([p + s // 4, s - p - s // 10, p + s // 4 + s // 8, s - p + s // 12], outline=c, width=w)
    d.ellipse([s - p - s // 6, s - p - s // 10, s - p - s // 12, s - p + s // 12], outline=c, width=w)


def draw_wallet(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p, p + s // 6, s - p, s - p], radius=s // 10, outline=c, width=w)
    d.ellipse([s - p - s // 4, s // 2 - s // 12, s - p - s // 10, s // 2 + s // 12], outline=c, width=w)


def draw_truck(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rectangle([p, s // 2, s // 2, s - p - s // 10], outline=c, width=w)
    d.polygon([s // 2, s // 2 + s // 12, s - p, s // 2 + s // 12, s - p, s - p - s // 10, p + s // 8, s - p - s // 10, p + s // 8, s // 2], outline=c, width=w)
    d.ellipse([p + s // 10, s - p - s // 8, p + s // 5, s - p + s // 12], outline=c, width=w)
    d.ellipse([s - p - s // 5, s - p - s // 8, s - p - s // 10, s - p + s // 12], outline=c, width=w)


def draw_chart(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.line([p, s - p, s - p, s - p], fill=c, width=w)
    for x, h in [(p + s // 6, 0.35), (p + s // 3, 0.55), (p + s // 2, 0.4), (2 * s // 3, 0.7)]:
        top = int(s - p - s * h)
        d.line([x, s - p, x, top], fill=c, width=w)


def draw_refresh(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.arc([p, p, s - p, s - p], 45, 300, fill=c, width=w)
    d.polygon([s - p - s // 8, p + s // 6, s - p, p + s // 5, s - p - s // 10, p + s // 3], fill=c)


def draw_qr(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w, u = pad(s), stroke(s), s // 7
    d.rectangle([p, p, p + 3 * u, p + 3 * u], outline=c, width=w)
    d.rectangle([s - p - 3 * u, p, s - p, p + 3 * u], outline=c, width=w)
    d.rectangle([p, s - p - 3 * u, p + 3 * u, s - p], outline=c, width=w)
    d.rectangle([p + u, p + u, p + 2 * u, p + 2 * u], fill=c)
    for x, y in [(s - p - 2 * u, p + u), (p + u, s - p - 2 * u), (s - p - 2 * u, s - p - 2 * u)]:
        d.rectangle([x, y, x + u, y + u], fill=c)


def draw_layers(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    for i, dy in enumerate([0, s // 8, s // 4]):
        d.polygon([s // 2, p + dy, s - p, p + s // 5 + dy, s // 2, p + s // 3 + dy, p, p + s // 5 + dy], outline=c, width=w)


def draw_building(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rectangle([p + s // 6, p + s // 5, s - p - s // 6, s - p], outline=c, width=w)
    for y in range(p + s // 3, s - p - s // 8, s // 6):
        for x in range(p + s // 4, s - p - s // 6, s // 5):
            d.rectangle([x, y, x + s // 14, y + s // 14], outline=c, width=1)


def draw_package(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p, p + s // 6, s - p, s - p], radius=s // 12, outline=c, width=w)
    d.line([p, p + s // 6, s // 2, p + s // 3], fill=c, width=w)
    d.line([s - p, p + s // 6, s // 2, p + s // 3], fill=c, width=w)


def draw_gear(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    cx = cy = s // 2
    d.ellipse([cx - s // 5, cy - s // 5, cx + s // 5, cy + s // 5], outline=c, width=w)
    for i in range(8):
        import math
        ang = math.radians(i * 45)
        x0 = cx + int(math.cos(ang) * s // 5)
        y0 = cy + int(math.sin(ang) * s // 5)
        x1 = cx + int(math.cos(ang) * s // 3)
        y1 = cy + int(math.sin(ang) * s // 3)
        d.line([x0, y0, x1, y1], fill=c, width=w)


def draw_users(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.ellipse([s // 2 - s // 8, p, s // 2 + s // 8, p + s // 4], outline=c, width=w)
    d.arc([s // 2 - s // 4, s // 4, s // 2 + s // 4, s - p], 200, 340, fill=c, width=w)
    d.ellipse([p + s // 10, p + s // 8, p + s // 4, p + s // 3], outline=c, width=max(1, w - 1))
    d.ellipse([s - p - s // 4, p + s // 8, s - p - s // 10, p + s // 3], outline=c, width=max(1, w - 1))


def draw_book(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p + s // 8, p, s - p, s - p], radius=s // 16, outline=c, width=w)
    d.line([p + s // 3, p, p + s // 3, s - p], fill=c, width=w)


def draw_bell(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.arc([p + s // 6, p, s - p - s // 6, s // 2 + s // 8], 200, 340, fill=c, width=w)
    d.line([p + s // 5, s // 2, s - p - s // 5, s // 2], fill=c, width=w)
    d.arc([s // 2 - s // 10, s // 2 + s // 12, s // 2 + s // 10, s - p + s // 12], 0, 180, fill=c, width=w)


def draw_lock(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.arc([s // 2 - s // 6, p, s // 2 + s // 6, p + s // 3], 180, 0, fill=c, width=w)
    d.rounded_rectangle([p + s // 5, p + s // 3, s - p - s // 5, s - p], radius=s // 12, outline=c, width=w)


def draw_swap(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.line([p + s // 6, s // 3, s - p - s // 4, s // 3], fill=c, width=w)
    d.polygon([s - p - s // 4, s // 3 - s // 10, s - p, s // 3, s - p - s // 4, s // 3 + s // 10], fill=c)
    d.line([s - p - s // 6, 2 * s // 3, p + s // 4, 2 * s // 3], fill=c, width=w)
    d.polygon([p + s // 4, 2 * s // 3 - s // 10, p, 2 * s // 3, p + s // 4, 2 * s // 3 + s // 10], fill=c)


def draw_help(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.ellipse([p, p, s - p, s - p], outline=c, width=w)
    d.arc([s // 2 - s // 8, p + s // 5, s // 2 + s // 8, s // 2], 200, 340, fill=c, width=w)
    d.ellipse([s // 2 - w, s - p - s // 5, s // 2 + w, s - p - s // 8], fill=c)


def draw_info(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.ellipse([p, p, s - p, s - p], outline=c, width=w)
    d.ellipse([s // 2 - w, p + s // 5, s // 2 + w, p + s // 5 + w * 2], fill=c)
    d.line([s // 2, p + s // 3, s // 2, s - p - s // 8], fill=c, width=w)


def draw_inbox(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p, p + s // 5, s - p, s - p], radius=s // 12, outline=c, width=w)
    d.line([p, p + s // 3, s // 2, s // 2, s - p, p + s // 3], fill=c, width=w)


def draw_receipt_in(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p + s // 6, p, s - p - s // 6, s - p], radius=s // 12, outline=c, width=w)
    d.polygon([s // 2 - s // 8, s // 2, s // 2, s // 2 + s // 6, s // 2 + s // 8, s // 2], outline=c, width=w)
    d.line([s // 2, s // 2 - s // 10, s // 2, s // 2 + s // 5], fill=c, width=w)


def draw_receipt_out(d: ImageDraw.ImageDraw, s: int, c: tuple[int, int, int, int]) -> None:
    p, w = pad(s), stroke(s)
    d.rounded_rectangle([p + s // 6, p, s - p - s // 6, s - p], radius=s // 12, outline=c, width=w)
    d.polygon([s // 2 - s // 8, s // 2, s // 2, s // 2 - s // 6, s // 2 + s // 8, s // 2], outline=c, width=w)
    d.line([s // 2, s // 2 - s // 5, s // 2, s // 2 + s // 10], fill=c, width=w)


def render(name: str, drawer, size: int, color: tuple[int, int, int, int], folder: str) -> None:
    img, draw = canvas(size)
    drawer(draw, size, color)
    save(img, os.path.join(folder, f'{name}.png'))


def main() -> None:
    app_icons = {
        'report': draw_clipboard,
        'orders': draw_list,
        'plans': draw_calendar,
        'stock': draw_box,
        'sales': draw_cart,
        'purchase': draw_inbox,
        'finance': draw_wallet,
        'collab': draw_truck,
        'progress': draw_chart,
        'rework': draw_refresh,
        'code': draw_qr,
        'batch': draw_layers,
        'partners': draw_building,
        'products': draw_package,
        'settings': draw_gear,
        'members': draw_users,
        'equipment': draw_gear,
        'dictionaries': draw_book,
        'knowledge': draw_book,
        'material': draw_package,
        'outsource': draw_truck,
        'receipt': draw_receipt_in,
        'payment': draw_receipt_out,
        'reconciliation': draw_chart,
        'account': draw_wallet,
        'nodes': draw_list,
        'warehouse': draw_box,
        'dev_styles': draw_package,
        'dev_templates': draw_layers,
        'trace': draw_qr,
        'pending_ship': draw_cart,
        'stocktake': draw_layers,
        'transfer': draw_swap,
    }

    for name, drawer in app_icons.items():
        render(name, drawer, 48, BLUE, ICONS)

    tab_icons = {
        'home': draw_home,
        'apps': draw_grid,
        'scan': draw_scan,
        'mine': draw_user,
    }
    for name, drawer in tab_icons.items():
        render(name, drawer, 81, GRAY, TAB)
        render(f'{name}-active', drawer, 81, BLUE, TAB)

    mine_icons = {
        'tenant': draw_building,
        'switch': draw_swap,
        'security': draw_lock,
        'notify': draw_bell,
        'help': draw_help,
        'about': draw_info,
    }
    for name, drawer in mine_icons.items():
        render(name, drawer, 40, BLUE, MINE)


if __name__ == '__main__':
    main()
