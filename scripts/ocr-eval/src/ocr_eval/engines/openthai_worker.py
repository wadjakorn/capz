"""Runs iApp's reference LineOCR on a list of images. Executed as
`python -I openthai_worker.py ...` so the downloaded runtime is imported from
the model directory only; it never imports ocr_eval."""
import argparse
import json
import sys
import time


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--config-json", required=True)
    ap.add_argument("--images-file", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--threads", type=int, default=1)
    a = ap.parse_args()
    sys.path.insert(0, a.model_dir)
    import cv2  # noqa: E402
    from runtime.line_engine import LineOCR  # noqa: E402

    cfg = json.loads(a.config_json)
    pre = cfg.pop("pre", {})
    scale = float(pre.get("scale", 1.0))
    ocr = LineOCR(a.model_dir, threads=a.threads, **cfg)
    with open(a.images_file, encoding="utf-8") as f, open(a.out, "w", encoding="utf-8") as out:
        for row in f:
            sid, path = row.rstrip("\n").split("\t")
            img = cv2.imread(path, cv2.IMREAD_COLOR)
            H, W = img.shape[:2]
            t0 = time.perf_counter()
            s = min(scale, 4000.0 / max(H, W)) if scale > 1.0 else scale
            work = cv2.resize(img, (round(W * s), round(H * s)), interpolation=cv2.INTER_CUBIC) if s != 1.0 else img
            r = ocr.read(work)
            ms = (time.perf_counter() - t0) * 1000
            lines = []
            for ln in r["lines"]:
                q = [[x / s, y / s] for x, y in ln["box"]]
                xs, ys = [p[0] for p in q], [p[1] for p in q]
                lines.append({"text": ln["text"], "conf": ln["confidence"],
                              "box": [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)],
                              "words": [{"text": w["text"], "box": [[x / s, y / s] for x, y in w["box"]]}
                                        for w in ln.get("words", [])]})
            out.write(json.dumps({"id": sid, "width": W, "height": H, "elapsed_ms": round(ms, 1),
                                  "timing": r.get("timing"), "lines": lines}, ensure_ascii=False) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
