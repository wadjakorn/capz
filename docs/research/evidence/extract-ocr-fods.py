#!/usr/bin/env python3
"""Extract the list of languages that have a Windows OCR Feature-on-Demand.

Evidence for docs/research/2026-08-19-oneocr-windows-thai.md §2 — the claim that
no Thai (th) OCR FOD exists, which makes docs/OCR-THAI-WINDOWS.th.md and the
toast in src/stores/ocr.ts unfollowable.

Source table (the one Microsoft's FOD docs page still links to as of 2026-08):
https://download.microsoft.com/download/7/6/0/7600F9DC-C296-4CF8-B92A-2D85BAFBD5D2/Windows-10-1809-FOD-to-LP-Mapping-Table.xlsx

usage: python3 extract-ocr-fods.py [path-to.xlsx]
"""
import re
import sys
import zipfile

path = sys.argv[1] if len(sys.argv) > 1 else "Windows-10-1809-FOD-to-LP-Mapping-Table.xlsx"
strings = re.findall(
    r"<t[^>]*>(.*?)</t>",
    zipfile.ZipFile(path).read("xl/sharedStrings.xml").decode("utf8", errors="ignore"),
    re.S,
)
langs = sorted(
    {m.group(1) for s in strings if (m := re.search(r"LanguageFeatures-OCR-([a-z\-]+)-Package", s))}
)
print(f"{len(langs)} OCR FODs: {' '.join(langs)}")
print("thai present:", any(l.startswith("th") for l in langs))
