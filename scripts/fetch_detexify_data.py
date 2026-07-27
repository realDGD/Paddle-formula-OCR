from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path


def point(x: float, y: float) -> dict[str, float]:
    return {"x": float(x), "y": float(y)}


def sub(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return point(a["x"] - b["x"], a["y"] - b["y"])


def add(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return point(a["x"] + b["x"], a["y"] + b["y"])


def scale(s: float, p: dict[str, float]) -> dict[str, float]:
    return point(s * p["x"], s * p["y"])


def dot(a: dict[str, float], b: dict[str, float]) -> float:
    return a["x"] * b["x"] + a["y"] * b["y"]


def norm(p: dict[str, float]) -> float:
    return math.sqrt(dot(p, p))


def stroke_length(stroke: list[dict[str, float]]) -> float:
    return sum(norm(sub(stroke[i], stroke[i - 1])) for i in range(1, len(stroke)))


def bounding_box(stroke: list[dict[str, float]]) -> tuple[dict[str, float], dict[str, float]]:
    xs = [p["x"] for p in stroke]
    ys = [p["y"] for p in stroke]
    return (point(min(xs), min(ys)), point(max(xs), max(ys)))


def refit(
    target: tuple[dict[str, float], dict[str, float]], stroke: list[dict[str, float]]
) -> list[dict[str, float]]:
    if not stroke:
        return []
    t_min, t_max = target
    s_min, s_max = bounding_box(stroke)
    s_w, s_h = s_max["x"] - s_min["x"], s_max["y"] - s_min["y"]
    t_w, t_h = t_max["x"] - t_min["x"], t_max["y"] - t_min["y"]
    scale_x = 1.0 if s_w == 0 else (1.0 / s_w) * t_w
    scale_y = 1.0 if s_h == 0 else (1.0 / s_h) * t_h
    trans_x = t_min["x"] + 0.5 * t_w if s_w == 0 else t_min["x"]
    trans_y = t_min["y"] + 0.5 * t_h if s_h == 0 else t_min["y"]
    return [point((p["x"] - s_min["x"]) * scale_x + trans_x, (p["y"] - s_min["y"]) * scale_y + trans_y) for p in stroke]


def aspect_fit(
    source: tuple[dict[str, float], dict[str, float]], target: tuple[dict[str, float], dict[str, float]]
) -> tuple[dict[str, float], dict[str, float]]:
    s_min, s_max = source
    t_min, t_max = target
    s_w, s_h = s_max["x"] - s_min["x"], s_max["y"] - s_min["y"]
    t_w, t_h = t_max["x"] - t_min["x"], t_max["y"] - t_min["y"]
    if s_w == 0 and s_h == 0:
        center = scale(0.5, add(t_min, t_max))
        return (center, center)
    if s_w == 0:
        scale_factor = t_h / s_h if s_h != 0 else 1.0
        source_wider = False
    elif s_h == 0:
        scale_factor = t_w / s_w
        source_wider = True
    else:
        source_wider = (s_w / s_h) > (t_w / t_h if t_h != 0 else 1.0)
        scale_factor = (t_w / s_w) if source_wider else (t_h / s_h)
    offset = point(0, (t_h - scale_factor * s_h) / 2) if source_wider else point((t_w - scale_factor * s_w) / 2, 0)

    def reposition(p: dict[str, float]) -> dict[str, float]:
        return add(add(scale(scale_factor, sub(p, s_min)), offset), t_min)

    return (reposition(s_min), reposition(s_max))


def aspect_refit(
    target: tuple[dict[str, float], dict[str, float]], stroke: list[dict[str, float]]
) -> list[dict[str, float]]:
    if not stroke:
        return []
    return refit(aspect_fit(bounding_box(stroke), target), stroke)


EPSILON = 1e-10


def unduplicate(stroke: list[dict[str, float]]) -> list[dict[str, float]]:
    if len(stroke) < 2:
        return list(stroke)
    res = [stroke[0]]
    for p in stroke[1:]:
        if norm(sub(p, res[-1])) >= EPSILON:
            res.append(p)
    return res


def smooth(stroke: list[dict[str, float]]) -> list[dict[str, float]]:
    if len(stroke) < 3:
        return list(stroke)
    res = [stroke[0]]
    for i in range(len(stroke) - 2):
        res.append(scale(1 / 3, add(add(stroke[i], stroke[i + 1]), stroke[i + 2])))
    res.append(stroke[-1])
    return res


def redistribute_by_distance(dist: float, stroke: list[dict[str, float]]) -> list[dict[str, float]]:
    if len(stroke) < 2:
        return list(stroke)
    res = [stroke[0]]
    left = dist
    curr = stroke[0]
    rest = stroke[1:]
    nxt = rest[0]
    while rest:
        direction = sub(nxt, curr)
        seg_len = norm(direction)
        if seg_len < left:
            curr = nxt
            rest = rest[1:]
            if rest:
                nxt = rest[0]
            left -= seg_len
        else:
            inserted = add(curr, scale(left / seg_len, direction))
            res.append(inserted)
            curr = inserted
            left = dist
    if stroke[-1] != res[-1] and norm(sub(res[-1], stroke[-1])) >= EPSILON:
        res.append(stroke[-1])
    return res


def redistribute(count: int, stroke: list[dict[str, float]]) -> list[dict[str, float]]:
    if not stroke:
        return []
    if len(stroke) == 1:
        return list(stroke)
    if count == 0:
        return []
    if count == 1:
        return [stroke[0]]
    slen = stroke_length(stroke)
    if slen == 0:
        return [stroke[0]] * count
    return redistribute_by_distance(slen / (count - 1), stroke)


def turn_angle(a: dict[str, float], b: dict[str, float], c: dict[str, float]) -> float:
    v, w = sub(b, a), sub(c, b)
    denom = norm(v) * norm(w)
    if denom == 0:
        return 0.0
    return math.acos(max(-1.0, min(1.0, dot(v, w) / denom)))


def dominant(angle: float, stroke: list[dict[str, float]]) -> list[dict[str, float]]:
    if len(stroke) < 3:
        return list(stroke)
    res = [stroke[0]]
    curr, middle = stroke[0], stroke[1]
    for i in range(2, len(stroke)):
        nxt = stroke[i]
        if turn_angle(curr, middle, nxt) >= angle:
            res.append(middle)
            curr = middle
        middle = nxt
    res.append(middle)
    return res


LEGACY_DOMINANT_ALPHA = (2 * math.pi * 15) / 360


def preprocess_legacy(strokes: list[list[dict[str, float]]]) -> list[list[dict[str, float]]]:
    res = []
    for stroke in strokes[:10]:
        s1 = unduplicate(stroke)
        s2 = smooth(s1)
        s3 = aspect_refit((point(0, 0), point(1, 1)), s2)
        s4 = redistribute(10, s3)
        s5 = unduplicate(s4)
        s6 = dominant(LEGACY_DOMINANT_ALPHA, s5)
        res.append(s6)
    return res


def main():
    root_dir = Path(__file__).resolve().parents[1]
    out_dir = root_dir / "static" / "vendor" / "detexify"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "detexify-dataset.json"

    # This is intentionally a one-way pipeline.  The auditor reads the complete
    # Detexify source, then this builder consumes that resulting whitelist.
    valid_ids_path = root_dir / "scripts" / "mathjax_valid_symbols.json"
    if not valid_ids_path.exists():
        print(f"Error: {valid_ids_path} does not exist. Run node scripts/verify_all_detexify_symbols.js first.")
        return
    valid_symbol_ids = set(json.loads(valid_ids_path.read_text(encoding="utf-8")))
    print(f"Loaded {len(valid_symbol_ids)} MathJax-verified symbol IDs from {valid_ids_path}")

    print("Fetching detexify-next symbols.json & snapshot.json...")
    url_sym = "https://raw.githubusercontent.com/kirel/detexify-next/main/apps/web/public/data/symbols.json"
    url_snap = "https://raw.githubusercontent.com/kirel/detexify-next/main/apps/web/public/data/snapshot.json"

    req_sym = urllib.request.Request(url_sym, headers={"User-Agent": "Python"})
    sym_data = json.loads(urllib.request.urlopen(req_sym).read().decode("utf-8"))

    req_snap = urllib.request.Request(url_snap, headers={"User-Agent": "Python"})
    snap_data = json.loads(urllib.request.urlopen(req_snap).read().decode("utf-8"))

    symbol_map = {}

    for item in sym_data:
        sid = item["id"]
        # Keep only commands that the strict MathJax audit verified in direct
        # math mode. Text-only commands deliberately stay out of handwriting
        # candidates, as they cannot be inserted directly into a formula.
        if sid not in valid_symbol_ids or not item.get("mathmode"):
            continue

        cmd = (item.get("command") or "").strip()
        pkg = (item.get("package") or "").strip()
        symbol_map[sid] = {
            "command": cmd,
            "package": pkg,
            "mode": "math",
        }

    print(f"Filtered dataset down to {len(symbol_map)} strict MathJax direct-math symbols.")

    dataset = []
    total_samples_count = 0

    print(f"Preprocessing {len(symbol_map)} symbols...")
    for sid, meta in symbol_map.items():
        samples = snap_data.get(sid, [])
        processed_samples = []
        for sample in samples:
            strokes = sample["strokes"]
            prep = preprocess_legacy(strokes)
            flat = []
            for st in prep:
                for p in st:
                    flat.append(round(p["x"], 4))
                    flat.append(round(p["y"], 4))
            if flat:
                processed_samples.append(flat)
        if processed_samples:
            entry = {
                "id": sid,
                "cmd": meta["command"],
                "pkg": meta["package"],
                "mode": meta["mode"],
                "samples": processed_samples,
            }
            dataset.append(entry)
            total_samples_count += len(processed_samples)

    out_path.write_text(json.dumps(dataset, separators=(",", ":")), encoding="utf-8")
    print(
        f"Saved {len(dataset)} strict MathJax direct-math symbols ({total_samples_count} preprocessed samples) to {out_path} ({out_path.stat().st_size / 1024 / 1024:.2f} MB)"
    )


if __name__ == "__main__":
    main()
