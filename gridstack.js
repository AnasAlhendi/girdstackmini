;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.GridStack = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function toNumberMaybe(v) {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  }

  function parseSize(v) {
    if (typeof v === 'number') return { n: v, u: 'px' };
    if (typeof v !== 'string' || v.trim() === '') return { n: 0, u: 'px' };
    const m = v.trim().match(/^(-?[0-9]+(?:\.[0-9]+)?)([a-z%]*)$/i);
    if (!m) return { n: 0, u: 'px' };
    return { n: parseFloat(m[1]), u: m[2] || 'px' };
  }

  function createStyle(nonce) {
    const style = document.createElement('style');
    style.type = 'text/css';
    if (nonce) style.nonce = nonce;
    document.head.appendChild(style);
    return style;
  }

  function normalizeBottomBar(v) {
    if (!v) return null;
    if (v === true) return { columns: 4, rows: 1, cellHeight: 80, margin: 0, lineHeight: 8, color: '#000' };
    if (typeof v === 'object') {
      const cols = toNumberMaybe(v.columns) || 4;
      const rows = toNumberMaybe(v.rows) || 1;
      const ch = parseSize(v.cellHeight || 80);
      const mg = parseSize(v.margin || 0);
      const lh = toNumberMaybe(v.lineHeight);
      return {
        columns: cols,
        rows: rows,
        cellHeight: ch.n,
        cellHeightUnit: ch.u || 'px',
        margin: (typeof v.margin === 'string') ? v.margin : (mg.n + (mg.u || 'px')),
        lineHeight: (lh && lh > 0) ? lh : 8,
        color: v.color || '#000',
      };
    }
    return null;
  }

  // convert a numeric size + optional unit to pixels
  function toPxValue(n, u) {
    const unit = u || 'px';
    if (unit === 'px') return n || 0;
    const t = document.createElement('div');
    t.style.position = 'absolute';
    t.style.visibility = 'hidden';
    t.style.height = (n + unit);
    document.body.appendChild(t);
    const px = t.getBoundingClientRect().height || 0;
    t.remove();
    return px || 0;
  }

  function ensureContentWrapper(el) {
    const content = el.querySelector && el.querySelector('.grid-stack-item-content');
    if (content) return content;
    if (el.dataset && el.dataset.gsNowrap === 'true') return null;
    // Skip wrapping for button-as-item to keep valid HTML
    if (el.tagName && el.tagName.toLowerCase() === 'button') return null;
    const wrap = document.createElement('div');
    wrap.className = 'grid-stack-item-content';
    while (el.firstChild) wrap.appendChild(el.firstChild);
    el.appendChild(wrap);
    return wrap;
  }

  class GridStack {
    constructor(container, opts) {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) throw new Error('GridStack: container not found');

      // defaults
      const d = {
        columns: 12,        // عدد الأعمدة
        rows: undefined,    // max rows (container height)
        margin: 0,          // padding inside item content
        cellHeight: 80,     // row height in px (or CSS size)
        nonce: undefined,
        bottomBar: undefined,
      };
      opts = Object.assign({}, d, opts || {});

      this.el = el;
      this.columns = toNumberMaybe(opts.columns) || 12;
      this.rows = toNumberMaybe(opts.rows);
      const ch = parseSize(opts.cellHeight);
      this.cellHeightValue = ch.n;
      this.cellHeightUnit = ch.u; // currently only px is used for layout math
      const mg = parseSize(opts.margin);
      this.margin = (typeof opts.margin === 'string') ? opts.margin : (mg.n + (mg.u || 'px'));
      this.nonce = opts.nonce;
      this.bottomBarCfg = normalizeBottomBar(opts.bottomBar);
      this._items = [];

      // base CSS
      this.styleEl = createStyle(this.nonce);
      this.styleEl.appendChild(document.createTextNode(
        [
          '.grid-stack{position:relative; overflow:visible;}',
          '.grid-stack-item{position:absolute;box-sizing:border-box;display:block;z-index:9999;}',
          '.grid-stack-item-content{width:100%;height:100%;box-sizing:border-box;}',
          '.grid-stack-bottom-bar{position:absolute;left:0;right:0;bottom:0;width:100%;}',
          '.grid-stack-bottom-content{position:absolute;left:0;right:0;top:0;}',
          '.grid-stack-bottom-line{position:absolute;left:0;right:0;top:0;pointer-events:none;}',
        ].join('\n')
      ));

      if (!this.el.classList.contains('grid-stack')) this.el.classList.add('grid-stack');

      // Apply margin via inline style on each item content when laying out
      this._onResize = this.layout.bind(this);
      window.addEventListener('resize', this._onResize);

      // auto prepare existing children
      this._autoInitExisting();

      // optional bottom bar element
      this._ensureBottomBar();
      if (this.bottomBarCfg) {
        this.bottomGrid = new GridStack(this.bottomBarContentEl, {
          columns: this.bottomBarCfg.columns,
          rows: this.bottomBarCfg.rows,
          margin: this.bottomBarCfg.margin,
          cellHeight: (this.bottomBarCfg.cellHeight || 80) + (this.bottomBarCfg.cellHeightUnit || 'px'),
          nonce: this.nonce
        });
      }

      // initial layout
      this.layout();
    }

    static init(container, opts) { return new GridStack(container, opts); }

    destroy() {
      window.removeEventListener('resize', this._onResize);
      if (this.styleEl && this.styleEl.parentNode) this.styleEl.parentNode.removeChild(this.styleEl);
      if (this.bottomGrid && this.bottomGrid.destroy) this.bottomGrid.destroy();
      if (this.bottomBarEl && this.bottomBarEl.parentNode) this.bottomBarEl.parentNode.removeChild(this.bottomBarEl);
    }

    // resolve an input to the .grid-stack-item element within this grid
    _resolveItemEl(input) {
      let el = null;
      if (typeof input === 'string') {
        const q = this.el.querySelector(input);
        el = q || null;
      } else if (input instanceof Element) {
        el = input;
      }
      if (!el) return null;
      // if given inner element, climb to the item container
      if (!el.classList.contains('grid-stack-item')) {
        el = el.closest('.grid-stack-item');
      }
      if (!el || !this.el.contains(el)) return null;
      return el;
    }

    _autoInitExisting() {
      const nodes = Array.from(this.el.children).filter(c => c.classList.contains('grid-stack-item'));
      nodes.forEach(el => {
        ensureContentWrapper(el);
        const x = toNumberMaybe(el.getAttribute('gs-x')) || 0;
        const y = toNumberMaybe(el.getAttribute('gs-y')) || 0;
        const w = toNumberMaybe(el.getAttribute('gs-w')) || 1;
        const h = toNumberMaybe(el.getAttribute('gs-h')) || 1;
        this._items.push({ el, x, y, w, h });
      });
    }

    addWidget(elOrHtmlOrOpts, opts) {
      let el, conf;
      if (typeof elOrHtmlOrOpts === 'string') {
        const t = document.createElement('template');
        t.innerHTML = elOrHtmlOrOpts.trim();
        el = t.content.firstElementChild;
        if (el && !el.classList.contains('grid-stack-item')) {
          if (el.tagName && el.tagName.toLowerCase() === 'button') {
            el.classList.add('grid-stack-item');
            
          } else {
            const wrap = document.createElement('div');
            wrap.className = 'grid-stack-item';
            wrap.appendChild(el);
            el = wrap;
          }
        }
        conf = opts || {};
      } else if (elOrHtmlOrOpts instanceof Element) {
        el = elOrHtmlOrOpts;
        if (el.tagName && el.tagName.toLowerCase() === 'button') {
          if (!el.classList.contains('grid-stack-item')) el.classList.add('grid-stack-item');
          
        }
        conf = opts || {};
      } else {
        conf = elOrHtmlOrOpts || {};
        const content = conf.content != null ? String(conf.content) : '';
        const wrap = document.createElement('div');
        wrap.className = 'grid-stack-item';
        const inner = document.createElement('div');
        inner.className = 'grid-stack-item-content';
        inner.innerHTML = content;
        wrap.appendChild(inner);
        el = wrap;
      }

      ensureContentWrapper(el);
      if (el.parentNode !== this.el) this.el.appendChild(el);

      let w = toNumberMaybe(conf.w) || 1;
      let h = toNumberMaybe(conf.h) || 1;
      // clamp size
      if (this.columns && w > this.columns) w = this.columns;

      let x = toNumberMaybe(conf.x);
      let y = toNumberMaybe(conf.y);
      // auto-position if x or y are not provided
      if (x == null || y == null) {
        const pos = this._findEmptyPosition(w, h);
        if (!pos) return null; // cannot fit
        x = pos.x; y = pos.y;
      } else {
        // clamp to columns
        x = Math.max(0, x);
        y = Math.max(0, y);
        if (this.columns && x + w > this.columns) x = Math.max(0, this.columns - w);
        // if rows cap exists and would overflow, try to auto-place
        if (this.rows != null && y + h > this.rows) {
          const pos = this._findEmptyPosition(w, h);
          if (!pos) return null;
          x = pos.x; y = pos.y;
        }
        // avoid overlap; if overlaps, try auto-place
        if (!this._isAreaFree(x, y, w, h)) {
          const pos = this._findEmptyPosition(w, h);
          if (!pos) return null;
          x = pos.x; y = pos.y;
        }
      }

      el.setAttribute('gs-x', String(x));
      el.setAttribute('gs-y', String(y));
      el.setAttribute('gs-w', String(w));
      el.setAttribute('gs-h', String(h));

      const existing = this._items.find(i => i.el === el);
      if (existing) Object.assign(existing, { x, y, w, h });
      else this._items.push({ el, x, y, w, h });

      this.layout();
      return el;
    }

    // Add a widget to the bottom bar content area
    addBottomWidget(elOrHtmlOrOpts, opts) {
      if (!this.bottomGrid) return null;
      const el = this.bottomGrid.addWidget(elOrHtmlOrOpts, opts);
      this.layout();
      return el;
    }


    // Make the provided HTML element (from a string) the grid item itself.
    // Adds the `grid-stack-item` class to that element (no inner wrapper),
    // then places it using either opts object or positional x,y,w,h.
    // Examples:
    //   addWidgetHTML('<button>B</button>', {x:1,y:0,w:1,h:1})
    //   addWidgetHTML('<button>B</button>', 1, 0, 1, 1)
    addWidgetHTML(html, xOrOpts, y, w, h) {
      const tpl = document.createElement('template');
      tpl.innerHTML = (html || '').trim();
      const el = tpl.content.firstElementChild;
      if (!el) return null;
      if (!el.classList.contains('grid-stack-item')) el.classList.add('grid-stack-item');

      el.dataset.gsNowrap = 'true';
      let conf = { w: 1, h: 1 };
      if (typeof xOrOpts === 'object' && xOrOpts !== null) {
        conf = Object.assign(conf, xOrOpts);
      } else if (xOrOpts != null) {
        conf.x = toNumberMaybe(xOrOpts);
        conf.y = toNumberMaybe(y);
        conf.w = toNumberMaybe(w) || conf.w;
        conf.h = toNumberMaybe(h) || conf.h;
      }
      const gx = toNumberMaybe(el.getAttribute('gs-x'));
      const gy = toNumberMaybe(el.getAttribute('gs-y'));
      const gw = toNumberMaybe(el.getAttribute('gs-w'));
      const gh = toNumberMaybe(el.getAttribute('gs-h'));
      if (conf.x == null && gx != null) conf.x = gx;
      if (conf.y == null && gy != null) conf.y = gy;
      if (conf.w == null && gw != null) conf.w = gw;
      if (conf.h == null && gh != null) conf.h = gh;
      return this.addWidget(el, conf);
    }

    // Bottom bar: add element as item (no inner wrapper)
    addBottomWidgetHTML(html, xOrOpts, y, w, h) {
      if (!this.bottomGrid) return null;
      const el = this.bottomGrid.addWidgetHTML(html, xOrOpts, y, w, h);
      this.layout();
      return el;
    }

    // Update a bottom widget position/size
    updateBottomWidget(target, conf) {
      if (!this.bottomGrid) return false;
      const ok = this.bottomGrid.updateWidget(target, conf);
      this.layout();
      return ok;
    }

    // Remove a bottom widget
    removeBottomWidget(target) {
      if (!this.bottomGrid) return false;
      const ok = this.bottomGrid.removeWidget(target);
      this.layout();
      return ok;
    }

    // (compat aliases removed)

    // (removed) addButtonItem, makeItem

    // (removed) addElementAsItem

    // (removed) addWidgetHtml

    setColumns(n) {
      this.columns = Math.max(1, Number(n) || 12);
      this.layout();
    }

    setRows(n) {
      this.rows = toNumberMaybe(n);
      this.layout();
    }

    setCellHeight(v) {
      const p = parseSize(v);
      this.cellHeightValue = p.n;
      this.cellHeightUnit = p.u || 'px';
      this.layout();
    }

    setMargin(v) {
      const p = parseSize(v);
      this.margin = (typeof v === 'string') ? v : (p.n + (p.u || 'px'));
      this.layout();
    }

    layout() {
      const gap = this._gapPx();
      const cw = this._cellWidth(gap);
      const ch = this._cellHeight();
      // position each item
      this._items.forEach(n => this._applyItemLayout(n, cw, ch, gap));
      // container height includes gaps between rows
      const maxRow = this.rows != null ? this.rows : this._computedRows();
      let totalH = (maxRow * ch) + (Math.max(0, maxRow - 1) * gap);
      if (this.bottomBarCfg) {
        this._ensureBottomBar();
        const gapB = this._gapPxFrom(this.bottomBarCfg.margin || 0);
        const rowsB = Math.max(1, Number(this.bottomBarCfg.rows) || 1);
        const chB = toPxValue(this.bottomBarCfg.cellHeight || 80, this.bottomBarCfg.cellHeightUnit || 'px');
        const contentH = (rowsB * chB) + (Math.max(0, rowsB - 1) * gapB);
        const lineH = this.bottomBarCfg.lineHeight || 8;
        const barH = contentH + lineH;
        totalH += barH;

        // Size elements
        const barS = this.bottomBarEl.style;
        barS.height = barH + 'px';
        const contentS = this.bottomBarContentEl.style;
        contentS.height = contentH + 'px';
        contentS.top = lineH + 'px'; // place content below top line
        const lineS = this.bottomBarLineEl.style;
        lineS.height = lineH + 'px';
        lineS.top = '0px';
        lineS.background = this.bottomBarCfg.color || '#000';

        // ensure bottom grid is laid out
        if (this.bottomGrid) this.bottomGrid.layout();
      } else if (this.bottomBarEl) {
        this.bottomBarEl.style.height = '0px';
      }
      this.el.style.height = totalH + 'px';
    }

    // geometry helpers
    _intersects(a, b) {
      return !(a.y >= b.y + b.h || a.y + a.h <= b.y || a.x + a.w <= b.x || a.x >= b.x + b.w);
    }

    _isAreaFree(x, y, w, h) {
      const rect = { x, y, w, h };
      for (const it of this._items) {
        const r2 = { x: it.x, y: it.y, w: it.w, h: it.h };
        if (this._intersects(rect, r2)) return false;
      }
      return true;
    }

    _findEmptyPosition(w, h) {
      const cols = Math.max(1, this.columns || 12);
      const maxY = (this.rows != null) ? Math.max(0, this.rows - h) : (this._computedRows() + 200);
      for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x + w <= cols; x++) {
          if (this._isAreaFree(x, y, w, h)) return { x, y };
        }
      }
      return null;
    }

    // Remove a widget by element or selector. Returns true if removed.
    removeWidget(target) {
      const el = this._resolveItemEl(target);
      if (!el) return false;
      const idx = this._items.findIndex(i => i.el === el);
      if (idx === -1) return false;
      this._items.splice(idx, 1);
      if (el.parentNode === this.el) el.parentNode.removeChild(el);
      this.layout();
      return true;
    }

    // Update a widget position/size.
    updateWidget(target, conf) {
      const el = this._resolveItemEl(target);
      if (!el) return false;
      const item = this._items.find(i => i.el === el);
      if (!item) return false;
      const next = Object.assign({}, item);
      if (conf && typeof conf === 'object') {
        if (conf.x != null) next.x = Math.max(0, Number(conf.x) || 0);
        if (conf.y != null) next.y = Math.max(0, Number(conf.y) || 0);
        if (conf.w != null) next.w = Math.max(1, Number(conf.w) || 1);
        if (conf.h != null) next.h = Math.max(1, Number(conf.h) || 1);
      }
      // keep within columns when possible
      if (this.columns && next.w > this.columns) next.w = this.columns;
      if (this.columns && next.x + next.w > this.columns) next.x = Math.max(0, this.columns - next.w);

      // write back
      Object.assign(item, next);
      el.setAttribute('gs-x', String(item.x));
      el.setAttribute('gs-y', String(item.y));
      el.setAttribute('gs-w', String(item.w));
      el.setAttribute('gs-h', String(item.h));
      this.layout();
      return true;
    }

    _applyItemLayout(n, cw, ch, gap) {
      const left = n.x * (cw + gap);
      const top = n.y * (ch + gap);
      const width = (n.w * cw) + (Math.max(0, n.w - 1) * gap);
      const height = (n.h * ch) + (Math.max(0, n.h - 1) * gap);
      const s = n.el.style;
      s.left = left + 'px';
      s.top = top + 'px';
      s.width = width + 'px';
      s.height = height + 'px';
      const content = n.el.querySelector('.grid-stack-item-content');
      if (content) content.style.padding = '0px'; else n.el.style.padding = '0px';
    }

    _cellWidth(gapPx) {
      const w = this.el.clientWidth || this.el.getBoundingClientRect().width || 0;
      const cols = Math.max(1, this.columns || 12);
      const totalGap = Math.max(0, cols - 1) * (gapPx || 0);
      const avail = Math.max(0, w - totalGap);
      return Math.floor(avail / cols);
    }

    _cellHeight() {
      return toPxValue(this.cellHeightValue, this.cellHeightUnit);
    }

  _computedRows() {
      let max = 0;
      this._items.forEach(n => { max = Math.max(max, n.y + n.h); });
      return max;
    }

    _gapPx() {
      const p = parseSize(this.margin);
      return toPxValue(p.n, p.u || 'px');
    }

    _gapPxFrom(v) {
      const p = parseSize(v);
      return toPxValue(p.n, p.u || 'px');
    }

    _ensureBottomBar() {
      if (!this.bottomBarCfg) return;
      if (!this.bottomBarEl) {
        const bar = document.createElement('div');
        bar.className = 'grid-stack-bottom-bar';
        const content = document.createElement('div');
        content.className = 'grid-stack-bottom-content';
        const line = document.createElement('div');
        line.className = 'grid-stack-bottom-line';
        bar.appendChild(content);
        bar.appendChild(line);
        this.el.appendChild(bar);
        this.bottomBarEl = bar;
        this.bottomBarContentEl = content;
        this.bottomBarLineEl = line;
      }
    }

    // bottom-specific geometry handled by bottomGrid
    
  }

  return GridStack;
});

