// Reown-AppKit-style wallet modal — self-contained (no SDK, no CDN, no cloud
// project ID). Installed wallets are discovered via the EIP-6963 standard and
// badged INSTALLED with their real icons; the All-Wallets screen is a curated
// catalog where anything not installed links to its official site instead of
// pretending. The WalletConnect QR row is a labeled slot: it lights up when a
// (free) Reown project id is configured at deploy time — never faked locally.
import { discoverWallets, connectWallet } from "./wallet-connect.js";

const CATALOG = [
  ["MetaMask", "io.metamask", "#f6851b", "https://metamask.io", "metamask"],
  ["Brave Wallet", "com.brave.wallet", "#ff2000", "https://brave.com/wallet/", "brave"],
  ["Coinbase Wallet", "com.coinbase.wallet", "#0052ff", "https://www.coinbase.com/wallet", "coinbase"],
  ["Binance Wallet", "com.binance.wallet", "#f0b90b", "https://www.binance.com/en/web3wallet", "binance"],
  ["Trust Wallet", "com.trustwallet.app", "#0500ff", "https://trustwallet.com", "trust"],
  ["OKX Wallet", "com.okex.wallet", "#111111", "https://www.okx.com/web3", "okx"],
  ["Rabby", "io.rabby", "#7084ff", "https://rabby.io", "rabby"],
  ["SafePal", "com.safepal", "#4a21ef", "https://safepal.com", "safepal"],
  ["Bitget Wallet", "com.bitget.web3", "#00f0ff", "https://web3.bitget.com", "bitget"],
  ["TokenPocket", "pro.tokenpocket", "#2980fe", "https://tokenpocket.pro", "tokenpocket"],
  ["Uniswap", "org.uniswap.app", "#ff37c7", "https://wallet.uniswap.org", "uniswap"],
  ["Phantom", "app.phantom", "#ab9ff2", "https://phantom.app", "phantom"],
  ["Zerion", "io.zerion.wallet", "#2461ed", "https://zerion.io", "zerion"],
  ["Fireblocks", "com.fireblocks", "#0075f2", "https://www.fireblocks.com", "fireblocks"],
  ["imToken", "im.token", "#11c4d1", "https://token.im", "imtoken"],
  ["Exodus", "com.exodus.web3", "#7b39ff", "https://www.exodus.com", "exodus"],
  ["Ledger Live", "com.ledger", "#d4a0ff", "https://www.ledger.com", "ledger"],
  ["Frame", "sh.frame", "#29b6af", "https://frame.sh", "frame"],
];

const CSS = `
.wm-ov{position:fixed;inset:0;background:rgba(4,7,5,.72);backdrop-filter:blur(6px);z-index:999;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif}
.wm{width:min(400px,92vw);max-height:82vh;overflow:auto;background:#101511;border:1px solid #262e24;border-radius:22px;padding:1.1rem 1.15rem 1.25rem;color:#eef3ed;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.wm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.9rem}
.wm-head h3{font-size:1rem;font-weight:700;margin:0 auto}
.wm-x,.wm-back{background:none;border:0;color:#93a094;font-size:1.05rem;cursor:pointer;padding:.2rem .4rem;border-radius:8px}
.wm-x:hover,.wm-back:hover{color:#eef3ed;background:rgba(255,255,255,.05)}
.wm-row{display:flex;align-items:center;gap:.8rem;width:100%;padding:.62rem .7rem;border:0;background:transparent;border-radius:14px;cursor:pointer;color:#eef3ed;font:inherit;font-size:.95rem;font-weight:600;text-align:left}
.wm-row:hover{background:rgba(255,255,255,.045)}
.wm-ic{width:38px;height:38px;border-radius:10px;flex:none;display:grid;place-items:center;font-weight:800;font-size:1rem;color:#fff;overflow:hidden}
.wm-ic img{width:100%;height:100%;object-fit:cover;border-radius:10px}
.wm-tag{margin-left:auto;font-size:.62rem;letter-spacing:.08em;font-weight:700;padding:.18rem .5rem;border-radius:6px;border:1px solid #262e24;color:#5c675e}
.wm-tag.on{color:#46d68c;border-color:#1f7a52;background:rgba(70,214,140,.07)}
.wm-tag.qr{color:#67d8e8;border-color:#2a5e66}
.wm-arrow{color:#5c675e;margin-left:.35rem}
.wm-note{font-size:.78rem;color:#93a094;line-height:1.55;padding:.7rem .75rem;border:1px solid #262e24;border-radius:12px;margin:.5rem 0}
.wm-search{width:100%;font:inherit;font-size:.9rem;background:#0e130f;color:#eef3ed;border:1px solid #262e24;border-radius:12px;padding:.55rem .8rem;outline:none;margin-bottom:.9rem}
.wm-search:focus{border-color:#1f7a52}
.wm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem}
.wm-cell{display:flex;flex-direction:column;align-items:center;gap:.45rem;padding:.8rem .3rem;background:#0e130f;border:1px solid #1c231a;border-radius:14px;cursor:pointer;color:#c7d0c6;font-size:.72rem;font-weight:600;text-align:center;text-decoration:none}
.wm-cell:hover{border-color:#2a3527}
.wm-cell .wm-ic{width:44px;height:44px;border-radius:12px}
.wm-foot{text-align:center;color:#5c675e;font-size:.7rem;margin-top:1rem;letter-spacing:.06em}`;

