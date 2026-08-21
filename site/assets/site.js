/* SpendVeto — shared premium motion + ambiance layer.
   Self-contained, zero dependencies, served locally (no CDN).
   One <script type="module" src="./assets/site.js"></script> upgrades any page:
   page loader, scroll reveals, scroll progress, cursor glow, magnetic buttons,
   back-to-top, count-up stats, and a nav "scrolled" state.

   Config via <html> data-attributes:
     data-motion="inline"  → the page already runs its own reveal/progress/glow
                             (the landing page's Three.js scene); this module then
                             only adds loader, magnetic, back-to-top, counters, nav.
   Everything degrades to nothing under prefers-reduced-motion or on failure. */

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const inlineScene = document.documentElement.dataset.motion === "inline";

if (window.__spendveto) {
  /* already initialised — do nothing */
} else {
  window.__spendveto = true;
  const ready = (fn) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", fn, { once: true })
      : fn();
  ready(init);
}

function el(tag, props = {}) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  return node;
}

function init() {
  document.documentElement.classList.add("js");
  navScrolled();
  activeNav();
  mobileMenu();
  magnetic();
  backToTop();
  countUp();
  gateFlow();
  chainMatrix();
  if (!inlineScene) {
    ambiance();
    scrollProgress();
    cursorGlow();
    reveals();
  }
}

/* ---- highlight the nav link for the page you're on ---- */
function activeNav() {
  const here = location.pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "/index.html");
  document.querySelectorAll(".nav-links a:not(.nav-cta)").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return;
    const target = new URL(href, location.href).pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "/index.html");
    if (target === here) {
      a.setAttribute("aria-current", "page");
    }
  });
}

/* ---- mobile menu: burger + full-screen glass overlay (≤760px) ----
   CSS is injected here (not pages.css) so it also works on pages with
   their own inline styles (index, playground, auth). */
