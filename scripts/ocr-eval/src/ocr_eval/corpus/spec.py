"""Which images each split contains. Deterministic: the same split always
yields the same specs (seeded), so a corpus can be rebuilt bit-for-bit."""
from __future__ import annotations

import random
from dataclasses import asdict, dataclass

from . import fonts

TEMPLATES = ["chat", "settings", "table", "article", "terminal", "code", "dialog", "menu"]
CSS_PX = [11, 12, 13, 14, 16, 20]
DPRS = [1.0, 1.25, 1.5, 2.0]
THEMES = ["light", "dark", "tinted"]
VIEWPORT = (1280, 800)  # CSS px

SPLITS = {"smoke": (0, 12), "dev": (1, 240), "test": (2, 240), "perf": (3, 10)}


@dataclass(frozen=True)
class SampleSpec:
    id: str
    split: str
    template: str
    font: str  # key in fonts.FONTS (the Thai/UI font)
    css_px: int
    dpr: float
    theme: str
    crop: str  # "viewport" | "element"
    seed: int

    def meta(self) -> dict:
        return asdict(self)


def build_specs(split: str) -> list[SampleSpec]:
    seed, n = SPLITS[split]
    rng = random.Random(seed)
    font_pool = fonts.DEV_FONTS + (fonts.TEST_ONLY_FONTS if split == "test" else [])
    out = []
    for i in range(n):
        if split == "perf":
            sp = SampleSpec(f"perf-{i:04d}", split, "dense", rng.choice(fonts.DEV_FONTS), rng.choice([13, 14]),
                            2.0, rng.choice(["light", "dark"]), "viewport", rng.randrange(1 << 30))
        else:
            sp = SampleSpec(
                id=f"{split}-{i:04d}", split=split,
                template=TEMPLATES[i % len(TEMPLATES)] if split == "smoke" else rng.choice(TEMPLATES),
                font=rng.choice(font_pool), css_px=rng.choice(CSS_PX), dpr=rng.choice(DPRS),
                theme=rng.choice(THEMES), crop="element" if rng.random() < 0.3 else "viewport",
                seed=rng.randrange(1 << 30))
        out.append(sp)
    return out
