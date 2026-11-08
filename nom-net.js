/* NAME-O-MATIC network helper
 * - Registers the service worker so the site runs offline after the first visit.
 * - Shows a small pill when the connection drops.
 * - Pages marked <body data-online-only> (accounts, multiplayer, community, AI connect)
 *   show a banner when Firebase cannot be reached. Single-player pages never show it.
 * Online-only features check window.NOM_ONLINE.
 */
(function () {
  window.NOM_ONLINE = navigator.onLine;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
  function pill() {
    var p = document.getElementById('nomNetPill');
    if (!p) {
      p = document.createElement('div');
      p.id = 'nomNetPill';
      p.textContent = '📴 Offline: single-player games still work';
      p.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;background:#1b1b33;color:#ffd23f;'
        + 'border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:6px 11px;'
        + 'font:700 11px Nunito,Arial,sans-serif;display:none;';
      document.body.appendChild(p);
    }
    p.style.display = window.NOM_ONLINE ? 'none' : 'block';
  }
  function banner() {
    if (!document.body || !document.body.hasAttribute('data-online-only')) return;
    if (typeof firebase !== 'undefined' && window.NOM_ONLINE) return;
    if (document.getElementById('nomOnlineBanner')) return;
    var b = document.createElement('div');
    b.id = 'nomOnlineBanner';
    b.innerHTML = '📴 This page needs an internet connection. Single-player games still work offline. '
      + '<a href="index.html" style="color:#06ffa5">Back to the hub</a>';
    b.style.cssText = 'position:fixed;left:0;right:0;top:58px;z-index:9998;background:#2a1a10;color:#ffd23f;'
      + 'border-bottom:1px solid rgba(255,210,63,.35);padding:9px 14px;font:700 12px Nunito,Arial,sans-serif;text-align:center;';
    document.body.appendChild(b);
  }
  window.addEventListener('online', function () { window.NOM_ONLINE = true; pill(); });
  window.addEventListener('offline', function () { window.NOM_ONLINE = false; pill(); banner(); });
  document.addEventListener('DOMContentLoaded', function () {
    pill();
    // give the Firebase SDK a moment to load before deciding the page is offline-only
    setTimeout(banner, window.NOM_ONLINE ? 2500 : 0);
  });
})();
