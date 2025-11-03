// Minimal TypeScript port of gridstack.js
function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
function assignShallow(target, src) {
    for (const k in src) {
        if (hasOwn(src, k))
            target[k] = src[k];
    }
    return target;
}
function mergeShallow(a, b) {
    return assignShallow(assignShallow({}, a), b);
}
function toNumberMaybe(v) {
    if (v == null || v === '')
        return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
}
function parseSize(v) {
    if (typeof v === 'number')
        return { n: v, u: 'px' };
    if (typeof v !== 'string' || v.trim() === '')
        return { n: 0, u: 'px' };
    const m = v.trim().match(/^(-?[0-9]+(?:\.[0-9]+)?)([a-z%]*)$/i);
    if (!m)
        return { n: 0, u: 'px' };
    return { n: parseFloat(m[1]), u: m[2] || 'px' };
}
function createStyle() {
    const style = document.createElement('style');
    style.type = 'text/css';
    document.head.appendChild(style);
    return style;
}
function normalizeBottomBar(v) {
    var _a, _b, _c, _d;
    if (!v)
        return null;
    if (v === true) {
        return { columns: 4, rows: 1, cellHeight: 80, margin: '0px', lineHeight: 8, color: '#000' };
    }
    if (typeof v === 'object') {
        const cols = (_a = toNumberMaybe(v.columns)) !== null && _a !== void 0 ? _a : 4;
        const rows = (_b = toNumberMaybe(v.rows)) !== null && _b !== void 0 ? _b : 1;
        const ch = parseSize((_c = v.cellHeight) !== null && _c !== void 0 ? _c : 80);
        const mg = parseSize((_d = v.margin) !== null && _d !== void 0 ? _d : 0);
        const lhNum = toNumberMaybe(v.lineHeight);
        return {
            columns: cols,
            rows,
            cellHeight: ch.n,
            cellHeightUnit: ch.u || 'px',
            margin: typeof v.margin === 'string' ? v.margin : `${mg.n}${mg.u || 'px'}`,
            lineHeight: lhNum && lhNum > 0 ? lhNum : 8,
            color: v.color || '#000',
        };
    }
    return null;
}
function toPxValue(n, u) {
    const unit = u || 'px';
    if (unit === 'px')
        return n || 0;
    const t = document.createElement('div');
    t.style.position = 'absolute';
    t.style.visibility = 'hidden';
    t.style.height = `${n}${unit}`;
    document.body.appendChild(t);
    const px = t.getBoundingClientRect().height || 0;
    t.remove();
    return px || 0;
}
function ensureContentWrapper(el) {
    const content = el.querySelector('.grid-stack-item-content');
    if (content)
        return content;
    if (el.dataset && el.dataset.gsNowrap === 'true')
        return null;
    if (el.tagName && el.tagName.toLowerCase() === 'button')
        return null;
    const wrap = document.createElement('div');
    wrap.className = 'grid-stack-item-content';
    while (el.firstChild)
        wrap.appendChild(el.firstChild);
    el.appendChild(wrap);
    return wrap;
}
export class GridStack {
    constructor(container, opts = {}) {
        this._items = [];
        this.styleEl = null;
        this._onResize = null;
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el)
            throw new Error('GridStack: container not found');
        const d = {
            columns: 12,
            rows: undefined,
            margin: 0,
            cellHeight: 80,
            bottomBar: undefined,
        };
        opts = mergeShallow(d, opts);
        this.el = el;
        this.columns = toNumberMaybe(opts.columns) || 12;
        this.rows = toNumberMaybe(opts.rows);
        const ch = parseSize(opts.cellHeight);
        this.cellHeightValue = ch.n;
        this.cellHeightUnit = ch.u || 'px';
        const mg = parseSize(opts.margin);
        this.margin = typeof opts.margin === 'string' ? opts.margin : `${mg.n}${mg.u || 'px'}`;
        this.bottomBarCfg = normalizeBottomBar(opts.bottomBar);
        this.styleEl = createStyle();
        this.styleEl.appendChild(document.createTextNode([
            '.grid-stack{position:relative; overflow:visible;}',
            '.grid-stack-item{position:absolute;box-sizing:border-box;display:block;z-index:9999;}',
            '.grid-stack-item-content{width:100%;height:100%;box-sizing:border-box;}',
            '.grid-stack-bottom-bar{position:absolute;left:0;right:0;bottom:0;width:100%;}',
            '.grid-stack-bottom-content{position:absolute;left:0;right:0;top:0;}',
            '.grid-stack-bottom-line{position:absolute;left:0;right:0;top:0;pointer-events:none;}',
        ].join('\n')));
        if (!this.el.classList.contains('grid-stack'))
            this.el.classList.add('grid-stack');
        this._onResize = this.layout.bind(this);
        window.addEventListener('resize', this._onResize);
        this._autoInitExisting();
        this._ensureBottomBar();
        if (this.bottomBarCfg) {
            this.bottomGrid = new GridStack(this.bottomBarContentEl, {
                columns: this.bottomBarCfg.columns,
                rows: this.bottomBarCfg.rows,
                margin: this.bottomBarCfg.margin,
                cellHeight: `${this.bottomBarCfg.cellHeight}${this.bottomBarCfg.cellHeightUnit || 'px'}`,
            });
        }
        this.layout();
    }
    destroy() {
        if (this._onResize)
            window.removeEventListener('resize', this._onResize);
        if (this.styleEl && this.styleEl.parentNode)
            this.styleEl.parentNode.removeChild(this.styleEl);
        if (this.bottomGrid && this.bottomGrid.destroy)
            this.bottomGrid.destroy();
        if (this.bottomBarEl && this.bottomBarEl.parentNode)
            this.bottomBarEl.parentNode.removeChild(this.bottomBarEl);
    }
    _resolveItemEl(input) {
        let el = null;
        if (typeof input === 'string') {
            el = this.el.querySelector(input);
        }
        else if (input instanceof Element) {
            el = input;
        }
        if (!el)
            return null;
        if (!el.classList.contains('grid-stack-item')) {
            el = el.closest('.grid-stack-item');
        }
        if (!el || !this.el.contains(el))
            return null;
        return el;
    }
    _autoInitExisting() {
        const nodes = Array.from(this.el.children).filter((c) => c.classList.contains('grid-stack-item'));
        nodes.forEach((el) => {
            ensureContentWrapper(el);
            const x = toNumberMaybe(el.getAttribute('gs-x')) || 0;
            const y = toNumberMaybe(el.getAttribute('gs-y')) || 0;
            const w = toNumberMaybe(el.getAttribute('gs-w')) || 1;
            const h = toNumberMaybe(el.getAttribute('gs-h')) || 1;
            this._items.push({ el, x, y, w, h });
        });
    }
    addWidget(elOrHtmlOrOpts, opts) {
        let el = null;
        let conf = {};
        if (typeof elOrHtmlOrOpts === 'string') {
            const t = document.createElement('template');
            t.innerHTML = elOrHtmlOrOpts.trim();
            el = t.content.firstElementChild;
            if (el && !el.classList.contains('grid-stack-item')) {
                if (el.tagName && el.tagName.toLowerCase() === 'button') {
                    el.classList.add('grid-stack-item');
                }
                else {
                    const wrap = document.createElement('div');
                    wrap.className = 'grid-stack-item';
                    wrap.appendChild(el);
                    el = wrap;
                }
            }
            conf = opts || {};
        }
        else if (elOrHtmlOrOpts instanceof Element) {
            el = elOrHtmlOrOpts;
            if (el.tagName && el.tagName.toLowerCase() === 'button') {
                if (!el.classList.contains('grid-stack-item'))
                    el.classList.add('grid-stack-item');
            }
            conf = opts || {};
        }
        else {
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
        if (!el)
            return null;
        ensureContentWrapper(el);
        if (el.parentNode !== this.el)
            this.el.appendChild(el);
        let w = toNumberMaybe(conf.w) || 1;
        let h = toNumberMaybe(conf.h) || 1;
        if (this.columns && w > this.columns)
            w = this.columns;
        let x = toNumberMaybe(conf.x);
        let y = toNumberMaybe(conf.y);
        if (x == null || y == null) {
            const pos = this._findEmptyPosition(w, h);
            if (!pos)
                return null;
            x = pos.x;
            y = pos.y;
        }
        else {
            x = Math.max(0, x);
            y = Math.max(0, y);
            if (this.columns && x + w > this.columns)
                x = Math.max(0, this.columns - w);
            if (this.rows != null && y + h > this.rows) {
                const pos = this._findEmptyPosition(w, h);
                if (!pos)
                    return null;
                x = pos.x;
                y = pos.y;
            }
            if (!this._isAreaFree(x, y, w, h)) {
                const pos = this._findEmptyPosition(w, h);
                if (!pos)
                    return null;
                x = pos.x;
                y = pos.y;
            }
        }
        el.setAttribute('gs-x', String(x));
        el.setAttribute('gs-y', String(y));
        el.setAttribute('gs-w', String(w));
        el.setAttribute('gs-h', String(h));
        const existing = this._items.find((i) => i.el === el);
        if (existing)
            assignShallow(existing, { x, y, w, h });
        else
            this._items.push({ el, x, y, w, h });
        this.layout();
        return el;
    }
    addBottomWidget(elOrHtmlOrOpts, opts) {
        if (!this.bottomGrid)
            return null;
        const el = this.bottomGrid.addWidget(elOrHtmlOrOpts, opts);
        this.layout();
        return el;
    }
    addWidgetHTML(html, xOrOpts, y, w, h) {
        const tpl = document.createElement('template');
        tpl.innerHTML = (html || '').trim();
        const el = tpl.content.firstElementChild;
        if (!el)
            return null;
        if (!el.classList.contains('grid-stack-item'))
            el.classList.add('grid-stack-item');
        el.dataset.gsNowrap = 'true';
        let conf = { w: 1, h: 1 };
        if (typeof xOrOpts === 'object' && xOrOpts !== null) {
            conf = assignShallow(conf, xOrOpts);
        }
        else if (xOrOpts != null) {
            conf.x = toNumberMaybe(xOrOpts);
            conf.y = toNumberMaybe(y);
            conf.w = toNumberMaybe(w) || conf.w;
            conf.h = toNumberMaybe(h) || conf.h;
        }
        const gx = toNumberMaybe(el.getAttribute('gs-x'));
        const gy = toNumberMaybe(el.getAttribute('gs-y'));
        const gw = toNumberMaybe(el.getAttribute('gs-w'));
        const gh = toNumberMaybe(el.getAttribute('gs-h'));
        if (conf.x == null && gx != null)
            conf.x = gx;
        if (conf.y == null && gy != null)
            conf.y = gy;
        if (conf.w == null && gw != null)
            conf.w = gw;
        if (conf.h == null && gh != null)
            conf.h = gh;
        return this.addWidget(el, conf);
    }
    addBottomWidgetHTML(html, xOrOpts, y, w, h) {
        if (!this.bottomGrid)
            return null;
        const el = this.bottomGrid.addWidgetHTML(html, xOrOpts, y, w, h);
        this.layout();
        return el;
    }
    removeBottomWidget(target) {
        if (!this.bottomGrid)
            return false;
        const ok = this.bottomGrid.removeWidget(target);
        this.layout();
        return ok;
    }
    setCellHeight(v) {
        const p = parseSize(v);
        this.cellHeightValue = p.n;
        this.cellHeightUnit = p.u || 'px';
        this.layout();
    }
    layout() {
        const gap = this._gapPx();
        const cw = this._cellWidth(gap);
        const ch = this._cellHeight();
        this._items.forEach((n) => this._applyItemLayout(n, cw, ch, gap));
        const maxRow = this.rows != null ? this.rows : this._computedRows();
        let totalH = maxRow * ch + Math.max(0, maxRow - 1) * gap;
        if (this.bottomBarCfg) {
            this._ensureBottomBar();
            const gapB = this._gapPxFrom(this.bottomBarCfg.margin || 0);
            const rowsB = Math.max(1, Number(this.bottomBarCfg.rows) || 1);
            const chB = toPxValue(this.bottomBarCfg.cellHeight || 80, this.bottomBarCfg.cellHeightUnit || 'px');
            const contentH = rowsB * chB + Math.max(0, rowsB - 1) * gapB;
            const lineH = this.bottomBarCfg.lineHeight || 8;
            const barH = contentH + lineH;
            totalH += barH;
            const barS = this.bottomBarEl.style;
            barS.height = `${barH}px`;
            const contentS = this.bottomBarContentEl.style;
            contentS.height = `${contentH}px`;
            contentS.top = `${lineH}px`;
            const lineS = this.bottomBarLineEl.style;
            lineS.height = `${lineH}px`;
            lineS.top = '0px';
            lineS.background = this.bottomBarCfg.color || '#000';
            if (this.bottomGrid)
                this.bottomGrid.layout();
        }
        else if (this.bottomBarEl) {
            this.bottomBarEl.style.height = '0px';
        }
        this.el.style.height = `${totalH}px`;
    }
    _intersects(a, b) {
        return !(a.y >= b.y + b.h || a.y + a.h <= b.y || a.x + a.w <= b.x || a.x >= b.x + b.w);
    }
    _isAreaFree(x, y, w, h) {
        const rect = { x, y, w, h };
        for (const it of this._items) {
            const r2 = { x: it.x, y: it.y, w: it.w, h: it.h };
            if (this._intersects(rect, r2))
                return false;
        }
        return true;
    }
    _findEmptyPosition(w, h) {
        const cols = Math.max(1, this.columns || 12);
        const maxY = this.rows != null ? Math.max(0, this.rows - h) : this._computedRows() + 200;
        for (let y = 0; y <= maxY; y++) {
            for (let x = 0; x + w <= cols; x++) {
                if (this._isAreaFree(x, y, w, h))
                    return { x, y };
            }
        }
        return null;
    }
    removeWidget(target) {
        const el = this._resolveItemEl(target);
        if (!el)
            return false;
        const idx = this._items.findIndex((i) => i.el === el);
        if (idx === -1)
            return false;
        this._items.splice(idx, 1);
        if (el.parentNode === this.el)
            el.parentNode.removeChild(el);
        this.layout();
        return true;
    }
    _applyItemLayout(n, cw, ch, gap) {
        const left = n.x * (cw + gap);
        const top = n.y * (ch + gap);
        const width = n.w * cw + Math.max(0, n.w - 1) * gap;
        const height = n.h * ch + Math.max(0, n.h - 1) * gap;
        const s = n.el.style;
        s.left = `${left}px`;
        s.top = `${top}px`;
        s.width = `${width}px`;
        s.height = `${height}px`;
        const content = n.el.querySelector('.grid-stack-item-content');
        if (content)
            content.style.padding = '0px';
        else
            n.el.style.padding = '0px';
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
        this._items.forEach((n) => { max = Math.max(max, n.y + n.h); });
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
        if (!this.bottomBarCfg)
            return;
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
}
const rootObj = typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : undefined;
if (rootObj && !rootObj.GridStack) {
    rootObj.GridStack = GridStack;
}
