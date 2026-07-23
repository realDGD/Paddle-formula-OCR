(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DetexifyClassifier = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPSILON = 1e-10;
  const LEGACY_DOMINANT_ALPHA = (2 * Math.PI * 15) / 360;

  function point(x, y) {
    return { x: Number(x), y: Number(y) };
  }
  function sub(a, b) {
    return point(a.x - b.x, a.y - b.y);
  }
  function add(a, b) {
    return point(a.x + b.x, a.y + b.y);
  }
  function scale(s, p) {
    return point(s * p.x, s * p.y);
  }
  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }
  function norm(p) {
    return Math.sqrt(dot(p, p));
  }
  function manhattan(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  function strokeLength(stroke) {
    let total = 0;
    for (let i = 1; i < stroke.length; i++) {
      total += norm(sub(stroke[i], stroke[i - 1]));
    }
    return total;
  }

  function boundingBox(stroke) {
    let minX = stroke[0].x, minY = stroke[0].y;
    let maxX = minX, maxY = minY;
    for (let i = 1; i < stroke.length; i++) {
      const p = stroke[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return [point(minX, minY), point(maxX, maxY)];
  }

  function refit(target, stroke) {
    if (!stroke || !stroke.length) return [];
    const [tMin, tMax] = target;
    const [sMin, sMax] = boundingBox(stroke);
    const sW = sMax.x - sMin.x, sH = sMax.y - sMin.y;
    const tW = tMax.x - tMin.x, tH = tMax.y - tMin.y;
    const scaleX = sW === 0 ? 1 : (1 / sW) * tW;
    const scaleY = sH === 0 ? 1 : (1 / sH) * tH;
    const transX = sW === 0 ? tMin.x + 0.5 * tW : tMin.x;
    const transY = sH === 0 ? tMin.y + 0.5 * tH : tMin.y;
    return stroke.map((p) => point((p.x - sMin.x) * scaleX + transX, (p.y - sMin.y) * scaleY + transY));
  }

  function aspectFit(source, target) {
    const [sMin, sMax] = source;
    const [tMin, tMax] = target;
    const sW = sMax.x - sMin.x, sH = sMax.y - sMin.y;
    const tW = tMax.x - tMin.x, tH = tMax.y - tMin.y;
    if (sW === 0 && sH === 0) {
      const center = scale(0.5, add(tMin, tMax));
      return [center, center];
    }
    let scaleFactor, sourceWider;
    if (sW === 0) {
      scaleFactor = sH !== 0 ? tH / sH : 1;
      sourceWider = false;
    } else if (sH === 0) {
      scaleFactor = tW / sW;
      sourceWider = true;
    } else {
      sourceWider = (sW / sH) > (tH !== 0 ? tW / tH : 1);
      scaleFactor = sourceWider ? tW / sW : tH / sH;
    }
    const offset = sourceWider
      ? point(0, (tH - scaleFactor * sH) / 2)
      : point((tW - scaleFactor * sW) / 2, 0);
    const reposition = (p) => add(add(scale(scaleFactor, sub(p, sMin)), offset), tMin);
    return [reposition(sMin), reposition(sMax)];
  }

  function aspectRefit(target, stroke) {
    if (!stroke || !stroke.length) return [];
    return refit(aspectFit(boundingBox(stroke), target), stroke);
  }

  function unduplicate(stroke) {
    if (stroke.length < 2) return [...stroke];
    const res = [stroke[0]];
    for (let i = 1; i < stroke.length; i++) {
      if (norm(sub(stroke[i], res[res.length - 1])) >= EPSILON) {
        res.push(stroke[i]);
      }
    }
    return res;
  }

  function smooth(stroke) {
    if (stroke.length < 3) return [...stroke];
    const res = [stroke[0]];
    for (let i = 0; i + 2 < stroke.length; i++) {
      res.push(scale(1 / 3, add(add(stroke[i], stroke[i + 1]), stroke[i + 2])));
    }
    res.push(stroke[stroke.length - 1]);
    return res;
  }

  function redistributeByDistance(dist, stroke) {
    if (stroke.length < 2) return [...stroke];
    const res = [stroke[0]];
    let left = dist;
    let curr = stroke[0];
    let rest = stroke.slice(1);
    let nxt = rest[0];

    while (rest.length > 0) {
      const direction = sub(nxt, curr);
      const segLen = norm(direction);
      if (segLen < left) {
        curr = nxt;
        rest = rest.slice(1);
        if (rest.length > 0) nxt = rest[0];
        left -= segLen;
      } else {
        const inserted = add(curr, scale(left / segLen, direction));
        res.push(inserted);
        curr = inserted;
        left = dist;
      }
    }
    const last = stroke[stroke.length - 1];
    if (last && res[res.length - 1] !== last && norm(sub(res[res.length - 1], last)) >= EPSILON) {
      res.push(last);
    }
    return res;
  }

  function redistribute(count, stroke) {
    if (!stroke || !stroke.length) return [];
    if (stroke.length === 1) return [...stroke];
    if (count === 0) return [];
    if (count === 1) return [stroke[0]];
    const slen = strokeLength(stroke);
    if (slen === 0) return Array(count).fill(stroke[0]);
    return redistributeByDistance(slen / (count - 1), stroke);
  }

  function turnAngle(a, b, c) {
    const v = sub(b, a);
    const w = sub(c, b);
    const denom = norm(v) * norm(w);
    if (denom === 0) return 0;
    const val = Math.max(-1, Math.min(1, dot(v, w) / denom));
    return Math.acos(val);
  }

  function dominant(angle, stroke) {
    if (stroke.length < 3) return [...stroke];
    const res = [stroke[0]];
    let curr = stroke[0];
    let middle = stroke[1];

    for (let i = 2; i < stroke.length; i++) {
      const nxt = stroke[i];
      if (turnAngle(curr, middle, nxt) >= angle) {
        res.push(middle);
        curr = middle;
      }
      middle = nxt;
    }
    res.push(middle);
    return res;
  }

  function preprocessLegacy(strokes) {
    const targetRect = [point(0, 0), point(1, 1)];
    return strokes.slice(0, 10).map((stroke) => {
      const s1 = unduplicate(stroke);
      const s2 = smooth(s1);
      const s3 = aspectRefit(targetRect, s2);
      const s4 = redistribute(10, s3);
      const s5 = unduplicate(s4);
      return dominant(LEGACY_DOMINANT_ALPHA, s5);
    });
  }

  function flattenPoints(preprocessedStrokes) {
    const flat = [];
    for (const stroke of preprocessedStrokes) {
      for (const p of stroke) {
        flat.push(p.x, p.y);
      }
    }
    return flat;
  }

  function greedyDtw(first, second) {
    const n1 = first.length >> 1;
    const n2 = second.length >> 1;
    if (n1 === 0 || n2 === 0) return 999;

    let s = first;
    let o = second;
    let sCount = n1;
    let oCount = n2;

    let sIndex = 0;
    let oIndex = 0;
    let result = manhattan(s[0], s[1], o[0], o[1]);
    let pathLength = 1;

    while (sCount - sIndex > 1 && oCount - oIndex > 1) {
      const left = manhattan(s[(sIndex + 1) << 1], s[((sIndex + 1) << 1) + 1], o[oIndex << 1], o[(oIndex << 1) + 1]);
      const middle = manhattan(s[(sIndex + 1) << 1], s[((sIndex + 1) << 1) + 1], o[(oIndex + 1) << 1], o[((oIndex + 1) << 1) + 1]);
      const right = manhattan(s[sIndex << 1], s[(sIndex << 1) + 1], o[(oIndex + 1) << 1], o[((oIndex + 1) << 1) + 1]);
      const minVal = Math.min(left, middle, right);

      if (left === minVal) {
        sIndex += 1;
        result += left;
      } else if (middle === minVal) {
        sIndex += 1;
        oIndex += 1;
        result += middle;
      } else {
        oIndex += 1;
        result += right;
      }
      pathLength += 1;
    }

    if (oCount - oIndex === 1) {
      const tmp = o;
      const tmpIndex = oIndex;
      const tmpCount = oCount;

      o = s;
      oIndex = sIndex;
      oCount = sCount;

      s = tmp;
      sIndex = tmpIndex;
      sCount = tmpCount;
    }

    for (let i = oIndex + 1; i < oCount; i += 1) {
      result += manhattan(s[sIndex << 1], s[(sIndex << 1) + 1], o[i << 1], o[(i << 1) + 1]);
      pathLength += 1;
    }

    return result / pathLength;
  }

  function classify(strokes, dataset, limit = 12, meanNearest = 2) {
    if (!strokes || !strokes.length) return [];
    const preprocessed = preprocessLegacy(strokes);
    const queryFlat = flattenPoints(preprocessed);
    if (!queryFlat.length) return [];

    const scored = [];
    for (let i = 0; i < dataset.length; i++) {
      const item = dataset[i];
      const samples = item.samples;
      if (!samples || !samples.length) continue;

      const distances = [];
      for (let j = 0; j < samples.length; j++) {
        distances.push(greedyDtw(queryFlat, samples[j]));
      }
      distances.sort((a, b) => a - b);
      const topK = distances.slice(0, Math.min(meanNearest, distances.length));
      const score = topK.reduce((a, b) => a + b, 0) / topK.length;
      scored.push({ item, score });
    }

    scored.sort((a, b) => a.score - b.score);

    const seenCmds = new Set();
    const results = [];

    for (const entry of scored) {
      const cmd = entry.item.cmd;
      if (seenCmds.has(cmd)) continue;
      seenCmds.add(cmd);
      results.push(entry);
      if (results.length >= limit) break;
    }

    return results;
  }

  return {
    preprocessLegacy,
    flattenPoints,
    greedyDtw,
    classify,
  };
}));
