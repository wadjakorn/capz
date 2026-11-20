"""pyclipper ClipperOffset (round joins) emulation check on 500 random tilted boxes; the Rust port
(geom.rs clipper_offset_round) follows the same algorithm. Usage: uv run python tools/pyclipper_emulation_check.py"""
import math, numpy as np, pyclipper, cv2
def rnd(v): return int(v - 0.5) if v < 0 else int(v + 0.5)
def offset(poly, delta, arc_tol=0.25):
    pts = [(int(x), int(y)) for x, y in poly]
    dedup = []
    for p in pts:
        if not dedup or p != dedup[-1]: dedup.append(p)
    if len(dedup) > 1 and dedup[0] == dedup[-1]: dedup.pop()
    pts = dedup
    area = sum(pts[i][0]*pts[(i+1)%len(pts)][1] - pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts))) / 2
    if area < 0: pts = pts[::-1]
    y = arc_tol if arc_tol <= abs(delta) * 0.25 else abs(delta) * 0.25
    steps = math.pi / math.acos(1 - y / abs(delta))
    if steps > abs(delta) * math.pi: steps = abs(delta) * math.pi
    sin_, cos_ = math.sin(2 * math.pi / steps), math.cos(2 * math.pi / steps)
    spr = steps / (2 * math.pi)
    n = len(pts); normals = []
    for j in range(n):
        a, b = pts[j], pts[(j + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        f = 1.0 / math.sqrt(dx * dx + dy * dy)
        normals.append((dy * f, -dx * f))
    out = []; k = n - 1
    for j in range(n):
        nk, nj = normals[k], normals[j]
        sinA = nk[0] * nj[1] - nj[0] * nk[1]
        cosA = nk[0] * nj[0] + nj[1] * nk[1]
        if abs(sinA * delta) < 1.0:
            if cosA > 0:
                out.append((rnd(pts[j][0] + nk[0] * delta), rnd(pts[j][1] + nk[1] * delta))); k = j; continue
        elif sinA > 1.0: sinA = 1.0
        elif sinA < -1.0: sinA = -1.0
        if sinA * delta < 0:
            out += [(rnd(pts[j][0] + nk[0]*delta), rnd(pts[j][1] + nk[1]*delta)), pts[j], (rnd(pts[j][0] + nj[0]*delta), rnd(pts[j][1] + nj[1]*delta))]
        else:
            a = math.atan2(sinA, cosA)
            st = max(rnd(spr * abs(a)), 1)
            X, Y = nk
            for _ in range(st):
                out.append((rnd(pts[j][0] + X * delta), rnd(pts[j][1] + Y * delta)))
                X, Y = X * cos_ - sin_ * Y, X * sin_ + Y * cos_
            out.append((rnd(pts[j][0] + nj[0] * delta), rnd(pts[j][1] + nj[1] * delta)))
        k = j
    return out
if __name__ == "__main__":
    rng = np.random.default_rng(1); bad = 0; rectbad = 0
    for _ in range(500):
        c = rng.uniform(20, 500, 2); w, h = rng.uniform(5, 300), rng.uniform(3, 40); ang = rng.uniform(-0.05, 0.05)
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        box = (np.array([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]) @ R.T + c).astype(np.float32)
        d = cv2.contourArea(box) * 1.4 / cv2.arcLength(box, True)
        pc = pyclipper.PyclipperOffset(); pc.AddPath([tuple(p) for p in box.tolist()], pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
        ref = [tuple(p) for p in pc.Execute(d)[0]]
        mine = offset(box.tolist(), d)
        if set(ref) - set(mine): bad += 1
        r1 = cv2.boxPoints(cv2.minAreaRect(np.array(ref, np.float32))); r2 = cv2.boxPoints(cv2.minAreaRect(np.array(mine, np.float32)))
        rectbad += np.abs(np.sort(r1, 0) - np.sort(r2, 0)).max() > 1e-3
    print("points in pyclipper output missing from emulation:", bad, "/ 500; min-area rects differing:", rectbad)
