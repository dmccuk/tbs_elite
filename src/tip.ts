// "Support Vox9 Studios" on the title screen.
//
// Adapted from Vox9's standalone tip banner (vox-studio/SNIPPET-tip-banner.html),
// restyled for the game. Tips go to Stripe Payment Links: a plain navigation, so
// no CORS and nothing to allow-list on api.vox9.io.
//
// TO GO LIVE: replace the four REPLACE_ME urls with real Payment Links from the
// Stripe Dashboard. Give EACH link the metadata  type = platform_tip  (that's what
// makes the Vox9 webhook count it as a platform tip). Stripe can't prefill a custom
// amount from a URL, so each fixed amount needs its own link, and "Other" should be
// a "customer chooses what to pay" link.
// Until every url is real, the footer link simply goes to FALLBACK_URL (Ko-fi).

const TIP_CONFIG = {
  amounts: [
    { label: "$2", url: "https://buy.stripe.com/REPLACE_ME_2" },
    { label: "$5", url: "https://buy.stripe.com/REPLACE_ME_5" },
    { label: "$10", url: "https://buy.stripe.com/REPLACE_ME_10" },
    { label: "Other", url: "https://buy.stripe.com/REPLACE_ME_CUSTOM" },
  ],
  /** Show "Thanks for supporting Vox9" for the rest of the month after a tip click.
   *  It's optimistic: this page can't know whether Stripe checkout was completed. */
  rememberTipForTheMonth: true,
};

const FALLBACK_URL = "https://ko-fi.com/scifistories1977";
const STORAGE_KEY = "vox9_platform_tip_month"; // same key as the Vox9 hub banner

const thisMonth = () => new Date().toISOString().slice(0, 7);

function tippedThisMonth(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === thisMonth(); } catch { return false; }
}

function rememberTip() {
  try { localStorage.setItem(STORAGE_KEY, thisMonth()); } catch { /* private mode */ }
}

/** Wire up the title-screen support link (plain Ko-fi link until Stripe links are configured). */
export function initTip() {
  const link = document.getElementById("tip-link") as HTMLAnchorElement | null;
  const panel = document.getElementById("tip-panel");
  const list = document.getElementById("tip-amounts");
  if (!link || !panel || !list) return;

  const live = TIP_CONFIG.amounts.length > 0 && TIP_CONFIG.amounts.every((a) => !a.url.includes("REPLACE_ME"));
  if (!live) {
    link.href = FALLBACK_URL;
    return;
  }

  const thank = () => { link.textContent = "Thanks for supporting Vox9"; };
  if (TIP_CONFIG.rememberTipForTheMonth && tippedThisMonth()) thank();

  // The link becomes a toggle for the amount panel.
  link.removeAttribute("href");
  link.setAttribute("role", "button");
  link.tabIndex = 0;
  link.setAttribute("aria-expanded", "false");
  link.setAttribute("aria-controls", "tip-panel");
  const toggle = (e: Event) => {
    e.preventDefault();
    const open = panel.hidden;
    panel.hidden = !open;
    link.setAttribute("aria-expanded", String(open));
  };
  link.addEventListener("click", toggle);
  link.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") toggle(e); });

  for (const a of TIP_CONFIG.amounts) {
    const el = document.createElement("a");
    el.className = "tip-amount";
    el.href = a.url;
    el.target = "_blank";
    el.rel = "noopener";
    el.textContent = a.label;
    el.addEventListener("click", () => {
      if (TIP_CONFIG.rememberTipForTheMonth) {
        rememberTip();
        thank();
      }
    });
    list.appendChild(el);
  }
}
