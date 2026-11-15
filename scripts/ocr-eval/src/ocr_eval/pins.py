"""Every external artefact the harness downloads, pinned by revision and sha256."""

OPENTHAI_REPO = "iapp/OpenThai2.0-OCR-Text"
OPENTHAI_REV = "40e8e9ff752b65153b1a71d521ec9390882afd7e"
OPENTHAI_FILES = {
    "det.onnx": "193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8",
    "rec.onnx": "82ec89533346faadcb30df96703dad2dd7521de65709e60d83fd9745b8968124",
    "rec_dict.txt": "259ef2636cec0eeae225ae9fd9a63fa9305285650c22d7ec34fe8a82b24c2f1a",
    "config.json": "11599c0dae206381cb8ea11c1b7ce130b2e7971c19219f409785ee8c02ab5d94",
    "det.yml": "3ac018be6f97499a08faa3bbdeb33640968d9307f6736d152902747a9f259593",
    "NOTICE": "4c0e4f27877836de51e29aec3918b6c743c3028cd4163b6661fd540336db32b3",
    "runtime/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "runtime/line_engine.py": "5d5d672658d2a82ca6b32e230bb551eefe5d1e4efa46ff21908bfcfd75e5495c",
    "runtime/thai_norm.py": "53a03ac139fb0de3e7aec0f5b8ab69b0b519fb5e636f7c1de09cb357b023344a",
}


def openthai_url(path: str) -> str:
    return f"https://huggingface.co/{OPENTHAI_REPO}/resolve/{OPENTHAI_REV}/{path}"


# Same tessdata_fast data PR #84 bundles for Windows (scripts/package-tesseract-windows.sh).
TESSDATA_COMMIT = "87416418657359cb625c412a48b6e1d6d41c29bd"
TESSDATA_FILES = {
    "tha.traineddata": "294227cc2d1292b0acb28d61d4115c88252b96d466ca90b417cf4cf0c67bf07c",
    "eng.traineddata": "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
}


def tessdata_url(name: str) -> str:
    return f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/{TESSDATA_COMMIT}/{name}"
