"""One spelling per rendering, applied to ground truth and every engine alike.

Thai has several code-point sequences that render identically (mark order,
sara am typed as nikhahit + aa, legacy PUA glyph variants). Without this an
engine is charged for an "error" no reader could see. Whitespace is removed
last: Thai does not space words, and engines space differently."""
from __future__ import annotations

import re
import unicodedata

PUA = {
    0xF700: 0x0E10, 0xF701: 0x0E34, 0xF702: 0x0E35, 0xF703: 0x0E36, 0xF704: 0x0E37,
    0xF705: 0x0E48, 0xF706: 0x0E49, 0xF707: 0x0E4A, 0xF708: 0x0E4B, 0xF709: 0x0E4C,
    0xF70A: 0x0E48, 0xF70B: 0x0E49, 0xF70C: 0x0E4A, 0xF70D: 0x0E4B, 0xF70E: 0x0E4C,
    0xF70F: 0x0E0D, 0xF710: 0x0E31, 0xF711: 0x0E4D, 0xF712: 0x0E47, 0xF713: 0x0E48,
    0xF714: 0x0E49, 0xF715: 0x0E4A, 0xF716: 0x0E4B, 0xF717: 0x0E4C, 0xF718: 0x0E38,
    0xF719: 0x0E39, 0xF71A: 0x0E3A,
}
DROP = dict.fromkeys(map(ord, "​‌‍⁠­﻿"))
TABLE = {**PUA, **DROP, 0x00A0: 0x20}

VOWEL_ABOVE = set("ัิีึื็")
VOWEL_BELOW = set("ฺุู")
TONE = set("่้๊๋์๎")
NIKHAHIT = "ํ"
_RANK = {**{c: 0 for c in VOWEL_ABOVE | VOWEL_BELOW}, **{c: 1 for c in TONE}, NIKHAHIT: 2}
MARK_RUN = re.compile("[" + "".join(sorted(_RANK)) + "]{2,}")
SARA_AM = re.compile("([่-๋]?)ํ([่-๋]?)า")
WS = re.compile(r"\s+")


def _order(m: re.Match) -> str:
    out: list[str] = []
    for ch in sorted(m.group(0), key=_RANK.__getitem__):
        if not out or out[-1] != ch:
            out.append(ch)
    return "".join(out)


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFC", (s or "").translate(TABLE))
    s = MARK_RUN.sub(_order, s)
    s = SARA_AM.sub(lambda m: m.group(1) + m.group(2) + "ำ", s)
    s = s.replace("เเ", "แ").replace("ำำ", "ำ")
    return WS.sub("", s)


THAI_OTHER = set("ะาำเแโใไๅฯๆ")


def char_class(ch: str) -> str:
    if "ก" <= ch <= "ฮ":
        return "thai_cons"
    if ch in VOWEL_ABOVE:
        return "thai_vowel_above"
    if ch in VOWEL_BELOW:
        return "thai_vowel_below"
    if ch in TONE:
        return "thai_tone"
    if ch in THAI_OTHER or ch == NIKHAHIT:
        return "thai_other"
    if "๐" <= ch <= "๙":
        return "thai_digit"
    if "A" <= ch <= "Z":
        return "latin_upper"
    if "a" <= ch <= "z":
        return "latin_lower"
    if "0" <= ch <= "9":
        return "digit"
    return "symbol"


CLASSES = ["thai_cons", "thai_vowel_above", "thai_vowel_below", "thai_tone", "thai_other", "thai_digit",
           "latin_upper", "latin_lower", "digit", "symbol"]
