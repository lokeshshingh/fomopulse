/*!
 * FomoPulse storefront widget - MIT License
 * https://github.com/lokeshshingh/fomopulse
 *
 * Fetches the shop's feed from the App Proxy and shows one notification at a
 * time. Text is always inserted with textContent (never innerHTML).
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || window.__fomopulse) return;
  window.__fomopulse = true;

  var FEED_URL = script.getAttribute("data-feed") || "/apps/fomopulse/feed";
  var LOCALE = script.getAttribute("data-locale") || document.documentElement.lang || "en";
  var CLOSE_LABEL = script.getAttribute("data-close-label") || "Close notification";
  var REGION_LABEL = script.getAttribute("data-region-label") || "Recent store activity";
  var DEMO = script.getAttribute("data-demo") === "true";

  var NS = "fomopulse";
  var CACHE_KEY = NS + ":feed";
  var CACHE_MS = 60 * 1000;
  var SEEN_KEY = NS + ":seen";
  var SEEN_TTL_MS = 6 * 60 * 60 * 1000; // don't repeat an item for 6h
  var SNOOZE_KEY = NS + ":snoozed_until";
  var SNOOZE_MS = 24 * 60 * 60 * 1000;

  // ---- storage helpers (storage can throw in private mode) -----------------
  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function readJSON(kind, key, fallback) {
    var s = store(kind);
    if (!s) return fallback;
    try { var v = JSON.parse(s.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeJSON(kind, key, value) {
    var s = store(kind);
    if (!s) return;
    try { s.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  // ---- feed -----------------------------------------------------------------
  function demoFeed() {
    var now = Date.now();
    return {
      v: 1, enabled: true,
      config: {
        position: "bottom-left", theme: "light", accentColor: "#111111",
        initialDelaySec: 1, displaySec: 6, gapSec: 3, randomizeGap: false,
        maxPerPage: 10, hideOnMobile: false, excludedPaths: [], showTimeAgo: true
      },
      items: [
        { id: "demo1", kind: "purchase", message: "Sarah from Sydney, NSW bought Demo Product", highlight: "Demo Product", url: null, image: null, at: new Date(now - 12 * 60000).toISOString() },
        { id: "demo2", kind: "roundup", message: "14 people bought Demo Product in the last 24 hours", highlight: "Demo Product", url: null, image: null, at: null }
      ]
    };
  }

  function loadFeed() {
    if (DEMO) return Promise.resolve(demoFeed());
    var cached = readJSON("sessionStorage", CACHE_KEY, null);
    if (cached && cached.t && Date.now() - cached.t < CACHE_MS) return Promise.resolve(cached.feed);
    return fetch(FEED_URL, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (feed) { writeJSON("sessionStorage", CACHE_KEY, { t: Date.now(), feed: feed }); return feed; });
  }

  // ---- eligibility ------------------------------------------------------------
  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 749px)").matches;
  }
  function pathExcluded(paths) {
    var p = window.location.pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/)/i, ""); // strip /en-au
    for (var i = 0; i < (paths || []).length; i++) {
      if (paths[i] && p.indexOf(paths[i]) === 0) return true;
    }
    return false;
  }
  function snoozed() {
    return Number(readJSON("localStorage", SNOOZE_KEY, 0)) > Date.now();
  }

  // ---- seen tracking ----------------------------------------------------------
  function seenMap() {
    var m = readJSON("localStorage", SEEN_KEY, {});
    var now = Date.now(), out = {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k) && now - m[k] < SEEN_TTL_MS) out[k] = m[k];
    return out;
  }
  function markSeen(id) {
    var m = seenMap(); m[id] = Date.now(); writeJSON("localStorage", SEEN_KEY, m);
  }

  // ---- formatting -------------------------------------------------------------
  function timeAgo(iso) {
    var then = Date.parse(iso);
    if (!then) return "";
    var sec = Math.max(1, Math.round((Date.now() - then) / 1000));
    var units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    try {
      var rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
      for (var i = 0; i < units.length; i++) {
        if (sec >= units[i][1]) return rtf.format(-Math.floor(sec / units[i][1]), units[i][0]);
      }
      return rtf.format(0, "minute");
    } catch (e) {
      return "";
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Build message text, wrapping the highlight (product) in <strong> via DOM nodes. */
  function messageNode(item) {
    var p = el("p", NS + "__msg");
    var msg = String(item.message || "");
    var hl = item.highlight ? String(item.highlight) : "";
    var at = hl ? msg.indexOf(hl) : -1;
    if (at < 0) { p.textContent = msg; return p; }
    p.appendChild(document.createTextNode(msg.slice(0, at)));
    p.appendChild(el("strong", NS + "__hl", hl));
    p.appendChild(document.createTextNode(msg.slice(at + hl.length)));
    return p;
  }

  function safeUrl(url) {
    if (!url) return null;
    try {
      var u = new URL(url, window.location.origin);
      return u.origin === window.location.origin ? u.pathname + u.search : null; // same-origin only
    } catch (e) { return null; }
  }

  // ---- widget -----------------------------------------------------------------
  function Widget(feed) {
    var cfg = feed.config || {};
    this.cfg = cfg;
    this.items = (feed.items || []).slice();
    this.shown = 0;
    this.timer = null;
    this.current = null;
    this.hovering = false;

    var root = el("section", NS + " " + NS + "--" + (cfg.position || "bottom-left") + " " + NS + "--" + (cfg.theme || "light"));
    root.setAttribute("aria-label", REGION_LABEL);
    root.setAttribute("role", "region");
    if (/^#[0-9a-f]{6}$/i.test(cfg.accentColor || "")) root.style.setProperty("--fp-accent", cfg.accentColor);
    var live = el("div", NS + "__live");
    live.setAttribute("aria-live", "polite");
    root.appendChild(live);
    document.body.appendChild(root);
    this.root = root;
    this.live = live;

    var self = this;
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) self.pause(); else self.schedule(self.current ? 2000 : 1000);
    });
  }

  Widget.prototype.next = function () {
    var seen = seenMap();
    for (var i = 0; i < this.items.length; i++) {
      if (!seen[this.items[i].id]) return this.items.splice(i, 1)[0];
    }
    return null;
  };

  Widget.prototype.gap = function () {
    var base = (this.cfg.gapSec || 12) * 1000;
    return this.cfg.randomizeGap ? Math.round(base * (0.6 + Math.random() * 0.8)) : base;
  };

  Widget.prototype.schedule = function (ms) {
    clearTimeout(this.timer);
    var self = this;
    this.timer = setTimeout(function () { self.tick(); }, ms);
  };

  Widget.prototype.pause = function () { clearTimeout(this.timer); };

  Widget.prototype.stop = function () {
    this.pause();
    this.items = [];
    if (this.current) this.hide();
  };

  Widget.prototype.tick = function () {
    if (document.hidden || snoozed()) return;
    if (this.shown >= (this.cfg.maxPerPage || 5)) return;
    var item = this.next();
    if (!item) return;
    this.show(item);
  };

  Widget.prototype.show = function (item) {
    var self = this;
    var href = safeUrl(item.url);
    var card = el(href ? "a" : "div", NS + "__card");
    if (href) {
      card.href = href;
      card.addEventListener("click", function () { self.trackClick(item); });
    }

    if (item.image) {
      var img = el("img", NS + "__img");
      img.src = item.image;
      img.alt = "";
      img.loading = "lazy";
      img.width = 56; img.height = 56;
      img.onerror = function () { img.remove(); };
      card.appendChild(img);
    }
    var body = el("div", NS + "__body");
    body.appendChild(messageNode(item));
    if (this.cfg.showTimeAgo && item.at) {
      var t = timeAgo(item.at);
      if (t) body.appendChild(el("span", NS + "__time", t));
    }
    card.appendChild(body);

    var wrap = el("div", NS + "__wrap");
    wrap.appendChild(card);
    var close = el("button", NS + "__close", "\u00d7");
    close.type = "button";
    close.setAttribute("aria-label", CLOSE_LABEL);
    close.addEventListener("click", function (e) {
      e.preventDefault();
      writeJSON("localStorage", SNOOZE_KEY, Date.now() + SNOOZE_MS);
      self.stop();
    });
    wrap.appendChild(close);

    wrap.addEventListener("mouseenter", function () { self.hovering = true; self.pause(); });
    wrap.addEventListener("mouseleave", function () { self.hovering = false; self.schedule(2000); });
    wrap.addEventListener("focusin", function () { self.hovering = true; self.pause(); });
    wrap.addEventListener("focusout", function () { self.hovering = false; self.schedule(2000); });

    this.root.insertBefore(wrap, this.live);
    this.live.textContent = item.message || "";
    // Next frame -> trigger CSS transition.
    requestAnimationFrame(function () { wrap.classList.add(NS + "__wrap--in"); });

    this.current = wrap;
    this.shown++;
    markSeen(item.id);
    this.schedule((this.cfg.displaySec || 8) * 1000);
    this.tick = this.afterShow;
  };

  /** Called when the display time is up: hide, then wait the gap and show the next one. */
  Widget.prototype.afterShow = function () {
    if (this.hovering) return;
    this.hide();
    this.tick = Widget.prototype.tick;
    this.schedule(this.gap());
  };

  Widget.prototype.hide = function () {
    var wrap = this.current;
    this.current = null;
    if (!wrap) return;
    wrap.classList.remove(NS + "__wrap--in");
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 400);
  };

  /** Tag the cart so orders show which shoppers clicked a notification. */
  Widget.prototype.trackClick = function (item) {
    try {
      var body = JSON.stringify({ attributes: { _fomopulse_click: item.kind + ":" + new Date().toISOString().slice(0, 10) } });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/cart/update.js", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/cart/update.js", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
      }
    } catch (e) { /* non-critical */ }
  };

  // ---- boot -------------------------------------------------------------------
  function start() {
    if (snoozed() && !DEMO) return;
    loadFeed().then(function (feed) {
      if (!feed || !feed.enabled || !feed.items || !feed.items.length) return;
      var cfg = feed.config || {};
      if (cfg.hideOnMobile && isMobile()) return;
      if (pathExcluded(cfg.excludedPaths)) return;
      var w = new Widget(feed);
      window.FomoPulse = { pause: function () { w.pause(); }, stop: function () { w.stop(); }, next: function () { if (!w.current) w.schedule(0); } };
      w.schedule(Math.max(0, (cfg.initialDelaySec || 0) * 1000));
    }).catch(function (err) {
      if (window.console && console.debug) console.debug("[fomopulse] feed unavailable", err);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
