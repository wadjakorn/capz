// Ground truth from the DOM: every visible grapheme's rect, grouped into
// visual line fragments. Installed as window.__gt; all coordinates are CSS px
// in the page (viewport) space. render.py converts them to image pixels.
(() => {
  const seg = new Intl.Segmenter("th", { granularity: "grapheme" });

  const ignored = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest("[data-gt-ignore],script,style,head"));
  };

  const inside = (r, R, tol) =>
    r.left >= R.x - tol && r.top >= R.y - tol && r.right <= R.x + R.w + tol && r.bottom <= R.y + R.h + tol;
  const intersects = (r, R) => r.right > R.x && r.left < R.x + R.w && r.bottom > R.y && r.top < R.y + R.h;

  // Hide (visibility:hidden keeps layout) every text element the capture
  // region R cuts, so no half-visible text ever reaches the image or the GT.
  // Measured on the text runs themselves (a Range per text node), not the
  // element box: text can overflow its box (white-space:pre, long words).
  function prune(R) {
    const range = document.createRange();
    const cut = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.data.trim() || ignored(n)) continue;
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      // only a run that straddles R's edge is half-visible; runs wholly outside never reach the image
      if (rects.some((r) => intersects(r, R) && !inside(r, R, 0.5))) {
        cut.add(n.parentElement);
      }
    }
    for (const el of cut) el.style.visibility = "hidden";
    return cut.size;
  }

  function extract(R) {
    const frags = [];
    let cur = null;
    const range = document.createRange();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (ignored(n) || !n.data) continue;
      const el = n.parentElement;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      for (const { segment, index } of seg.segment(n.data)) {
        if (/^\s+$/.test(segment)) {
          if (cur) cur.pendingSpace = true;
          continue;
        }
        range.setStart(n, index);
        range.setEnd(n, index + segment.length);
        const rs = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
        if (!rs.length) { if (cur) cur.text += segment; continue; }
        const r = rs[0];
        const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        if (cx < R.x || cx > R.x + R.w || cy < R.y || cy > R.y + R.h) { cur = null; continue; }
        let join = false;
        if (cur) {
          const ov = Math.min(cur.b, r.bottom) - Math.max(cur.t, r.top);
          const gap = r.left - cur.r;
          join = ov >= 0.5 * Math.min(cur.b - cur.t, r.height) && gap < 0.6 * fs && r.left >= cur.l - 2;
        }
        if (join) {
          cur.text += (cur.pendingSpace ? " " : "") + segment;
          cur.l = Math.min(cur.l, r.left); cur.t = Math.min(cur.t, r.top);
          cur.r = Math.max(cur.r, r.right); cur.b = Math.max(cur.b, r.bottom);
        } else {
          cur = { text: segment, l: r.left, t: r.top, r: r.right, b: r.bottom };
          frags.push(cur);
        }
        cur.pendingSpace = false;
      }
    }
    return frags.map((f) => ({ text: f.text, box: [f.l, f.t, f.r - f.l, f.b - f.t] }));
  }

  // Ignored elements inherit colour; pin it inline so the transparent-text
  // pass (which only targets non-ignored elements) can't reach them.
  function freezeIgnored() {
    for (const el of document.querySelectorAll("[data-gt-ignore]")) {
      const cs = getComputedStyle(el);
      el.style.color = cs.color;
      el.style.webkitTextFillColor = cs.webkitTextFillColor;
    }
  }

  window.__gt = { prune, extract, freezeIgnored };
})();