function mobileMenu() {
  const nav = document.querySelector("nav");
  const links = document.querySelector(".nav-links");
  if (!nav || !links) return;

  const style = el("style");
  style.textContent = `
    #nav-burger { display: none; }
    @media (max-width: 760px) {
      #nav-burger {
        display: inline-flex; flex-direction: column; justify-content: center; gap: 5px;
        width: 40px; height: 40px; padding: 0 9px; margin-left: 0.4rem;
        background: rgba(238,243,237,0.04); border: 1px solid rgba(238,243,237,0.14);
        border-radius: 10px; cursor: pointer;
      }
      #nav-burger i { display: block; height: 2px; border-radius: 2px; background: #eef3ed; transition: transform 0.25s, opacity 0.2s; }
    }
    #mobile-menu {
      position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
      padding: 1.1rem clamp(1.2rem, 6vw, 2rem) 2.5rem;
      background: rgba(7, 10, 8, 0.92);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      opacity: 0; visibility: hidden; transition: opacity 0.28s ease, visibility 0.28s ease;
    }
    #mobile-menu.open { opacity: 1; visibility: visible; }
    #mobile-menu .mm-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.2rem; }
    #mobile-menu .mm-brand { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 700; letter-spacing: 0.14em; font-size: 0.95rem; color: #eef3ed; }
    #mobile-menu .mm-brand b { color: #46d68c; }
    #mobile-menu .mm-close {
      width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center;
      background: rgba(238,243,237,0.04); border: 1px solid rgba(238,243,237,0.14);
      color: #eef3ed; cursor: pointer; font-size: 1.1rem;
    }
    #mobile-menu .mm-links { display: flex; flex-direction: column; gap: 0.3rem; }
    #mobile-menu .mm-links a {
      color: #eef3ed; text-decoration: none; font-family: "Space Grotesk", -apple-system, sans-serif;
      font-size: 1.65rem; font-weight: 700; letter-spacing: -0.02em; padding: 0.55rem 0;
      border-bottom: 1px solid rgba(238,243,237,0.07); display: flex; justify-content: space-between; align-items: center;
      opacity: 0; transform: translateY(10px); transition: opacity 0.35s ease, transform 0.35s ease;
    }
    #mobile-menu.open .mm-links a { opacity: 1; transform: none; }
    #mobile-menu .mm-links a::after { content: "→"; color: #46d68c; font-size: 1.1rem; opacity: 0.65; }
    #mobile-menu .mm-links a[aria-current="page"] { color: #46d68c; }
    #mobile-menu .mm-cta {
      margin-top: 1.8rem; text-align: center; padding: 0.95rem; border-radius: 99px;
      background: #46d68c; color: #06130c !important; font-weight: 700; text-decoration: none;
      font-size: 1rem; opacity: 0; transform: translateY(10px); transition: opacity 0.35s ease 0.15s, transform 0.35s ease 0.15s;
    }
    #mobile-menu.open .mm-cta { opacity: 1; transform: none; }
    @media (prefers-reduced-motion: reduce) {
      #mobile-menu, #mobile-menu .mm-links a, #mobile-menu .mm-cta { transition: none; }
    }
    body.mm-locked { overflow: hidden; }
    /* current-page state on the desktop nav (aria-current set by activeNav) */
    .nav-links a[aria-current="page"] { color: #eef3ed; }
    .nav-links a[aria-current="page"]::after { right: 0 !important; }
  `;
  document.head.appendChild(style);

  // burger (lives in the nav, only shows ≤760px)
  const burger = el("button", { id: "nav-burger", type: "button", ariaLabel: "Open menu" });
  burger.setAttribute("aria-expanded", "false");
  burger.setAttribute("aria-controls", "mobile-menu");
  burger.innerHTML = "<i style='width:18px'></i><i style='width:13px'></i><i style='width:18px'></i>";
  nav.appendChild(burger);

  // overlay, links cloned from the real nav so every page stays truthful
  const menu = el("div", { id: "mobile-menu" });
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Site menu");
  const items = [...links.querySelectorAll("a")];
  const plain = items.filter((a) => !a.classList.contains("nav-cta"));
  const cta = items.find((a) => a.classList.contains("nav-cta"));
  menu.innerHTML =
    `<div class="mm-head"><span class="mm-brand">SPENDVETO<b>_</b></span>` +
    `<button class="mm-close" type="button" aria-label="Close menu">✕</button></div>` +
    `<div class="mm-links">` +
    plain.map((a) => `<a href="${a.getAttribute("href")}"${a.getAttribute("aria-current") ? ' aria-current="page"' : ""}>${a.textContent.trim()}</a>`).join("") +
    `</div>` +
    (cta ? `<a class="mm-cta" href="${cta.getAttribute("href")}">${cta.textContent.trim()}</a>` : "");
  document.body.appendChild(menu);

  // stagger the link entrances
  menu.querySelectorAll(".mm-links a").forEach((a, i) => (a.style.transitionDelay = `${0.06 + i * 0.045}s`));

  const setOpen = (open) => {
    menu.classList.toggle("open", open);
    document.body.classList.toggle("mm-locked", open);
    burger.setAttribute("aria-expanded", String(open));
  };
  burger.addEventListener("click", () => setOpen(true));
  menu.querySelector(".mm-close").addEventListener("click", () => setOpen(false));
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
}

/* ---- nav gains a solid glass background once you leave the very top ---- */
function navScrolled() {
  const nav = document.querySelector("nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 12);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---- magnetic pull on primary interactive elements (desktop only) ---- */
function magnetic() {
  if (reduced || !finePointer) return;
  const targets = document.querySelectorAll(
    ".btn, .pill, .nav-cta, [data-magnetic]"
  );
  targets.forEach((t) => {
    t.classList.add("magnetic");
    const strength = t.classList.contains("nav-cta") ? 0.22 : 0.3;
    t.addEventListener("pointermove", (e) => {
      const r = t.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      t.style.setProperty("--mx", `${x * strength}px`);
      t.style.setProperty("--my", `${y * strength}px`);
    });
    t.addEventListener("pointerleave", () => {
      t.style.setProperty("--mx", "0px");
      t.style.setProperty("--my", "0px");
    });
  });
}

/* ---- back-to-top control, appears after a screenful ---- */
function backToTop() {
  const btn = el("button", {
    id: "back-to-top",
    type: "button",
    title: "Back to top",
    ariaLabel: "Back to top",
  });
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>';
  btn.addEventListener("click", () =>
    scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })
  );
  document.body.appendChild(btn);
  const onScroll = () =>
    btn.classList.toggle("show", scrollY > innerHeight * 0.9);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---- count-up for any [data-count] number when it scrolls into view ---- */
function countUp() {
  const nums = document.querySelectorAll("[data-count]");
  if (!nums.length) return;
  const run = (node) => {
    const to = parseFloat(node.dataset.count);
    const dec = (node.dataset.count.split(".")[1] || "").length;
    const pre = node.dataset.prefix || "";
    const suf = node.dataset.suffix || "";
    if (reduced) {
      node.textContent = pre + to.toFixed(dec) + suf;
      return;
    }
    const dur = 1200;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = pre + (to * eased).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          run(e.target);
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.6 }
  );
  nums.forEach((n) => io.observe(n));
}

