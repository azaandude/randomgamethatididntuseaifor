/* nom3d.js — shared 3D kit for NAME-O-MATIC 9000: stadium, pitch, goals with nets, jointed players, ball, crowd, sound.
   Needs Three.js r128 (global THREE). Everything is in metres. The pitch is 105 x 68, x runs along it, z across it, y is up.
   Players face +x in their own space; N3.face() turns them. */
var N3 = (function () {
  'use strict';
  var PL = 105, PW = 68, HL = PL / 2, HW = PW / 2, GW = 7.32, GH = 2.44, GD = 2.0, TAU = Math.PI * 2;

  // ---- helpers --------------------------------------------------------------------------------------------------------
  function rng32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s) { var h = 2166136261, i; s = String(s); for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(cv, rep, aniso) { var t = new THREE.CanvasTexture(cv); t.anisotropy = aniso || 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
  function col(c) { return new THREE.Color(c); }
  function shade(c, amt) { var k = col(c), hsl = {}; k.getHSL(hsl); k.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt))); return k; }
  function cssOf(c) { return '#' + col(c).getHexString(); }
  function lam(c) { return new THREE.MeshLambertMaterial({ color: col(c) }); }
  function bas(c, o) { var m = new THREE.MeshBasicMaterial({ color: col(c) }); if (o) for (var k in o) m[k] = o[k]; return m; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angDiff(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

  // ---- textures ---------------------------------------------------------------------------------------------------------
  var MARGIN = 7;
  function pitchTexture(opts) {
    opts = opts || {};
    var S = opts.scale || 18, M = MARGIN, W = (PL + 2 * M) * S, H = (PW + 2 * M) * S, cv = canvas(W, H), c = cv.getContext('2d'), r = rng32(5), i;
    c.setTransform(S, 0, 0, S, (HL + M) * S, (HW + M) * S);                 // origin = centre spot, canvas y = world z
    c.fillStyle = '#267a33'; c.fillRect(-HL - M, -HW - M, PL + 2 * M, PW + 2 * M);
    var n = 14, sw = PL / n;
    for (i = -1; i <= n; i++) { c.fillStyle = (i % 2 === 0) ? '#31983f' : '#287f36'; c.fillRect(-HL + i * sw, -HW - M, sw + 0.03, PW + 2 * M); }
    if (opts.checker) { for (i = -1; i <= n; i++) for (var j = -5; j < 6; j++) if ((i + j) % 2 === 0) { c.fillStyle = 'rgba(0,0,0,0.045)'; c.fillRect(-HL + i * sw, j * 7, sw, 7); } }
    for (i = 0; i < 26000; i++) {                                           // blades of grass
      var gx = (r() - 0.5) * (PL + 2 * M), gy = (r() - 0.5) * (PW + 2 * M);
      c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,25,0,0.05)'; c.fillRect(gx, gy, 0.05, 0.22);
    }
    [-1, 1].forEach(function (s) {                                          // worn goalmouths and spots
      var g = c.createRadialGradient(s * (HL - 5), 0, 0.5, s * (HL - 5), 0, 7); g.addColorStop(0, 'rgba(120,96,52,0.30)'); g.addColorStop(1, 'rgba(120,96,52,0)');
      c.fillStyle = g; c.fillRect(s * (HL - 5) - 8, -8, 16, 16);
      var g2 = c.createRadialGradient(s * (HL - 11), 0, 0.1, s * (HL - 11), 0, 1.8); g2.addColorStop(0, 'rgba(130,104,60,0.35)'); g2.addColorStop(1, 'rgba(130,104,60,0)');
      c.fillStyle = g2; c.fillRect(s * (HL - 11) - 2, -2, 4, 4);
    });
    c.strokeStyle = 'rgba(255,255,255,0.94)'; c.fillStyle = 'rgba(255,255,255,0.96)'; c.lineWidth = 0.14; c.lineJoin = 'miter';
    c.strokeRect(-HL, -HW, PL, PW);
    c.beginPath(); c.moveTo(0, -HW); c.lineTo(0, HW); c.stroke();
    c.beginPath(); c.arc(0, 0, 9.15, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.22, 0, TAU); c.fill();
    [-1, 1].forEach(function (s) {
      c.strokeRect(s > 0 ? HL - 16.5 : -HL, -20.16, 16.5, 40.32);
      c.strokeRect(s > 0 ? HL - 5.5 : -HL, -9.16, 5.5, 18.32);
      c.beginPath(); c.arc(s * (HL - 11), 0, 0.22, 0, TAU); c.fill();
      c.beginPath(); c.arc(s * (HL - 11), 0, 9.15, s > 0 ? Math.PI - 0.9273 : -0.9273, s > 0 ? Math.PI + 0.9273 : 0.9273); c.stroke();
    });
    [[-1, -1, 0, 1.5708], [1, -1, 1.5708, 3.1416], [1, 1, 3.1416, 4.7124], [-1, 1, 4.7124, 6.2832]].forEach(function (q) { c.beginPath(); c.arc(q[0] * HL, q[1] * HW, 1, q[2], q[3]); c.stroke(); });
    return tex(cv, null, 8);
  }
  function crowdTexture(a, b, dens, light) {                                      // dens (0..1) thins the crowd out for small grounds
    var cv = canvas(1024, 256), c = cv.getContext('2d'), r = rng32(777), pal = ['#e9e9f2', '#9aa0b8', '#ffd23f', '#3a4470', '#c8ccdc', '#ff6b35', '#202840'], x, y;
    var g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, light ? '#7d88a3' : '#0d1222'); g.addColorStop(1, light ? '#98a2ba' : '#1b2240'); c.fillStyle = g; c.fillRect(0, 0, 1024, 256);
    for (y = 8; y < 252; y += 10) {
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, y + 4, 1024, 2);                                   // the step behind each row
      for (x = 3; x < 1022; x += 8) {
        var rv = r(), cc = rv < 0.36 ? a : (rv < 0.62 ? b : pal[(r() * pal.length) | 0]);
        if (dens != null && r() > dens) continue;
        c.globalAlpha = 0.65 + r() * 0.35; c.fillStyle = cc;
        c.beginPath(); c.arc(x + (r() - 0.5) * 2.5, y + (r() - 0.5) * 2, 3 + r() * 0.8, 0, TAU); c.fill();                 // head and shoulders
        c.globalAlpha = 0.5; c.fillStyle = '#d2a37e'; c.beginPath(); c.arc(x + (r() - 0.5) * 2.5, y - 3.2, 1.7, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
    return tex(cv, [4, 1], 4);
  }
  function adTexture(list) {
    var cv = canvas(2048, 64), c = cv.getContext('2d'), cols = ['#ff6b35', '#ffd23f', '#06ffa5', '#a855f7', '#3b82f6', '#ec4899'], ads = list || ['NAME-O-MATIC', 'PRACTICE LAB', 'REAL SQUADS', 'GOAL!', 'PLAY ON'], i;
    c.font = '800 30px Nunito, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (i = 0; i < 8; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect(i * 256 + 3, 3, 250, 58); c.fillStyle = '#0a0d18'; c.fillText(ads[i % ads.length], i * 256 + 128, 34); }
    return tex(cv, null, 4);
  }
  function netTexture() {
    var cv = canvas(64, 64), c = cv.getContext('2d');
    c.strokeStyle = 'rgba(240,244,255,0.62)'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(0, 1); c.lineTo(64, 1); c.moveTo(1, 0); c.lineTo(1, 64); c.stroke();
    return tex(cv, [1, 1], 4);
  }
  function glowTexture() {
    var cv = canvas(128, 128), c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.2, 'rgba(255,244,205,0.55)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
  }
  function blobTexture() {
    var cv = canvas(64, 64), c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }
  function skyTexture() {
    var cv = canvas(16, 256), c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#03050d'); g.addColorStop(0.55, '#0c1330'); g.addColorStop(0.9, '#2a2a52'); g.addColorStop(1, '#3d3560');
    c.fillStyle = g; c.fillRect(0, 0, 16, 256); return new THREE.CanvasTexture(cv);
  }
  var ICO = (function () { var t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]; return v.map(function (a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }); })();
  function ballTexture() {
    var W = 256, H = 128, cv = canvas(W, H), c = cv.getContext('2d'), im = c.createImageData(W, H), x, y, k;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var th = (x + 0.5) / W * TAU, ph = (y + 0.5) / H * Math.PI, dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th), best = -1, second = -1;
      for (k = 0; k < 12; k++) { var d = dx * ICO[k][0] + dy * ICO[k][1] + dz * ICO[k][2]; if (d > best) { second = best; best = d; } else if (d > second) second = d; }
      var o = (y * W + x) * 4, v = 246, seam = (best - second) < 0.045 && best < 0.93;
      if (best > 0.88) v = 28; else if (seam) v = 150;                      // dark pentagons, soft grey seams
      im.data[o] = v; im.data[o + 1] = v; im.data[o + 2] = v + (v > 200 ? 4 : 0); im.data[o + 3] = 255;
    }
    c.putImageData(im, 0, 0); return tex(cv, null, 4);
  }
  var KIT_CACHE = {};
  function kitTexture(base, trim, num, style) {
    var key = [base, trim, num, style].join('|'); if (KIT_CACHE[key]) return KIT_CACHE[key];
    var cv = canvas(256, 128), c = cv.getContext('2d'), i;
    c.fillStyle = cssOf(base); c.fillRect(0, 0, 256, 128);
    c.fillStyle = cssOf(trim);
    if (style === 1) { for (i = 0; i < 8; i++) if (i % 2 === 0) c.fillRect(i * 32, 0, 16, 128); }              // stripes
    else if (style === 2) { c.fillRect(0, 0, 256, 18); }                                                       // collar band
    else if (style === 3) { c.fillRect(0, 46, 256, 22); }                                                      // hoops
    c.fillStyle = cssOf(trim); c.globalAlpha = 0.9; c.fillRect(0, 118, 256, 10); c.globalAlpha = 1;
    if (num != null && num !== '') {
      c.font = '900 46px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 5;
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.strokeText(String(num), 192, 62); c.fillStyle = '#ffffff'; c.fillText(String(num), 192, 62);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(64, 38, 8, 0, TAU); c.fill();                                // a crest on the chest
    }
    var t = tex(cv, null, 4); KIT_CACHE[key] = t; return t;
  }

  // ---- geometry helpers -------------------------------------------------------------------------------------------------
  function quad(p0, p1, p2, p3, ur, vr) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, ur || 1, 0, ur || 1, vr || 1, 0, vr || 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g;
  }
  function ringPath(hx, hz, rad, per) {                                      // a rounded rectangle, anticlockwise, with outward normals
    var pts = [], i, q, cx = [hx - rad, -(hx - rad), -(hx - rad), hx - rad], cz = [hz - rad, hz - rad, -(hz - rad), -(hz - rad)];
    for (q = 0; q < 4; q++) for (i = 0; i <= per; i++) { var a = (q + i / per) * Math.PI / 2; pts.push({ x: cx[q] + Math.cos(a) * rad, z: cz[q] + Math.sin(a) * rad, nx: Math.cos(a), nz: Math.sin(a) }); }
    pts.push({ x: pts[0].x, z: pts[0].z, nx: pts[0].nx, nz: pts[0].nz });         // close the loop along the last straight side
    return pts;
  }
  function ringStrip(path, prof, uPerM, vRepeat, intRepeat) {                    // sweep a profile (offset, height) round the path
    var pos = [], uv = [], idx = [], i, j, len = 0, nj = prof.length;
    for (i = 0; i < path.length; i++) {
      if (i) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      for (j = 0; j < nj; j++) { pos.push(path[i].x + path[i].nx * prof[j][0], prof[j][1], path[i].z + path[i].nz * prof[j][0]); uv.push(len * uPerM, j / (nj - 1) * (vRepeat || 1)); }
    }
    for (i = 0; i < path.length - 1; i++) for (j = 0; j < nj - 1; j++) { var a = i * nj + j, b = a + 1, c2 = a + nj, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
    if (intRepeat) { var k = Math.max(1, Math.round(len * uPerM)) / (len * uPerM); for (i = 0; i < uv.length; i += 2) uv[i] *= k; }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  // ---- the goal ----------------------------------------------------------------------------------------------------------
  function goal(scene, side) {                                               // side +1 = the goal at +x, -1 = at -x
    var G = { side: side, x: side * HL, group: new THREE.Group(), nets: [] }, postM = lam(0xffffff), s = side, gx = side * HL, hw = GW / 2, gd = GD, bd = GD + 0.5, t;
    G.group.position.x = gx;
    function post(px, py, pz, rx, rz, len) { var m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 10), postM); m.position.set(px, py, pz); m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = true; G.group.add(m); return m; }
    post(0, GH / 2, -hw, 0, 0, GH); post(0, GH / 2, hw, 0, 0, GH);
    var bar = post(0, GH, 0, Math.PI / 2, 0, GW); bar.rotation.set(Math.PI / 2, 0, 0);
    // back supports
    [-1, 1].forEach(function (z) { post(s * gd / 2, GH, z * hw, 0, Math.PI / 2, gd).rotation.set(0, 0, Math.PI / 2); post(s * (gd + 0.25), 0.04, z * hw, 0, Math.PI / 2, bd).rotation.set(0, 0, Math.PI / 2); post(s * bd / 2 + s * gd / 2 - 0.1, GH / 2 + 0.0, z * hw, 0, 0, GH).position.x = s * (gd + 0.25); });
    function net(p0, p1, p2, p3, w, h) {
      t = netTexture(); t.repeat.set(Math.max(1, Math.round(w / 0.13)), Math.max(1, Math.round(h / 0.13)));
      var m = new THREE.Mesh(quad(p0, p1, p2, p3, 1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      G.group.add(m); G.nets.push(m); return m;
    }
    G.back = net([s * (gd + 0.5), 0, -hw], [s * (gd + 0.5), 0, hw], [s * gd, GH, hw], [s * gd, GH, -hw], GW, GH);
    net([0, 0, -hw], [s * (gd + 0.5), 0, -hw], [s * gd, GH, -hw], [0, GH, -hw], gd, GH);
    net([0, 0, hw], [s * (gd + 0.5), 0, hw], [s * gd, GH, hw], [0, GH, hw], gd, GH);
    net([0, GH, -hw], [s * gd, GH, -hw], [s * gd, GH, hw], [0, GH, hw], gd, GW);
    G.ripple = 0; G.rippleAmp = 0; G.backHome = G.back.position.x;
    scene.add(G.group); return G;
  }
  function netHit(G, strength) { G.ripple = 1; G.rippleAmp = Math.min(0.5, 0.12 + (strength || 10) * 0.012); }

  // ---- the stadium ----------------------------------------------------------------------------------------------------
  function stadium(scene, o) {
    o = o || {};
    var S = { t: 0, goals: {}, lamps: [], roar: 0 }, a = o.homeColor || '#d33', b = o.awayColor || '#36c';
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0x0b1020, 90, 300);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), lam(0x0d1424)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.04; ground.receiveShadow = true; scene.add(ground); S.ground = ground;
    var pm = new THREE.Mesh(new THREE.PlaneGeometry(PL + 2 * MARGIN, PW + 2 * MARGIN), new THREE.MeshLambertMaterial({ map: pitchTexture(o) }));
    pm.rotation.x = -Math.PI / 2; pm.receiveShadow = true; scene.add(pm); S.pitch = pm;
    // the bowl: lower tier, a fascia band, upper tier, a roof
    var path = ringPath(HL + MARGIN - 1.5, HW + MARGIN - 1.5, 10, 10);
    S.crowdTex = crowdTexture(a, b); S.crowdMat = new THREE.MeshBasicMaterial({ map: S.crowdTex, side: THREE.DoubleSide });
    var dark = new THREE.MeshLambertMaterial({ color: 0x141b2e, side: THREE.DoubleSide }), roofM = new THREE.MeshLambertMaterial({ color: 0x1c2438, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(ringStrip(path, [[2.5, 0.9], [15.5, 10.5]], 1 / 38, 1), S.crowdMat));
    scene.add(new THREE.Mesh(ringStrip(path, [[15.5, 10.5], [15.8, 12.6]], 1 / 38, 1), dark));
    S.upper = []; function up(m) { S.upper.push(m); scene.add(m); }                        // the upper tier and roof can be hidden for small grounds
    up(new THREE.Mesh(ringStrip(path, [[17.5, 12.6], [32, 27]], 1 / 38, 1), S.crowdMat));
    up(new THREE.Mesh(ringStrip(path, [[32, 27], [32.3, 0]], 1 / 38, 1), dark));
    up(new THREE.Mesh(ringStrip(path, [[13, 31.5], [36, 28.2]], 1 / 38, 1), roofM));
    up(new THREE.Mesh(ringStrip(path, [[13, 31.5], [13.2, 29.8]], 1 / 38, 1), new THREE.MeshBasicMaterial({ color: 0xcfd8ff, side: THREE.DoubleSide })));
    S.adTex = adTexture(o.ads); S.adTex.wrapS = THREE.RepeatWrapping;
    var adPath = ringPath(HL + MARGIN - 3, HW + MARGIN - 3, 8, 10);
    S.adTex.repeat.set(1, 1);
    S.adMesh = new THREE.Mesh(ringStrip(adPath, [[0, 0], [0, 0.9]], 1 / 60, 1, true), new THREE.MeshBasicMaterial({ map: S.adTex, side: THREE.DoubleSide }));
    scene.add(S.adMesh);
    // floodlights
    var glow = glowTexture();
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      var px = q[0] * (HL + 24), pz = q[1] * (HW + 17), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 42, 8), lam(0x4a5470)); pole.position.set(px, 21, pz); scene.add(pole);
      var panel = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.8), bas(0xfff6dc)); panel.position.set(px, 43, pz); panel.lookAt(0, 8, 0); scene.add(panel);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1c9, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.scale.set(46, 46, 1); sp.position.set(px, 43, pz); scene.add(sp); S.lamps.push(sp);
    });
    // goals, flags, benches
    S.goals[1] = goal(scene, 1); S.goals[-1] = goal(scene, -1);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
      var f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), lam(0xffffff)); f.position.set(q[0] * HL, 0.75, q[1] * HW); scene.add(f);
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), bas(0xffd23f, { side: THREE.DoubleSide })); fl.position.set(q[0] * HL - q[0] * 0.2, 1.34, q[1] * HW); scene.add(fl);
    });
    [-1, 1].forEach(function (s) {
      var bx = s * 13, bz = HW + 5.4, g = new THREE.Group();
      var back = new THREE.Mesh(new THREE.BoxGeometry(9, 1.7, 0.1), new THREE.MeshLambertMaterial({ color: 0x1b2540, transparent: true, opacity: 0.85 })); back.position.set(0, 0.95, 1.1); g.add(back);
      var seat = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.6), lam(0xd9dcec)); seat.position.set(0, 0.5, 0.5); g.add(seat);
      var roof = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.1, 1.9), new THREE.MeshLambertMaterial({ color: 0x1b2540, transparent: true, opacity: 0.55 })); roof.position.set(0, 1.9, 0.4); g.add(roof);
      g.position.set(bx, 0, bz); scene.add(g);
    });
    // light
    S.hemi = new THREE.HemisphereLight(0xd6e4ff, 0x234628, 0.78); scene.add(S.hemi);
    S.nightBG = scene.background; S.nightFog = scene.fog;
    S.sun = new THREE.DirectionalLight(0xfff4e0, 0.72); S.sun.position.set(-20, 46, 26);
    S.sun.target.position.set(0, 0, 0); scene.add(S.sun); scene.add(S.sun.target);
    if (o.shadows) {
      S.sun.castShadow = true; S.sun.shadow.mapSize.set(o.shadowSize || 2048, o.shadowSize || 2048);
      var sc = S.sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 5; sc.far = 130; S.sun.shadow.bias = -0.0006;
    }
    S.setTeams = function (c1, c2, dens, light) { S.crowdTex = crowdTexture(c1, c2, dens, light); S.crowdMat.map = S.crowdTex; S.crowdMat.needsUpdate = true; };
    S.focus = function (x, z) {                                                                // keep the shadow camera over the action
      S.sun.target.position.set(x, 0, z); S.sun.position.set(x - 20, 46, z + 26);
    };
    S.update = function (dt) {
      S.t += dt; S.roar = Math.max(0, S.roar - dt * 0.5);
      S.crowdTex.offset.y = Math.sin(S.t * 2.2) * 0.002 * (1 + S.roar * 9) * 0.5 + (S.roar > 0.05 ? Math.abs(Math.sin(S.t * 14)) * 0.004 * S.roar : 0);
      S.crowdTex.offset.x = S.t * 0.0004;
      S.adTex.offset.x = (S.t * 0.035) % 1;
      [1, -1].forEach(function (k) {
        var G = S.goals[k]; if (G.ripple > 0) { G.ripple = Math.max(0, G.ripple - dt * 1.5); G.back.position.x = G.backHome + G.side * Math.sin((1 - G.ripple) * 18) * G.ripple * G.rippleAmp; } else G.back.position.x = G.backHome;
      });
    };
    S.cheer = function (lvl) { S.roar = Math.min(1, S.roar + (lvl || 1)); };
    return S;
  }

  // ---- the ball -------------------------------------------------------------------------------------------------------
  var BALLTEX = null, BLOB = null;
  function ball(r) {
    r = r || 0.15; if (!BALLTEX) BALLTEX = ballTexture(); if (!BLOB) BLOB = blobTexture();
    var B = { r: r, group: new THREE.Group() };
    B.mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshLambertMaterial({ map: BALLTEX })); B.mesh.castShadow = true;
    B.blob = new THREE.Mesh(new THREE.PlaneGeometry(r * 5, r * 5), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false }));
    B.blob.rotation.x = -Math.PI / 2; B.blob.position.y = 0.02;
    B.group.add(B.mesh); B.group.add(B.blob); B.q = new THREE.Quaternion(); B.ax = new THREE.Vector3(); B.last = null;
    return B;
  }
  function ballAt(B, x, y, z, rollIt) {                                      // place the ball, rolling it for the distance travelled
    if (rollIt !== false && B.last) {
      var dx = x - B.last.x, dz = z - B.last.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.0003 && d < 4) { B.ax.set(dz, 0, -dx).normalize(); B.q.setFromAxisAngle(B.ax, d / B.r); B.mesh.quaternion.premultiply(B.q); }
    }
    B.last = { x: x, z: z };
    B.mesh.position.set(x, y, z);
    var h = Math.max(0, y - B.r), s = 1 / (1 + h * 0.35);
    B.blob.position.set(x + h * 0.1, 0.025, z + h * 0.05); B.blob.scale.set(s, s, s); B.blob.material.opacity = Math.max(0.2, 1 - h * 0.08);
  }

  // ---- people ---------------------------------------------------------------------------------------------------------
  var SKINS = ['#f1c9a5', '#e0ac86', '#c68a62', '#a56a45', '#7a4a2e', '#5a3420'], HAIRS = ['#16100a', '#2a1a0e', '#4a2c14', '#7a5224', '#b68a3c', '#c9c9c9', '#7a1f0e'];
  function mesh(geo, mat, x, y, z, cast) { var m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (cast !== false) m.castShadow = true; return m; }
  function player(o) {
    o = o || {};
    var h = o.height || 1, bw = o.build || 1, hh = hashStr(o.name || o.number || Math.random()), P = { o: o, ph: Math.random() * 6, t: 0, speed: 0, face: 0, kickT: -1, kickFoot: 1, diveT: -1, diveSide: 1, slideT: -1, fallT: -1, cel: false, gesture: '', gdir: 0, card: null, flag: false, idle: Math.random() * 6 };
    var skinC = o.skin || SKINS[hh % SKINS.length], hairC = o.hair || HAIRS[(hh >> 4) % HAIRS.length], style = o.hairStyle != null ? o.hairStyle : (hh >> 8) % 4;
    var kitMat = new THREE.MeshLambertMaterial({ map: kitTexture(o.kit || '#d33', o.trim || '#ffffff', o.number, o.kitStyle || 0) }), sleeveMat = lam(o.sleeve || o.kit || '#d33');
    var skin = lam(skinC), hair = lam(hairC), shortsM = lam(o.shorts || '#ffffff'), sockM = lam(o.socks || o.kit || '#d33'), bootM = lam(o.boots || '#0d0d14'), gloveM = lam(o.gloves || '#ffd23f');
    var root = new THREE.Group(); P.root = root;
    P.kitMat = kitMat; P.num = o.number;
    P.setNumber = function (n) { kitMat.map = kitTexture(o.kit || '#d33', o.trim || '#ffffff', n, o.kitStyle || 0); kitMat.needsUpdate = true; P.num = n; };
    var yaw = new THREE.Group(); root.add(yaw); P.yaw = yaw;
    var lean = new THREE.Group(); yaw.add(lean); P.lean = lean;
    var hips = new THREE.Group(); hips.position.y = 0.92 * h; lean.add(hips); P.hips = hips;
    var torso = new THREE.Group(); hips.add(torso); P.torso = torso;
    var chest = mesh(new THREE.CylinderGeometry(0.2 * bw, 0.165 * bw, 0.6, 16), kitMat, 0, 0.3, 0); chest.scale.set(0.8, 1, 1.12); chest.rotation.y = 0; torso.add(chest);
    torso.add(mesh(new THREE.SphereGeometry(0.2 * bw, 12, 8, 0, TAU, 0, Math.PI / 2), kitMat, 0, 0.6, 0)).scale.set(0.8, 0.55, 1.12);
    torso.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), skin, 0, 0.64, 0));
    var head = new THREE.Group(); head.position.y = 0.75; torso.add(head); P.head = head;
    var skull = mesh(new THREE.SphereGeometry(0.132, 14, 12), skin, 0, 0, 0); skull.scale.set(0.95, 1.1, 0.92); head.add(skull);
    head.add(mesh(new THREE.BoxGeometry(0.04, 0.05, 0.035), lam(shade(skinC, -0.1)), 0.112, -0.012, 0, false));
    [-1, 1].forEach(function (z) { head.add(mesh(new THREE.SphereGeometry(0.014, 6, 5), bas(0x15110f), 0.102, 0.03, z * 0.042, false)); });
    if (style === 0) { var c0 = mesh(new THREE.SphereGeometry(0.122, 14, 8, 0, TAU, 0, 1.45), hair, -0.012, 0.012, 0); c0.scale.set(0.97, 1.1, 0.95); head.add(c0); }
    else if (style === 1) { var c1 = mesh(new THREE.SphereGeometry(0.119, 12, 8, 0, TAU, 0, 1.15), hair, -0.004, 0.012, 0); c1.scale.set(0.96, 1.1, 0.93); head.add(c1); }
    else if (style === 2) { var c2 = mesh(new THREE.SphereGeometry(0.124, 14, 8, 0, TAU, 0, 1.55), hair, -0.02, 0.012, 0); c2.scale.set(0.98, 1.1, 0.97); head.add(c2); head.add(mesh(new THREE.BoxGeometry(0.07, 0.2, 0.17), hair, -0.1, -0.06, 0)); }
    function limb(parent, x, y, z, upLen, loLen, upM, loM, upR, loR) {
      var g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
      g.add(mesh(new THREE.CylinderGeometry(upR, upR * 0.82, upLen, 8), upM, 0, -upLen / 2, 0));
      var k = new THREE.Group(); k.position.y = -upLen; g.add(k);
      k.add(mesh(new THREE.CylinderGeometry(loR, loR * 0.82, loLen, 8), loM, 0, -loLen / 2, 0));
      return { g: g, k: k };
    }
    var legs = [-1, 1].map(function (side) {
      var L = limb(hips, 0, 0, side * 0.095 * bw, 0.45 * h, 0.43 * h, skin, sockM, 0.075 * bw, 0.056 * bw);
      var boot = mesh(new THREE.BoxGeometry(0.27, 0.085, 0.105), bootM, 0.06, -0.43 * h, 0); L.k.add(boot); L.boot = boot; return L;
    });
    P.legL = legs[0]; P.legR = legs[1];
    var shorts = mesh(new THREE.CylinderGeometry(0.19 * bw, 0.21 * bw, 0.27, 14), shortsM, 0, -0.04, 0); shorts.scale.set(0.82, 1, 1.15); hips.add(shorts);
    var arms = [-1, 1].map(function (side) {
      var A = limb(torso, 0, 0.52, side * 0.25 * bw, 0.3, 0.27, sleeveMat, skin, 0.056, 0.045);
      var hand = mesh(new THREE.SphereGeometry(o.gk ? 0.068 : 0.045, 8, 6), o.gk ? gloveM : skin, 0, -0.29, 0); A.k.add(hand); A.hand = hand;
      return A;
    });
    P.armL = arms[0]; P.armR = arms[1];
    var card = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.14, 0.095), bas(0xffd23f)); card.position.set(0, -0.36, 0); card.visible = false; P.armR.k.add(card); P.cardMesh = card;
    if (o.flag) {                                                              // an assistant referee's flag
      var fl = new THREE.Group(), stick = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), lam(0x444444), 0, -0.22, 0, false); fl.add(stick);
      var cloth = mesh(new THREE.PlaneGeometry(0.4, 0.3), bas(0xffd23f, { side: THREE.DoubleSide }), 0, -0.33, 0.2, false); cloth.rotation.y = Math.PI / 2; fl.add(cloth);
      fl.position.set(0, -0.29, 0); P.armR.k.add(fl); P.flagMesh = fl;
    }
    P.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: BLOB || (BLOB = blobTexture()), transparent: true, depthWrite: false, opacity: o.noBlob ? 0 : 0.5 }));
    P.blob.rotation.x = -Math.PI / 2; P.blob.position.y = 0.02; root.add(P.blob);
    root.scale.set(1, 1, 1);
    return P;
  }
  function face(P, dx, dz) { P.face = Math.atan2(-dz, dx); }
  function setPos(P, x, z) { P.root.position.x = x; P.root.position.z = z; }

  function swingTo(P, hip, knee, side) { var L = side > 0 ? P.legR : P.legL; L.g.rotation.z = hip; L.k.rotation.z = -knee; }
  function pose(P, dt) {
    dt = Math.min(dt || 0.016, 0.05); P.t += dt; P.idle += dt;
    // turn smoothly towards the wanted heading
    var d = angDiff(P.yaw.rotation.y, P.face), turn = Math.min(Math.abs(d), (P.turnRate || 9) * dt); P.yaw.rotation.y += Math.sign(d) * turn;
    var sp = clamp(P.speed / 7, 0, 1.3), run = P.speed > 0.4; P.ph += dt * (run ? (4 + P.speed * 1.45) : 0);
    var s = Math.sin(P.ph), c = Math.cos(P.ph), sc = Math.sin(P.ph + Math.PI), cc = Math.cos(P.ph + Math.PI);
    var A = 0.33 + 0.5 * Math.min(1, P.speed / 6), K = 0.25 + 1.05 * Math.min(1, P.speed / 6);
    var stand = run ? 0 : 1, br = Math.sin(P.idle * 1.6) * 0.012;
    var hipR = A * s, hipL = A * sc, knR = 0.12 + K * Math.max(0, c), knL = 0.12 + K * Math.max(0, cc);
    var shR = -0.9 * A * s * 1.15, shL = -0.9 * A * sc * 1.15, elb = 0.35 + 0.9 * Math.min(1, P.speed / 6);
    var bob = run ? Math.abs(c) * 0.045 * sp : br, leanF = -0.02 - 0.15 * sp, twist = run ? 0.16 * s * sp : 0, lx = 0, ang = 0, jump = 0, ly = 0, rz = 0;
    P.lean.rotation.set(0, 0, 0); P.root.position.y = P.jumpY || 0; P.torso.rotation.set(0, twist, leanF); P.head.rotation.set(0, 0, 0);
    var aRx = 0, aLx = 0;                                                       // sideways arm roll
    var armRz = shR, armLz = shL, elbR = elb, elbL = elb;
    if (P.kickT >= 0) {                                                          // kick: wind up, strike at 0.56, follow through
      var k = P.kickT, kf = P.kickFoot > 0, hipK, knK, plantK = 0.3;
      if (k < 0.5) { var u = ease(k / 0.5); hipK = lerp(0.25, -0.95, u); knK = lerp(0.3, 1.7, u); }
      else if (k < 0.64) { var u2 = (k - 0.5) / 0.14; hipK = lerp(-0.95, 1.25, ease(u2)); knK = lerp(1.7, 0.1, ease(u2)); }
      else { var u3 = ease((k - 0.64) / 0.36); hipK = lerp(1.25, 0.2, u3); knK = lerp(0.1, 0.25, u3); }
      var plantH = k < 0.64 ? lerp(0.1, 0.4, ease(Math.min(1, k / 0.45))) : lerp(0.4, 0.1, ease((k - 0.64) / 0.36));
      swingTo(P, hipK, knK, kf ? 1 : -1); swingTo(P, plantH, plantK, kf ? -1 : 1);
      var wing = k < 0.5 ? lerp(0.2, 0.9, ease(k / 0.5)) : lerp(0.9, -0.5, ease((k - 0.5) / 0.5));
      armRz = kf ? wing * 0.6 : -wing * 0.9; armLz = kf ? -wing * 0.9 : wing * 0.6; elbR = elbL = 0.5;
      P.torso.rotation.z = k < 0.5 ? lerp(0.1, 0.2, ease(k / 0.5)) : lerp(0.2, -0.25, ease((k - 0.5) / 0.5));
      aRx = 0.25; aLx = -0.25;
      P.skipLegs = true;
    } else P.skipLegs = false;
    if (!P.skipLegs) { swingTo(P, hipR, knR, 1); swingTo(P, hipL, knL, -1); }
    if (P.diveT >= 0) {                                                          // a keeper's dive, to the model's right (+1) or left (-1)
      var dv = ease(P.diveT), side = P.diveSide >= 0 ? 1 : -1;
      P.lean.rotation.x = side * (1.35 * dv * (P.diveAmp == null ? 1 : P.diveAmp)); jump = Math.sin(Math.min(1, P.diveT) * Math.PI) * 0.5; ly = jump + 0.1 * dv;
      P.armL.g.rotation.x = side > 0 ? -2.9 * dv : 2.9 * dv; P.armR.g.rotation.x = side > 0 ? -2.9 * dv : 2.9 * dv; P.armL.g.rotation.z = P.armR.g.rotation.z = 0;
      P.armL.k.rotation.z = P.armR.k.rotation.z = 0.2;
      swingTo(P, 0.35 * dv, 0.6 * dv, 1); swingTo(P, -0.2 * dv, 0.3 * dv, -1);
      P.root.position.y = ly; P.torso.rotation.set(0, 0, -0.1 * dv); P.skipArms = true;
    } else if (P.slideT >= 0) {                                                  // a slide tackle: low and feet first
      var sl = ease(Math.min(1, P.slideT * 4)), out = 1 - ease(Math.max(0, (P.slideT - 0.7) / 0.3));
      P.lean.rotation.z = 1.2 * sl * out; P.root.position.y = 0.32 * sl * out * (P.slideH == null ? 1 : P.slideH) + (P.jumpY || 0);
      swingTo(P, 1.5 * sl * out, 0.1, 1); swingTo(P, 0.5 * sl * out, 1.1 * sl * out, -1);
      P.armL.g.rotation.z = P.armR.g.rotation.z = -0.9 * sl; P.skipArms = true;
    } else if (P.fallT >= 0) {                                                   // knocked over, then lying
      var fa = ease(Math.min(1, P.fallT * 2.2));
      var fsg = P.fallSign == null ? 1 : P.fallSign;                              // +1 falls on the back, -1 falls forwards onto the front
      P.lean.rotation.z = 1.5 * fa * fsg; P.root.position.y = 0.2 * fa + (P.jumpY || 0); swingTo(P, 0.5 * fa * fsg, 0.6 * fa, 1); swingTo(P, 0.1 * fa, 0.9 * fa, -1);
      P.armL.g.rotation.z = P.armR.g.rotation.z = -0.5 * fa; P.skipArms = true;
    } else P.skipArms = false;
    if (!P.skipArms) {
      P.armR.g.rotation.set(aRx, 0, armRz); P.armL.g.rotation.set(aLx, 0, armLz); P.armR.k.rotation.z = elbR; P.armL.k.rotation.z = elbL;
      var gs = P.gesture;
      if (P.cel) {                                                               // celebrating: arms up, bouncing
        P.armL.g.rotation.set(2.6, 0, 0); P.armR.g.rotation.set(-2.6, 0, 0); P.armL.k.rotation.z = P.armR.k.rotation.z = 0.15; jump = Math.abs(Math.sin(P.t * 9 + P.idle)) * 0.24; P.root.position.y = jump;
        P.torso.rotation.set(0, 0, -0.05);
      } else if (gs === 'point') { P.armR.g.rotation.set(0, 0, 1.57); P.armR.k.rotation.z = 0.05; }
      else if (gs === 'whistle') { P.armR.g.rotation.set(0, 0, 0.55); P.armR.k.rotation.z = 2.35; }
      else if (gs === 'card') { P.armR.g.rotation.set(0, 0, 3.0); P.armR.k.rotation.z = 0.0; }
      else if (gs === 'advantage') { P.armR.g.rotation.set(0, 0, 1.15); P.armL.g.rotation.set(0, 0, 1.15); P.armR.k.rotation.z = P.armL.k.rotation.z = 0.15; }
      else if (gs === 'flagUp') { P.armR.g.rotation.set(0, 0, 3.0); P.armR.k.rotation.z = 0; }
      else if (gs === 'flagSide') { P.armR.g.rotation.set(-1.45, 0, 0); P.armR.k.rotation.z = 0; }
      else if (gs === 'flagDown') { P.armR.g.rotation.set(0, 0, 0.1); P.armR.k.rotation.z = 0.1; }
      else if (gs === 'hands') { P.armR.g.rotation.set(0, 0, 0.8); P.armL.g.rotation.set(0, 0, 0.8); P.armR.k.rotation.z = P.armL.k.rotation.z = 1.4; }
      else if (gs === 'ready') { P.armR.g.rotation.set(0.2, 0, 0.35); P.armL.g.rotation.set(-0.2, 0, 0.35); P.armR.k.rotation.z = P.armL.k.rotation.z = 1.0; P.torso.rotation.z = -0.08; }
      else if (gs === 'throw') { P.armR.g.rotation.set(0, 0, 2.9); P.armL.g.rotation.set(0, 0, 2.9); P.armR.k.rotation.z = P.armL.k.rotation.z = 0.35; P.torso.rotation.z = 0.12; }
      else if (gs === 'armUp') { P.armR.g.rotation.set(-2.5, 0, 0); P.armR.k.rotation.z = 0.1; }
      else if (gs === 'armOut') { P.armR.g.rotation.set(-1.5, 0, 0); P.armR.k.rotation.z = 0.05; P.armL.g.rotation.set(1.5, 0, 0); P.armL.k.rotation.z = 0.05; }
      else if (gs === 'shrug') { P.armR.g.rotation.set(-0.6, 0, 0.5); P.armL.g.rotation.set(0.6, 0, 0.5); P.armR.k.rotation.z = P.armL.k.rotation.z = 1.5; }
      else if (gs === 'rage') { P.armR.g.rotation.set(-1.0, 0, 1.2 + Math.sin(P.t * 11) * 0.5); P.armL.g.rotation.set(1.0, 0, 1.2 + Math.cos(P.t * 11) * 0.5); P.armR.k.rotation.z = P.armL.k.rotation.z = 1.2; P.torso.rotation.z = 0.2; }
    }
    if (P.cardMesh) { P.cardMesh.visible = P.gesture === 'card' && !!P.card; if (P.card) P.cardMesh.material.color.set(P.card === 'r' ? 0xe5223a : 0xffd23f); }
    if (P.flagMesh) P.flagMesh.visible = true;
    P.hips.position.y = 0.92 * (P.o.height || 1) + bob - (run ? 0.02 * sp : 0) + (P.kickT >= 0 ? -0.03 : 0);
    P.blob.visible = P.root.position.y < 0.9;
    var by = P.root.position.y; P.blob.position.y = 0.02 - by; P.blob.material.opacity = (P.o.noBlob ? 0 : 0.5) * clamp(1 - by * 0.8, 0.2, 1);
  }

  // ---- sound ----------------------------------------------------------------------------------------------------------
  var AC = null, noiseBuf = null, muted = false;
  function ac() {
    if (muted) return null;
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = false; } }
    if (!AC) return null; if (AC.state === 'suspended') { try { AC.resume(); } catch (e2) {} }
    return AC;
  }
  function noise(a) { if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } var s = a.createBufferSource(); s.buffer = noiseBuf; return s; }
  function tone(a, f, f2, dur, vol, type, at) {
    var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + (at || 0); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur); o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function burst(a, fType, f, q, dur, vol, at, attack) {
    var s = noise(a), fl = a.createBiquadFilter(), g = a.createGain(), t0 = a.currentTime + (at || 0); fl.type = fType; fl.frequency.value = f; fl.Q.value = q || 1;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  function sfx(name, v) {
    var a = ac(); if (!a) return; v = v == null ? 1 : v;
    try {
      if (name === 'kick') { tone(a, 150, 55, 0.14, 0.5 * v, 'sine'); burst(a, 'lowpass', 900, 0.8, 0.1, 0.5 * v); }
      else if (name === 'post') { tone(a, 1250, 1180, 0.55, 0.28 * v, 'sine'); tone(a, 1870, 1800, 0.4, 0.14 * v, 'sine'); burst(a, 'highpass', 3000, 1, 0.06, 0.2 * v); }
      else if (name === 'net') { burst(a, 'bandpass', 1500, 0.7, 0.45, 0.32 * v, 0, 0.03); burst(a, 'lowpass', 400, 1, 0.3, 0.25 * v); }
      else if (name === 'save') { burst(a, 'bandpass', 700, 1, 0.12, 0.55 * v); tone(a, 220, 120, 0.1, 0.3 * v); }
      else if (name === 'bounce') { tone(a, 130, 70, 0.09, 0.28 * v); }
      else if (name === 'whistle') { var o = a.createOscillator(), g = a.createGain(), l = a.createOscillator(), lg = a.createGain(), t0 = a.currentTime; o.type = 'sine'; o.frequency.value = 2900; l.frequency.value = 38; lg.gain.value = 95; l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.25 * v, t0 + 0.02); g.gain.setValueAtTime(0.25 * v, t0 + 0.4 * (v > 1 ? 1.4 : 1)); g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.55 * (v > 1 ? 1.4 : 1)); o.connect(g); g.connect(a.destination); o.start(t0); l.start(t0); o.stop(t0 + 0.9); l.stop(t0 + 0.9); }
      else if (name === 'cheer') { burst(a, 'bandpass', 1100, 0.4, 2.2, 0.45 * v, 0, 0.35); burst(a, 'bandpass', 2300, 0.5, 1.8, 0.2 * v, 0.1, 0.3); }
      else if (name === 'groan') { burst(a, 'lowpass', 520, 0.6, 1.1, 0.35 * v, 0, 0.2); tone(a, 190, 110, 0.9, 0.08 * v, 'sawtooth'); }
      else if (name === 'ooh') { burst(a, 'bandpass', 800, 0.5, 1.0, 0.3 * v, 0, 0.25); }
      else if (name === 'tick') { tone(a, 900, 900, 0.05, 0.15 * v, 'square'); }
      else if (name === 'good') { tone(a, 660, 660, 0.12, 0.2 * v, 'triangle'); tone(a, 990, 990, 0.2, 0.2 * v, 'triangle', 0.1); }
      else if (name === 'bad') { tone(a, 200, 150, 0.3, 0.2 * v, 'sawtooth'); }
    } catch (e) {}
  }

  // ---- misc scene helpers ---------------------------------------------------------------------------------------------
  function cone(color) {
    var g = new THREE.Group(), m = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 14), lam(color || 0xff7a1a)); m.position.y = 0.2; m.castShadow = true; g.add(m);
    var st = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.14, 0.04, 14), lam(0xffffff)); st.position.y = 0.2; st.scale.set(1, 1, 1); g.add(st);
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.34), lam(color || 0xff7a1a)); base.position.y = 0.012; g.add(base);
    return g;
  }
  function disc(r, color, opacity) { var m = new THREE.Mesh(new THREE.CircleGeometry(r, 36), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: opacity == null ? 0.5 : opacity, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; return m; }
  function ring(r0, r1, color, opacity) { var m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: opacity == null ? 0.9 : opacity, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = 0.035; return m; }
  function supported() { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } }

  return {
    PL: PL, PW: PW, HL: HL, HW: HW, GW: GW, GH: GH, GD: GD, MARGIN: MARGIN,
    rng32: rng32, hashStr: hashStr, canvas: canvas, tex: tex, shade: shade, lam: lam, bas: bas, clamp: clamp, ease: ease, lerp: lerp, angDiff: angDiff, quad: quad,
    stadium: stadium, goal: goal, netHit: netHit, ball: ball, ballAt: ballAt, player: player, pose: pose, face: face, setPos: setPos, cone: cone, disc: disc, ring: ring,
    sfx: sfx, supported: supported, mute: function (m) { muted = !!m; }, isMuted: function () { return muted; }, unlock: function () { ac(); },
    kitTexture: kitTexture, crowdTexture: crowdTexture, glowTexture: glowTexture, blobTexture: blobTexture
  };
})();
