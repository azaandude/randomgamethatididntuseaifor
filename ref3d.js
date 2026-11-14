/* ref3d.js — the Referee Simulator's 3D world: a full 11 v 11 match (4-4-2 against 4-3-3) with a referee and two assistants,
   a living ball (passes, tackles, shots, saves, goals, throw-ins, corners), day/night grounds by league tier and three cameras.
   Needs three.min.js and nom3d.js (global N3). ref3d_inc.js adds staged incidents, the VAR replay and the outcomes on top.
   Everything is in metres: pitch 105 x 68, x runs along it, z across it, y is up. Home attack +x, away attack -x. */
var W3 = (function () {
  'use strict';
  var PL = N3.PL, PW = N3.PW, HL = N3.HL, HW = N3.HW, GW = N3.GW, GH = N3.GH;
  var clamp = N3.clamp, lerp = N3.lerp, ease = N3.ease, angDiff = N3.angDiff, rnd = Math.random;
  var BR = 0.16, KT = 0.46;                                                   // ball radius, length of a kick in seconds

  function hyp(a, b) { return Math.sqrt(a * a + b * b); }
  function pick(a) { return a[(rnd() * a.length) | 0]; }
  function rgb(c) { var k = new THREE.Color(c); return [k.r * 255, k.g * 255, k.b * 255]; }
  function cdist(a, b) { var x = rgb(a), y = rgb(b), r = x[0] - y[0], g = x[1] - y[1], bl = x[2] - y[2]; return Math.sqrt(r * r * 0.9 + g * g * 1.2 + bl * bl * 0.8); }
  function lum(c) { var x = rgb(c); return (0.299 * x[0] + 0.587 * x[1] + 0.114 * x[2]) / 255; }
  function farthest(list, avoid) { var best = list[0], bs = -1; list.forEach(function (c) { var m = 1e9; avoid.forEach(function (x) { m = Math.min(m, cdist(c, x)); }); if (m > bs) { bs = m; best = c; } }); return best; }

  // normalised formation: role, depth u (0 own goal .. 1 opposing goal), width v (-1..1), shirt number
  var FORM = [
    [['GK', 0.02, 0, 1], ['DEF', 0.20, 0.78, 2], ['DEF', 0.19, 0.27, 5], ['DEF', 0.19, -0.27, 4], ['DEF', 0.20, -0.78, 3],
     ['MID', 0.46, 0.82, 7], ['MID', 0.42, 0.27, 8], ['MID', 0.42, -0.27, 6], ['MID', 0.46, -0.82, 11], ['FWD', 0.70, 0.22, 9], ['FWD', 0.70, -0.22, 10]],
    [['GK', 0.02, 0, 1], ['DEF', 0.20, 0.78, 2], ['DEF', 0.19, 0.27, 5], ['DEF', 0.19, -0.27, 4], ['DEF', 0.20, -0.78, 3],
     ['MID', 0.35, 0, 6], ['MID', 0.46, 0.42, 8], ['MID', 0.46, -0.42, 10], ['FWD', 0.71, 0.75, 7], ['FWD', 0.74, 0, 9], ['FWD', 0.71, -0.75, 11]]
  ];
  var GKC = ['#ffd23f', '#2ee59d', '#ff7a1a', '#ec4899', '#7c5cff', '#22d3ee'], REFC = ['#f5e60a', '#18c26b', '#ff4fa3', '#ff7a1a'];

  var W = { ready: false, speed: 1, frozen: false, camMode: 'follow', onGoal: null, onEvent: null, tier: 0, quality: 0 };
  var R = W.R = {};
  var canvas, renderer, scene, camera, S, ball, amb, Q = 0, qAcc = 0, qN = 0, focusT = 0;
  var team = [[], []], all = [], refP = null, ars = [], K = null;
  var G = {
    state: 'dead', clock: 0, timer: 0, owner: null, tm: 0, last: 0, lastP: null, b: { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0 },
    fl: null, pend: null, decide: 1, hold: false, forcePass: false, safe: 0, score: [0, 0], rs: null, scorer: null, cc: 0, gkPlan: null
  };
  R.G = G; R.team = team; R.all = all; R.hyp = hyp; R.BR = BR;

  // ---- kits ---------------------------------------------------------------------------------------------------------------
  function styleFor(name) { return [0, 0, 1, 2, 3][N3.hashStr(name || 'x') % 5]; }
  function mkKit(main, name) {
    var l = lum(main);
    return { main: main, trim: l > 0.6 ? '#14203a' : '#ffffff', shorts: l > 0.6 ? '#14203a' : (l < 0.22 ? '#eeeeee' : '#ffffff'), socks: main, style: styleFor(name) };
  }
  function pickKits(o) {
    var h = o.homeColor || '#d63c3c', a = o.awayColor || '#3c6fd6';
    if (cdist(h, a) < 120) a = lum(h) > 0.5 ? '#16254a' : '#f3f3f3';
    if (cdist(h, a) < 120) a = '#f5d90a';
    var k = { names: [o.home || 'Home', o.away || 'Away'], team: [mkKit(h, o.home), mkKit(a, o.away)] };
    var g0 = farthest(GKC, [h, a]), g1 = farthest(GKC.filter(function (c) { return c !== g0; }), [h, a, g0]);
    k.gk = [mkKit(g0, 'gk0'), mkKit(g1, 'gk1')];
    k.gk.forEach(function (g) { g.style = 0; g.trim = '#111111'; g.shorts = '#111111'; g.socks = '#111111'; });
    var rc = REFC[0]; if (Math.min(cdist(rc, h), cdist(rc, a), cdist(rc, g0), cdist(rc, g1)) < 100) rc = farthest(REFC, [h, a, g0, g1]);
    k.ref = rc;
    return k;
  }

  // ---- people ---------------------------------------------------------------------------------------------------------------
  function disposeNode(o) { o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) { if (Array.isArray(n.material)) n.material.forEach(function (m) { m.dispose(); }); else n.material.dispose(); } }); }
  function clearPeople() {
    all.forEach(function (p) { scene.remove(p.root); disposeNode(p.root); });
    all.length = 0; team[0].length = 0; team[1].length = 0;
    if (refP) { scene.remove(refP.root); disposeNode(refP.root); refP = null; }
    ars.forEach(function (p) { scene.remove(p.root); disposeNode(p.root); }); ars.length = 0;
  }
  function clearPose(p) { p.kickT = p.slideT = p.diveT = p.fallT = -1; p.gesture = ''; p.jumpY = 0; p.cel = false; p.card = null; p.fallSign = 1; p.slideH = 1; p.diveAmp = 1; p.speed = 0; }
  function initMover(p) { p.x = p.z = p.vx = p.vz = p.tx = p.tz = 0; p.run = 0.6; p.maxSp = 7; p.lock = 0; p.scripted = false; p.on = true; clearPose(p); }
  function buildPeople(k) {
    clearPeople();
    var t, i;
    for (t = 0; t < 2; t++) for (i = 0; i < 11; i++) {
      var f = FORM[t][i], kit = i === 0 ? k.gk[t] : k.team[t], hh = N3.hashStr(k.names[t] + ':' + f[3]);
      var p = N3.player({ kit: kit.main, trim: kit.trim, shorts: kit.shorts, socks: kit.socks, kitStyle: kit.style, number: f[3], name: k.names[t] + f[3] + (t ? 'b' : 'a'), gk: i === 0, height: 0.95 + (hh % 14) / 100 + (i === 0 ? 0.04 : 0), build: 0.94 + ((hh >> 5) % 12) / 100 });
      p.team = t; p.i = i; p.role = f[0]; p.bu = f[1]; p.bv = f[2]; p.seed = rnd() * 6.28; initMover(p);
      scene.add(p.root); team[t].push(p); all.push(p);
    }
    var rk = k.ref;
    refP = N3.player({ kit: rk, trim: '#111111', shorts: '#111111', socks: '#111111', name: 'referee', hair: '#1c1c1c', boots: '#111111', height: 1.03 });
    refP.team = -1; refP.role = 'REF'; refP.seed = 1; initMover(refP); refP.maxSp = 6.2; refP.run = 0.7; scene.add(refP.root);
    for (i = 0; i < 2; i++) {
      var ar = N3.player({ kit: rk, trim: '#111111', shorts: '#111111', socks: '#111111', name: 'assistant' + i, boots: '#111111', flag: true, height: 1.0 });
      ar.team = -1; ar.role = 'AR'; ar.seed = 2 + i; initMover(ar); ar.maxSp = 6.5; ar.run = 0.8; ars.push(ar); scene.add(ar.root);
    }
    R.ref = refP; R.ars = ars; R.k = k;
  }

  // ---- positions ------------------------------------------------------------------------------------------------------------
  function gkSpot(p, bx, bz) { var t = p.team, dir = t === 0 ? 1 : -1, gx = t === 0 ? -HL + 1.3 : HL - 1.3, dg = hyp(bx - (t === 0 ? -HL : HL), bz); return { x: gx + dir * clamp((26 - dg) * 0.1, 0, 2.6), z: clamp(bz * 0.14, -2.6, 2.6) }; }
  function baseTarget(p, bx, bz) {
    var t = p.team, ballU = t === 0 ? (bx + HL) / PL : (HL - bx) / PL, has = G.tm === t, push = (ballU - 0.5) * 0.5;
    var shift = p.role === 'DEF' ? 0.78 : p.role === 'MID' ? 1 : 1.05;
    var u = p.bu + push * shift + (has ? (p.role === 'FWD' ? 0.07 : p.role === 'MID' ? 0.03 : 0) : (p.role === 'FWD' ? -0.05 : 0));
    u = clamp(u, 0.07, 0.93);
    var v = clamp(p.bv * (has ? 1.0 : 0.82) + clamp(bz / HW, -1, 1) * 0.24 * (p.role === 'DEF' ? 1 : 0.7), -0.92, 0.92);
    return { x: t === 0 ? -HL + u * PL : HL - u * PL, z: v * (HW - 4) * (t === 0 ? 1 : -1) };
  }
  function snapFormation(bx, bz) {
    all.forEach(function (p) {
      if (!p.on) return;
      var b = p.role === 'GK' ? gkSpot(p, bx, bz) : baseTarget(p, bx, bz);
      p.x = b.x; p.z = b.z; p.vx = p.vz = 0; p.tx = p.x; p.tz = p.z; clearPose(p);
    });
  }
  function kickoffSnap(kt, taker) {
    G.tm = kt; snapFormation(0, 0);
    all.forEach(function (p) {
      if (!p.on || p.role === 'GK') return;
      var s = p.team === 0 ? -1 : 1, minAx = p.team === kt ? 1.5 : 10.4;
      p.x = s * Math.max(Math.abs(p.x), minAx); p.tx = p.x;
    });
    if (taker) { var d = kt === 0 ? 1 : -1; taker.x = -d * 0.6; taker.z = 0; taker.tx = taker.x; taker.tz = 0; }
  }

  // ---- movement ----------------------------------------------------------------------------------------------------------------
  function steer(p, tx, tz, maxSp, h) {
    var dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz), want = Math.min(maxSp, d * 2.4);
    if (d < 0.2) want = 0;
    var wx = d > 1e-4 ? dx / d * want : 0, wz = d > 1e-4 ? dz / d * want : 0, ax = wx - p.vx, az = wz - p.vz, al = hyp(ax, az), mx = 13 * h;
    if (al > mx) { ax *= mx / al; az *= mx / al; }
    p.vx += ax; p.vz += az; p.x += p.vx * h; p.z += p.vz * h;
  }
  function nearestOppDist(t, x, z) { var m = 99; team[1 - t].forEach(function (q) { if (!q.on) return; var d = hyp(q.x - x, q.z - z); if (d < m) m = d; }); return m; }
  function laneGap(o, q) {                                                       // how close the nearest opponent is to the passing lane
    var m = 8, ax = o.x, az = o.z, bx = q.x - ax, bz = q.z - az, l2 = bx * bx + bz * bz || 1;
    team[1 - o.team].forEach(function (e) { if (!e.on) return; var u = clamp(((e.x - ax) * bx + (e.z - az) * bz) / l2, 0, 1), d = hyp(e.x - (ax + bx * u), e.z - (az + bz * u)); if (d < m) m = d; });
    return m;
  }
  function pickTarget(o, gk) {
    var best = null, bs = -1e9, dir = o.team === 0 ? 1 : -1;
    team[o.team].forEach(function (q) {
      if (q === o || !q.on || q.scripted) return;
      var d = hyp(q.x - o.x, q.z - o.z);
      if (d < (gk ? 14 : 6) || d > (gk ? 56 : 34)) return;
      if (q.role === 'GK') return;
      var open = Math.min(9, nearestOppDist(o.team, q.x, q.z)), fwd = (q.x - o.x) * dir, lane = Math.min(6, laneGap(o, q));
      var s = fwd * (gk ? 0.2 : 0.5) + open * 1.1 + lane * 2.2 - (gk ? 0 : Math.abs(d - 16) * 0.18) + rnd() * 3.2;
      if (s > bs) { bs = s; best = q; }
    });
    return best;
  }

  function take(p, ground) {
    var B = G.b;
    G.owner = p; G.tm = p.team; G.last = p.team; G.lastP = p; G.state = 'carry'; G.fl = null; G.pend = null; G.safe = 0.7;
    G.hold = p.role === 'GK' && !ground; G.decide = G.hold ? 1.1 + rnd() * 0.8 : 0.35 + rnd() * 0.7;
    B.vx = B.vy = B.vz = 0;
  }
  function freeBall(vx, vy, vz) { var B = G.b; B.vx = vx; B.vy = vy; B.vz = vz; G.state = 'loose'; G.owner = null; G.fl = null; }

  // ---- restarts ------------------------------------------------------------------------------------------------------------------
  function restart(kind, t, x, z) {
    var B = G.b, dir = t === 0 ? 1 : -1, taker = null, best = 1e9;
    G.state = 'dead'; G.owner = null; G.fl = null; G.pend = null; G.hold = false; G.gkPlan = null; G.tm = t; G.last = 1 - t; G.lastP = null;
    all.forEach(function (p) { if (p.role !== 'AR') { p.cel = false; p.gesture = ''; } });
    B.x = x; B.z = z; B.y = BR; B.vx = B.vy = B.vz = 0;
    if (kind === 'goalkick') taker = team[t][0];
    else team[t].forEach(function (p) { if (!p.on || p.role === 'GK' || p.scripted) return; var d = hyp(p.x - x, p.z - z) + (kind === 'kickoff' && p.i < 9 ? 100 : 0); if (d < best) { best = d; taker = p; } });
    if (!taker) taker = team[t][0];
    var sx = -dir * 0.55, sz = 0;
    if (kind === 'throw') { sx = 0; sz = z >= 0 ? 0.7 : -0.7; } else if (kind === 'corner') { sx = x >= 0 ? 0.5 : -0.5; sz = z >= 0 ? 0.5 : -0.5; }
    G.rs = { kind: kind, team: t, x: x, z: z, sx: sx, sz: sz, taker: taker };
    G.timer = kind === 'kickoff' ? 2.2 : kind === 'corner' ? 2.4 : kind === 'goalkick' ? 1.9 : 1.5;
    if (kind === 'kickoff') kickoffSnap(t, taker);
  }
  function deadStep(h) {
    var rs = G.rs, tk = rs.taker; G.timer -= h;
    tk.tx = rs.x + rs.sx; tk.tz = rs.z + rs.sz; tk.run = 0.9;
    var near = hyp(tk.x - tk.tx, tk.z - tk.tz) < 0.9;
    if ((G.timer <= 0 && near) || G.timer < -2.5) {
      if (!near) { tk.x = tk.tx; tk.z = tk.tz; tk.vx = tk.vz = 0; }
      G.forcePass = true; take(tk, true); G.decide = 0.25;
    }
  }

  // ---- kicking ---------------------------------------------------------------------------------------------------------------------
  function startKick(o, kind, q) { G.pend = { o: o, kind: kind, q: q, k: 0, done: false }; o.kickT = 0; o.kickFoot = rnd() < 0.78 ? 1 : -1; G.hold = false; }
  function pendStep(h) {
    var pd = G.pend, o = pd.o; pd.k += h / KT; o.kickT = Math.min(1, pd.k);
    if (!pd.done) { o.tx = o.x; o.tz = o.z; o.run = 0; }
    if (!pd.done && pd.k >= 0.56) { pd.done = true; if (pd.kind === 'shot') releaseShot(o); else releasePass(pd); }
    if (pd.k >= 1) { o.kickT = -1; G.pend = null; }
  }
  function releasePass(pd) {
    var o = pd.o, q = pd.q, B = G.b, t = o.team, dist = hyp(q.x - B.x, q.z - B.z), lane = laneGap(o, q);
    var lofted = dist > 26 || o.role === 'GK' || (lane < 2.2 && dist > 12 && rnd() < 0.5), sp = lofted ? 17 + rnd() * 3 : 13 + dist * 0.35, T = Math.max(0.35, dist / (sp * 0.85));
    var ax = clamp(q.x + q.vx * T * 0.55, -HL + 1, HL - 1), az = clamp(q.z + q.vz * T * 0.55, -HW + 1, HW - 1);
    var wild = dist > 10 && rnd() < 0.07;                                      // a misplaced pass: out for a throw-in or a goal kick
    if (wild) { ax += (rnd() - 0.5) * 24; az += (rnd() - 0.5) * 24; }
    dist = hyp(ax - B.x, az - B.z); T = Math.max(0.35, dist / (sp * 0.85));
    var fl = { kind: 'pass', x0: B.x, y0: 0, z0: B.z, x1: ax, y1: lofted ? 0.8 : 0, z1: az, T: T, t: 0, h: lofted ? Math.min(7, 1 + dist * 0.17) : 0.06, tgt: q, wild: wild };
    var pInt = lane < 1.4 ? 0.5 : lane < 3 ? 0.25 : lane < 5 ? 0.09 : 0.03; if (lofted) pInt *= 0.5;
    if (!wild && rnd() < pInt) {
      var iq = null, id = 6, bxv = ax - B.x, bzv = az - B.z, l2 = bxv * bxv + bzv * bzv || 1, us = 0.5;
      team[1 - t].forEach(function (e) { if (!e.on || e.role === 'GK' || e.scripted) return; var u = clamp(((e.x - B.x) * bxv + (e.z - B.z) * bzv) / l2, 0.2, 0.9), d = hyp(e.x - (B.x + bxv * u), e.z - (B.z + bzv * u)); if (d < id) { id = d; iq = e; us = u; } });
      if (iq) { fl.x1 = B.x + bxv * us; fl.z1 = B.z + bzv * us; fl.T = T * us; fl.tgt = iq; fl.h *= us; fl.int = true; }
    }
    G.fl = fl; G.state = 'pass'; G.owner = null; G.last = t; G.lastP = o; o.lock = 0.6; N3.sfx('kick', 0.3);
  }
  function releaseShot(o) {
    var t = o.team, dir = t === 0 ? 1 : -1, gx = dir * HL, gk = team[1 - t][0], B = G.b, d = hyp(gx - B.x, B.z), r = rnd(), res;
    var pg = 0.3 - clamp((d - 14) * 0.006, 0, 0.1);
    res = r < pg ? 'goal' : r < pg + 0.28 ? 'save' : r < pg + 0.4 ? 'block' : 'miss';
    var blocker = null, bd = 99;
    if (res === 'block') {
      team[1 - t].forEach(function (e) { if (!e.on || e.role === 'GK' || e.scripted) return; var ex = (e.x - B.x) * dir; if (ex < 2 || ex > 12) return; var dz = Math.abs(e.z - (B.z + (e.x - B.x) * (-B.z) / (gx - B.x || 1))); if (dz < bd) { bd = dz; blocker = e; } });
      if (!blocker || bd > 3.5) res = 'miss';
    }
    var tz, ty, x1 = gx + dir * (res === 'goal' ? 0.45 : 0.05);
    if (res === 'goal') { tz = (rnd() < 0.5 ? -1 : 1) * (3.0 + rnd() * 0.45); ty = 0.3 + rnd() * 1.95; }
    else if (res === 'save') { tz = clamp(gk.z + (rnd() - 0.5) * 3.4, -3.3, 3.3); ty = 0.25 + rnd() * 1.4; }
    else if (res === 'miss') { var sd = rnd() < 0.5 ? -1 : 1; if (rnd() < 0.5) { tz = sd * (GW / 2 + 0.7 + rnd() * 2.6); ty = 0.4 + rnd() * 1.5; } else { tz = (rnd() - 0.5) * 6; ty = GH + 0.5 + rnd() * 2.2; } }
    else { tz = blocker.z; ty = 0.5; x1 = blocker.x; }
    var dist = hyp(x1 - B.x, tz - B.z), sp = 21 + rnd() * 8, T = Math.max(0.28, dist / sp);
    G.fl = { kind: 'shot', res: res, x0: B.x, y0: 0, z0: B.z, x1: x1, y1: ty, z1: tz, T: T, t: 0, h: ty > 1.6 ? 0.12 : 0.04, tgt: blocker, shooter: o };
    G.state = 'shot'; G.owner = null; G.last = t; G.lastP = o; o.lock = 0.8; N3.sfx('kick', 0.7);
    if (res !== 'block') {                                                     // the keeper's reaction
      var z0 = gk.z, zEnd = res === 'save' ? tz : res === 'goal' ? z0 + (tz - z0) * 0.45 : clamp(tz, -2, 2) * 0.4;
      gk.scripted = true; gk.vx = gk.vz = 0; gk.speed = 0; N3.face(gk, gk.team === 0 ? 1 : -1, 0);
      gk.diveSide = (tz - z0) >= 0 ? (gk.team === 0 ? 1 : -1) : (gk.team === 0 ? -1 : 1);
      G.gkPlan = { gk: gk, res: res, z0: z0, zEnd: zEnd, T: T, t: 0 };
    }
  }
  function gkPlanStep(h) {
    var gp = G.gkPlan; if (!gp) return;
    var gk = gp.gk; gp.t += h;
    var u = clamp((gp.t - gp.T * 0.12) / (gp.T * 0.88), 0, 1);
    if (gp.res !== 'miss') { gk.diveT = u > 0 ? Math.max(u, 0.001) : -1; gk.diveSide = gk.diveSide; gk.z = lerp(gp.z0, gp.zEnd, ease(u)); } else gk.z = lerp(gp.z0, gp.zEnd, ease(u));
    gk.root.position.z = gk.z;
    if (gp.t > gp.T + 1.0) { gk.diveT = -1; gk.scripted = false; gk.jumpY = 0; G.gkPlan = null; }
  }

  function flightStep(h) {
    var f = G.fl, B = G.b, px = B.x, py = B.y, pz = B.z; f.t += h;
    var u = Math.min(1, f.t / f.T), s = f.kind === 'shot' ? u : (u - 0.3 * u * u) / 0.7;
    B.x = f.x0 + (f.x1 - f.x0) * s; B.z = f.z0 + (f.z1 - f.z0) * s; B.y = BR + f.y0 + (f.y1 - f.y0) * s + 4 * f.h * u * (1 - u);
    var ih = 1 / Math.max(h, 1e-4); B.vx = (B.x - px) * ih; B.vy = (B.y - py) * ih; B.vz = (B.z - pz) * ih;
    if (u >= 1) flightEnd(f);
  }
  function flightEnd(f) {
    var B = G.b; G.fl = null;
    if (f.kind === 'pass') {
      var q = f.tgt;
      if (q && q.on && !q.scripted && hyp(q.x - B.x, q.z - B.z) < 2.8) take(q); else freeBall(B.vx * 0.5, 0, B.vz * 0.5);
      return;
    }
    var t = f.shooter ? f.shooter.team : 0, dir = t === 0 ? 1 : -1, gk = team[1 - t][0];
    if (f.res === 'goal' || f.res === 'miss') { freeBall(B.vx, Math.max(0, B.vy) * 0.5, B.vz); return; }
    if (f.res === 'save') {
      N3.sfx('save', 0.9);
      if (rnd() < 0.55) { take(gk); G.decide = 1.7; G.hold = true; B.y = 0.5; }
      else { freeBall(-dir * (4 + rnd() * 5), 1.5 + rnd() * 3, (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 5)); G.last = 1 - t; }
      return;
    }
    var bl = f.tgt; N3.sfx('kick', 0.4); freeBall(-dir * (2 + rnd() * 5), 1 + rnd() * 2.5, (rnd() - 0.5) * 9); G.last = bl ? bl.team : 1 - t;
  }
  function freeStep(h) {
    var B = G.b, onG = B.y <= BR + 0.002, sp;
    if (!onG || B.vy > 0) B.vy -= 9.8 * h;
    B.x += B.vx * h; B.y += B.vy * h; B.z += B.vz * h;
    if (B.y < BR) { B.y = BR; if (B.vy < -1.2) { B.vy = -B.vy * 0.55; N3.sfx('bounce', Math.min(1, -B.vy / 8) * 0.5); } else B.vy = 0; }
    if (B.y <= BR + 0.002) { sp = hyp(B.vx, B.vz); var dec = 2.1 * h; if (sp > dec) { B.vx -= B.vx / sp * dec; B.vz -= B.vz / sp * dec; } else { B.vx = B.vz = 0; } }
    else { B.vx *= 1 - 0.1 * h; B.vz *= 1 - 0.1 * h; }
    if (Math.abs(B.x) > HL + 0.2 && Math.abs(B.z) < GW / 2 + 0.3 && B.y < GH + 0.3) {              // inside the goal: the net holds it
      var sd = B.x > 0 ? 1 : -1;
      if (Math.abs(B.x) > HL + 2.2) { B.x = sd * (HL + 2.2); B.vx *= -0.15; }
      B.z = clamp(B.z, -GW / 2 + 0.15, GW / 2 - 0.15); if (B.y > GH - 0.15) { B.y = GH - 0.15; B.vy = -Math.abs(B.vy) * 0.3; }
    }
  }

  // ---- goals, bounds ----------------------------------------------------------------------------------------------------------------
  function goalFx(t, speed) { var side = t === 0 ? 1 : -1; N3.netHit(S.goals[side], speed || 12); N3.sfx('net', 1); N3.sfx('cheer', 1); S.cheer(1); }
  function goalScored(t) {
    if (G.state === 'celebrate') return;
    var B = G.b, scorer = (G.lastP && G.lastP.team === t && G.lastP.role !== 'GK') ? G.lastP : null;
    if (!scorer) { var c = team[t].filter(function (p) { return p.on && p.role !== 'GK' && !p.scripted; }); scorer = pick(c) || team[t][9]; }
    G.score[t]++; goalFx(t, hyp(B.vx, B.vz));
    G.state = 'celebrate'; G.timer = 0; G.scorer = scorer; G.owner = null; G.fl = null; G.pend = null; G.cc = t; G.hold = false;
    if (G.gkPlan) { G.gkPlan.res = 'goal'; }
    if (W.onGoal) { try { W.onGoal(t, scorer.num); } catch (e) {} }
  }
  function boundsCheck() {
    var B = G.b;
    if (G.state !== 'loose') return;
    if (Math.abs(B.z) > HW + 0.1) { restart('throw', 1 - G.last, clamp(B.x, -HL + 1.5, HL - 1.5), B.z > 0 ? HW : -HW); N3.sfx('whistle', 0.35); return; }
    if (Math.abs(B.x) > HL + 0.1) {
      if (Math.abs(B.z) < GW / 2 && B.y < GH) { goalScored(B.x > 0 ? 0 : 1); return; }
      var defT = B.x > 0 ? 1 : 0;
      if (Math.abs(B.x) > HL + 0.6 || Math.abs(B.z) > GW / 2 + 0.3) {
        if (G.last === defT) restart('corner', 1 - defT, B.x > 0 ? HL - 0.3 : -HL + 0.3, B.z > 0 ? HW - 0.3 : -HW + 0.3);
        else restart('goalkick', defT, defT === 0 ? -HL + 5.5 : HL - 5.5, 0);
      }
    }
  }
  function celebrateStep(h) {
    G.timer += h;
    var sc = G.scorer, t = G.cc, dir = t === 0 ? 1 : -1, cz = (sc.z >= 0 ? 1 : -1) * (HW - 6), cx = dir * (HL - 8);
    team[t].forEach(function (p) {
      if (!p.on || p.scripted) return;
      if (p === sc) { p.tx = cx; p.tz = cz; p.run = 1; p.cel = hyp(p.x - cx, p.z - cz) < 7 || G.timer > 1.6; }
      else if (p.role !== 'GK' && hyp(p.x - sc.x, p.z - sc.z) < 45) { var a = p.seed * 3; p.tx = sc.x + Math.cos(a) * 3.2; p.tz = sc.z + Math.sin(a) * 3.2; p.run = 1; p.cel = hyp(p.x - sc.x, p.z - sc.z) < 5.5; }
    });
    team[1 - t].forEach(function (p) { if (p.on && !p.scripted && p.role !== 'GK') { p.run = 0.35; p.cel = false; } });
    if (G.timer > 4.0) { G.score && restart('kickoff', 1 - t, 0, 0); }
  }

  // ---- the ball -----------------------------------------------------------------------------------------------------------------------
  function ballStep(h) {
    var B = G.b, o = G.owner;
    if (G.state === 'carry' && o) {
      var ang = o.yaw.rotation.y, fx = Math.cos(ang), fz = -Math.sin(ang), ahead = o.role === 'GK' ? 0.3 : 0.5 + 0.26 * Math.sin(o.ph * 2), k = Math.min(1, h * 14);
      var tx = o.x + fx * ahead, tz = o.z + fz * ahead, ty = (o.role === 'GK' && G.hold) ? 1.15 : BR;
      B.x += (tx - B.x) * k; B.z += (tz - B.z) * k; B.y += (ty - B.y) * k; B.vx = B.vz = B.vy = 0;
    } else if (G.state === 'pass' || G.state === 'shot') { if (G.fl) flightStep(h); }
    else if (G.state === 'loose' || G.state === 'celebrate') freeStep(h);
    boundsCheck();
  }

  // ---- carrying, deciding, tackling ----------------------------------------------------------------------------------------------------
  function carryTarget(o) {
    var dir = o.team === 0 ? 1 : -1, gx = dir * HL, dx = gx - o.x, dz = -o.z, d = hyp(dx, dz) || 1, ux = dx / d, uz = dz / d, ax = 0, az = 0;
    team[1 - o.team].forEach(function (q) {
      if (!q.on) return;
      var rx = q.x - o.x, rz = q.z - o.z, rd = hyp(rx, rz);
      if (rd < 8 && rd > 0.01 && (rx * ux + rz * uz) > 0) { var side = (rx * -uz + rz * ux) > 0 ? -1 : 1, w = (1 - rd / 8) * 1.6; ax += -uz * side * w; az += ux * side * w; }
    });
    ux += ax; uz += az; var l = hyp(ux, uz) || 1; ux /= l; uz /= l;
    return { x: clamp(o.x + ux * 10, -HL + 2, HL - 2), z: clamp(o.z + uz * 10, -HW + 3, HW - 3) };
  }
  function decide(o) {
    var t = o.team, dir = t === 0 ? 1 : -1, d2g = hyp(dir * HL - o.x, o.z), press = nearestOppDist(t, o.x, o.z), forced = G.forcePass, r = rnd(), q;
    G.forcePass = false;
    var inZone = d2g < 27 && Math.abs(o.z) < 23 && o.role !== 'GK';
    if (!forced && inZone && r < 0.34 + (press < 4 ? 0.2 : 0)) { startKick(o, 'shot'); return; }
    if (forced || o.role === 'GK' || press < 3.2 || r < 0.55) { q = pickTarget(o, o.role === 'GK' || (forced && G.rs && G.rs.kind === 'goalkick')); if (q) { startKick(o, 'pass', q); return; } }
    G.decide = 0.5 + rnd() * 1.1;
  }
  function carryStep(h) {
    var o = G.owner; if (!o) { G.state = 'loose'; return; }
    G.safe -= h;
    if (o.role === 'GK') { o.tx = o.x; o.tz = o.z; o.run = 0.3; }
    else if (!G.pend) { var c = carryTarget(o), open = nearestOppDist(o.team, o.x, o.z) > 10; o.tx = c.x; o.tz = c.z; o.run = open ? 0.95 : 0.78; }
    if (G.pend) return;
    if (o.role !== 'GK' && G.safe <= 0) {
      var best = null, bd = 1.45;
      team[1 - o.team].forEach(function (q) { if (!q.on || q.scripted) return; var d = hyp(q.x - o.x, q.z - o.z); if (d < bd) { bd = d; best = q; } });
      if (best && rnd() < h * 0.6) { if (best.slideT < 0 && best.speed > 4 && rnd() < 0.3) best.slideT = 0; N3.sfx('kick', 0.2); take(best, true); G.decide = 0.6 + rnd() * 0.6; return; }
    }
    G.decide -= h; if (G.decide <= 0) decide(o);
  }
  function looseStep(h) {
    var B = G.b, best = null, bd = 99;
    all.forEach(function (p) { if (!p.on || p.scripted || p.role === 'AR') return; p.lock = Math.max(0, p.lock - h); });
    all.forEach(function (p) { if (!p.on || p.scripted || p.lock > 0) return; var d = hyp(p.x - (B.x + B.vx * 0.25), p.z - (B.z + B.vz * 0.25)); if (d < bd) { bd = d; best = p; } });
    if (best) { best.tx = B.x + B.vx * 0.3; best.tz = B.z + B.vz * 0.3; best.run = 1; if (hyp(best.x - B.x, best.z - B.z) < 0.95 && B.y < 1.2) take(best, true); }
  }

  // ---- world step -------------------------------------------------------------------------------------------------------------------------
  function defaultTargets(bx, bz, frozen) {
    var owner = G.owner, t, dir;
    for (t = 0; t < 2; t++) {
      dir = t === 0 ? 1 : -1;
      var outf = team[t].filter(function (p) { return p.on && p.role !== 'GK' && !p.scripted; });
      outf.sort(function (a, b) { return hyp(a.x - bx, a.z - bz) - hyp(b.x - bx, b.z - bz); });
      team[t].forEach(function (p) {
        if (!p.on || p.scripted) return;
        p.maxSp = p.role === 'GK' ? 5.4 : p.role === 'FWD' ? 7.7 : p.role === 'DEF' ? 7.1 : 7.4;
        if (p.role === 'GK') { var g = gkSpot(p, bx, bz); p.tx = g.x; p.tz = g.z; p.run = 0.7; return; }
        var b = baseTarget(p, bx, bz);
        p.tx = clamp(b.x + Math.sin(G.clock * 0.55 + p.seed) * 1.1, -HL + 1, HL - 1); p.tz = clamp(b.z + Math.cos(G.clock * 0.47 + p.seed * 1.7) * 1.1, -HW + 1, HW - 1); p.run = 0.55;
      });
      if (frozen || G.state === 'dead' || G.state === 'celebrate') continue;
      if (G.tm !== t) {
        if (outf[0]) { outf[0].tx = bx - dir * 0.9; outf[0].tz = bz; outf[0].run = 1; }
        if (outf[1]) { outf[1].tx = bx - dir * 7; outf[1].tz = bz * 0.7; outf[1].run = 0.9; }
      } else {
        var sup = outf.filter(function (p) { return p !== owner; }), sgn = bz > 0 ? -1 : 1;
        if (sup[0]) { sup[0].tx = clamp(bx + dir * 9, -HL + 3, HL - 3); sup[0].tz = clamp(bz + 9 * sgn, -HW + 3, HW - 3); sup[0].run = 0.85; }
        if (sup[1]) { sup[1].tx = clamp(bx + dir * 2, -HL + 3, HL - 3); sup[1].tz = clamp(bz - 10 * sgn, -HW + 3, HW - 3); sup[1].run = 0.8; }
      }
    }
  }
  function separate() {
    var i, j, a, b, dx, dz, d2, d, push, ux, uz;
    for (i = 0; i < all.length; i++) for (j = i + 1; j < all.length; j++) {
      a = all[i]; b = all[j]; if (!a.on || !b.on) continue;
      dx = b.x - a.x; dz = b.z - a.z; d2 = dx * dx + dz * dz;
      if (d2 < 0.81 && d2 > 1e-6) { d = Math.sqrt(d2); push = (0.9 - d) * 0.5; ux = dx / d; uz = dz / d; if (!a.scripted) { a.x -= ux * push; a.z -= uz * push; } if (!b.scripted) { b.x += ux * push; b.z += uz * push; } }
    }
  }
  function officials(h, bx, bz) {
    if (!refP.scripted) {
      var cl = hyp(bx, bz) || 1, d = Math.min(12, cl * 0.9 + 4), ox = bx - bx / cl * d, oz = bz - bz / cl * d, dirA = G.tm === 0 ? 1 : -1;
      if (cl < 14) { ox = bx - dirA * 8; oz = bz + (bz >= 0 ? -6 : 6); }
      refP.tx = clamp(ox, -HL + 2, HL - 2); refP.tz = clamp(oz, -HW + 2, HW - 2); refP.run = 0.8;
      if (G.state === 'dead' && G.rs && G.rs.kind === 'kickoff') { refP.tx = 0; refP.tz = 9; }
      steer(refP, refP.tx, refP.tz, refP.maxSp * refP.run, h);
    }
    ars.forEach(function (ar, i) {
      if (ar.scripted) return;
      var half = i === 0 ? 1 : -1, defTeam = half > 0 ? 1 : 0, xs = team[defTeam].filter(function (p) { return p.on; }).map(function (p) { return p.x * half; }).sort(function (a, b) { return b - a; });
      var lineX = (xs.length > 1 ? xs[1] : xs[0] || 0) * half;
      if (bx * half < -14) lineX = half * 3;
      ar.tx = half > 0 ? clamp(lineX, 0, HL) : clamp(lineX, -HL, 0); ar.tz = half * (HW + 1.5); ar.run = 0.9;
      steer(ar, ar.tx, ar.tz, ar.maxSp * ar.run, h);
    });
  }
  function stepWorld(h) {
    var B = G.b, frozen = W.frozen, bx = B.x, bz = B.z;
    G.clock += h;
    if (frozen && R.focus) { bx = R.focus.x; bz = R.focus.z; }
    if (!frozen) {
      if (G.pend) pendStep(h);
      if (G.state === 'dead') deadStep(h);
      else if (G.state === 'carry') carryStep(h);
      else if (G.state === 'loose') looseStep(h);
      else if (G.state === 'celebrate') celebrateStep(h);
      else if ((G.state === 'pass' || G.state === 'shot') && G.fl && G.fl.tgt && G.fl.kind === 'pass' && !G.fl.wild) { var q = G.fl.tgt; q.tx = G.fl.x1; q.tz = G.fl.z1; q.run = 1; }
      gkPlanStep(h);
    }
    // targets are set after the state logic so that overrides win
    var keep = all.map(function (p) { return p.tx + ',' + p.tz + ',' + p.run; });
    defaultTargets(bx, bz, frozen);
    if (!frozen) {                                                              // re-apply the state-specific overrides on top of the formation
      if (G.state === 'dead' && G.rs) { var tk = G.rs.taker; tk.tx = G.rs.x + G.rs.sx; tk.tz = G.rs.z + G.rs.sz; tk.run = 0.9; }
      else if (G.state === 'carry' && G.owner) { var o = G.owner; if (o.role === 'GK' || G.pend) { o.tx = o.x; o.tz = o.z; o.run = 0.3; } else { var c = carryTarget(o); o.tx = c.x; o.tz = c.z; o.run = nearestOppDist(o.team, o.x, o.z) > 10 ? 0.95 : 0.78; } }
      else if (G.state === 'loose') { all.forEach(function (p) { if (!p.on || p.scripted || p.lock > 0) return; }); var best = null, bd = 99; all.forEach(function (p) { if (!p.on || p.scripted || p.lock > 0) return; var d = hyp(p.x - B.x, p.z - B.z); if (d < bd) { bd = d; best = p; } }); if (best) { best.tx = B.x + B.vx * 0.3; best.tz = B.z + B.vz * 0.3; best.run = 1; } }
      else if (G.state === 'celebrate') celebrateTargets();
      else if ((G.state === 'pass' || G.state === 'shot') && G.fl && G.fl.kind === 'pass' && G.fl.tgt && !G.fl.wild) { var rq = G.fl.tgt; rq.tx = G.fl.x1; rq.tz = G.fl.z1; rq.run = 1; }
      if (G.pend && G.pend.o) { G.pend.o.tx = G.pend.o.x; G.pend.o.tz = G.pend.o.z; G.pend.o.run = 0; }
    }
    keep = null;
    all.forEach(function (p) {
      if (!p.on || p.scripted) return;
      if (R.freezeOthers) { p.vx = p.vz = 0; return; }
      steer(p, p.tx, p.tz, p.maxSp * (hyp(p.tx - p.x, p.tz - p.z) > 9 ? Math.max(p.run, 0.88) : p.run), h);
      p.x = clamp(p.x, -HL - 4, HL + 4); p.z = clamp(p.z, -HW - 3, HW + 3);
      if (p.slideT >= 0) { p.slideT += h / 0.7; if (p.slideT >= 1) p.slideT = -1; }
    });
    if (!R.freezeOthers) separate();
    if (!frozen) ballStep(h);
    if (!R.freezeOthers) officials(h, bx, bz);
  }
  function celebrateTargets() {
    var sc = G.scorer, t = G.cc, dir = t === 0 ? 1 : -1, cz = (sc.z >= 0 ? 1 : -1) * (HW - 6), cx = dir * (HL - 8);
    team[t].forEach(function (p) {
      if (!p.on || p.scripted) return;
      if (p === sc) { p.tx = cx; p.tz = cz; p.run = 1; }
      else if (p.role !== 'GK' && hyp(p.x - sc.x, p.z - sc.z) < 45) { var a = p.seed * 3; p.tx = sc.x + Math.cos(a) * 3.2; p.tz = sc.z + Math.sin(a) * 3.2; p.run = 1; }
    });
    team[1 - t].forEach(function (p) { if (p.on && !p.scripted && p.role !== 'GK') p.run = 0.35; });
  }

  // ---- drawing the people ------------------------------------------------------------------------------------------------------------------
  function poseAll(dt) {
    var bx = G.b.x, bz = G.b.z, pd = dt * (R.poseScale == null ? 1 : R.poseScale);
    all.concat(refP, ars).forEach(function (p) {
      if (!p.on) return;
      p.root.position.x = p.x; p.root.position.z = p.z;
      if (!p.scripted) {
        p.speed = hyp(p.vx, p.vz);
        if (p.speed > 0.9) N3.face(p, p.vx, p.vz);
        else if (p.role === 'AR') N3.face(p, (p.z > 0 ? 0.001 : -0.001), p.z > 0 ? -1 : 1);
        else { var lx = bx - p.x, lz = bz - p.z; if (hyp(lx, lz) > 0.3) N3.face(p, lx, lz); }
      }
      N3.pose(p, pd);
    });
  }

  // ---- camera ------------------------------------------------------------------------------------------------------------------------------
  var cam = { pos: new THREE.Vector3(0, 14, 48), look: new THREE.Vector3(0, 0, 0), hfov: 62, yaw: 0, pad: 0, padT: 0 }, _tp = new THREE.Vector3(), _tl = new THREE.Vector3();
  R.cam = cam;
  function updateCamera(dt) {
    var hf = 70, rate = 3.2, lrate = 4.5, snap = false, hook = R.camHook ? R.camHook(dt) : null, B = G.b, bx = B.x, bz = B.z;
    if (W.frozen && R.focus) { bx = R.focus.x; bz = R.focus.z; }
    refP.root.visible = refP.on;
    if (hook) { _tp.set(hook.pos[0], hook.pos[1], hook.pos[2]); _tl.set(hook.look[0], hook.look[1], hook.look[2]); hf = hook.hfov || 62; rate = hook.rate || 5; lrate = rate * 1.4; snap = !!hook.snap; }
    else if (W.camMode === 'tv') { _tp.set(bx * 0.72, 17, HW + 22); _tl.set(bx * 0.85, 0, 3 + bz * 0.1); hf = 54; rate = 2.2; lrate = 3; }
    else if (W.camMode === 'eye') { _tp.set(refP.x, 1.74, refP.z); _tl.set(bx, 0.8, bz); hf = 84; rate = 12; lrate = 9; refP.root.visible = false; }
    else {
      var rx = refP.x, rz = refP.z, dx = bx - rx, dz = bz - rz, dd = hyp(dx, dz);
      if (dd > 1.5) cam.yaw += angDiff(cam.yaw, Math.atan2(dz, dx)) * Math.min(1, dt * 2.4);
      var back = 8.5, hh = 3.4 + clamp(dd * 0.05, 0, 1.6), kf = clamp(0.5 + dd * 0.01, 0.5, 0.75);
      _tp.set(rx - Math.cos(cam.yaw) * back, hh, rz - Math.sin(cam.yaw) * back); _tl.set(rx + dx * kf, 0.9, rz + dz * kf); hf = 80 + clamp(dd * 0.5, 0, 12);
    }
    _tp.x = clamp(_tp.x, -HL - 9, HL + 9); _tp.z = clamp(_tp.z, -HW - 8, HW + 26); _tp.y = Math.max(0.9, _tp.y);
    var kk = snap ? 1 : 1 - Math.exp(-dt * rate), kl = snap ? 1 : 1 - Math.exp(-dt * lrate);
    cam.pos.lerp(_tp, kk); cam.look.lerp(_tl, kl); cam.hfov += (hf - cam.hfov) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    camera.fov = clamp(2 * Math.atan(Math.tan(cam.hfov * Math.PI / 360) / camera.aspect) * 180 / Math.PI, 26, 100);
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    cam.pad += (cam.padT - cam.pad) * (1 - Math.exp(-dt * 6));
    var w = renderer.domElement.clientWidth || window.innerWidth, h = renderer.domElement.clientHeight || window.innerHeight;
    if (cam.pad > 0.5) camera.setViewOffset(w, h, 0, cam.pad, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // ---- atmosphere ------------------------------------------------------------------------------------------------------------------------------
  function applyAtmo() {
    var idx = W.tier, night = idx >= 4, dens = [0.06, 0.16, 0.32, 0.55, 0.86, 1][idx], q = [0.4, 0.55, 0.7, 0.85, 1, 1][idx];
    if (dens == null) { dens = 0.5; q = 0.7; }
    if (night) { scene.background = S.nightBG; scene.fog = S.nightFog; S.sun.intensity = 0.72; S.hemi.intensity = 0.78; amb.intensity = 0; }
    else { scene.background = new THREE.Color(0x8cc4ee); scene.fog = new THREE.Fog(0xbad8ee, 170, 430); S.sun.intensity = 1.05; S.hemi.intensity = 1.0; amb.intensity = 0.22; }
    S.lamps.forEach(function (l) { l.visible = night; });
    S.pitch.material.color.setRGB(1, lerp(0.88, 1, q), lerp(0.6, 1, q));
    S.upper.forEach(function (m) { m.visible = idx >= 2; });
    S.ground.material.color.set(night ? 0x0d1424 : 0x58764a);
    if (K) S.setTeams(K.team[0].main, K.team[1].main, dens, !night);
  }

  // ---- public ---------------------------------------------------------------------------------------------------------------------------------------
  W.init = function (cv) {
    if (!N3.supported()) return false;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { return false; }
    canvas = cv; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 700);
    S = N3.stadium(scene, { shadows: true, shadowSize: 1024 });
    amb = new THREE.AmbientLight(0xffffff, 0); scene.add(amb);
    ball = N3.ball(BR); scene.add(ball.group);
    R.scene = scene; R.camera = camera; R.S = S; R.ball = ball; R.renderer = renderer; R.N3 = N3;
    R.stepWorld = stepWorld; R.poseAll = poseAll; R.boundsCheck = boundsCheck;
    R.baseTarget = baseTarget; R.snapFormation = snapFormation; R.clearPose = clearPose; R.restart = restart; R.take = take; R.steer = steer; R.goalFx = goalFx; R.startKick = startKick;
    W.resize(); window.addEventListener('resize', W.resize);
    W.newMatch({});
    W.ready = true;
    return true;
  };
  W.resize = function () { if (!renderer) return; renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); };
  W.newMatch = function (o) {
    o = o || {}; K = pickKits(o);
    if (W.ready || true) { R.setFrozen && R.setFrozen(false); }
    R.freezeOthers = false; R.poseScale = 1; W.frozen = false;
    buildPeople(K);
    G.score = [0, 0]; G.clock = 0; G.gkPlan = null; G.scorer = null;
    snapFormation(0, 0);
    restart('kickoff', 0, 0, 0);
    refP.x = 0; refP.z = 8; ars[0].x = 0; ars[0].z = HW + 1.5; ars[1].x = 0; ars[1].z = -HW - 1.5;
    all.concat(refP, ars).forEach(function (p) { p.root.position.x = p.x; p.root.position.z = p.z; });
    applyAtmo();
    G.rs.timer = 0; G.timer = 2.2; N3.sfx('whistle', 0.6);
  };
  W.setTier = function (idx) { W.tier = idx | 0; if (S) applyAtmo(); };
  W.setSpeed = function (s) { W.speed = s; };
  W.setCam = function (m) { W.camMode = m; if (m !== 'eye' && refP) refP.root.visible = true; };
  W.setPad = function (px) { cam.padT = px || 0; };
  W.liveNumbers = function (t, kind) {
    var want = kind === 'def' ? [2, 3, 4, 5, 6] : [7, 8, 9, 10, 11];
    return want.filter(function (n) { return team[t].some(function (p) { return p.on && p.num === n; }); });
  };
  W.pickNumber = function (t, kind) { var l = W.ready ? W.liveNumbers(t, kind) : []; return l.length ? pick(l) : pick(kind === 'def' ? [2, 3, 4, 5, 6] : [7, 8, 9, 10, 11]); };
  W.info = function () {
    var on = [team[0].filter(function (p) { return p.on; }).length, team[1].filter(function (p) { return p.on; }).length];
    return { ready: W.ready, state: G.state, score: G.score.slice(), on: on, ball: { x: +G.b.x.toFixed(1), y: +G.b.y.toFixed(2), z: +G.b.z.toFixed(1) }, cam: W.camMode, frozen: W.frozen, quality: Q, owner: G.owner ? (G.owner.team + ':' + G.owner.num) : null, ref: [+refP.x.toFixed(1), +refP.z.toFixed(1)], visible: all.filter(function (p) { return p.on && p.root.visible; }).length };
  };
  W.update = function (dt) {
    if (!W.ready) return;
    dt = Math.min(dt, 0.05);
    if (R.scriptStep) R.scriptStep(dt);
    var sp = W.frozen ? 1 : W.speed, hh = dt * sp, n = Math.max(1, Math.ceil(hh / 0.034)), i;
    for (i = 0; i < n; i++) stepWorld(hh / n);
    poseAll(dt * Math.min(sp, 2.5));
    N3.ballAt(ball, G.b.x, G.b.y, G.b.z);
    if (R.afterPose) R.afterPose(dt);
    updateCamera(dt);
    S.update(dt);
    focusT -= dt; if (focusT <= 0) { focusT = 0.12; var fx = (W.frozen && R.focus) ? R.focus.x : G.b.x, fz = (W.frozen && R.focus) ? R.focus.z : G.b.z; S.focus(fx, fz); }
    qAcc += dt; qN++;
    if (qN >= 100) { var avg = qAcc / qN; qAcc = 0; qN = 0; if (avg > 0.05 && Q < 2) { Q++; W.quality = Q; if (Q === 1) { S.sun.castShadow = false; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2)); } else renderer.setPixelRatio(0.8); renderer.setSize(window.innerWidth, window.innerHeight); } }
    renderer.render(scene, camera);
  };
  W.render = function () { if (W.ready) renderer.render(scene, camera); };
  R.restartWorld = function () {};
  return W;
})();
