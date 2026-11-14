/* ref3d_inc.js — the Referee Simulator's staged incidents, the VAR replay and the outcomes of the decisions (extends W3 from ref3d.js).
   Every incident is a short script written in a local frame (u along the attack, v across the pitch, metres) so the very same play can be
   shown live, held for the decision, replayed in slow motion for VAR (with overlays) and then continued with the outcome of the call. */
(function (W) {
  'use strict';
  var R = W.R, G = R.G, team = R.team, all = R.all, hyp = R.hyp, BR = R.BR;
  var HL = N3.HL, HW = N3.HW, GW = N3.GW, GH = N3.GH, KT = 0.46;
  var clamp = N3.clamp, lerp = N3.lerp, ease = N3.ease, angDiff = N3.angDiff, rnd = Math.random;
  var E = null, ST = null, OUT = null, SPR = [], BUILD = {}, _pv = new THREE.Vector3(), _pw = new THREE.Vector3();
  var RED = '#ff4d5e', GRN = '#2ee59d', YEL = '#ffd23f', WHT = '#ffffff', BLU = '#5ab8ff';

  function pick(a) { return a[(rnd() * a.length) | 0]; }
  function rr(a, b) { return a + rnd() * (b - a); }
  function lp(u, v) { return [E.cx + E.a * u, E.cz + E.sg * v]; }                         // local (u, v) -> world (x, z)
  function wl(x, z) { return [(x - E.cx) * E.a, (z - E.cz) * E.sg]; }                     // world -> local
  function lw(c) { return [E.cx + E.a * c[0], c[2], E.cz + E.sg * c[1]]; }               // local [u, v, height] -> world [x, y, z]
  function anchor(xd, z) { E.cx = E.a * xd; E.cz = z; E.gu = HL - xd; E.gv = -E.sg * z; }  // xd: how far the play is from the middle towards the goal being attacked

  // ---- keyframed movement ---------------------------------------------------------------------------------------------------
  function pos2(k, t) {
    var n = k.length, i, a, b, s;
    if (t <= k[0][0]) return [k[0][1], k[0][2]];
    if (t >= k[n - 1][0]) return [k[n - 1][1], k[n - 1][2]];
    i = 1; while (k[i][0] < t) i++;
    a = k[i - 1]; b = k[i]; s = (t - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
  }
  function Move(p, keys, look) {                                                           // a player following keyframes; facing and speed are baked so any t can be shown
    this.p = p; this.k = keys; this.look = look || null; this.ang = []; this.sp = [];
    var end = keys[keys.length - 1][0] + 0.4, n = Math.ceil(end / 0.04) + 2, i, ang = null, a, b, du, dv, s, tg, c, lk, t;
    for (i = 0; i < n; i++) {
      t = i * 0.04; a = pos2(keys, t - 0.03); b = pos2(keys, t + 0.03); du = (b[0] - a[0]) / 0.06; dv = (b[1] - a[1]) / 0.06; s = hyp(du, dv); tg = null;
      if (s > 0.7) tg = Math.atan2(-E.sg * dv, E.a * du);
      else if (this.look) { lk = this.look(t); if (lk) { c = pos2(keys, t); if (hyp(lk[0] - c[0], lk[1] - c[1]) > 0.05) tg = Math.atan2(-E.sg * (lk[1] - c[1]), E.a * (lk[0] - c[0])); } }
      if (ang === null) ang = tg !== null ? tg : (E.a > 0 ? 0 : Math.PI);
      else if (tg !== null) ang += clamp(angDiff(ang, tg), -0.5, 0.5);
      this.ang.push(ang); this.sp.push(Math.min(s, 9));
    }
  }
  Move.prototype.apply = function (t) {
    var p = this.p, q = pos2(this.k, t), w = lp(q[0], q[1]), i = clamp(t / 0.04, 0, this.ang.length - 1.001), i0 = i | 0, f = i - i0, an = this.ang[i0] + angDiff(this.ang[i0], this.ang[i0 + 1]) * f;
    var a = pos2(this.k, t - 0.03), b = pos2(this.k, t + 0.03), wa = lp(a[0], a[1]), wb = lp(b[0], b[1]);
    p.x = w[0]; p.z = w[1]; p.speed = lerp(this.sp[i0], this.sp[i0 + 1], f); p.face = an; p.yaw.rotation.y = an;
    p.vx = (wb[0] - wa[0]) / 0.06; p.vz = (wb[1] - wa[1]) / 0.06; p.tx = p.x; p.tz = p.z;
  };
  Move.prototype.pos = function (t) { return pos2(this.k, t); };
  Move.prototype.vel = function (t) { var a = pos2(this.k, t - 0.03), b = pos2(this.k, t + 0.03); return [(b[0] - a[0]) / 0.06, (b[1] - a[1]) / 0.06]; };
  function mv(p, keys, look) { var m = new Move(p, keys, look); ST.moves.push(m); if (ST.actors.indexOf(p) < 0) { ST.actors.push(p); p.scripted = true; } return m; }
  function stay(p, u, v, look) { return mv(p, [[0, u, v], [99, u, v]], look); }

  // ---- the ball in local coordinates [u, v, y] ----------------------------------------------------------------------------------
  function drib(m, t) { var q = m.pos(t), vl = m.vel(t), s = hyp(vl[0], vl[1]) || 1, ah = 0.55 + 0.24 * Math.sin(t * 9.5); return [q[0] + vl[0] / s * ah, q[1] + vl[1] / s * ah, BR]; }
  function bsim(p, v, t0, t, k) {                                                          // free ball: gravity, bounces, rolling friction
    var tau = Math.max(0, t - t0), x = p[0], z = p[1], y = p[2], vx = v[0], vz = v[1], vy = v[2] || 0, el = 0, s, d; k = k || 1.3;
    while (el < tau - 1e-6) {
      s = Math.min(0.02, tau - el); vy -= 9.8 * s; x += vx * s; z += vz * s; y += vy * s;
      if (y < BR) { y = BR; if (vy < -1.2) vy = -vy * 0.5; else vy = 0; }
      if (y <= BR + 0.004) { d = Math.exp(-k * s); vx *= d; vz *= d; } else { vx *= 1 - 0.08 * s; vz *= 1 - 0.08 * s; }
      el += s;
    }
    return [x, z, y];
  }
  function fly(a, b, t0, t1, t, h) { var u = clamp((t - t0) / (t1 - t0), 0, 1); return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u) + 4 * (h || 0) * u * (1 - u)]; }
  function inNet(p, t0, t) { var s = Math.max(0, t - t0); return [p[0] + 0.55 * (1 - Math.exp(-5 * s)), p[1], Math.max(BR, p[2] - 4.9 * s * s)]; }

  // ---- body poses ----------------------------------------------------------------------------------------------------------------
  function kick(p, ts, t, foot) { var s = ts - 0.56 * KT; p.kickFoot = foot || 1; if (t >= s && t <= s + KT) p.kickT = (t - s) / KT; }
  function slide(p, t0, t, h) { if (t >= t0 && t < t0 + 0.7) { p.slideT = (t - t0) / 0.7; p.slideH = h || 1; } }
  function fall(p, t0, t, sign) { if (t >= t0) { p.fallT = t - t0; p.fallSign = sign == null ? -1 : sign; } }
  function hop(p, t0, t, h, d) { var s = (t - t0) / (d || 0.45); if (s > 0 && s < 1) p.jumpY = h * Math.sin(Math.PI * s); }
  function sideTo(p, dx, dz) { var th = p.yaw.rotation.y; return (Math.sin(th) * dx + Math.cos(th) * dz) >= 0 ? 1 : -1; }   // +1: a dive towards the model's right

  // ---- sprites (labels, shirt numbers) -----------------------------------------------------------------------------------------------
  var _mc = document.createElement('canvas').getContext('2d');
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawLabel(sp, text) {
    var fs = 28, f = '700 ' + fs + 'px system-ui,-apple-system,"Segoe UI",sans-serif', w, h = 50, cv = sp.userData.cv, c;
    _mc.font = f; w = Math.ceil(_mc.measureText(text).width) + 30;
    if (!cv) { cv = sp.userData.cv = document.createElement('canvas'); sp.userData.tex = new THREE.CanvasTexture(cv); sp.material.map = sp.userData.tex; }
    cv.width = w; cv.height = h; c = cv.getContext('2d');
    c.fillStyle = 'rgba(8,12,26,0.9)'; rrect(c, 1.5, 1.5, w - 3, h - 3, 12); c.fill(); c.lineWidth = 3; c.strokeStyle = sp.userData.col; rrect(c, 1.5, 1.5, w - 3, h - 3, 12); c.stroke();
    c.font = f; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 1);
    sp.userData.tex.needsUpdate = true; sp.userData.asp = w / h; sp.userData.text = text;
  }
  function label(text, col, ks) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    sp.renderOrder = 999; sp.userData.col = col || WHT; sp.userData.k = ks || 1; drawLabel(sp, text); SPR.push(sp); return sp;
  }
  function setText(sp, text) { if (sp.userData.text !== text) drawLabel(sp, text); }
  function sprScale() {
    var cam = R.camera, tf = Math.tan(cam.fov * Math.PI / 360), i, s, d, h;
    for (i = 0; i < SPR.length; i++) {
      s = SPR[i]; if (!s.parent) continue;
      s.getWorldPosition(_pw); d = _pw.distanceTo(cam.position); h = clamp(0.07 * d * tf * s.userData.k, 0.28, 5);
      s.scale.set(h * s.userData.asp, h, 1);
    }
  }
  function track(o) { R.scene.add(o); ST.objs.push(o); return o; }
  function tagFor(p, col) { if (!p) return; var sp = label('#' + p.num, col || R.k.team[p.team].main, 0.82); track(sp); ST.tags.push({ p: p, sp: sp }); }

  // ---- probing the posed models (for contact points and gaps) --------------------------------------------------------------------------
  function poseAt(t) {
    var d = ST.def;
    ST.actors.forEach(function (p) { R.clearPose(p); });
    ST.moves.forEach(function (m) { m.apply(t); });
    d.pose(t);
  }
  function partAt(p, part, t) {                                                           // world position of a body part at script time t
    poseAt(t);
    ST.actors.forEach(function (q) { N3.pose(q, 0.0001); q.root.position.x = q.x; q.root.position.z = q.z; q.root.updateMatrixWorld(true); });
    var o = part === 'handR' ? p.armR.hand : part === 'handL' ? p.armL.hand : part === 'bootR' ? p.legR.boot : part === 'bootL' ? p.legL.boot : part === 'elbowR' ? p.armR.k : part === 'elbowL' ? p.armL.k : part === 'head' ? p.head : part === 'kneeR' ? p.legR.k : part === 'kneeL' ? p.legL.k : p.torso;
    o.getWorldPosition(_pv); return [_pv.x, _pv.y, _pv.z];
  }
  function toLocal(w) { var l = wl(w[0], w[2]); return [l[0], l[1], w[1]]; }                // world [x,y,z] -> local [u,v,y]
  function minGap(a, parts, b, partsB, t0, t1) {                                          // closest approach between two sets of body parts over a time window
    var best = 99, t, i, j, pa, pb, d;
    for (t = t0; t <= t1 + 1e-6; t += 0.04) for (i = 0; i < parts.length; i++) for (j = 0; j < partsB.length; j++) {
      pa = partAt(a, parts[i], t); pb = partAt(b, partsB[j], t); d = Math.sqrt((pa[0] - pb[0]) * (pa[0] - pb[0]) + (pa[1] - pb[1]) * (pa[1] - pb[1]) + (pa[2] - pb[2]) * (pa[2] - pb[2]));
      if (d < best) best = d;
    }
    return best;
  }

  // ---- VAR overlays (all built once per incident and shown only during the review) ---------------------------------------------------------
  function ovAdd(g, t0, t1, upd) { track(g); ST.ovl.push({ g: g, t0: t0, t1: t1, upd: upd }); g.visible = false; return g; }
  function dispMat(col, op) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(col), transparent: true, opacity: op == null ? 0.85 : op, depthTest: false, depthWrite: false }); }
  function ovRing(fn, t0, t1, col, text) {                                                // a pulsing marker at a point (fn(t) -> world [x, y, z])
    var g = new THREE.Group(), r1 = N3.ring(0.5, 0.7, col, 0.95), r2 = N3.ring(0.18, 0.28, col, 0.95), sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), dispMat(col, 0.95)), bm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 6), dispMat(col, 0.5)), lb = text ? label(text, col, 1) : null;
    bm.position.y = 1.3; sp.renderOrder = 998; r1.position.y = r2.position.y = 0.05; g.add(r1); g.add(r2); g.add(sp); g.add(bm); if (lb) { lb.position.y = 2.9; g.add(lb); }
    return ovAdd(g, t0, t1, function (t) { var p = fn(t), s = 1 + 0.16 * Math.sin(t * 14); g.position.set(p[0], 0, p[2]); sp.position.y = p[1]; r1.scale.set(s, s, s); });
  }
  function ovLink(fa, fb, t0, t1, col, textFn) {                                          // a bar between two moving points with its length in metres
    var g = new THREE.Group(), bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), dispMat(col, 0.9)), lb = label('0.0 m', col, 0.9), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    bar.renderOrder = 997; g.add(bar); g.add(lb);
    return ovAdd(g, t0, t1, function (t) {
      var pa = fa(t), pb = fb(t); a.set(pa[0], pa[1], pa[2]); b.set(pb[0], pb[1], pb[2]); d.subVectors(b, a); var L = d.length() || 0.001;
      bar.position.copy(a).add(b).multiplyScalar(0.5); bar.scale.set(1, L, 1); bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      lb.position.copy(bar.position); lb.position.y += 0.45; setText(lb, textFn ? textFn(L, t) : (L.toFixed(2) + ' m'));
    });
  }
  function ovHalo(fn, t0, t1, col, text) {                                                // a glow with a caption (arm, hand, face...)
    var g = new THREE.Group(), gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: N3.glowTexture(), color: new THREE.Color(col), transparent: true, depthTest: false, depthWrite: false, opacity: 0.95 })), lb = text ? label(text, col, 1) : null;
    gl.renderOrder = 996; gl.scale.set(0.95, 0.95, 1); g.add(gl); if (lb) { lb.position.y = 0.7; g.add(lb); }
    return ovAdd(g, t0, t1, function (t) { var p = fn(t), s = 0.85 + 0.12 * Math.sin(t * 12); g.position.set(p[0], p[1], p[2]); gl.scale.set(s, s, 1); });
  }
  function ovLine(u, t0, t1, col, text, vAt) {                                            // a line across the pitch at local u (offside lines) with a curtain above it
    var g = new THREE.Group(), x = E.cx + E.a * u, strip = new THREE.Mesh(new THREE.PlaneGeometry(0.24, PW2()), dispMat(col, 0.95)), cur = new THREE.Mesh(new THREE.PlaneGeometry(PW2(), 2.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(col), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })), lb = text ? label(text, col, 1.05) : null;
    strip.rotation.x = -Math.PI / 2; strip.position.set(x, 0.06, 0); cur.rotation.y = Math.PI / 2; cur.position.set(x, 1.4, 0); strip.renderOrder = 990; g.add(strip); g.add(cur);
    if (lb) { var w = lw([u, vAt == null ? 0 : vAt, 3.1]); lb.position.set(w[0], w[1], w[2]); g.add(lb); }
    return ovAdd(g, t0, t1, function () {});
  }
  function PW2() { return N3.PW + 8; }
  function ovUpdate(t) { ST.ovl.forEach(function (o) { var on = ST.ovOn && t >= o.t0 && t <= o.t1; o.g.visible = on; if (on) o.upd(t); }); }

  // ---- running an incident ------------------------------------------------------------------------------------------------------------------
  function byNum(t, n, avoid) {
    var l = team[t].filter(function (p) { return p.on && p.num === n && (!avoid || avoid.indexOf(p) < 0); });
    if (l.length) return l[0];
    l = team[t].filter(function (p) { return p.on && p.role !== 'GK' && (!avoid || avoid.indexOf(p) < 0); }); return pick(l);
  }
  function some(t, n, roles, avoid) {
    var l = team[t].filter(function (p) { return p.on && roles.indexOf(p.role) >= 0 && (!avoid || avoid.indexOf(p) < 0); });
    l.sort(function () { return rnd() - 0.5; }); return l.slice(0, n);
  }
  function applyAt(t) {
    var d = ST.def, b, w;
    poseAt(t); b = d.ball(t); w = lp(b[0], b[1]);
    G.b.x = w[0]; G.b.z = w[1]; G.b.y = Math.max(BR, b[2]); G.b.vx = G.b.vy = G.b.vz = 0;
  }
  function endStage() {
    if (!ST) return; var S = ST;
    S.actors.concat(S.held).forEach(function (p) { if (p.keepScripted) return; p.scripted = false; R.clearPose(p); p.vx = p.vz = 0; p.tx = p.x; p.tz = p.z; p.lock = 0.5; });
    S.objs.forEach(function (o) { R.scene.remove(o); o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) { if (n.material.map && n.material.map !== N3._glow) n.material.map.dispose(); n.material.dispose(); } }); });
    SPR = SPR.filter(function (s) { return s.parent; });
    ST = null; R.focus = null;
  }
  function abort() { OUT = null; endStage(); W.frozen = false; R.freezeOthers = false; R.poseScale = 1; R.focus = null; }
  var _newMatch = W.newMatch; W.newMatch = function (o) { abort(); SPR = []; return _newMatch.call(W, o); };
  W.abortIncident = abort;

  W.stage = function (inc, cb) {
    var bld = BUILD[inc.type];
    if (!W.ready || !bld || !R.scene || !R.ref) { if (cb) cb(); return false; }
    abort();
    var att = inc.att == null ? (rnd() < 0.5 ? 0 : 1) : inc.att;
    E = { a: att === 0 ? 1 : -1, sg: rnd() < 0.5 ? -1 : 1, cx: 0, cz: 0, gu: 0, gv: 0, att: att, def: 1 - att };
    ST = { inc: inc, att: att, def: 1 - att, t: 0, T: 4, phase: 'run', cb: cb, var: false, vt: 0, playing: false, rate: 0.5, camKey: 'main', camSnap: true, moves: [], actors: [], tags: [], tagsOn: true, ovl: [], ovOn: false, objs: [], held: [], stopDone: [], dwell: 0, sI: 0, fI: 0, res: {} };
    all.forEach(function (p) { p.scripted = false; });
    G.fl = null; G.pend = null; G.gkPlan = null; G.owner = null; G.tm = att; G.hold = false;
    var d = bld(inc, ST); ST.def = d; ST.T = d.T;
    R.snapFormation(E.cx, E.cz);
    R.focus = { x: E.cx, z: E.cz };
    var kp = d.keep || { u0: -12, u1: 8, v0: -9, v1: 9 }, mx = HL + 3;
    all.forEach(function (p) {                                                              // clear the stage: anybody left in the corridor of the play steps out and stays put
      if (!p.on || p.scripted) return;
      var l = wl(p.x, p.z), u = l[0], v = l[1];
      if (u > kp.u0 - 1.5 && u < kp.u1 + 1.5 && v > kp.v0 - 1.5 && v < kp.v1 + 1.5) { var nv = (v >= 0 ? 1 : -1) * (kp.v1 + 2 + rnd() * 3), w = lp(u, nv); p.x = w[0]; p.z = clamp(w[1], -HW + 1, HW - 1); p.x = clamp(p.x, -HL + 1, HL - 1); }
      if (Math.abs(p.x) > mx) p.x = clamp(p.x, -HL, HL);
      p.scripted = true; p.speed = 0; p.vx = p.vz = 0; p.tx = p.x; p.tz = p.z; N3.face(p, E.cx - p.x, E.cz - p.z); p.yaw.rotation.y = p.face; ST.held.push(p);
    });
    all.forEach(function (p) { if (ST.held.indexOf(p) >= 0 && ST.actors.indexOf(p) < 0) return; });
    ST.held = ST.held.filter(function (p) { return ST.actors.indexOf(p) < 0; });
    if (d.prep) d.prep();
    W.frozen = true; R.freezeOthers = false; R.poseScale = 1; ST.ovOn = false;
    applyAt(0); ST.camSnap = true;
    if (W.onCut) { try { W.onCut(); } catch (e) {} }
    return true;
  };
  W.stageInfo = function () { return ST ? { type: ST.inc.type, T: ST.T, tc: ST.def.tc, phase: ST.phase, label: ST.def.label || '', canVar: ST.def.canVar !== false } : null; };
  W.endIncident = function () { OUT = null; endStage(); W.frozen = false; R.freezeOthers = false; R.poseScale = 1; R.focus = null; };

  R.scriptStep = function (dt) {
    laterStep(dt); holdsStep(dt);
    if (OUT) { outStep(dt); return; }
    if (!ST) return;
    var S = ST, t0, t, i, s, f;
    if (S.var) { varStep(dt); return; }
    if (S.phase === 'run') {
      t0 = S.t; S.t += dt; t = Math.min(S.t, S.T);
      while (S.sI < S.def.snd.length && S.def.snd[S.sI][0] <= t) { s = S.def.snd[S.sI++]; if (s[0] > t0 - 0.2) N3.sfx(s[1], s[2]); }
      while (S.fI < S.def.fx.length && S.def.fx[S.fI][0] <= t) { f = S.def.fx[S.fI++]; try { f[1](); } catch (e) {} }
      applyAt(t);
      if (S.t >= S.T) { S.phase = 'hold'; var cb = S.cb; S.cb = null; if (cb) { try { cb(); } catch (e2) { if (window.console) console.error(e2); } } }
    } else applyAt(S.T);
  };
  function varStep(dt) {
    var S = ST, nt, stops = S.def.stops || [], i;
    if (S.dwell > 0) S.dwell -= dt;
    else if (S.playing) {
      nt = S.vt + dt * S.rate;
      for (i = 0; i < stops.length; i++) if (S.vt < stops[i] - 1e-4 && nt >= stops[i] && S.stopDone.indexOf(i) < 0) { nt = stops[i]; S.stopDone.push(i); S.dwell = 1.7; }
      S.vt = nt; if (S.vt >= S.T) { S.vt = S.T; S.playing = false; }
    }
    applyAt(S.vt);
  }

  R.camHook = function () {
    if (OUT) return OUT.cam ? OUT.cam() : null;
    if (!ST) return null;
    var S = ST, t = S.var ? S.vt : Math.min(S.t, S.T), fn = S.def.cams[S.camKey] || S.def.cams.main, c = fn(t), sn = S.camSnap; S.camSnap = false;
    return { pos: lw(c.p), look: lw(c.l), hfov: c.f || 60, rate: S.var ? 7 : 3.6, snap: sn };
  };
  R.afterPose = function () {
    if (ST) {
      var t = ST.var ? ST.vt : Math.min(ST.t, ST.T);
      ST.tags.forEach(function (g) { g.sp.visible = ST.tagsOn && g.p.on; g.sp.position.set(g.p.x, 2.5, g.p.z); });
      if (ST.ovOn || ST.ovl.length) { ST.actors.forEach(function (p) { p.root.updateMatrixWorld(true); }); ovUpdate(t); }
    }
    if (ST || OUT) sprScale();
  };

  // ===== the incidents ==========================================================================================================
  // helpers shared by the scripts
  function mkDef(o) { o.snd = (o.snd || []).sort(function (a, b) { return a[0] - b[0]; }); o.fx = (o.fx || []).sort(function (a, b) { return a[0] - b[0]; }); o.cams = o.cams || {}; return o; }
  function refWatch(tc, side) { mv(R.ref, [[0, -10.5, 9.5 * side], [Math.max(0.8, tc - 0.45), -4.4, 7.4 * side], [99, -4.4, 7.4 * side]], function () { return [0, 0]; }); }
  function camSide(u0, u1, v, h, lu, lv, lh, f) { return function (t) { var s = clamp(t / 4.6, 0, 1); return { p: [lerp(u0, u1, s), v, h], l: [lu, lv, lh], f: f }; }; }
  function camFix(p, l, f) { return function () { return { p: p, l: l, f: f }; }; }
  function liveObj(p, part) { return part === 'handR' ? p.armR.hand : part === 'handL' ? p.armL.hand : part === 'bootR' ? p.legR.boot : part === 'bootL' ? p.legL.boot : part === 'head' ? p.head : part === 'elbowR' ? p.armR.k : part === 'elbowL' ? p.armL.k : p.torso; }
  function live(p, part) { return function () { liveObj(p, part).getWorldPosition(_pv); return [_pv.x, _pv.y, _pv.z]; }; }
  function ballLive() { return [G.b.x, G.b.y, G.b.z]; }
  function stat(w) { return function () { return w; }; }
  function farthestHand(p, q, t) { var l = partAt(p, 'handL', t), r = partAt(p, 'handR', t); return hyp3(l, q) < hyp3(r, q) ? 'handL' : 'handR'; }
  function hyp3(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2])); }
  function nearestPart(p, parts, q, t) { var best = parts[0], bd = 1e9; parts.forEach(function (n) { var d = hyp3(partAt(p, n, t), q); if (d < bd) { bd = d; best = n; } }); return best; }
  function fmt(m) { return (Math.round(m * 100) / 100).toFixed(2); }

  // ---- 1. a challenge for the ball -----------------------------------------------------------------------------------------------
  BUILD.challenge = function (inc, S) {
    var tr = inc.truth, T = 4.7, tc = 2.45, tk = tc - 0.45;
    anchor(inc.inBox ? HL - rr(7.5, 11) : rr(-4, 22), inc.inBox ? rr(-7, 7) : rr(-13, 13));
    var A = byNum(S.att, inc.numA), D = byNum(S.def, inc.numD), clean = tr === 'clean', aEnd, dK, sT0, slH = 1, mA, mD;
    aEnd = { clean: [[tc + 0.45, 1.1, 0.2], [T, 1.6, 0.25]], foul: [[tc + 0.5, 0.95, 0.1], [T, 1.25, 0.1]], reckless: [[tc + 0.55, 1.5, -0.35], [T, 1.8, -0.35]], violent: [[tc + 0.3, 0.3, 0.15], [T, 0.35, 0.15]] }[tr];
    mA = mv(A, [[0, -12.4, 1.1], [tc, -0.15, 0.12]].concat(aEnd));
    if (tr === 'reckless') { dK = [[0, 3.5, 12.5], [tc - 0.9, 1.2, 4.0], [tc - 0.28, 0.4, 1.5], [tc, 0.25, 0.75], [tc + 0.35, -0.2, -0.1], [tc + 0.8, -0.5, -0.5], [T, -0.5, -0.5]]; sT0 = tc - 0.34; slH = 1.8; }
    else if (tr === 'violent') { dK = [[0, 13.5, -2.4], [tc - 0.7, 3.4, -0.9], [tc - 0.28, 1.5, -0.5], [tc, 0.55, -0.32], [tc + 0.4, 0.0, -0.25], [T, 0.0, -0.25]]; sT0 = tc - 0.3; slH = 2.3; }
    else { dK = [[0, 14, 1.3], [tc - 0.3, 2.9, 0.45], [tc, 1.3, 0.35], [tc + 0.4, 0.1, 0.3], [tc + 0.8, -0.6, 0.3], [T, -0.6, 0.3]]; sT0 = tc - 0.3; }
    mD = mv(D, dK, function () { return [0, 0]; });
    refWatch(tc, 1); tagFor(A); tagFor(D);
    var foot = null, hit = null, ball0 = null, rows = null;
    S.res = { A: A, D: D, cul: D, vic: A, sp: [0.3, 0.1] };
    return mkDef({
      T: T, tc: tc, keep: { u0: -14, u1: 5, v0: -10, v1: 10 }, label: 'Challenge',
      pose: function (t) {
        slide(D, sT0, t, slH);
        if (tr === 'reckless') { hop(D, sT0, t, 0.34, 0.7); hop(A, tc, t, 0.55, 0.62); fall(A, tc + 0.05, t, -1); }
        else if (tr === 'violent') { hop(D, sT0, t, 0.4, 0.7); fall(A, tc + 0.05, t, 1); }
        else if (clean) fall(A, tc + 0.3, t, -1);
        else fall(A, tc + 0.1, t, -1);
        if (t > tc + 1.0 && !D.slideT >= 0) D.gesture = clean ? 'armOut' : tr === 'foul' ? 'hands' : tr === 'reckless' ? 'shrug' : '';
      },
      ball: function (t) {
        if (clean) {
          if (t < tc - 0.2) return drib(mA, t);
          if (t < tc) return fly(drib(mA, tc - 0.2), foot, tc - 0.2, tc, t, 0);
          return bsim(foot, [-1.1, 3.3, 0], tc, t);
        }
        if (t < tk) return drib(mA, t);
        return bsim(ball0, [5.2, 0.3, 0], tk, t);
      },
      snd: clean ? [[tc, 'kick', 0.6]] : [[tc, 'kick', 0.45], [tc + 0.08, 'ooh', tr === 'foul' ? 0.6 : 1]],
      cams: { main: camSide(-6.6, -4.2, -8.4, 2.3, 0.7, 0.3, 0.7, 58), high: camFix([-4.5, -3.5, 10.5], [0.4, 0.2, 0], 52), close: camFix([-2.3, -4.6, 1.25], [0.6, 0.15, 0.35], 44) },
      prep: function () {
        ball0 = drib(mA, tk);
        foot = toLocal(partAt(D, 'bootR', tc)); foot[2] = BR;
        hit = partAt(A, tr === 'violent' ? 'kneeR' : 'bootR', tc + 0.05);
        var hitW = partAt(A, 'bootL', tc + 0.12);
        if (clean) {
          ovRing(stat(lw(foot)), tc - 0.2, tc + 0.7, GRN, 'BALL WON FIRST');
          ovRing(live(A, 'bootL'), tc + 0.14, tc + 0.9, YEL, 'TRIPS OVER HIS LEG AFTERWARDS');
        } else if (tr === 'foul') {
          ovRing(stat(hit), tc - 0.12, tc + 0.7, RED, 'CONTACT ON THE LEG');
          ovLink(live(D, 'bootR'), ballLive, tc - 0.5, tc + 0.8, YEL, function (L) { return 'BALL ' + fmt(L) + ' m AWAY'; });
        } else if (tr === 'reckless') {
          ovRing(stat(hit), tc - 0.12, tc + 0.8, RED, 'HIGH ON THE ANKLE · EXCESSIVE FORCE');
          ovHalo(live(D, 'bootR'), tc - 0.4, tc + 0.5, YEL, 'FEET OFF THE GROUND');
        } else {
          ovRing(stat(hit), tc - 0.12, tc + 0.8, RED, 'STUDS UP INTO THE KNEE');
          ovLink(live(D, 'bootR'), ballLive, tc - 0.5, tc + 0.8, YEL, function (L) { return 'NO ATTEMPT AT THE BALL · ' + fmt(L) + ' m'; });
        }
      }
    });
  };

  // ---- 2. handball ----------------------------------------------------------------------------------------------------------------
  BUILD.handball = function (inc, S) {
    var tr = inc.truth, T = 4.0, tS, tc, xK, dStart, cross = tr === 'deliberate', X, D = byNum(S.def, inc.numD), mX, mD, cp = null, b0 = null, partName, vAfter, bx;
    anchor(inc.inBox ? HL - rr(8, 12) : HL - rr(19, 25), rr(-7, 7));
    X = some(S.att, 1, ['MID', 'FWD'])[0];
    if (tr === 'accidental') { tS = 1.4; tc = 1.64; xK = [[0, -12, 3.4], [1.05, -6.2, 2.5], [1.4, -5.4, 2.3], [99, -5.4, 2.3]]; dStart = [-1.9, 1.3]; }
    else if (cross) { tS = 1.55; tc = 2.15; xK = [[0, -17, 9.4], [1.0, -12.3, 9.3], [1.5, -10.6, 9.2], [99, -10.6, 9.2]]; dStart = [0.5, -0.4]; }
    else { tS = 1.35; tc = 1.64; xK = [[0, -12.5, 3.0], [1.0, -7.6, 2.2], [1.35, -6.6, 2.0], [99, -6.6, 2.0]]; dStart = [-1.7, 0.7]; }
    mX = mv(X, xK);
    mD = mv(D, [[0, dStart[0], dStart[1]], [99, dStart[0], dStart[1]]], function (t) { var xp = mX.pos(Math.min(t, tS)); return (tr === 'accidental' && t > tS + 0.05) ? [dStart[0], dStart[1] + 5] : xp; });
    refWatch(tc, 1); tagFor(X); tagFor(D);
    S.res = { A: X, D: D, cul: D, vic: X, sp: [dStart[0], dStart[1]] };
    return mkDef({
      T: T, tc: tc, keep: { u0: -13, u1: 4, v0: -11, v1: 11 }, label: 'Handball',
      pose: function (t) {
        kick(X, tS, t);
        if (tr === 'deliberate') { if (t > tc - 0.35) D.gesture = 'armOut'; hop(D, tc - 0.3, t, 0.2, 0.45); }
        else if (tr === 'deliberate_danger') { if (t > tc - 0.3) D.gesture = 'armUp'; hop(D, tc - 0.28, t, 0.4, 0.62); }
        if (t > tc + 0.5) { X.gesture = 'armOut'; if (tr === 'accidental' && t > tc + 0.2) D.gesture = 'shrug'; else if (!D.gesture && t > tc + 0.9) D.gesture = 'hands'; }
      },
      ball: function (t) {
        if (t < tS - 0.14) return drib(mX, t);
        if (t < tS) return fly(drib(mX, tS - 0.14), b0, tS - 0.14, tS, t, 0);
        if (t < tc) return fly(b0, cp, tS, tc, t, cross ? 3.1 : 0.12);
        return bsim(cp, vAfter, tc, t);
      },
      snd: [[tS, 'kick', 0.8], [tc, 'kick', 0.3], [tc + 0.12, 'ooh', 1]],
      cams: { main: cross ? camSide(-7.5, -4.5, -9.6, 3.0, -4.2, 4.8, 1.3, 64) : camSide(-9.4, -6.6, -9.6, 2.5, -2.8, 1.2, 1.1, 60), high: camFix([-3, -5, 12.5], [-2.5, 1, 0], 56), close: function () { return { p: [cp ? cp[0] - 1.3 : -2.4, cp ? cp[1] - 3.3 : -3.2, 1.7], l: cp ? [cp[0], cp[1], cp[2]] : [0, 0, 1], f: 40 }; } },
      prep: function () {
        b0 = toLocal(partAt(X, 'bootR', tS)); b0[2] = 0.2;
        var tgt = partAt(X, 'bootR', tS);
        partName = tr === 'deliberate_danger' ? 'handR' : tr === 'deliberate' ? nearestPart(D, ['handL', 'handR'], partAt(X, 'bootR', tS), tc) : nearestPart(D, ['elbowL', 'elbowR', 'handL', 'handR'], tgt, tc);
        cp = toLocal(partAt(D, partName, tc));
        vAfter = tr === 'accidental' ? [2.4, 2.9, 2.4] : tr === 'deliberate' ? [1.4, -2.2, 3.4] : [2.2, -1.4, 6.5];
        var dist = hyp(cp[0] - b0[0], cp[1] - b0[1]);
        ovHalo(stat(lw(cp)), tc - 0.25, tc + 0.9, tr === 'accidental' ? YEL : RED, tr === 'accidental' ? 'ARM TUCKED IN · BALL FROM ' + fmt(dist) + ' m' : tr === 'deliberate' ? 'ARM OUT · BODY MADE BIGGER' : 'ARM ABOVE THE SHOULDER · BLOCKS A SHOT');
        ovLink(stat(lw(b0)), stat(lw(cp)), tS, tc + 0.5, WHT, function () { return fmt(dist) + ' m'; });
      }
    });
  };

  // ---- 3. a challenge in the box / a last-man trip -----------------------------------------------------------------------------------------
  function tripScene(inc, S, kind) {                                                        // kind: 'pen' (penalty), 'noFoul', 'red' (last man in the box), 'dogso', 'tactical'
    var T = kind === 'dogso' || kind === 'tactical' ? 4.9 : 4.6, tc = kind === 'dogso' || kind === 'tactical' ? 2.6 : 2.5, A = byNum(S.att, inc.numA), D = byNum(S.def, inc.numD), noFoul = kind === 'noFoul', far = kind === 'red' || kind === 'dogso' || kind === 'tactical', mA, mD, gk = team[S.def][0], cov = null, aK, dK, others, ball0, tk = tc - 0.3, cpA = null, gapD = null, vA0 = kind === 'dogso' || kind === 'tactical' ? rr(-1.5, 1.5) : 5.6;
    anchor(far ? (kind === 'red' ? HL - rr(12.5, 14.5) : HL - rr(25, 30)) : HL - rr(8.5, 11.5), far && kind !== 'red' ? rr(-6, 6) : rr(-4.5, 4.5));
    var u0 = far ? -15.6 : -9.4;
    aK = [[0, u0, vA0], [tc, 0, 0.45]].concat(noFoul ? [[tc + 0.45, 1.1, 0.35], [T, 1.5, 0.3]] : [[tc + 0.5, 1.4, 0.4], [T, 1.9, 0.4]]);
    mA = mv(A, aK);
    if (noFoul) dK = [[0, -14, 5.0], [tc - 0.5, -3.0, 1.95], [tc - 0.05, -1.5, 1.3], [tc + 0.55, -0.3, 1.15], [T, -0.3, 1.15]];
    else if (far) dK = [[0, -18.8, 3.8], [tc - 0.45, -3.6, 1.5], [tc, -1.0, 0.7], [tc + 0.6, 0.3, 0.55], [T, 0.3, 0.55]];
    else dK = [[0, -15.2, 8.4], [tc - 0.45, -3.4, 1.7], [tc, -0.95, 0.72], [tc + 0.55, 0.25, 0.5], [T, 0.25, 0.5]];
    mD = mv(D, dK, function () { return [0, 0]; });
    if (far) {                                                                              // the keeper comes off his line; the other defenders are well beaten
      mv(gk, [[0, E.gu - 1.3, E.gv], [tc, E.gu - 1.3, E.gv], [T, E.gu - 4.8, E.gv]], function () { return [0, 0]; });
      others = some(S.def, 3, ['DEF', 'MID'], [D]);
      var pos = [[-17.5, rr(7, 10)], [-20.5, -rr(6, 10)], [-23, rr(11, 14)]];
      others.forEach(function (p, i) { if (kind === 'tactical' && i === 0) return; stay(p, pos[i][0], pos[i][1], function () { return [0, 0]; }); });
      if (kind === 'tactical') { cov = others[0]; mv(cov, [[0, -17, -10.5], [tc, -3.9, -6.4], [T, -2.6, -3.9]], function () { return [0, 0]; }); tagFor(cov, '#9aa7c2'); }
    }
    refWatch(tc, 1); tagFor(A); tagFor(D);
    S.res = { A: A, D: D, cul: D, vic: A, sp: [0.2, 0.45], last: kind === 'red' || kind === 'dogso' };
    return mkDef({
      T: T, tc: tc, keep: far ? { u0: -22, u1: E.gu + 2, v0: -9, v1: 9 } : { u0: -15, u1: 6, v0: -9, v1: 10 }, label: noFoul ? 'Contact?' : kind === 'dogso' || kind === 'red' ? 'Last man' : kind === 'tactical' ? 'Tactical foul' : 'Foul in the area',
      pose: function (t) {
        slide(D, tc - (noFoul ? 0.28 : 0.31), t, 1);
        if (noFoul) { fall(A, tc - 0.06, t, -1); hop(A, tc - 0.12, t, 0.13, 0.35); if (t > tc + 0.9) D.gesture = 'armOut'; }
        else { fall(A, tc + (far ? 0.1 : 0.12), t, -1); if (t > tc + 1.0) D.gesture = 'hands'; }
        if (far && t > tc + 0.5) gk.gesture = '';
      },
      ball: function (t) { if (t < tk) return drib(mA, t); return bsim(ball0, [far ? 5.6 : 4.4, 0.1, 0], tk, t); },
      snd: noFoul ? [[tc - 0.02, 'ooh', 0.5]] : [[tc, 'kick', 0.4], [tc + 0.06, 'ooh', 1]],
      cams: { main: camSide(far ? -7.5 : -6.4, far ? -4.6 : -4.0, -8.2, 2.2, 0.8, 0.8, 0.6, 60), high: camFix([-3, -3, 11], [0.3, 0.6, 0], 52), close: camFix([-2.4, -3.8, 1.2], [-0.2, 0.5, 0.35], 42) },
      prep: function () {
        ball0 = drib(mA, tk);
        if (noFoul) {
          gapD = minGap(D, ['bootL', 'bootR'], A, ['bootL', 'bootR', 'kneeL', 'kneeR'], tc - 0.3, tc + 0.3);
          ovLink(live(D, 'bootR'), live(A, 'bootL'), tc - 0.4, tc + 0.5, YEL, function (L) { return L < 0.1 ? 'CONTACT' : 'GAP ' + fmt(L) + ' m · NO CONTACT'; });
          ovHalo(live(A, 'head'), tc - 0.2, tc + 0.9, RED, 'GOES DOWN BEFORE ANY CONTACT');
        } else {
          cpA = partAt(A, 'bootR', tc + 0.04);
          ovRing(stat(cpA), tc - 0.12, tc + 0.8, RED, kind === 'pen' ? 'TRIP ON THE ANKLE' : 'TRIPPED FROM BEHIND');
          if (kind === 'red' || kind === 'dogso') ovHalo(live(A, 'head'), tc - 0.9, tc + 0.9, YEL, 'CLEAR CHANCE · NO COVER NEAR');
          if (kind === 'tactical') ovLink(live(D, 'head'), live(cov, 'head'), tc - 0.9, tc + 0.9, YEL, function (L) { return 'COVER ' + fmt(L) + ' m AWAY'; });
        }
      }
    });
  }
  BUILD.penalty_foul = function (inc, S) { return tripScene(inc, S, inc.truth === 'no_foul' ? 'noFoul' : inc.truth === 'penalty_red' ? 'red' : 'pen'); };
  BUILD.dogso = function (inc, S) { return tripScene(inc, S, inc.truth === 'dogso' ? 'dogso' : 'tactical'); };

  // ---- 4. a player goes down: dive or genuine contact ----------------------------------------------------------------------------------------
  BUILD.dive = function (inc, S) {
    var sim = inc.truth === 'simulation', T = 4.4, tc = 2.35, tk = tc - 0.4;
    anchor(inc.inBox ? HL - rr(8, 12) : rr(-4, 22), inc.inBox ? rr(-6, 6) : rr(-12, 12));
    var A = byNum(S.att, inc.numA), D = byNum(S.def, inc.numD), mA, mD, ball0 = null, cp = null, aK, dK;
    aK = [[0, -11.2, 0.7], [tc, 0, 0.3]].concat(sim ? [[tc + 0.5, 0.9, 0.5], [T, 1.2, 0.5]] : [[tc + 0.55, 1.4, 0.35], [T, 1.7, 0.35]]);
    dK = sim ? [[0, -12.8, 2.0], [tc, -1.0, 1.35], [tc + 0.4, -0.1, 1.5], [tc + 1.0, 0.1, 1.5], [T, 0.1, 1.5]] : [[0, -13.4, 1.9], [tc - 0.45, -3.8, 1.0], [tc - 0.05, -1.35, 0.62], [tc + 0.4, 0.2, 0.5], [T, 0.2, 0.5]];
    mA = mv(A, aK); mD = mv(D, dK, function () { return [0, 0]; });
    refWatch(tc, 1); tagFor(A); tagFor(D);
    S.res = { A: A, D: D, cul: sim ? A : D, vic: A, sp: [0.2, 0.4], sim: sim };
    return mkDef({
      T: T, tc: tc, keep: { u0: -14, u1: 5, v0: -10, v1: 10 }, label: sim ? 'Contact?' : 'Contact',
      pose: function (t) {
        if (sim) { fall(A, tc, t, -1); hop(A, tc - 0.05, t, 0.28, 0.4); if (t > tc + 0.6) D.gesture = 'armOut'; }
        else { slide(D, tc - 0.3, t, 1); fall(A, tc + 0.22, t, -1); if (t > tc + 1.1) D.gesture = 'hands'; }
      },
      ball: function (t) { if (t < tk) return drib(mA, t); return bsim(ball0, [5.0, 0.2, 0], tk, t); },
      snd: sim ? [[tc + 0.1, 'ooh', 0.7]] : [[tc, 'kick', 0.3], [tc + 0.1, 'ooh', 0.9]],
      cams: { main: camSide(-6.6, -4.4, -8.4, 2.3, 0.7, 0.5, 0.7, 58), high: camFix([-4.5, -3.5, 10.5], [0.4, 0.4, 0], 52), close: camFix([-2.2, -4.3, 1.2], [0.1, 0.5, 0.35], 44) },
      prep: function () {
        ball0 = drib(mA, tk);
        if (sim) {
          ovLink(live(D, 'bootR'), live(A, 'bootL'), tc - 0.5, tc + 0.6, YEL, function (L) { return 'NO CONTACT · GAP ' + fmt(L) + ' m'; });
          ovHalo(live(A, 'head'), tc - 0.1, tc + 1.0, RED, 'THROWS HIMSELF DOWN');
        } else {
          cp = partAt(A, 'bootR', tc + 0.04);
          ovRing(stat(cp), tc - 0.12, tc + 0.9, RED, 'CLIP ON THE TRAILING FOOT');
          ovHalo(live(A, 'head'), tc + 0.2, tc + 1.2, YEL, 'GOES DOWN AFTER THE CONTACT');
        }
      }
    });
  };

  // ---- 5. a player confronts the referee ----------------------------------------------------------------------------------------------------
  BUILD.dissent = function (inc, S) {
    var harsh = inc.truth === 'serious_dissent', T = 4.4, D = byNum(S.def, inc.numD), mates, mD, ref = R.ref;
    anchor(rr(-8, 14), rr(-9, 9));
    ref.gesture = '';
    mv(ref, [[0, -3.2, -1.0], [0.8, 0, 0], [99, 0, 0]], function (t) { return mD ? mD.pos(t) : [5, 0]; });
    mD = mv(D, harsh ? [[0, 11.5, 3.8], [1.7, 2.0, 0.5], [1.9, 0.95, 0.12], [3.1, 0.95, 0.12], [T, 4.2, 1.9]] : [[0, 11.5, 3.8], [1.6, 3.3, 0.9], [2.0, 2.7, 0.65], [3.4, 2.7, 0.65], [T, 4.6, 2.0]], function () { return [-2, -0.3]; });
    if (harsh) { mates = some(S.def, 2, ['DEF', 'MID'], [D]); mates.forEach(function (p, i) { mv(p, [[0, 6.5, i ? -6 : 7], [2.7, 1.5, i ? -1.4 : 1.5], [3.1, 1.5, i ? -1.4 : 1.5], [T, 4.4, i ? -3 : 3.4]], function () { return [0.95, 0.1]; }); tagFor(p, '#9aa7c2'); }); }
    tagFor(D);
    S.res = { A: null, D: D, cul: D, vic: null, sp: [0, 0], dissent: true };
    return mkDef({
      T: T, tc: harsh ? 1.9 : 2.0, canVar: false, keep: { u0: -4, u1: 13, v0: -8, v1: 8 }, label: 'Dissent',
      pose: function (t) {
        if (harsh) { if (t > 1.9 && t < 3.15) D.gesture = 'rage'; else if (t >= 3.15) D.gesture = 'hands'; if (t > 2.0 && t < 3.3) ref.gesture = 'hands'; }
        else { if (t > 1.9 && t < 3.0) D.gesture = 'hands'; else if (t >= 3.0 && t < 3.6) D.gesture = 'shrug'; }
      },
      ball: function () { var p = lp(-1.3, -1.1); return [-1.3, -1.1, BR]; },
      snd: [[1.7, 'ooh', 0.5]],
      cams: { main: function (t) { var s = clamp(t / 4.4, 0, 1); return { p: [-1.1 - 0.2 * s, -2.0, 1.78], l: [3.4 - 0.5 * s, 0.7, 1.35], f: 68 }; } }
    });
  };

  // ---- 6. a goal that the assistant flags / a goal that needs checking ----------------------------------------------------------------------------
  function goalRun(inc, S, mode) {
    var off = inc.truth === 'offside', lay = mode === 'goal_check', T = lay ? 5.5 : 5.0, tPass = 1.0, tTouch = 1.95, tLay = 2.75, tShoot = lay ? 3.45 : 3.15, tNet = tShoot + 0.5, tFlag = tNet + 0.4, i;
    E.sg = -E.a; anchor(HL - 24, 0);
    var gu = E.gu, A = byNum(S.att, inc.numA), X = A, mM, mX, mA, M, gk = team[S.def][0], ar = R.ars[E.a > 0 ? 0 : 1], arz = E.a * (HW + 1.5), vAR = E.sg * (arz - E.cz), mAR, mG, mRef, lineD, vs = [-10.8, -3.9, 3.4, 10.2], ups = [0, -0.55, -0.95, -1.35], dKeys = [], deep, mDs = [];
    if (lay) X = some(S.att, 1, ['FWD', 'MID'], [A])[0];
    M = some(S.att, 1, ['MID'], [A, X])[0];
    var m = off ? rr(0.45, 0.85) : -rr(0.22, 0.5), vX = rr(-5, 5), vM = rr(-4, 4), vT = (rnd() < 0.5 ? -1 : 1) * rr(1.5, 2.7), xTouch;
    lineD = some(S.def, 4, ['DEF'], []); if (lineD.length < 4) lineD = lineD.concat(some(S.def, 4 - lineD.length, ['MID'], lineD));
    ups.sort(function () { return rnd() - 0.5; }); vs.sort(function () { return rnd() - 0.5; }); deep = ups.indexOf(0);
    mM = mv(M, [[0, -17, vM], [0.7, -14.4, vM], [1.1, -14.0, vM], [99, -14.0, vM]], function () { return [0, vM]; });
    var xh = m - 0.12;                                                                      // hips of the attacker at the moment of the pass
    var xK = [[0, xh - 3.4, vX - 0.3], [tPass, xh, vX], [tTouch, xh + 5.4, vX * 0.8]];
    if (!lay) { xK.push([tShoot, gu - 12.5, vX * 0.35], [tNet + 0.5, gu - 9.2, vX * 0.3], [T, gu - 8.0, vX * 0.3]); }
    else { xK.push([tLay, xh + 6.6, vX * 0.7], [99, xh + 6.6, vX * 0.7]); }
    mX = mv(X, xK, function () { return lay ? [xh + 8, vX * 0.7 - 2] : [gu, 0]; });
    if (lay) { mA = mv(A, [[0, -12.5, -vX * 0.6 - 4.5], [tLay, xh + 4.9, -2.6], [tShoot, xh + 9.2, -1.8], [tNet + 0.5, xh + 10.8, -1.7], [T, xh + 11.5, -1.7]], function () { return [gu, 0]; }); }
    else mA = mX;
    lineD.forEach(function (p, k) {
      var uT = ups[k], vk = vs[k], keys = [[0, uT + 0.65, vk], [0.45, uT + 0.65, vk], [tPass, uT, vk], [tShoot, uT + 5.2, vk * 0.55], [T, uT + 9.5, vk * 0.4]];
      dKeys.push(keys); mDs.push(mv(p, keys, function (t) { return t < tPass ? [-14, vM] : mX.pos(t); }));
    });
    var arK = []; for (i = 0; i <= T + 0.01; i += 0.25) arK.push([i, pos2(dKeys[deep], i)[0], vAR]);
    mAR = mv(ar, arK, function (t) { return [pos2(dKeys[deep], t)[0], 0]; });
    mG = mv(gk, [[0, gu - 1.3, E.gv], [99, gu - 1.3, E.gv]], function () { return [0, 0]; });
    mRef = mv(R.ref, [[0, -22, 8], [tShoot, -8, 7.5], [T, -6, 7.5]], function () { return [G.b.x === undefined ? 0 : wl(G.b.x, G.b.z)[0], 0]; });
    tagFor(A); if (X !== A) tagFor(X); tagFor(M, '#9aa7c2');
    var netPt = [gu + 0.45, vT, 0.9], bM = null, bShot = null, bLay = null, aim = null;
    S.res = { A: A, D: lineD[deep], cul: null, vic: null, X: X, scorer: A, sp: [xh + 0.12, vX], spotU: xh, goal: true, off: off, tNet: tNet, netPt: netPt, tPass: tPass, lay: lay, margin: m };
    var line0 = ups[deep];
    return mkDef({
      T: T, tc: tPass, stops: [tPass], keep: { u0: -20, u1: gu + 2, v0: -13.5, v1: 13.5 }, label: lay ? 'Build-up to a goal' : 'Offside check',
      pose: function (t) {
        kick(M, tPass, t);
        if (lay) { kick(X, tLay, t); kick(A, tShoot, t); } else kick(A, tShoot, t);
        var dir = sideTo(gk, 0, vT - E.gv) , gz = E.sg * 0 + vT;
        if (t > tShoot + 0.04) { gk.diveT = clamp((t - tShoot - 0.04) / 0.5, 0, 1) || 0.001; gk.diveSide = sideTo(gk, lp(0, vT)[0] - lp(0, E.gv)[0], lp(0, vT)[1] - lp(0, E.gv)[1]); gk.diveAmp = 0.9; }
        if (t > tNet + 0.1) A.cel = t < tFlag + 0.5 && !(!lay ? off : false) ? true : (t < tFlag + 0.1 && true);
        if (!lay && t > tNet + 0.1 && t >= tFlag + 0.2) A.cel = false;
        if (!lay && t >= tFlag) ar.gesture = 'flagUp';
        var an = Math.atan2(arz > 0 ? 1 : -1, 0); ar.face = ar.yaw.rotation.y = an; ar.speed = Math.min(ar.speed, 5);
        if (lay && t > tNet + 0.2) { A.cel = true; if (t > tNet + 1.4) A.cel = false; }
      },
      ball: function (t) {
        if (t < tPass - 0.15) return drib(mM, t);
        if (t < tPass) return fly(drib(mM, tPass - 0.15), bM, tPass - 0.15, tPass, t, 0);
        if (t < tTouch) return fly(bM, xTouch, tPass, tTouch, t, 2.3);
        if (!lay) {
          if (t < tShoot - 0.14) return drib(mX, t);
          if (t < tShoot) return fly(drib(mX, tShoot - 0.14), bShot, tShoot - 0.14, tShoot, t, 0);
          if (t < tNet) return fly(bShot, netPt, tShoot, tNet, t, 0.12);
          return inNet(netPt, tNet, t);
        }
        if (t < tLay - 0.14) return drib(mX, t);
        if (t < tLay) return fly(drib(mX, tLay - 0.14), bLay, tLay - 0.14, tLay, t, 0);
        if (t < tShoot) return fly(bLay, aim, tLay, tShoot, t, 0.05);
        if (t < tNet) return fly(bShot, netPt, tShoot, tNet, t, 0.12);
        return inNet(netPt, tNet, t);
      },
      snd: [[tPass, 'kick', 0.7], [tShoot, 'kick', 0.8]].concat(lay ? [[tLay, 'kick', 0.4]] : []).concat(off ? [[tFlag, 'groan', 0.9]] : []),
      fx: [[tNet, function () { R.goalFx(E.att, 14); }]],
      cams: {
        main: function (t) { var s = clamp(t / T, 0, 1); return { p: [6 + 3 * s, -46.5, 13.5], l: [5 + 4 * s, 0, 0], f: 56 }; },
        high: camFix([-2, -3.5, 35], [0.4, 0, 0], 46),
        close: function () { return { p: [-4.6, -9.5, 1.9], l: [0, vX * 0.8, 0.9], f: 44 }; }
      },
      prep: function () {
        bM = toLocal(partAt(M, 'bootR', tPass)); bM[2] = 0.2;
        xTouch = drib(mX, tTouch);
        if (!lay) { bShot = toLocal(partAt(A, 'bootR', tShoot)); bShot[2] = 0.2; }
        else { bLay = toLocal(partAt(X, 'bootR', tLay)); bLay[2] = 0.2; bShot = toLocal(partAt(A, 'bootR', tShoot)); bShot[2] = 0.2; aim = [bShot[0], bShot[1], BR]; }
        var col = off ? RED : GRN, txt = (off ? 'OFFSIDE +' : 'ONSIDE ') + fmt(Math.abs(m)) + ' m';
        if (!off) txt = 'ONSIDE −' + fmt(Math.abs(m)) + ' m';
        ovLine(0, tPass - 0.02, T, WHT, 'LAST DEFENDER', -11.5);
        ovLine(m, tPass - 0.02, T, col, (lay ? '#' + X.num : '#' + A.num) + ' · ' + txt, 11.5);
        ovHalo(stat(lw([xh + 0.15, vX, 1.3])), tPass - 0.02, tPass + 1.4, col, txt);
        ovRing(stat(lw([bM[0], bM[1], 0.2])), tPass - 0.25, tPass + 0.6, YEL, 'BALL PLAYED');
      }
    });
  }
  BUILD.offside = function (inc, S) { return goalRun(inc, S, 'offside'); };
  BUILD.goal_check = function (inc, S) { return goalRun(inc, S, 'goal_check'); };

  // ===== the VAR review =========================================================================================================
  W.varOpen = function () {
    if (!ST || ST.def.canVar === false || ST.phase === 'run') return null;
    var S = ST; S.var = true; S.playing = true; S.rate = 0.5; S.camKey = 'main'; S.vt = Math.max(0, S.def.tc - 1.5); S.camSnap = true; S.dwell = 0; S.stopDone = []; S.ovOn = true; S.tagsOn = true;
    R.freezeOthers = true; R.poseScale = S.rate;
    return { T: S.T, tc: S.def.tc, t0: S.vt, label: S.def.label || '' };
  };
  W.varClose = function () {
    if (!ST || !ST.var) return; var S = ST;
    S.var = false; S.ovOn = false; S.playing = false; R.freezeOthers = false; R.poseScale = 1; S.camSnap = true; ovUpdate(S.vt); applyAt(S.phase === 'run' ? Math.min(S.t, S.T) : S.T);
  };
  W.varState = function () { var S = ST; if (!S || !S.var) return null; return { t: S.vt, T: S.T, tc: S.def.tc, playing: S.playing && S.dwell <= 0, rate: S.rate, angle: S.camKey === 'main' ? 1 : S.camKey === 'high' ? 2 : 3, dwell: S.dwell > 0 }; };
  W.varPlay = function (b) { if (!ST || !ST.var) return; if (b && ST.vt >= ST.T - 0.02) { ST.vt = Math.max(0, ST.def.tc - 1.5); ST.stopDone = []; } ST.playing = !!b; };
  W.varToggle = function () { if (!ST || !ST.var) return false; W.varPlay(!ST.playing); return ST.playing; };
  W.varSeek = function (t) { var S = ST; if (!S || !S.var) return; S.vt = clamp(t, 0, S.T); S.playing = false; S.dwell = 0; S.stopDone = []; (S.def.stops || []).forEach(function (s, i) { if (s <= S.vt + 1e-4) S.stopDone.push(i); }); };
  W.varRate = function (r) { if (!ST || !ST.var) return; ST.rate = r; R.poseScale = r; };
  W.varAngle = function (n) { if (!ST || !ST.var) return; ST.camKey = n === 2 ? 'high' : n === 3 ? 'close' : 'main'; ST.camSnap = true; };

  // ===== outcomes: whistle, cards, free kicks, penalties, goals ==================================================================
  var LATER = [], HOLDS = [];
  function later(t, fn) { LATER.push({ t: t, fn: fn }); }
  function laterStep(dt) { for (var i = LATER.length - 1; i >= 0; i--) { LATER[i].t -= dt; if (LATER[i].t <= 0) { var f = LATER[i].fn; LATER.splice(i, 1); try { f(); } catch (e) { if (window.console) console.error(e); } } } }
  function walk(p, tx, tz, sp, dt, look) {                                               // move a scripted person towards a point; returns the distance left
    var dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz), s;
    if (d > 0.06) { s = Math.min(sp * dt, d); p.x += dx / d * s; p.z += dz / d * s; p.vx = dx / d * sp; p.vz = dz / d * sp; if (d > 0.35) { p.speed = sp; N3.face(p, dx, dz); } else { p.speed = 0; if (look) N3.face(p, look[0] - p.x, look[1] - p.z); } }
    else { p.speed = 0; p.vx = p.vz = 0; if (look) N3.face(p, look[0] - p.x, look[1] - p.z); }
    p.tx = p.x; p.tz = p.z; return d;
  }
  function holdsStep(dt) {
    for (var i = HOLDS.length - 1; i >= 0; i--) {
      var h = HOLDS[i], p = h.p, fin = false, u, d, tg;
      h.t += dt;
      if (h.kind === 'walk') { walk(p, h.x, h.z, h.sp || 6.2, dt, h.look); if (G.state !== 'dead') h.live = (h.live || 0) + dt; if (h.live > 0.5 || h.t > 9) fin = true; }
      else if (h.kind === 'getup') { if (h.t > h.delay) { u = (h.t - h.delay) / 0.6; p.fallT = Math.max(0, 0.46 * (1 - u)); p.speed = 0; p.jumpY = 0; if (u >= 1) fin = true; } }
      else if (h.kind === 'off') { tg = h.path[h.i]; d = walk(p, tg[0], tg[1], 3.8, dt); if (d < 0.5) { h.i++; if (h.i >= h.path.length) { p.on = false; p.root.visible = false; fin = true; } } }
      if (fin) { HOLDS.splice(i, 1); if (h.kind !== 'off') { p.keepScripted = false; p.scripted = false; R.clearPose(p); p.lock = 0.3; } }
    }
  }
  function holdGetUp(p, delay) { if (!p) return; p.keepScripted = true; p.scripted = true; HOLDS.push({ kind: 'getup', p: p, t: 0, delay: delay || 0.9 }); }
  function holdWalkOff(p) {
    var zt = (p.z >= 0 ? 1 : -1) * (HW + 3.2), xt = p.x + (p.x >= 0 ? -1 : 1) * 4, tunnel = [clamp(xt, -HL + 6, HL - 6), zt];
    p.keepScripted = true; p.scripted = true; p.gesture = ''; p.card = null; R.clearPose(p); p.scripted = true;
    HOLDS.push({ kind: 'off', p: p, t: 0, i: 0, path: [[p.x, zt], [tunnel[0], zt], [tunnel[0] + (tunnel[0] >= 0 ? -1 : 1) * 14, zt]] });
  }
  var _nm2 = W.newMatch; W.newMatch = function (o) { HOLDS.length = 0; LATER.length = 0; OUT = null; return _nm2.call(W, o); };

  function awardGoal(t, scorer) {                                                          // the same as the engine's own goal: score, net, crowd, celebration, kick-off
    if (!scorer || !scorer.on) scorer = team[t].filter(function (p) { return p.on && p.role !== 'GK'; })[0];
    G.score[t]++; R.goalFx(t, 13);
    G.state = 'celebrate'; G.timer = 0; G.scorer = scorer; G.owner = null; G.fl = null; G.pend = null; G.cc = t; G.hold = false; G.gkPlan = null;
    if (W.onGoal) { try { W.onGoal(t, scorer.num); } catch (e) {} }
  }
  function loosen(x, z) { G.state = 'loose'; G.owner = null; G.fl = null; G.pend = null; G.hold = false; G.gkPlan = null; G.b.x = x; G.b.z = z; G.b.y = BR; G.b.vx = G.b.vz = G.b.vy = 0; }
  function camBetween(a, b, back, h, f) {
    return function () { var dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz) || 1, ux = dx / d, uz = dz / d; return { pos: [a.x - ux * back - uz * 0.9, h, a.z - uz * back + ux * 0.9], look: [b.x, 1.3, b.z], hfov: f, rate: 4.5 }; };
  }
  function buildWall(fk, x, z) {                                                           // the defenders retreat ten yards; close to goal they form a wall
    var dir = fk === 0 ? 1 : -1, gx = dir * HL, dg = hyp(gx - x, z) || 1, ux = (gx - x) / dg, uz = (0 - z) / dg, n = dg < 24 ? 4 : dg < 33 ? 3 : 0, list = team[1 - fk].filter(function (p) { return p.on && p.role !== 'GK' && !p.scripted; }), i, p, off, wx, wz, d;
    list.sort(function (a, b) { return hyp(a.x - x, a.z - z) - hyp(b.x - x, b.z - z); });
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (i < n) { off = (i - (n - 1) / 2) * 0.78; wx = x + ux * 9.9 - uz * off; wz = z + uz * 9.9 + ux * off; }
      else { d = hyp(p.x - x, p.z - z); if (d > 10.4) continue; d = d || 1; wx = x + (p.x - x) / d * 11.4; wz = z + (p.z - z) / d * 11.4; }
      p.scripted = true; HOLDS.push({ kind: 'walk', p: p, t: 0, x: clamp(wx, -HL + 0.5, HL - 0.5), z: clamp(wz, -HW + 0.5, HW - 0.5), look: [x, z], sp: 6.4 });
    }
  }
  function freeKick(fk, x, z) {
    x = clamp(x, -HL + 1.5, HL - 1.5); z = clamp(z, -HW + 1.2, HW - 1.2);
    R.restart('free', fk, x, z); buildWall(fk, x, z);
  }

  W.outcome = function (inc, choice, info, done) {
    info = info || {};
    if (!ST) { if (done) done(); return false; }
    var S = ST, res = S.res || {}, att = S.att, def = S.def, ref = R.ref, type = inc.type, goalInc = type === 'offside' || type === 'goal_check', steps = [], cul = res.cul, vic = res.vic, card, kind, fk = att, spot, dirA = att === 0 ? 1 : -1, O;
    if (S.var) W.varClose();
    S.ovOn = false; S.tagsOn = false; ovUpdate(0); S.tags.forEach(function (g) { g.sp.visible = false; });
    S.actors.forEach(function (p) { p.speed = 0; p.vx = p.vz = 0; });
    if (goalInc && choice === 'play_on') choice = 'disallow_goal';
    card = choice === 'yellow' ? 'y' : choice === 'red' ? 'r' : null;
    if (goalInc) kind = choice === 'goal_stands' ? 'goal' : 'nogoal';
    else if (choice === 'play_on') kind = type === 'dissent' ? 'free' : 'play';
    else if (choice === 'penalty') kind = 'pen';
    else if (card) { if (type === 'dissent') kind = 'free'; else if (cul && cul.team === att) { kind = 'free'; fk = def; } else kind = inc.inBox ? 'pen' : 'free'; }
    else kind = 'free';
    spot = res.sp ? lp(res.sp[0], res.sp[1]) : [E.cx, E.cz];
    O = OUT = { steps: steps, i: -1, t: 0, cur: null, S: S, done: done, doneDelay: 0.7, finalize: null, snap: true, struck: false };
    O.cam = function () { var c = O.cur && O.cur.cam ? O.cur.cam() : null; if (c && O.snap) { c.snap = true; O.snap = false; } return c; };
    function tell(o) { if (W.onEvent) { try { W.onEvent(o); } catch (e) {} } }
    function stepWhistle(d) { return { d: d || 0.8, enter: function () { N3.sfx('whistle', 0.9); ref.scripted = true; ref.gesture = 'whistle'; N3.face(ref, G.b.x - ref.x, G.b.z - ref.z); if (vic && vic.fallT >= 0 && type !== 'dissent') holdGetUp(vic, 1.0); if (kind !== 'nogoal') N3.sfx('ooh', 0.6); } }; }
    function stepPoint(d, tx, tz) { return { d: d, enter: function () { ref.gesture = 'point'; ref.scripted = true; N3.face(ref, tx - ref.x, tz - ref.z); } }; }
    function stepToCulprit() {
      var tg = null;
      return { d: 3.6, enter: function () { ref.scripted = true; ref.gesture = ''; N3.sfx('tick', 0.4); }, cam: camBetween(ref, cul, 5.5, 2.3, 60), until: function () { return tg && hyp(ref.x - tg[0], ref.z - tg[1]) < 0.2; },
        tick: function (t, dt) { var dx = ref.x - cul.x, dz = ref.z - cul.z, d = hyp(dx, dz) || 1; tg = [cul.x + dx / d * 1.9, cul.z + dz / d * 1.9]; walk(ref, tg[0], tg[1], 6.4, dt, [cul.x, cul.z]); } };
    }
    function stepCard() {
      return { d: 2.2, cam: camBetween(ref, cul, 3.6, 1.95, 56), enter: function () { ref.scripted = true; ref.speed = 0; ref.gesture = 'card'; ref.card = card; N3.face(ref, cul.x - ref.x, cul.z - ref.z); cul.scripted = true; cul.gesture = card === 'r' ? 'hands' : 'shrug'; cul.speed = 0; N3.face(cul, ref.x - cul.x, ref.z - cul.z); N3.sfx(card === 'r' ? 'groan' : 'ooh', 0.9); },
        exit: function () { ref.gesture = ''; ref.card = null; if (card === 'r') { holdWalkOff(cul); } } };
    }
    function finishSimple(fn) { O.finalize = function () { endStage(); W.frozen = false; fn(); }; }
    // ---- assemble ----
    if (kind === 'goal') {
      steps.push({ d: 0.35, enter: function () { R.ars.forEach(function (a) { if (a.gesture === 'flagUp') a.gesture = 'flagDown'; }); ref.scripted = true; ref.gesture = 'point'; N3.face(ref, 0 - ref.x, 0 - ref.z); N3.sfx('cheer', 0.7); } });
      O.doneDelay = 1.6; finishSimple(function () { awardGoal(att, res.scorer); });
    } else if (kind === 'nogoal') {
      steps.push(stepWhistle(0.8));
      steps.push({ d: 1.9, enter: function () { ref.scripted = true; ref.gesture = 'flagUp'; N3.face(ref, spot[0] - ref.x, spot[1] - ref.z); loosen(spot[0], spot[1]); G.state = 'dead'; N3.sfx('groan', 0.9); S.cheer && 0; }, cam: camBetween(ref, { x: spot[0], z: spot[1] }, 7.5, 3.0, 62) });
      finishSimple(function () { R.ars.forEach(function (a) { a.gesture = ''; }); freeKick(def, spot[0], spot[1]); });
    } else if (kind === 'play') {
      steps.push({ d: 1.0, enter: function () { ref.scripted = true; ref.gesture = 'advantage'; N3.face(ref, G.b.x - ref.x, G.b.z - ref.z); if (vic && vic.fallT >= 0) holdGetUp(vic, 0.6); N3.sfx('ooh', 0.5); } });
      finishSimple(function () { var bx = G.b.x, bz = G.b.z; G.tm = att; G.last = att; loosen(bx, bz); G.b.vx = dirA * 1.2; });
    } else {
      steps.push(stepWhistle(0.8));
      if (card && cul) { steps.push(stepToCulprit()); steps.push(stepCard()); }
      if (kind === 'pen') penaltySteps(O, steps, S, att, def, vic, info, tell, dirA, !card);
      else {
        if (!card) steps.push({ d: 1.0, enter: function () { ref.scripted = true; ref.gesture = 'point'; N3.face(ref, (fk === 0 ? 1 : -1) * 10 + ref.x, ref.z); }, cam: camBetween(ref, { x: spot[0], z: spot[1] }, 7, 3.0, 62) });
        finishSimple(function () { freeKick(fk, spot[0], spot[1]); });
      }
    }
    return true;
  };

  function penaltySteps(O, steps, S, att, def, vic, info, tell, dir, pointFirst) {
    var sx = dir * (HL - 11), gk = team[def][0], ref = R.ref, ar = R.ars[dir > 0 ? 0 : 1], taker = null, i, st = { done: false }, startPos, plant;
    var order = [9, 10, 11, 7, 8], atkPos = [[20.8, -14.5], [21.2, -5.2], [20.9, 6], [21.3, 15], [14.5, -23.5], [14, 23.8], [27, -8], [27, 9], [26, 0], [31, 14]], defPos = [[20.9, -9.5], [21.4, 2], [20.7, 10.8], [21, -18], [14.2, 22.6], [14.6, -22.8], [26, -3], [26.5, 5], [31, 0], [30, -12]];
    if (vic && vic.on && vic.team === att && vic.role !== 'GK' && rnd() < 0.35) taker = vic;
    for (i = 0; i < order.length && !taker; i++) taker = team[att].filter(function (p) { return p.on && p.num === order[i] && p.role !== 'GK'; })[0] || null;
    if (!taker) taker = team[att].filter(function (p) { return p.on && p.role !== 'GK'; })[0];
    var camPen = function () { var b = G.b; return { pos: [sx - dir * 10.4, 2.5, 4.6], look: O.struck ? [b.x, Math.max(0.9, b.y), b.z] : [dir * (HL - 5.0), 1.1, 0], hfov: 58, rate: O.struck ? 5 : 3 }; };
    function release(list) { list.forEach(function (p) { if (p === taker && !st.done) return; p.scripted = false; R.clearPose(p); p.vx = p.vz = 0; p.tx = p.x; p.tz = p.z; p.lock = 0.2; }); }
    steps.push({ d: 2.5, cam: camPen,
      enter: function () {
        if (W.onCut) { try { W.onCut(); } catch (e) {} }
        var ia = 0, id = 0; O.list = [];
        all.forEach(function (p) {
          if (!p.on || p.role === 'GK' || p === taker) return;
          var q = p.team === att ? atkPos[ia++ % atkPos.length] : defPos[id++ % defPos.length];
          R.clearPose(p); p.scripted = true; p.keepScripted = false; p.x = dir * (HL - q[0]) + (rnd() - 0.5) * 1.4; p.z = q[1] + (rnd() - 0.5) * 1.4; p.vx = p.vz = 0; p.speed = 0; p.tx = p.x; p.tz = p.z; N3.face(p, sx - p.x, 0 - p.z); p.yaw.rotation.y = p.face; O.list.push(p);
        });
        R.clearPose(taker); taker.scripted = true; taker.keepScripted = true; startPos = [sx - dir * 4.2, 2.3]; taker.x = startPos[0]; taker.z = startPos[1]; N3.face(taker, sx - taker.x, -taker.z); taker.yaw.rotation.y = taker.face; taker.speed = 0; O.list.push(taker);
        R.clearPose(gk); gk.scripted = true; gk.x = dir * (HL - 0.4); gk.z = 0; gk.vx = gk.vz = 0; N3.face(gk, -dir, 0); gk.yaw.rotation.y = gk.face; gk.gesture = 'ready'; O.list.push(gk);
        ref.scripted = true; R.clearPose(ref); ref.x = dir * (HL - 24); ref.z = 5.5; N3.face(ref, sx - ref.x, 0 - ref.z); ref.yaw.rotation.y = ref.face; ref.gesture = 'point';
        ar.scripted = true; R.clearPose(ar); ar.x = dir * (HL - 0.6); ar.z = 24.5; ar.face = ar.yaw.rotation.y = Math.PI / 2;
        G.state = 'dead'; G.owner = null; G.fl = null; G.pend = null; G.b.x = sx; G.b.z = 0; G.b.y = BR; G.b.vx = G.b.vz = G.b.vy = 0;
        R.focus = { x: sx, z: 0 }; W.frozen = true; O.snap = true;
      },
      tick: function (t) { gk.z = 0.45 * Math.sin(t * 2.1); gk.root.position.z = gk.z; if (t > 1.2) ref.gesture = 'ready'; } });
    steps.push({ d: 0.8, cam: camPen, enter: function () { N3.sfx('whistle', 0.9); ref.gesture = 'whistle'; taker.gesture = ''; }, tick: function (t) { gk.z = 0.45 * Math.sin(t * 2.1 + 5); } });
    var struckAt = 1.0, plan = null;
    steps.push({ d: 1.9, cam: camPen,
      enter: function () { ref.gesture = ''; plant = [sx - dir * 0.6, 0.25]; },
      tick: function (t, dt) {
        var u = clamp(t / struckAt, 0, 1), e = ease(u);
        if (!st.done) {
          taker.x = lerp(startPos[0], plant[0], e); taker.z = lerp(startPos[1], plant[1], e); taker.speed = u < 1 ? 4.4 * Math.sqrt(Math.max(0.02, 1 - u * 0.8)) : 0; N3.face(taker, plant[0] - startPos[0], plant[1] - startPos[1]);
          var ks = struckAt - 0.56 * KT; if (t >= ks) { taker.kickT = clamp((t - ks) / KT, 0, 1); taker.speed = 0; N3.face(taker, dir, 0); }
          gk.z = 0.35 * Math.sin(t * 2.5) * (1 - u); gk.root.position.z = gk.z;
        }
        if (!st.done && t >= struckAt) { st.done = true; strike(); }
        if (st.done) { var ks2 = struckAt - 0.56 * KT; taker.kickT = clamp((t - ks2) / KT, 0, 1); if (taker.kickT >= 1) taker.kickT = -1; }
      } });
    O.finalize = function () { release(O.list || []); taker.keepScripted = false; taker.scripted = false; R.clearPose(taker); endStage(); W.frozen = false; };
    O.doneDelay = 0.9;
    function strike() {
      var B = G.b, gx = dir * HL, scores = info.scores == null ? rnd() < 0.78 : !!info.scores, r = rnd(), result, tz, ty, x1 = gx + dir * 0.05, z0 = gk.z, zEnd, tzGk;
      result = scores ? 'goal' : (r < 0.5 ? 'save' : r < 0.8 ? 'miss' : 'post');
      if (result === 'goal') { tz = (rnd() < 0.5 ? -1 : 1) * (2.6 + rnd() * 0.85); ty = 0.25 + rnd() * 1.9; x1 = gx + dir * 0.45; }
      else if (result === 'save') { tz = (rnd() < 0.5 ? -1 : 1) * (1.2 + rnd() * 1.9); ty = 0.3 + rnd() * 1.3; }
      else if (result === 'miss') { var sd = rnd() < 0.5 ? -1 : 1; if (rnd() < 0.5) { tz = sd * (GW / 2 + 0.8 + rnd() * 2.2); ty = 0.5 + rnd() * 1.4; } else { tz = (rnd() - 0.5) * 5; ty = GH + 0.6 + rnd() * 2; } }
      else { tz = (rnd() < 0.5 ? -1 : 1) * GW / 2; ty = 1.1; x1 = gx; }
      var dist = hyp(x1 - B.x, tz - B.z), T = Math.max(0.28, dist / (23 + rnd() * 5));
      G.fl = { kind: 'shot', res: result === 'post' ? 'block' : result, x0: B.x, y0: 0, z0: B.z, x1: x1, y1: ty, z1: tz, T: T, t: 0, h: ty > 1.6 ? 0.12 : 0.04, tgt: null, shooter: taker };
      G.state = 'shot'; G.owner = null; G.last = att; G.lastP = taker; G.tm = att; taker.lock = 0.8; N3.sfx('kick', 0.85);
      tzGk = result === 'save' ? tz : result === 'goal' ? (rnd() < 0.62 ? tz : -tz) : (rnd() < 0.5 ? -1 : 1) * 2.2;
      zEnd = result === 'save' ? tzGk : z0 + (tzGk - z0) * (result === 'goal' ? 0.5 : 0.85);
      gk.scripted = true; gk.gesture = ''; gk.vx = gk.vz = 0; gk.speed = 0; N3.face(gk, -dir, 0); gk.diveSide = (tzGk - z0) >= 0 ? (gk.team === 0 ? 1 : -1) : (gk.team === 0 ? -1 : 1);
      G.gkPlan = { gk: gk, res: result === 'post' ? 'miss' : result, z0: z0, zEnd: zEnd, T: T, t: 0 };
      O.struck = true; R.focus = null; W.frozen = false; R.freezeOthers = false;
      release(O.list.filter(function (p) { return p !== gk && p !== taker; }));
      ref.scripted = false; ar.scripted = false; ref.gesture = '';
      if (result === 'post') later(T, function () { N3.sfx('post', 1); });
      later(T + 0.05, function () { tell({ type: 'penalty', result: result, team: att, taker: taker.num }); });
    }
  }

  function outStep(dt) {
    var o = OUT, c;
    if (o.i < 0 || (o.cur && (o.t >= o.cur.d || (o.cur.until && o.t > 0.25 && o.cur.until())))) {
      if (o.cur && o.cur.exit) { try { o.cur.exit(); } catch (e) { if (window.console) console.error(e); } }
      o.i++; o.t = 0;
      if (o.i >= o.steps.length) { finishOut(); return; }
      o.cur = o.steps[o.i]; o.snap = true;
      if (o.cur.enter) { try { o.cur.enter(); } catch (e2) { if (window.console) console.error(e2); } }
    }
    o.t += dt;
    if (o.cur && o.cur.tick) { try { o.cur.tick(o.t, dt); } catch (e3) { if (window.console) console.error(e3); } }
  }
  function finishOut() {
    var o = OUT; OUT = null;
    try { if (o.finalize) o.finalize(); else endStage(); } catch (e) { if (window.console) console.error(e); endStage(); }
    [R.ref].concat(R.ars).forEach(function (p) { if (p && !p.keepScripted) { p.scripted = false; R.clearPose(p); p.vx = p.vz = 0; p.tx = p.x; p.tz = p.z; } });
    W.frozen = false; R.freezeOthers = false; R.poseScale = 1; R.focus = null;
    if (o.done) later(o.doneDelay || 0.6, o.done);
  }
  W._dbg = function () { return { ST: ST, OUT: OUT, E: E, HOLDS: HOLDS }; };
})(W3);