/* ---- ambient backdrop: grid + soft aurora + fine noise (CSS-driven) ---- */
function ambiance() {
  const frame = document.getElementById("canvas-frame") || document.body;
  if (!document.getElementById("ambient-grid")) {
    frame.prepend(el("div", { id: "ambient-grid", ariaHidden: "true" }));
  }
  if (!document.getElementById("ambient-aurora")) {
    frame.prepend(el("div", { id: "ambient-aurora", ariaHidden: "true" }));
  }
  if (!document.getElementById("noise")) {
    document.body.appendChild(el("div", { id: "noise", ariaHidden: "true" }));
  }
}

/* ---- top scroll-progress bar ---- */
function scrollProgress() {
  let bar = document.getElementById("scroll-progress");
  if (!bar) {
    bar = el("div", { id: "scroll-progress" });
    document.body.appendChild(bar);
  }
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.transform = `scaleX(${max > 0 ? (h.scrollTop / max).toFixed(4) : 0})`;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---- radial cursor glow that follows the pointer (desktop only) ---- */
function cursorGlow() {
  if (reduced || !finePointer) return;
  let glow = document.getElementById("cursor-glow");
  if (!glow) {
    glow = el("div", { id: "cursor-glow" });
    glow.style.opacity = "0";
    document.body.appendChild(glow);
  }
  addEventListener(
    "pointermove",
    (e) => {
      glow.style.opacity = "1";
      glow.style.left = e.clientX + "px";
      glow.style.top = e.clientY + "px";
    },
    { passive: true }
  );
  addEventListener("pointerleave", () => (glow.style.opacity = "0"));
}

/* ---- governed-spend flow: <canvas data-viz="gate"> ------------------------
   Payment intents stream in from the left; the gate decides each one. Most
   settle (green, continues right), some are held for approval (copper, pauses
   then resolves), some are blocked (red, stops dead at the gate and fades).
   The ratios are driven by data-pass/data-hold/data-block so the picture can
   never drift from what the product actually claims.

   Deliberately a 2D canvas, not WebGL: it costs ~4KB, runs on any device
   beside the Three.js hero without a second GL context, and degrades to a
   static diagram under prefers-reduced-motion.                              */
function gateFlow() {
  const canvases = document.querySelectorAll('canvas[data-viz="gate"]');
  if (!canvases.length) return;

  const GREEN = "#46d68c";
  const COPPER = "#e0a05c";
  const RUST = "#e0644a";

  canvases.forEach((cv) => {
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const weights = {
      pass: Number(cv.dataset.pass || 6),
      hold: Number(cv.dataset.hold || 2),
      block: Number(cv.dataset.block || 2),
    };
    const pool = [
      ...Array(weights.pass).fill("pass"),
      ...Array(weights.hold).fill("hold"),
      ...Array(weights.block).fill("block"),
    ];

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const rect = cv.getBoundingClientRect();
      w = rect.width;
      h = rect.height || 220;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener("resize", resize, { passive: true });

    const gateX = () => w * 0.46;
    const lanes = 5;
    const laneY = (i) => h * (0.2 + (0.6 * i) / (lanes - 1));

    const particles = [];
    const spawn = () => {
      const kind = pool[(Math.random() * pool.length) | 0];
      particles.push({
        kind,
        lane: (Math.random() * lanes) | 0,
        x: -10,
        v: 0.55 + Math.random() * 0.5,
        held: kind === "hold" ? 55 + Math.random() * 45 : 0,
        alpha: 1,
        decided: false,
      });
    };

    const drawGate = () => {
      const gx = gateX();
      const grad = ctx.createLinearGradient(gx - 12, 0, gx + 12, 0);
      grad.addColorStop(0, "rgba(70,214,140,0)");
      grad.addColorStop(0.5, "rgba(70,214,140,0.3)");
      grad.addColorStop(1, "rgba(70,214,140,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(gx - 12, h * 0.1, 24, h * 0.8);
      ctx.strokeStyle = "rgba(70,214,140,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx, h * 0.1);
      ctx.lineTo(gx, h * 0.9);
      ctx.stroke();
    };

    const drawRails = () => {
      ctx.strokeStyle = "rgba(238,243,237,0.055)";
      ctx.lineWidth = 1;
      for (let i = 0; i < lanes; i++) {
        ctx.beginPath();
        ctx.moveTo(0, laneY(i));
        ctx.lineTo(w, laneY(i));
        ctx.stroke();
      }
    };

    const colorOf = (p) => (p.kind === "block" ? RUST : p.kind === "hold" && p.held > 0 ? COPPER : GREEN);

    const step = () => {
      ctx.clearRect(0, 0, w, h);
      drawRails();
      drawGate();

      const gx = gateX();
      for (const p of particles) {
        const y = laneY(p.lane);
        // Held intents stall at the gate until a human decides.
        if (p.kind === "hold" && p.held > 0 && p.x >= gx - 4) {
          p.held--;
        } else if (p.kind === "block" && p.x >= gx - 4) {
          p.decided = true;
          p.alpha -= 0.045;
        } else {
          p.x += p.v;
        }

        ctx.globalAlpha = Math.max(0, p.alpha);
        const c = colorOf(p);
        // trail
        const tail = ctx.createLinearGradient(p.x - 26, 0, p.x, 0);
        tail.addColorStop(0, "rgba(0,0,0,0)");
        tail.addColorStop(1, c);
        ctx.strokeStyle = tail;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x - 26, y);
        ctx.lineTo(p.x, y);
        ctx.stroke();
        // head
        ctx.fillStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, y, p.kind === "hold" && p.held > 0 ? 3.4 : 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].x > w + 30 || particles[i].alpha <= 0) particles.splice(i, 1);
      }
      if (Math.random() < 0.09 && particles.length < 40) spawn();
      raf = requestAnimationFrame(step);
    };

    // Static, honest fallback: one of each outcome, no motion.
    if (reduced) {
      resize();
      ctx.clearRect(0, 0, w, h);
      drawRails();
      drawGate();
      const gx = gateX();
      [["pass", GREEN, w * 0.75], ["hold", COPPER, gx], ["block", RUST, gx - 8]].forEach(([, c, x], i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, laneY(i + 1), 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }

    let raf = 0;
    // Only animate while on screen — no background CPU burn on a long page.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !raf) raf = requestAnimationFrame(step);
        else if (!e.isIntersecting && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      });
    }, { threshold: 0.05 });
    io.observe(cv);
  });
}

