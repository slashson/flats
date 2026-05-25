(() => {
  'use strict';

  const SUPPORTED_LANGS = ['ru', 'uk', 'en'];
  const DEFAULT_LANG = 'ru';
  const LS_KEY = 'studio.lang';

  const state = {
    lang: DEFAULT_LANG,
    config: null,
    i18n: null,
  };

  /* ───────── Boot ───────── */

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    state.lang = pickInitialLang();
    try {
      const [config, i18n] = await Promise.all([loadJSON('config.json'), loadI18n(state.lang)]);
      state.config = config;
      state.i18n = i18n;
    } catch (err) {
      showFatal(err);
      return;
    }

    bindLangSwitcher();
    bindBackButton();
    bindActions();
    bindScrollShadow();
    applyAll();
    window.addEventListener('hashchange', onRoute);
    onRoute();
  }

  function pickInitialLang() {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    const nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGS.includes(nav)) return nav;
    return DEFAULT_LANG;
  }

  /* ───────── Loaders ───────── */

  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
    return res.json();
  }
  function loadI18n(lang) {
    return loadJSON(`i18n/${lang}.json`);
  }

  /* ───────── Applying content ───────── */

  function applyAll() {
    document.documentElement.lang = state.lang === 'uk' ? 'uk' : state.lang;
    applyI18n();
    applyConfig();
    renderDynamic();
    updateLangButtons();
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const value = lookup(state.i18n, key);
      if (typeof value === 'string') el.textContent = value;
    });
  }

  function applyConfig() {
    document.querySelectorAll('[data-config]').forEach((el) => {
      const key = el.getAttribute('data-config');
      const value = lookup(state.config, key);
      if (value !== undefined && value !== null) el.textContent = String(value);
    });
  }

  function lookup(obj, dottedKey) {
    return dottedKey.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  }

  function tmpl(str, vars) {
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  }

  /* ───────── Dynamic blocks ───────── */

  function renderDynamic() {
    renderAppliances();
    renderRules();
    renderDeposit();
    renderNearby();
    renderCheckout();
  }

  function renderAppliances() {
    const root = document.querySelector('[data-render="appliances"]');
    if (!root) return;
    const items = state.config.appliances || [];
    root.innerHTML = '';
    items.forEach((a) => {
      const t = lookup(state.i18n, `howTo.items.${a.id}.title`) || a.id;
      const el = document.createElement('a');
      el.className = 'appliance-tile';
      el.href = `#howto/${a.id}`;
      el.innerHTML = `
        <span class="icon">${escapeHTML(a.icon || '•')}</span>
        <span class="label">${escapeHTML(t)}</span>
      `;
      root.appendChild(el);
    });
  }

  function renderApplianceDetail(id) {
    const item = (state.config.appliances || []).find((a) => a.id === id);
    if (!item) {
      location.hash = '#howto';
      return;
    }
    const title = lookup(state.i18n, `howTo.items.${id}.title`) || id;
    const text = lookup(state.i18n, `howTo.items.${id}.text`) || '';

    const titleEl = document.querySelector('[data-render="appliance-title"]');
    if (titleEl) titleEl.textContent = title;
    const textEl = document.querySelector('[data-render="appliance-text"]');
    if (textEl) textEl.textContent = text;
  }

  function renderRules() {
    const root = document.querySelector('[data-render="rules-list"]');
    if (!root) return;
    const list = lookup(state.i18n, 'rules.list') || [];
    root.innerHTML = list.map((x) => `<li>${escapeHTML(x)}</li>`).join('');
  }

  function renderDeposit() {
    const intro = document.querySelector('[data-render="deposit-intro"]');
    if (intro) {
      const raw = lookup(state.i18n, 'deposit.intro') || '';
      intro.textContent = tmpl(raw, {
        amount: state.config.prices.deposit,
        currency: state.config.prices.currency,
      });
    }
    fillBulletList('deposit-covers', 'deposit.covers');
    fillBulletList('deposit-rules', 'deposit.rules');
    fillBulletList('deposit-return', 'deposit.return');
  }

  function fillBulletList(slot, key) {
    const root = document.querySelector(`[data-render="${slot}"]`);
    if (!root) return;
    const list = lookup(state.i18n, key) || [];
    root.innerHTML = list.map((x) => `<li>${escapeHTML(x)}</li>`).join('');
  }

  function renderNearby() {
    const root = document.querySelector('[data-render="nearby"]');
    if (!root) return;
    const items = state.config.nearby || [];
    const openLabel = lookup(state.i18n, 'nearby.openMap') || 'Open';
    root.innerHTML = '';
    items.forEach((n) => {
      const label = lookup(state.i18n, `nearby.items.${n.id}`) || n.id;
      const a = document.createElement('a');
      a.className = 'nearby-row';
      a.href = mapsURL(n.query);
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `
        <span class="icon">${escapeHTML(n.icon || '•')}</span>
        <span class="label">${escapeHTML(label)}</span>
        <span class="open">${escapeHTML(openLabel)}</span>
      `;
      root.appendChild(a);
    });
  }

  function renderCheckout() {
    const timeEl = document.querySelector('[data-render="checkout-time"]');
    if (timeEl) {
      const raw = lookup(state.i18n, 'checkout.time') || '';
      timeEl.textContent = tmpl(raw, { time: state.config.checkoutTime });
    }
    fillBulletList('checkout-before', 'checkout.before');
  }

  /* ───────── Lang switcher ───────── */

  function bindLangSwitcher() {
    document.querySelectorAll('.lang [data-lang]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lang = btn.getAttribute('data-lang');
        if (!SUPPORTED_LANGS.includes(lang) || lang === state.lang) return;
        try {
          state.i18n = await loadI18n(lang);
          state.lang = lang;
          localStorage.setItem(LS_KEY, lang);
          applyAll();
          onRoute(); // re-render appliance detail title if open
        } catch (e) {
          toast(`Не удалось загрузить язык: ${lang}`);
        }
      });
    });
  }

  function updateLangButtons() {
    document.querySelectorAll('.lang [data-lang]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-lang') === state.lang);
    });
  }

  /* ───────── Routing ───────── */

  function onRoute() {
    const raw = (location.hash || '').replace(/^#/, '');
    const [name, sub] = raw.split('/');
    const screenId = resolveScreen(name, sub);

    document.querySelectorAll('.screen').forEach((s) => {
      s.hidden = s.id !== screenId;
    });

    const isHome = screenId === 'home';
    document.querySelector('[data-back]').hidden = isHome;

    if (screenId === 'appliance' && sub) {
      renderApplianceDetail(sub);
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function resolveScreen(name, sub) {
    if (!name) return 'home';
    if (name === 'howto' && sub) return 'appliance';
    const valid = ['wifi', 'howto', 'extend', 'support', 'rules', 'deposit', 'nearby', 'checkout'];
    return valid.includes(name) ? name : 'home';
  }

  /* ───────── Back button ───────── */

  function bindBackButton() {
    document.querySelector('[data-back]').addEventListener('click', () => {
      const parts = (location.hash || '').replace(/^#/, '').split('/');
      if (parts.length > 1) {
        location.hash = `#${parts[0]}`;
      } else {
        location.hash = '';
      }
    });
  }

  /* ───────── Action handlers ───────── */

  function bindActions() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const action = t.getAttribute('data-action');

      if (action === 'tg-admin') {
        e.preventDefault();
        const u = (state.config.contacts.telegram || '').replace(/^@/, '');
        if (!u) return toast('Telegram администратора не настроен');
        window.open(`https://t.me/boris8242}`, '_blank', 'noopener');
      }

      if (action === 'call') {
        e.preventDefault();
        const p = (state.config.contacts.phone || '').replace(/[^\d+]/g, '');
        if (!p) return toast('Телефон не настроен');
        location.href = `tel:${p}`;
      }

      if (action === 'copy-wifi') {
        e.preventDefault();
        copyToClipboard(state.config.wifi.password || '')
          .then((ok) => toast(ok ? lookup(state.i18n, 'common.copied') : 'Copy failed'));
      }
    });
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { }
    // Fallback for non-secure contexts
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /* ───────── Toast ───────── */

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 250);
    }, 1800);
  }

  /* ───────── Maps URL ───────── */

  function mapsURL(query) {
    const { lat, lng } = state.config.location || {};
    const q = encodeURIComponent(query || '');
    // Centered search around the studio coordinates
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${q}&center=${lat},${lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  /* ───────── Misc ───────── */

  function bindScrollShadow() {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function showFatal(err) {
    document.body.innerHTML = `
      <div style="padding:40px 24px;font-family:system-ui;color:#1a1a1a;background:#f5f1ea;min-height:100vh">
        <h1 style="margin:0 0 12px;font-size:22px">Не удалось загрузить сайт</h1>
        <p style="color:#5c5651;font-size:15px">${escapeHTML(err.message)}</p>
        <p style="color:#8a847d;font-size:13px;margin-top:24px">
          Если открываете локально через file:// — это ограничение браузера.<br>
          Запустите локальный сервер: <code>python3 -m http.server 8000</code> и откройте <code>http://localhost:8000</code>
        </p>
      </div>`;
  }
})();
