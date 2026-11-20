from . import openthai, rustproto, tesseract, vision

ENGINES = {"openthai": openthai, "tesseract": tesseract, "vision": vision,
           "rust-ort": rustproto.ORT, "rust-tract": rustproto.TRACT,
           "capz": rustproto.CAPZ}