/* ---- chain coverage matrix: <div data-viz="chains"> -----------------------
   Renders the settlement-readiness registry as a grid rather than a logo
   strip, because the honest story is the three-way split: what settles now,
   what a free faucet unlocks, and what needs a key, funds and an audit.
   Reads /api/chains/readiness when a server is there; falls back to the
   markup already in the element so the static site never shows an empty box. */
function chainMatrix() {
  const mounts = document.querySelectorAll('[data-viz="chains"]');
  if (!mounts.length) return;

  const style = el("style");
  style.textContent = `
    .chain-matrix { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 0.5rem; margin: 1.4rem 0 1rem; }
    .cm-cell { position: relative; border: 1px solid var(--line); border-radius: 10px; padding: 0.6rem 0.7rem; background: rgba(238,243,237,0.02); overflow: hidden; }
    .cm-cell .cm-name { font-size: 0.8rem; color: var(--dim); letter-spacing: -0.01em; }
    .cm-cell .cm-tag { display:block; margin-top: 0.3rem; font-family: ui-monospace, monospace; font-size: 0.58rem; letter-spacing: 0.15em; color: var(--faint); font-weight: 700; }
    .cm-cell.is-live { border-color: rgba(70,214,140,0.5); background: rgba(70,214,140,0.06); }
    .cm-cell.is-live .cm-name { color: var(--ink); }
    .cm-cell.is-live .cm-tag { color: var(--green); }
    .cm-cell.is-testnet .cm-tag { color: var(--copper); }
    .cm-cell::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: currentColor; opacity: 0.25; }
    .cm-cell.is-live::after { background: var(--green); opacity: 0.85; }
    .cm-cell.is-testnet::after { background: var(--copper); opacity: 0.45; }
    .cm-cell.is-mainnet::after { background: var(--faint); opacity: 0.35; }
    .cm-legend { display: flex; flex-wrap: wrap; gap: 1.1rem; margin: 0 0 1.6rem; font-size: 0.74rem; color: var(--faint); font-family: ui-monospace, monospace; letter-spacing: 0.04em; }
    .cm-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 0.4rem; vertical-align: middle; }
  `;
  document.head.appendChild(style);

  // The registry, mirrored from shared-config.js. Kept static so the marketing
  // site stays fully self-contained (no server required to render truthfully);
  // the live endpoint below upgrades it whenever one is actually running.
  const FALLBACK = [
    ["Base Sepolia", "live"], ["Ethereum Sepolia", "testnet"], ["Avalanche Fuji", "testnet"],
    ["Arbitrum Sepolia", "testnet"], ["Optimism Sepolia", "testnet"], ["Polygon Amoy", "testnet"],
    ["Unichain Sepolia", "testnet"], ["Base", "mainnet"], ["Ethereum", "mainnet"],
    ["Polygon", "mainnet"], ["Arbitrum", "mainnet"], ["Optimism", "mainnet"],
    ["Avalanche", "mainnet"], ["Unichain", "mainnet"], ["Celo", "mainnet"],
    ["World Chain", "mainnet"], ["ZKsync Era", "mainnet"], ["Linea", "mainnet"], ["Sei", "mainnet"],
  ];

  const tagFor = (kind) => (kind === "live" ? "LIVE" : kind === "testnet" ? "FAUCET-READY" : "KEY + FUNDS");

  const render = (mount, rows) => {
    const grid = el("div");
    grid.className = "chain-matrix";
    grid.innerHTML = rows
      .map(([name, kind]) => `<div class="cm-cell is-${kind}"><span class="cm-name">${name}</span><span class="cm-tag">${tagFor(kind)}</span></div>`)
      .join("");
    const legend = el("div");
    legend.className = "cm-legend";
    legend.innerHTML =
      `<span><i style="background:#46d68c"></i>settling today</span>` +
      `<span><i style="background:#e0a05c"></i>free faucet away</span>` +
      `<span><i style="background:#5c675e"></i>needs facilitator key, funds &amp; an audit</span>`;
    mount.replaceChildren(grid, legend);
  };

  mounts.forEach((mount) => {
    render(mount, FALLBACK);
    // Upgrade to live truth if a server happens to be reachable.
    fetch("/api/chains/readiness")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.chains?.length) return;
        render(
          mount,
          data.chains.map((c) => [c.name, c.settlingNow ? "live" : c.network === "testnet" ? "testnet" : "mainnet"])
        );
      })
      .catch(() => {
        /* static site, no API — the mirrored registry above already rendered */
      });
  });
}

/* ---- scroll reveals with a gentle stagger inside each group ---- */
function reveals() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;
  if (reduced) {
    items.forEach((i) => i.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  // stagger by DOM order within the nearest section
  let section = null;
  let n = 0;
  items.forEach((item) => {
    const s = item.closest("section, .doc-wrap, .page-hero, footer") || document.body;
    if (s !== section) {
      section = s;
      n = 0;
    }
    if (!item.style.transitionDelay) {
      item.style.transitionDelay = `${Math.min(n, 6) * 65}ms`;
    }
    n++;
    io.observe(item);
  });
}