function icon(name, color, img) {
  const d = document.createElement("span");
  d.className = "wm-ic";
  if (img) {
    const im = document.createElement("img");
    im.src = img;
    im.alt = "";
    im.onerror = () => { im.remove(); d.style.background = color; d.textContent = name[0]; };
    d.appendChild(im);
  } else { d.style.background = color; d.textContent = name[0]; }
  return d;
}

export function openWalletModal({ onConnect, onError = () => {} }) {
  if (!document.getElementById("wm-css")) {
    const st = document.createElement("style"); st.id = "wm-css"; st.textContent = CSS; document.head.appendChild(st);
  }
  const ov = document.createElement("div"); ov.className = "wm-ov";
  const box = document.createElement("div"); box.className = "wm";
  ov.appendChild(box);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  let installed = [];

  const pick = async (detail) => {
    try { const c = await connectWallet(detail); close(); onConnect(c); }
    catch (err) { onError(err); }
  };

  const main = () => {
    box.innerHTML = "";
    const h = document.createElement("div"); h.className = "wm-head";
    h.innerHTML = `<span style="width:1.6rem"></span><h3>Connect Wallet</h3>`;
    const x = document.createElement("button"); x.className = "wm-x"; x.textContent = "✕"; x.onclick = close;
    h.appendChild(x); box.appendChild(h);

    for (const w of installed) {
      const b = document.createElement("button"); b.className = "wm-row";
      b.append(icon(w.info.name, "#1f7a52", w.info.icon), w.info.name);
      const t = document.createElement("span"); t.className = "wm-tag on"; t.textContent = "INSTALLED";
      b.append(t); b.onclick = () => pick(w); box.appendChild(b);
    }
    const wc = document.createElement("button"); wc.className = "wm-row";
    wc.append(icon("WalletConnect", "#3b99fc", "./assets/wallets/walletconnect.png"), "WalletConnect");
    const qt = document.createElement("span"); qt.className = "wm-tag qr"; qt.textContent = "QR CODE";
    wc.append(qt); box.appendChild(wc);
    wc.onclick = () => {
      if (!wc.dataset.open) {
        wc.dataset.open = "1";
        const n = document.createElement("div"); n.className = "wm-note";
        n.textContent = "QR-code mobile connections switch on when this site is deployed with a free Reown project id (window.SPENDVETO_WC_PROJECT_ID). Locally, use an installed browser wallet above — Brave Wallet works out of the box.";
        wc.after(n);
      }
    };
    const all = document.createElement("button"); all.className = "wm-row";
    all.append(icon("⌕", "#1c231a"), "Search Wallet");
    const ct = document.createElement("span"); ct.className = "wm-tag"; ct.textContent = "530+";
    all.append(ct); all.onclick = grid; box.appendChild(all);
    if (!installed.length) {
      const n = document.createElement("div"); n.className = "wm-note";
      n.textContent = "No wallet detected in this browser yet — pick one from Search Wallet to install it, then reload.";
      box.appendChild(n);
    }
    const f = document.createElement("div"); f.className = "wm-foot"; f.textContent = "SPENDVETO · EIP-6963"; box.appendChild(f);
  };

  const grid = () => {
    box.innerHTML = "";
    const h = document.createElement("div"); h.className = "wm-head";
    const back = document.createElement("button"); back.className = "wm-back"; back.textContent = "‹"; back.onclick = main;
    h.appendChild(back); h.insertAdjacentHTML("beforeend", `<h3>All Wallets</h3>`);
    const x = document.createElement("button"); x.className = "wm-x"; x.textContent = "✕"; x.onclick = close;
    h.appendChild(x); box.appendChild(h);
    const s = document.createElement("input"); s.className = "wm-search"; s.placeholder = "Search wallet"; box.appendChild(s);
    const g = document.createElement("div"); g.className = "wm-grid"; box.appendChild(g);
    const draw = (q = "") => {
      g.innerHTML = "";
      for (const [name, rdns, color, url, slug] of CATALOG.filter(([n]) => n.toLowerCase().includes(q))) {
        const hit = installed.find((w) => w.info.rdns === rdns || w.info.name.toLowerCase() === name.toLowerCase());
        const c = document.createElement(hit ? "button" : "a"); c.className = "wm-cell";
        if (hit) c.onclick = () => pick(hit);
        else { c.href = url; c.target = "_blank"; c.rel = "noopener"; c.title = `Not detected — get ${name}`; }
        c.append(icon(name, color, hit?.info.icon || (slug ? `./assets/wallets/${slug}.png` : undefined)));
        c.insertAdjacentHTML("beforeend", `<span>${name}${hit ? " ✓" : ""}</span>`);
        g.appendChild(c);
      }
    };
    s.addEventListener("input", () => draw(s.value.trim().toLowerCase()));
    draw();
  };

  discoverWallets((list) => { installed = list; if (box.querySelector(".wm-grid")) return; main(); });
  main();
  document.body.appendChild(ov);
}
