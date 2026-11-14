/* lab.js — NAME-O-MATIC Practice Lab. Runs on Three.js r128 + nom3d.js. Metres, seconds. Goal at +x. */
(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
function nogl() { var n = $('nogl'); if (n) n.style.display = 'flex'; var v = $('veil'); if (v) v.classList.add('hide'); }
if (!window.THREE || !window.N3 || !N3.supported()) { nogl(); return; }

// ============================================================================================================================
// renderer, scene, actors
// ============================================================================================================================
var PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
var TOUCH = PHONE || ('ontouchstart' in window && window.matchMedia && matchMedia('(pointer:coarse)').matches);
if (TOUCH) document.body.classList.add('touch');
var cvs = $('c'), rend, scene, cam, ST, W = 0, H = 0;
try { rend = new THREE.WebGLRenderer({ canvas: cvs, antialias: !PHONE }); } catch (e) { nogl(); return; }
var Q = { shadows: !PHONE, pr: Math.min(window.devicePixelRatio || 1, PHONE ? 1.5 : 1.75), auto: !window.__labNoAuto, acc: 0, n: 0, stage: 0 };
rend.shadowMap.enabled = true; rend.shadowMap.type = THREE.PCFSoftShadowMap; rend.setPixelRatio(Q.pr);
scene = new THREE.Scene();
cam = new THREE.PerspectiveCamera(56, 1, 0.1, 500);
ST = N3.stadium(scene, { shadows: Q.shadows, shadowSize: PHONE ? 1024 : 2048, homeColor: '#e8012c', awayColor: '#3b82f6' });

var GX = N3.HL, GZ = N3.GW / 2, GH = N3.GH, BR = 0.15, GOAL = ST.goals[1], PI = Math.PI;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.1547; }
function hyp(a, b) { return Math.sqrt(a * a + b * b); }

var KIT_YOU = { kit: '#e8012c', trim: '#ffffff', number: 10, shorts: '#ffffff', socks: '#e8012c', kitStyle: 2, name: 'you' };
var kicker = N3.player(KIT_YOU); scene.add(kicker.root);
var keeper = N3.player({ kit: '#19c25d', trim: '#0b5d2b', number: 1, gk: true, gloves: '#ffd23f', shorts: '#14171f', socks: '#19c25d', name: 'gk' }); scene.add(keeper.root);
var mate = N3.player({ kit: '#e8012c', trim: '#ffffff', number: 8, shorts: '#ffffff', socks: '#e8012c', kitStyle: 2, name: 'mate' }); scene.add(mate.root); mate.root.visible = false;
var defP = N3.player({ kit: '#2563eb', trim: '#ffd23f', number: 4, kitStyle: 1, shorts: '#0c1d4d', socks: '#2563eb', name: 'def' }); scene.add(defP.root); defP.root.visible = false;
var wall = [];
for (var wi = 0; wi < 5; wi++) { var wp = N3.player({ kit: '#2563eb', trim: '#ffd23f', number: 2 + wi, kitStyle: 1, shorts: '#0c1d4d', socks: '#2563eb', name: 'w' + wi }); wp.root.visible = false; scene.add(wp.root); wall.push(wp); }
var ball = N3.ball(BR); scene.add(ball.group);

// goal-mouth zones (shooting drill) -----------------------------------------------------------------------------------------
var ZONES = [], ZPTS = [[300, 150, 300], [200, 100, 200]];            // [row top, row bottom] x [left, centre, right]
(function () {
  var zw = N3.GW / 3, zh = GH / 2, r, c;
  for (r = 0; r < 2; r++) for (c = 0; c < 3; c++) {
    var cv = N3.canvas(128, 64), g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.0)'; g.fillRect(0, 0, 128, 64);
    g.font = '900 30px Nunito, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 5; g.strokeText(String(ZPTS[r][c]), 64, 34); g.fillText(String(ZPTS[r][c]), 64, 34);
    var mat = new THREE.MeshBasicMaterial({ map: N3.tex(cv), transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(zw - 0.08, zh - 0.08), mat);
    m.rotation.y = -PI / 2; m.position.set(GX - 0.15, GH - zh / 2 - r * zh, -GZ + zw / 2 + c * zw); m.visible = false; scene.add(m);
    var tint = new THREE.Mesh(new THREE.PlaneGeometry(zw - 0.08, zh - 0.08), new THREE.MeshBasicMaterial({ color: r === 0 && c !== 1 ? 0xffd23f : (c === 1 ? 0x3b9bff : 0x06ffa5), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    tint.rotation.y = -PI / 2; tint.position.copy(m.position); tint.position.x -= 0.01; tint.visible = false; scene.add(tint);
    ZONES.push({ m: m, tint: tint, flash: 0, r: r, c: c, pts: ZPTS[r][c] });
  }
})();
// aim reticle, dotted guide, pass target ring, ball trail -----------------------------------------------------------------------
var reticle = new THREE.Group();
(function () {
  var mt = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide });
  var rg = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 28), mt); reticle.add(rg);
  [[0, 0.36, 0.05, 0.22], [0, -0.36, 0.05, 0.22], [0.36, 0, 0.22, 0.05], [-0.36, 0, 0.22, 0.05]].forEach(function (a) { var m = new THREE.Mesh(new THREE.PlaneGeometry(a[2], a[3]), mt); m.position.set(a[0], a[1], 0); reticle.add(m); });
  reticle.renderOrder = 20; reticle.children.forEach(function (c) { c.renderOrder = 20; }); scene.add(reticle); reticle.visible = false; reticle.userData.mat = mt;
})();
var DOTS = []; (function () { var dm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false });
  for (var i = 0; i < 26; i++) { var d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), dm.clone()); d.renderOrder = 18; d.visible = false; scene.add(d); DOTS.push(d); } })();
var targetRing = N3.ring(1.0, 1.25, 0x06ffa5, 0.95), targetDisc = N3.disc(1.25, 0x06ffa5, 0.18); targetRing.visible = targetDisc.visible = false; scene.add(targetRing); scene.add(targetDisc);
var aimGround = N3.ring(0.35, 0.5, 0xffffff, 0.9); aimGround.visible = false; scene.add(aimGround);
var glowCv = N3.canvas(64, 64), gcx = glowCv.getContext('2d'), gg = gcx.createRadialGradient(32, 32, 1, 32, 32, 31); gg.addColorStop(0, 'rgba(255,240,170,0.9)'); gg.addColorStop(1, 'rgba(255,200,60,0)'); gcx.fillStyle = gg; gcx.fillRect(0, 0, 64, 64);
var glowTex = new THREE.CanvasTexture(glowCv), TRAIL = [], trailI = 0, trailT = 0;
for (var ti = 0; ti < 22; ti++) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp.scale.set(0.5, 0.5, 1); scene.add(sp); TRAIL.push({ s: sp, a: 0 }); }
var cones = [], gateRings = [];

// ============================================================================================================================
// ball physics (shared by the real ball and the predictions)
// ============================================================================================================================
var bp = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, bounceEv: false };
function phys(b, h) {
  var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz), onG = b.y <= BR + 0.003 && Math.abs(b.vy) < 0.06;
  if (!onG) b.vy -= 9.81 * h;
  var k = 0.0105 * sp * h; b.vx -= b.vx * k; b.vy -= b.vy * k; b.vz -= b.vz * k;
  var vh = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
  if (vh > 0.8 && b.spin && !onG) { var a = b.spin * 0.021 * vh * h, px = -b.vz / vh, pz = b.vx / vh; b.vx += px * a; b.vz += pz * a; b.spin *= (1 - 0.22 * h); }
  b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
  if (b.y < BR) {
    b.y = BR;
    if (b.vy < -1.1) { b.vy = -b.vy * 0.62; b.vx *= 0.88; b.vz *= 0.88; b.spin *= 0.6; b.bounceEv = true; }
    else {
      b.vy = 0; var s2 = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
      if (s2 > 0) { var ns = Math.max(0, s2 - (1.6 + s2 * 0.05) * h); b.vx *= ns / s2; b.vz *= ns / s2; }
      b.spin *= (1 - 3 * h);
    }
  }
}
function copyB(b) { return { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, spin: b.spin, bounceEv: false }; }
function predictGoalLine(b0, maxT) {
  var b = copyB(b0), t = 0;
  while (t < maxT) {
    phys(b, 0.01); t += 0.01;
    if (b.x >= GX) return { t: t, x: b.x, y: b.y, z: b.z, hit: true };
    if (b.x < -70 || Math.abs(b.z) > 60) break;
    if (b.y <= BR + 0.003 && hyp(b.vx, b.vz) < 0.3) break;
  }
  return { t: t, x: b.x, y: b.y, z: b.z, hit: false };
}
function solveAim(ox, oz, tz, ty, v0) {                                      // elevation that sends a straight (uncurved) shot through (GX, ty, tz)
  var az = Math.atan2(tz - oz, GX - ox), lo = 0, hi = 0.62, i;
  function yAt(e) {
    var b = { x: ox, y: BR + 0.08, z: oz, vx: Math.cos(e) * Math.cos(az) * v0, vy: Math.sin(e) * v0, vz: Math.cos(e) * Math.sin(az) * v0, spin: 0, bounceEv: false }, t = 0;
    while (t < 5) { phys(b, 0.02); t += 0.02; if (b.bounceEv && b.x < GX) return -1; if (b.x >= GX) return b.y; }
    return -1;
  }
  if (ty < 0.4) return { az: az, el: 0 };
  if (yAt(hi) < ty) return { az: az, el: hi };
  for (i = 0; i < 14; i++) { var m = (lo + hi) / 2; if (yAt(m) < ty) lo = m; else hi = m; }
  return { az: az, el: (lo + hi) / 2 };
}

// ============================================================================================================================
// drills
// ============================================================================================================================
var DRILLS = {
  shoot: { icon: '🎯', name: 'Target Practice', desc: 'Place the aim ring in the goal, hold to charge, release to shoot. Corners are worth the most — and the keeper is watching.', goal: '🏆 Score as many points as you can in 90 s', time: 90, stars: [500, 1100, 1800], runup: 0.14, keeper: true, zones: true, unit: 'Goals' },
  pass: { icon: '🎽', name: 'Passing', desc: 'Find your team-mate with a pass. Aim on the grass, hold for pace — arrive at a gentle speed for a perfect touch. Hold Shift on release to lob over defenders.', goal: '🏆 Score 900+ in 60 s', time: 60, stars: [450, 900, 1400], runup: 0.12, keeper: false, unit: 'Passes' },
  freekick: { icon: '🌀', name: 'Free Kicks', desc: 'Beat the wall. Curve the ball round it with Q / E, or dip it over the top. Five dead balls from around the box.', goal: '🏆 Score 3 of 5', time: 0, stars: [200, 500, 850], runup: 0.34, keeper: true, wall: true, att: 5, unit: 'Goals' },
  penalty: { icon: '🥅', name: 'Penalties', desc: 'Five spot-kicks. The keeper has to guess — pick a corner, trust your power, and don\'t smash it into the stands.', goal: '🏆 Score all 5', time: 0, stars: [300, 650, 1000], runup: 0.42, keeper: true, att: 5, pen: true, unit: 'Scored' },
  longshot: { icon: '💥', name: 'Long Shots', desc: 'Hit it from 25 – 35 metres. Pace gets it past the keeper but too much and accuracy goes. Six attempts.', goal: '🏆 Score 3 of 6', time: 0, stars: [250, 600, 1000], runup: 0.22, keeper: true, att: 6, unit: 'Goals' },
  skills: { icon: '⚡', name: 'Skills Course', desc: 'Dribble through all seven gates (WASD, Shift to sprint — the ball stays on your foot if you turn gently), then finish past the keeper. Cones cost time.', goal: '🏆 Finish under 45 s', time: 120, stars: [400, 800, 1100], runup: 0.1, keeper: true, unit: 'Gates' }
};
var ORDER = ['shoot', 'pass', 'freekick', 'penalty', 'longshot', 'skills'];
var S = { drill: 'shoot', phase: 'idle', time: 90, score: 0, goals: 0, att: 0, streak: 0, pow: 0, charging: false, curve: 0, keeperOn: true, guide: true, shot: null, resT: 0, ended: false,
  aimZ: 0, aimY: 1.1, aimX: 0, aimGZ: 0, lob: false, results: [], gates: 0, pen: 0, passes: 0, spot: { x: 0, z: 0 }, kick: null, camMode: 0, ctrl: true, tsince: 0, endAfter: false };
var BEST = {}; try { BEST = JSON.parse(localStorage.getItem('nom_lab_best') || '{}') || {}; } catch (e) { BEST = {}; }
function saveBest() { try { localStorage.setItem('nom_lab_best', JSON.stringify(BEST)); } catch (e) {} }

// ---- UI plumbing --------------------------------------------------------------------------------------------------------
function starsOf(id, score) { var t = DRILLS[id].stars, n = 0; for (var i = 0; i < 3; i++) if (score >= t[i]) n = i + 1; return n; }
function starStr(n) { return '★'.repeat(n) + '<span class="off">' + '★'.repeat(3 - n) + '</span>'; }
function buildTabs() {
  var h = '';
  ORDER.forEach(function (id) { var d = DRILLS[id], b = BEST[id]; h += '<button class="tab' + (id === S.drill ? ' on' : '') + '" data-d="' + id + '">' + d.icon + ' ' + d.name + (b ? '<span class="st">' + '★'.repeat(b.stars) + '</span>' : '') + '</button>'; });
  $('tabs').innerHTML = h;
  Array.prototype.forEach.call($('tabs').children, function (b) { b.addEventListener('click', function () { setDrill(b.getAttribute('data-d')); }); });
}
var toastT = 0;
function toast(big, sub, color, pts) {
  $('tbig').textContent = big; $('tbig').style.color = color || '#ffd23f'; $('tsub').textContent = sub || ''; $('tpts').textContent = pts || '';
  $('toast').classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { $('toast').classList.remove('show'); }, 1600);
}
function mmss(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60); }
function hud() {
  var d = DRILLS[S.drill];
  $('h1').textContent = S.drill === 'skills' ? (S.gates + '/7') : S.score; $('l1').textContent = S.drill === 'skills' ? 'Gates' : 'Score';
  var l2 = d.unit; $('l2').textContent = l2;
  if (S.drill === 'pass') $('h2').textContent = S.passes;
  else if (S.drill === 'skills') $('h2').textContent = S.score;
  else if (d.att) $('h2').textContent = S.goals + '/' + d.att; else $('h2').textContent = S.goals + '/' + S.att;
  if (S.drill === 'skills') $('l2').textContent = 'Points';
  $('h3').textContent = S.streak; $('l3').textContent = 'Streak';
  if (S.drill === 'skills') { $('h4').textContent = (S.skT || 0).toFixed(1) + 's'; $('l4').textContent = 'Time'; }
  else if (d.time) { $('h4').textContent = mmss(S.time); $('l4').textContent = 'Time'; }
  else { $('h4').textContent = Math.max(0, d.att - S.att); $('l4').textContent = 'Left'; }
  var pe = $('pens');
  if (d.att) { var h = ''; for (var i = 0; i < d.att; i++) { var r = S.results[i]; h += '<span class="' + (r === 1 ? 'g' : r === 0 ? 'm' : (i === S.att && S.phase !== 'idle' && S.phase !== 'done' ? 'n' : '')) + '">' + (r === 1 ? '⚽' : r === 0 ? '✕' : '') + '</span>'; } pe.innerHTML = h; pe.style.display = 'flex'; }
  else pe.style.display = 'none';
}
function panelFor(id) {
  var d = DRILLS[id]; $('dtitle').textContent = d.icon + ' ' + d.name.toUpperCase(); $('ddesc').textContent = d.desc; $('dgoal').textContent = d.goal;
  var b = BEST[id]; $('dbest').textContent = b ? ('Best: ' + b.score + ' pts  ' + '★'.repeat(b.stars) + '☆'.repeat(3 - b.stars)) : 'No best yet — go set one!';
  $('optk').style.display = (d.keeper && id !== 'penalty') ? 'flex' : 'none';
  $('cmove').style.display = $('cspr').style.display = id === 'skills' ? 'flex' : 'none';
  $('joy').classList.toggle('on', id === 'skills'); $('sprint').style.display = id === 'skills' ? 'block' : 'none';
}
function setDrill(id) {
  S.drill = id; buildTabs(); panelFor(id); resetDrill(); showStart();
}
function showStart() {
  clearTimeout(toastT); $('toast').classList.remove('show');
  var d = DRILLS[S.drill], b = BEST[S.drill], v = $('veil'), bx = $('vbox');
  bx.innerHTML = '<h2>' + d.icon + ' ' + d.name + '</h2><p>' + d.desc + '</p><p style="color:#06ffa5;margin-top:-4px">' + d.goal + '</p>' + (b ? '<div class="rec">BEST ' + b.score + ' ' + '★'.repeat(b.stars) + '</div>' : '') +
    '<div class="row"><button class="go" id="vgo">▶ START</button></div>';
  v.classList.remove('hide'); $('vgo').addEventListener('click', function () { N3.unlock(); startDrill(); });
}
function showResult() {
  clearTimeout(toastT); $('toast').classList.remove('show');
  var d = DRILLS[S.drill], sc = S.drill === 'skills' ? S.score : S.score, st = starsOf(S.drill, sc), b = BEST[S.drill], rec = !b || sc > b.score, v = $('veil'), bx = $('vbox');
  if (rec && sc > 0) { BEST[S.drill] = { score: sc, stars: st, t: Date.now() }; saveBest(); buildTabs(); }
  panelFor(S.drill);
  var nx = ORDER[(ORDER.indexOf(S.drill) + 1) % ORDER.length];
  var extra = S.drill === 'skills' ? (S.finished ? 'Finished in ' + S.skT.toFixed(1) + ' s' : 'Time ran out before the finish') : (S.drill === 'pass' ? S.passes + ' passes completed' : S.goals + ' goal' + (S.goals === 1 ? '' : 's') + ' from ' + S.att + (S.att === 1 ? ' attempt' : ' attempts'));
  bx.innerHTML = '<h2>' + (st >= 3 ? 'WORLD CLASS!' : st === 2 ? 'GREAT SESSION' : st === 1 ? 'GOOD WORK' : 'KEEP PRACTISING') + '</h2><div class="stars">' + starStr(st) + '</div><div class="big">' + sc + ' pts</div><p>' + extra + '</p>' + (rec && sc > 0 ? '<div class="rec">🏅 NEW PERSONAL BEST</div>' : (b ? '<div class="rec">Best ' + b.score + '</div>' : '')) +
    '<div class="row"><button class="go" id="vretry">↻ Retry</button><button id="vnext">' + DRILLS[nx].icon + ' ' + DRILLS[nx].name + ' →</button></div>';
  v.classList.remove('hide'); N3.sfx(st >= 2 ? 'cheer' : 'whistle');
  $('vretry').addEventListener('click', function () { N3.unlock(); startDrill(); }); $('vnext').addEventListener('click', function () { setDrill(nx); });
}

// ============================================================================================================================
// drill flow
// ============================================================================================================================
function clearStage() {
  wall.forEach(function (w) { w.root.visible = false; }); mate.root.visible = false; defP.root.visible = false; targetRing.visible = targetDisc.visible = false;
  cones.forEach(function (c) { scene.remove(c.m); }); cones = []; gateRings.forEach(function (g) { scene.remove(g); }); gateRings = [];
  ZONES.forEach(function (z) { z.m.visible = z.tint.visible = false; }); S.walls = [];
}
function resetDrill() {
  S.phase = 'idle'; S.score = 0; S.goals = 0; S.att = 0; S.streak = 0; S.pow = 0; S.charging = false; S.curve = 0; S.shot = null; S.results = []; S.passes = 0; S.gates = 0; S.skT = 0; S.finished = false; S.ended = false; S.endAfter = false; S.kick = null; S.pen = 0;
  S.time = DRILLS[S.drill].time; document.body.classList.remove('run'); clearStage(); setupScene(); hud(); $('power').classList.remove('show'); $('rcurve').textContent = '0';
}
function startDrill() {
  $('veil').classList.add('hide'); resetDrill(); S.phase = 'ready'; setupAttempt(); N3.sfx('whistle', 0.7); document.body.classList.add('run'); hud();
  if (S.drill === 'skills') toast('GO!', 'Gate 1 is lit — dribble through', '#06ffa5');
}
function setupScene() {
  var d = DRILLS[S.drill];
  keeper.root.visible = d.keeper && (S.keeperOn || S.drill === 'penalty'); resetKeeper();
  if (d.zones) ZONES.forEach(function (z) { z.m.visible = z.tint.visible = true; z.m.material.opacity = 0.9; });
  if (S.drill === 'skills') buildCourse();
  var sp = defaultSpot(); placeBall(sp.x, sp.z); S.spot = sp; S.aimGX = sp.x + 14; S.aimGZ = sp.z; S.aimZ = 0; S.aimY = 1.1;
  kicker.root.visible = true; mate.root.visible = false;
}
function defaultSpot() { var d = S.drill; return d === 'penalty' ? { x: GX - 11, z: 0 } : d === 'skills' ? { x: -22, z: 0 } : d === 'pass' ? { x: -5, z: 0 } : d === 'longshot' ? { x: GX - 30, z: 0 } : d === 'freekick' ? { x: GX - 22, z: 8 } : { x: GX - 18, z: 0 }; }
function placeBall(x, z) { bp.x = x; bp.y = BR; bp.z = z; bp.vx = bp.vy = bp.vz = 0; bp.spin = 0; bp.bounceEv = false; bp.held = false; ball.last = null; }
function resetKeeper() { keeper.root.position.set(GX - 0.7, 0, 0); keeper.face = PI; keeper.root.children[0].rotation.y = PI; keeper.diveT = -1; keeper.gesture = 'ready'; keeper.speed = 0; keeper.jumpY = 0; keeper.kz = 0; keeper.plan = null; }

function setupAttempt() {
  var d = DRILLS[S.drill], id = S.drill, sp, ang, dist;
  S.shot = null; S.kick = null; S.charging = false; S.pow = 0; S.curve = 0; $('rcurve').textContent = '0'; $('power').classList.remove('show'); S.tsince = 0; S.lob = false;
  resetKeeper(); defP.root.visible = false; wall.forEach(function (w) { w.root.visible = false; w.jumpY = 0; }); S.walls = [];
  if (id === 'shoot') { dist = rnd(14, 22); ang = rnd(-0.7, 0.7); sp = { x: GX - dist * Math.cos(ang), z: clamp(dist * Math.sin(ang), -22, 22) }; S.aimZ = 0; S.aimY = 1.1; }
  else if (id === 'longshot') { dist = rnd(26, 34); ang = rnd(-0.45, 0.45); sp = { x: GX - dist * Math.cos(ang), z: dist * Math.sin(ang) }; S.aimZ = 0; S.aimY = 1.4; }
  else if (id === 'freekick') {
    dist = rnd(18.5, 26.5); ang = (Math.random() < 0.5 ? -1 : 1) * rnd(0.12, 0.62); sp = { x: GX - dist * Math.cos(ang), z: dist * Math.sin(ang) };
    S.aimZ = 0; S.aimY = 1.3; buildWall(sp);
  } else if (id === 'penalty') { sp = { x: GX - 11, z: 0 }; S.aimZ = 0; S.aimY = 1.0; }
  else if (id === 'pass') { sp = { x: rnd(-22, 4), z: rnd(-14, 14) }; S.aimGX = sp.x + 14; S.aimGZ = sp.z; newMate(sp); }
  else if (id === 'skills') { sp = null; S.aimZ = 0; S.aimY = 1.2; }
  if (sp) { S.spot = sp; placeBall(sp.x, sp.z); }
  if (d.keeper && keeper.root.visible) { keeper.root.position.z = 0; }
  hud();
}
function buildWall(sp) {
  var dx = GX - sp.x, dz = 0 - sp.z, L = hyp(dx, dz), ux = dx / L, uz = dz / L, n = L < 21 ? 3 : (L < 25 ? 4 : 5), cx = sp.x + ux * 9.15, cz = sp.z + uz * 9.15, px = -uz, pz = ux, i;
  for (i = 0; i < 5; i++) {
    var w = wall[i];
    if (i < n) { var off = (i - (n - 1) / 2) * 0.64 + (sp.z > 0 ? 0.0 : 0.0); w.root.visible = true; w.root.position.set(cx + px * off, 0, cz + pz * off); N3.face(w, -ux, -uz); w.yaw.rotation.y = w.face; w.gesture = 'hands'; w.speed = 0; w.jumpY = 0; S.walls.push({ p: w, x: w.root.position.x, z: w.root.position.z }); }
    else w.root.visible = false;
  }
}
function newMate(sp) {
  var ang = rnd(-1.0, 1.0), dist = rnd(12, 26), mx = clamp(sp.x + Math.cos(ang) * dist, -46, 46), mz = clamp(sp.z + Math.sin(ang) * dist, -28, 28);
  if (!mate.root.visible) { mate.root.position.set(mx - 6, 0, mz); }
  mate.root.visible = true; S.mate = { x: mx, z: mz, arrived: false }; mate.gesture = '';
  // a defender cuts the lane once you have a few passes
  if (S.passes >= 3) { var t = rnd(0.4, 0.55), dxp = sp.x + (mx - sp.x) * t, dzp = sp.z + (mz - sp.z) * t + rnd(-0.35, 0.35); defP.root.visible = true; defP.root.position.set(dxp, 0, dzp); N3.face(defP, sp.x - dxp, sp.z - dzp); defP.yaw.rotation.y = defP.face; defP.gesture = 'hands'; S.def = { x: dxp, z: dzp }; } else { defP.root.visible = false; S.def = null; }
}
var GATES = [];
function buildCourse() {
  GATES = []; var i, zs = [3.5, -3.5, 3.5, -3.5, 3.5, -3.5, 2];
  for (i = 0; i < 7; i++) {
    var gx = -16 + i * 7, gz = zs[i];
    var c1 = N3.cone(0xff7a1a), c2 = N3.cone(0xffd23f); c1.position.set(gx, 0, gz - 1.7); c2.position.set(gx, 0, gz + 1.7); scene.add(c1); scene.add(c2);
    cones.push({ m: c1, x: gx, z: gz - 1.7, down: false }); cones.push({ m: c2, x: gx, z: gz + 1.7, down: false });
    var r = N3.ring(1.6, 1.78, 0x06ffa5, 0.0); r.rotation.x = -PI / 2; r.scale.set(0.9, 0.1, 1); r.rotation.z = 0; r.position.set(gx, 0.04, gz);
    var bar = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 3.2), new THREE.MeshBasicMaterial({ color: 0x06ffa5, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })); bar.rotation.x = -PI / 2; bar.position.set(gx, 0.04, gz); scene.add(bar); gateRings.push(bar);
    GATES.push({ x: gx, z: gz, passed: false });
  }
  S.pl = { x: -22, z: 0, vx: 0, vz: 0, face: 0 }; placeBall(-21.4, 0); bp.held = true; S.ctrl = true; S.skStart = false;
  kicker.root.position.set(-22, 0, 0);
}
function endDrill() {
  if (S.ended) return; S.ended = true; S.phase = 'done'; S.charging = false; document.body.classList.remove('run'); $('power').classList.remove('show'); N3.sfx('whistle', 1.3);
  if (S.drill === 'skills' && S.finished) S.score = Math.max(0, Math.round(2000 - 25 * S.skT));
  else if (S.drill === 'skills') S.score = S.gates * 40;
  hud(); setTimeout(showResult, 900);
}

// ============================================================================================================================
// aiming, power, shooting
// ============================================================================================================================
var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(0, 0), mouseOn = false, planeG = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), planeX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), GX - 0.05), hit = new THREE.Vector3();
function aimFromMouse() {
  if (S.camMode === 4) return;
  ray.setFromCamera(mouse, cam);
  if (S.drill === 'pass') {
    if (ray.ray.intersectPlane(planeG, hit)) { var dx = hit.x - bp.x, dz = hit.z - bp.z, L = hyp(dx, dz), mx = Math.min(L, 34); if (L > 0.01) { S.aimGX = bp.x + dx / L * Math.max(mx, 3); S.aimGZ = bp.z + dz / L * Math.max(mx, 3); } }
  } else if (ray.ray.intersectPlane(planeX, hit)) { S.aimZ = clamp(hit.z, -GZ - 2.2, GZ + 2.2); S.aimY = clamp(hit.y, 0.05, GH + 1.1); }
}
function currentPower() { return S.charging ? S.pow : 0.72; }
function shotParams(power) {
  var id = S.drill, v0, r;
  if (id === 'pass') {
    v0 = 6 + 19 * power; var dx = S.aimGX - bp.x, dz = S.aimGZ - bp.z, az = Math.atan2(dz, dx), el = S.lob ? 0.62 : 0;
    return { az: az, el: el, v0: v0 };
  }
  v0 = 11 + 24 * power; r = solveAim(bp.x, bp.z, S.aimZ, S.aimY, v0);
  return { az: r.az, el: r.el, v0: v0 };
}
function startCharge() {
  if (S.phase !== 'ready' || S.charging) return; if (S.drill === 'skills' && S.gates < 7) return;
  S.charging = true; S.pow = 0; $('power').classList.add('show'); N3.unlock();
}
function releaseCharge() { if (!S.charging) return; S.charging = false; S.lob = S.lob || keys['ShiftLeft'] || keys['ShiftRight']; var p = S.pow; setTimeout(function () { if (S.phase !== 'ready') $('power').classList.remove('show'); }, 250); fire(Math.max(0.12, p)); }

function fire(power) {
  var d = DRILLS[S.drill]; if (S.phase !== 'ready') return;
  S.phase = 'kick'; var sp = shotParams(power), over = Math.max(0, power - 0.82), sigma = 0.35 + 15 * over;
  var moving = S.drill === 'skills' ? Math.min(2.5, hyp(S.pl.vx, S.pl.vz) * 0.25) : 0;
  var az = sp.az + gauss() * sigma * PI / 180 * (S.drill === 'pass' ? 0.5 : 1) + gauss() * moving * PI / 180, el = sp.el + (S.drill === 'pass' ? 0 : gauss() * sigma * 0.9 * PI / 180);
  if (over > 0 && S.drill !== 'pass') el += over * 0.35 * Math.random();
  S.kick = { t: 0, power: power, az: az, el: Math.max(0, el), v0: sp.v0, curve: S.curve, lob: S.lob, run: d.runup, contact: false, from: { x: kicker.root.position.x, z: kicker.root.position.z } };
  // face the aim, take a run-up
  var ux = Math.cos(az), uz = Math.sin(az); S.kick.sx = bp.x - ux * (0.5 + d.runup * 6); S.kick.sz = bp.z - uz * (0.5 + d.runup * 6); S.kick.ex = bp.x - ux * 0.5; S.kick.ez = bp.z - uz * 0.5;
  S.curve0 = S.curve;
  var K = S.kick; if (S.drill === 'skills') { K.sx = kicker.root.position.x; K.sz = kicker.root.position.z; K.ex = K.sx; K.ez = K.sz; }
}
var KDUR = 0.44;
function updateKick(dt) {
  var K = S.kick; if (!K) return; K.t += dt;
  var tr = K.t < K.run ? K.t / Math.max(K.run, 0.001) : 1, u = N3.ease(tr);
  var ux = Math.cos(K.az), uz = Math.sin(K.az);
  if (K.t < K.run) { kicker.root.position.set(K.sx + (K.ex - K.sx) * u, 0, K.sz + (K.ez - K.sz) * u); kicker.speed = 4.8; kicker.kickT = -1; }
  else {
    kicker.root.position.set(K.ex, 0, K.ez); kicker.speed = 0; kicker.kickT = Math.min(1, (K.t - K.run) / KDUR); kicker.kickFoot = 1;
    if (!K.contact && kicker.kickT >= 0.56) { K.contact = true; launch(); }
    if (kicker.kickT >= 1 && K.contact) { kicker.kickT = -1; }
  }
  N3.face(kicker, ux, uz);
}
function launch() {
  var K = S.kick, el = K.el, v0 = K.v0, ux = Math.cos(K.az), uz = Math.sin(K.az);
  bp.held = false; bp.vx = Math.cos(el) * ux * v0; bp.vz = Math.cos(el) * uz * v0; bp.vy = Math.sin(el) * v0; bp.spin = K.curve; bp.bounceEv = false; bp.y = BR + 0.04;
  N3.sfx('kick', 0.5 + K.power * 0.7);
  var sh = { t: 0, K: K, from: { x: bp.x, z: bp.z }, v0: v0, curve: K.curve, power: K.power, post: 0, bar: 0, done: false, wallHit: false, crossed: false, firstLine: null, saved: false, scored: false, keeper: null, bounces: 0, stuck: 0, passDone: false };
  S.shot = sh; S.phase = 'flight'; S.att++;
  // wall jumps, keeper reads the shot
  if (S.walls && S.walls.length) S.walls.forEach(function (w, i) { w.jumpT = -0.12 - i * 0.015; });
  if (keeper.root.visible && DRILLS[S.drill].keeper) planKeeper(sh);
  hud();
}

// ---- goalkeeper ------------------------------------------------------------------------------------------------------------
function planKeeper(sh) {
  var pr = predictGoalLine(bp, 4), kz = keeper.root.position.z, pen = S.drill === 'penalty', plan = { start: -1, t0: 0, tz: kz, ty: 0, dur: 0.4, side: 1, saveType: null, arrive: pr.t, willSave: false, amp: 1, pr: pr };
  var skill = pen ? 0.9 : S.drill === 'longshot' ? 0.7 : S.drill === 'skills' ? 0.78 : S.drill === 'freekick' ? 0.8 : 0.8;
  var react = pen ? 0.1 : (S.drill === 'freekick' ? 0.3 : S.drill === 'longshot' ? 0.28 : 0.2) + Math.random() * 0.1;
  if (pen) {
    var guess = [-2.6, 0, 2.6][Math.random() < 0.43 ? 0 : (Math.random() < 0.3 ? 1 : 2)]; plan.tz = guess; plan.ty = 0.9; plan.t0 = 0.0 + react; plan.dur = Math.max(0.3, Math.min(0.62, pr.t - react));
    var need = Math.abs(pr.z - guess), canReach = 1.25 + (pr.y > 1.9 ? -0.6 : 0) + (pr.y < 0.5 ? 0.15 : 0);
    plan.willSave = pr.hit && Math.abs(pr.z) < GZ && pr.y < GH && need < canReach * (0.75 + 0.3 * Math.random()) && pr.t > 0.28;
    if (plan.willSave) { plan.tz = pr.z; plan.ty = pr.y; }
  } else {
    var inFrame = pr.hit && Math.abs(pr.z) < GZ + 0.3 && pr.y < GH + 0.2;
    plan.tz = clamp(pr.z, -GZ + 0.2, GZ - 0.2); plan.ty = clamp(pr.y, 0.1, 2.3); plan.t0 = react;
    var avail = Math.max(0, pr.t - react), reach = 1.0 + 3.7 * avail; reach = Math.min(reach, 3.25);
    var need2 = Math.abs(plan.tz - kz) + 0.85 * Math.max(0, plan.ty - 1.55);
    plan.dur = clamp(avail, 0.2, 0.62);
    if (inFrame) {
      var ratio = need2 / Math.max(0.5, reach);
      plan.willSave = ratio < 0.8 * skill + (Math.random() - 0.5) * 0.12 || (ratio < 1.0 && Math.random() < 0.35 * skill);
      if (pr.y > 2.15 && Math.abs(pr.z) > 2.9) plan.willSave = plan.willSave && Math.random() < 0.3;       // the top corner is a very hard place to save
    } else { plan.tz = clamp(pr.z * 0.5, -2.4, 2.4); }
    if (!plan.willSave && inFrame) { plan.tz = clamp(plan.tz + (plan.tz > kz ? -1 : 1) * rnd(0.9, 1.8), -GZ + 0.3, GZ - 0.3); }       // he gets there too late
  }
  if (plan.willSave) { var spd = hyp(sh.from.x - GX, 0) ? 0 : 0; plan.saveType = (pr.y < 1.9 && sh.v0 < 22 && Math.random() < 0.55) ? 'catch' : 'parry'; }
  var dz = plan.tz - kz; plan.side = dz > 0 ? -1 : 1; plan.amp = Math.abs(dz) < 0.7 ? 0 : clamp(0.5 + Math.abs(dz) / 3 + (plan.ty < 0.8 ? 0.3 : 0), 0.5, 1);
  plan.z0 = kz; plan.state = 0; keeper.plan = plan; sh.keeper = plan;
}
function updateKeeper(dt) {
  if (!keeper.root.visible) return; var pl = keeper.plan, sh = S.shot;
  if (pl && sh && S.phase !== 'ready') {
    var t = sh.t - pl.t0;
    if (t >= 0) {
      var u = clamp(t / pl.dur, 0, 1), e = N3.ease(u);
      keeper.root.position.z = pl.z0 + (pl.tz - pl.z0) * e;
      if (pl.amp > 0) { keeper.diveT = u; keeper.diveSide = pl.side; keeper.diveAmp = pl.amp; keeper.gesture = ''; keeper.root.position.x = GX - 0.7 + 0.25 * e; keeper.jumpY = 0; }
      else { keeper.diveT = -1; keeper.gesture = 'hands'; keeper.root.position.x = GX - 0.7 + 0.6 * e; }
    }
  } else if (S.phase === 'ready' || S.phase === 'idle') {
    // idle: shuffle along the line to cover the angle, hands ready
    var ball = bp, wantZ = clamp(ball.z * 0.14, -1.6, 1.6), kz = keeper.root.position.z, dz = wantZ - kz, mv = clamp(dz, -3 * dt, 3 * dt);
    keeper.root.position.z = kz + mv; keeper.speed = Math.abs(mv) / Math.max(dt, 0.001) * 0.9; keeper.gesture = 'ready'; keeper.diveT = -1;
    keeper.face = PI;
  }
  if (S.phase === 'ready' || S.phase === 'idle') keeper.face = PI;
}

// ---- stepping the ball ---------------------------------------------------------------------------------------------------------
var POSTS = [{ z: -GZ }, { z: GZ }];
function collide(sh, h) {
  var R = 0.06 + BR, i;
  // posts and bar
  for (i = 0; i < 2; i++) {
    var dx = bp.x - GX, dz = bp.z - POSTS[i].z, d = hyp(dx, dz);
    if (d < R && bp.y < GH + 0.05) {
      var nx = dx / (d || 1), nz = dz / (d || 1), vn = bp.vx * nx + bp.vz * nz;
      if (vn < 0) { bp.vx -= 1.68 * vn * nx; bp.vz -= 1.68 * vn * nz; bp.vx *= 0.9; bp.vz *= 0.9; bp.x = GX + nx * R; bp.z = POSTS[i].z + nz * R; if (sh) { sh.post++; } N3.sfx('post', 0.9); postHit(); }
    }
  }
  if (Math.abs(bp.z) < GZ + 0.06) {
    var bx = bp.x - GX, by = bp.y - GH, bd = hyp(bx, by);
    if (bd < R) {
      var nx2 = bx / (bd || 1), ny2 = by / (bd || 1), vn2 = bp.vx * nx2 + bp.vy * ny2;
      if (vn2 < 0) { bp.vx -= 1.7 * vn2 * nx2; bp.vy -= 1.7 * vn2 * ny2; bp.vx *= 0.92; bp.vy *= 0.92; bp.x = GX + nx2 * R; bp.y = GH + ny2 * R; if (sh) sh.bar++; N3.sfx('post', 1.0); postHit(); }
    }
  }
  // inside the net: soft walls
  if (bp.x > GX + 0.02 && Math.abs(bp.z) < GZ + 0.05 && bp.y < GH + 0.2) {
    var damp = Math.exp(-4.8 * h); bp.vx *= damp; bp.vz *= damp; bp.vy *= Math.exp(-2 * h);
    if (bp.x > GX + 2.0 - BR) { if (bp.vx > 2.5) { N3.netHit(GOAL, bp.vx); N3.sfx('net', clamp(bp.vx / 18, 0.3, 1)); } bp.x = GX + 2.0 - BR; bp.vx = -Math.abs(bp.vx) * 0.12; }
    if (bp.z > GZ - BR * 0.6) { bp.z = GZ - BR * 0.6; bp.vz = -Math.abs(bp.vz) * 0.15; }
    if (bp.z < -GZ + BR * 0.6) { bp.z = -GZ + BR * 0.6; bp.vz = Math.abs(bp.vz) * 0.15; }
    if (bp.y > GH - BR) { bp.y = GH - BR; bp.vy = -Math.abs(bp.vy) * 0.1; }
  }
  // wall players
  if (S.walls && S.walls.length && sh && !sh.wallHit) {
    for (i = 0; i < S.walls.length; i++) {
      var w = S.walls[i], wx = bp.x - w.x, wz = bp.z - w.z, wd = hyp(wx, wz), jy = w.p.jumpY || 0;
      if (wd < 0.32 + BR && bp.y < 1.86 + jy && bp.y > jy - BR) {
        sh.wallHit = true; var nx3 = wx / (wd || 1), nz3 = wz / (wd || 1), sp = hyp(bp.vx, bp.vz);
        bp.vx = nx3 * sp * 0.35 + rnd(-2, 2); bp.vz = nz3 * sp * 0.35 + rnd(-2, 2); bp.vy = Math.abs(bp.vy) * 0.3 + rnd(1.5, 3.5); bp.spin = 0; N3.sfx('save', 0.9); break;
      }
    }
  }
  // the keeper's gloves
  if (sh && sh.keeper && sh.keeper.willSave && !sh.saved && bp.x >= GX - 0.9 && bp.vx > 0) {
    sh.saved = true; var pl = sh.keeper;
    if (pl.saveType === 'catch') { bp.held = true; bp.vx = bp.vy = bp.vz = 0; sh.catch = true; }
    else { var sp2 = hyp(bp.vx, bp.vz); bp.vx = -Math.max(2.5, sp2 * 0.22); bp.vz = (bp.z > 0 ? 1 : -1) * rnd(2.5, 6) * (Math.random() < 0.2 ? -1 : 1); bp.vy = rnd(2.5, 5); bp.spin = 0; }
    N3.sfx('save', 1); if (!sh.catch) N3.sfx('ooh', 0.5);
  }
  // lane defender (passing)
  if (S.def && sh && !sh.passDone && !sh.blocked) { var ddx = bp.x - S.def.x, ddz = bp.z - S.def.z; if (hyp(ddx, ddz) < 0.4 + BR && bp.y < 1.85) { sh.blocked = true; bp.vx *= -0.25; bp.vz *= -0.25; bp.vy = rnd(1, 2.5); N3.sfx('save', 0.8); } }
}
var postFlash = 0; function postHit() { postFlash = 0.5; }
function stepBall(dt) {
  if (bp.held) { var hk = keeper.root.position; if (S.phase === 'flight' && S.shot && S.shot.catch) { bp.x = hk.x - 0.12; bp.z = hk.z; bp.y = 1.05 + (keeper.diveT > 0 ? 0.2 : 0); } return; }
  var n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n, i, sh = S.shot, was;
  for (i = 0; i < n; i++) {
    was = bp.bounceEv; bp.bounceEv = false; var px = bp.x;
    phys(bp, h); collide(sh, h);
    if (bp.bounceEv && Math.abs(bp.vy) > 1.5) { N3.sfx('bounce', clamp(Math.abs(bp.vy) / 8, 0.15, 0.8)); if (sh) sh.bounces++; }
    if (sh && !sh.firstLine && px < GX && bp.x >= GX) sh.firstLine = { y: bp.y, z: bp.z, v: hyp(bp.vx, bp.vz) };
  }
}

// ============================================================================================================================
// results
// ============================================================================================================================
function zoneAt(z, y) { var c = z < -GZ / 3 ? 0 : (z > GZ / 3 ? 2 : 1), r = y > GH / 2 ? 0 : 1; return ZONES[r * 3 + c]; }
function endShot(res, info) {
  var sh = S.shot; if (!sh || sh.done) return; sh.done = true; S.phase = 'result'; S.resT = 0; info = info || {};
  var id = S.drill, d = DRILLS[id], pts = 0, big = '', sub = '', col = '#ffd23f', ok = false;
  if (res === 'goal') {
    ok = true; var fl = sh.firstLine || { y: bp.y, z: bp.z, v: 20 }, z = zoneAt(fl.z, fl.y), dist = hyp(GX - sh.from.x, sh.from.z);
    if (id === 'shoot') { pts = z.pts; z.flash = 1; }
    else if (id === 'penalty') pts = 150 + ((Math.abs(fl.z) > 2.5 || fl.y > 1.7) ? 100 : 0);
    else if (id === 'freekick') pts = 200 + ((Math.abs(fl.z) > 2.5 && fl.y > 1.6) ? 100 : 0) + (Math.abs(sh.curve) >= 5 ? 50 : 0);
    else if (id === 'longshot') pts = 250 + Math.round(Math.max(0, dist - 25) * 8);
    else if (id === 'skills') pts = 0;
    S.streak++; if (S.streak >= 2 && (id === 'shoot' || id === 'longshot')) pts = Math.round(pts * (1 + Math.min(0.5, (S.streak - 1) * 0.1)));
    var topC = Math.abs(fl.z) > 2.6 && fl.y > 1.7;
    big = sh.post || sh.bar ? 'OFF THE POST — IN!' : topC ? 'TOP BINS!' : S.streak >= 3 ? 'HAT-TRICK!' : S.streak === 2 ? 'BRACE!' : 'GOAL!';
    sub = id === 'longshot' ? ('Strike from ' + Math.round(dist) + ' m') : (['Clinical!', 'Keeper had no chance', 'What a strike!', 'Nailed it!', 'Pure class'][Math.floor(Math.random() * 5)]); col = '#ffd23f';
    S.goals++; S.score += pts; N3.sfx('cheer', 1); ST.cheer(1); N3.sfx('net', 0.6); flashCam = 1;
  } else {
    S.streak = 0; col = '#ef4444';
    if (res === 'save') { big = sh.catch ? 'CAUGHT!' : 'SAVED!'; sub = 'The keeper got across'; N3.sfx('groan', 0.7); }
    else if (res === 'post') { big = sh.bar ? 'OFF THE BAR!' : 'OFF THE POST!'; sub = 'So close…'; N3.sfx('groan', 0.8); }
    else if (res === 'wall') { big = 'BLOCKED!'; sub = 'Hit the wall'; N3.sfx('groan', 0.7); }
    else if (res === 'high') { big = 'OVER THE BAR'; sub = 'Too much on it'; N3.sfx('groan', 0.7); }
    else if (res === 'wide') { big = 'WIDE!'; sub = sh.power > 0.88 ? 'Over-hit — stay in the green zone' : 'Just off target'; N3.sfx('groan', 0.7); }
    else if (res === 'short') { big = 'SHORT!'; sub = 'Needs more pace'; N3.sfx('groan', 0.6); }
    else if (res === 'intercept') { big = 'INTERCEPTED!'; sub = 'Lob it or bend it round'; N3.sfx('groan', 0.6); }
    else if (res === 'pass') { ok = true; }
    else { big = 'MISS!'; sub = 'Keep trying'; }
  }
  if (res === 'pass') {
    ok = true; var q = info; pts = 100 + q.weight + q.acc; S.score += pts; S.passes++; S.streak++; big = q.weight >= 60 ? 'PERFECT PASS!' : q.weight >= 30 ? 'NICE PASS' : 'COMPLETE'; sub = q.weight >= 60 ? 'Perfect weight' : (q.fast ? 'A touch too hard' : 'Good ball'); col = '#06ffa5'; N3.sfx('good');
  }
  if (id === 'pass' && !ok) { S.streak = 0; }
  S.results[S.att - 1] = ok && (id !== 'pass') ? 1 : (id === 'pass' ? undefined : 0);
  toast(big, sub, col, pts ? '+' + pts : '');
  if (id === 'penalty' && res === 'goal') { /* nothing extra */ }
  hud();
  S.resultKind = res;
}
function judge(dt) {
  var sh = S.shot; if (!sh || sh.done) return; sh.t += dt; var id = S.drill, sp = hyp(bp.vx, bp.vz);
  if (id === 'pass') {
    var m = S.mate; if (m) { var dm = hyp(bp.x - m.x, bp.z - m.z); if (!sh.passDone && dm < 1.35 && bp.y < 1.7 && !sh.blocked) { sh.passDone = true; var w = sp < 3.2 ? 60 : sp < 9 ? 60 : sp < 14 ? 30 : 0; if (sp < 2.2) w = 20; endShot('pass', { weight: w, acc: Math.round((1 - dm / 1.35) * 50), fast: sp > 14 }); bp.vx *= 0.1; bp.vz *= 0.1; return; } }
    if (sh.blocked && sh.t > 0.2 && sp < 4) { endShot('intercept'); return; }
    if (sh.t > 0.4 && sp < 0.35 && bp.y <= BR + 0.02 && !sh.blocked) { endShot(m && hyp(bp.x - m.x, bp.z - m.z) > 2 && sh.bounces === 0 && sp < 0.3 ? (hyp(bp.x - sh.from.x, bp.z - sh.from.z) < hyp(m.x - sh.from.x, m.z - sh.from.z) - 2 ? 'short' : 'miss') : 'miss'); return; }
    if (Math.abs(bp.x) > 56 || Math.abs(bp.z) > 38 || sh.t > 6) { endShot('miss'); return; }
    return;
  }
  // shooting-type drills
  if (sh.wallHit && !sh.done && sh.t > 0.15 && !sh.scored) { if (!sh.wallTimer) sh.wallTimer = sh.t; if (sh.t - sh.wallTimer > 0.9) { endShot('wall'); return; } }
  if (bp.x > GX + BR * 0.9 && Math.abs(bp.z) < GZ - 0.02 && bp.y < GH - 0.02 && !sh.scored && !bp.held) { sh.scored = true; sh.scoreT = sh.t; }
  if (sh.scored) { if (sh.t - sh.scoreT > 0.05) { endShot('goal'); return; } }
  if (sh.saved && !sh.scored) { if (!sh.saveT) sh.saveT = sh.t; if (sh.t - sh.saveT > (sh.catch ? 0.35 : 0.8)) { endShot('save'); return; } }
  if (sh.firstLine && !sh.scored && !sh.saved) {
    if (sh.t > sh.firstLine.t0 + 0.5 || !sh.firstLine.t0) { if (!sh.firstLine.t0) sh.firstLine.t0 = sh.t; }
    if (sh.t - (sh.firstLine.t0 || sh.t) > 0.45) { var f = sh.firstLine; endShot(sh.post || sh.bar ? 'post' : (f.y > GH ? 'high' : 'wide')); return; }
  }
  if (!sh.scored && !sh.saved && bp.x < GX - 0.2 && sh.t > 0.5 && !bp.held) {
    if (sp < 0.5 && bp.y <= BR + 0.02) { endShot(sh.wallHit ? 'wall' : (sh.post || sh.bar ? 'post' : 'short')); return; }
    if (bp.x < -58 || Math.abs(bp.z) > 38 || bp.x > GX + 8) { endShot('wide'); return; }
  }
  if (sh.t > 7) endShot(sh.post || sh.bar ? 'post' : 'miss');
}
var flashCam = 0;

// ============================================================================================================================
// per-frame update
// ============================================================================================================================
var keys = {}, joy = { x: 0, z: 0 }, sprint = false;
function update(dt) {
  var d = DRILLS[S.drill];
  ST.update(dt);
  // timers
  if (S.phase === 'ready' || S.phase === 'kick' || S.phase === 'flight' || S.phase === 'result') {
    if (S.phase !== 'result' && d.time && S.drill !== 'skills') { S.time -= dt; if (S.time <= 0) { S.time = 0; S.endAfter = true; if (S.phase === 'ready') { endDrill(); } } if (Math.ceil(S.time) !== S.lastSec) { S.lastSec = Math.ceil(S.time); if (S.time <= 5 && S.time > 0) N3.sfx('tick', 0.6); } }
    if (S.drill === 'skills' && S.skStart && !S.finished) { S.skT += dt; if (S.skT >= d.time) { S.endAfter = true; if (S.phase === 'ready') endDrill(); } }
    S.tsince += dt;
  }
  // input -> aim
  if (S.phase === 'ready') readInput(dt);
  if (S.phase === 'ready' && S.charging) { S.pow = Math.min(1, S.pow + dt * 0.95); }
  if (S.phase === 'ready' && S.drill === 'skills') updateDribble(dt);
  if (S.phase === 'kick') updateKick(dt);
  if (S.phase === 'kick' || S.phase === 'flight' || S.phase === 'result') { if (S.phase === 'flight' || (S.phase === 'result') || (S.phase === 'kick' && S.kick && S.kick.contact)) { stepBall(dt); } }
  if (S.phase === 'flight') { judge(dt); }
  if (S.phase === 'result') {
    S.resT += dt; if (S.shot) S.shot.t += dt;
    if (S.drill === 'skills' && S.resultKind === 'goal' && !S.finished) { S.finished = true; endDrill(); }
    else if (S.resT > 1.5 && !S.ended) {
      var done = (d.att && S.att >= d.att) || S.endAfter || (d.time && S.time <= 0 && S.drill !== 'skills');
      if (done) endDrill(); else { S.phase = 'ready'; setupAttempt(); if (S.drill === 'skills') afterSkillShot(); }
    }
  }
  if (S.phase === 'idle' && !S.ended) { keeper.speed = 0; }
  updateKeeper(dt); updateActors(dt); updateVisuals(dt); updateCamera(dt);
  if (S.phase === 'ready' || S.phase === 'idle') hudTick();
}
var hudAcc = 0; function hudTick() { hudAcc += 1; if (hudAcc % 6 === 0) hud(); }
function readInput(dt) {
  var k = keys, sh = (k['ShiftLeft'] || k['ShiftRight']) ? 0.35 : 1;
  if (S.drill === 'pass') {
    if (k['ArrowLeft'] || k['ArrowRight'] || k['ArrowUp'] || k['ArrowDown']) {
      var ax = S.aimGX - bp.x, az = S.aimGZ - bp.z, ang = Math.atan2(az, ax), L = hyp(ax, az);
      if (k['ArrowLeft']) ang -= 1.4 * dt * sh; if (k['ArrowRight']) ang += 1.4 * dt * sh; if (k['ArrowUp']) L = Math.min(34, L + 14 * dt * sh); if (k['ArrowDown']) L = Math.max(4, L - 14 * dt * sh);
      S.aimGX = bp.x + Math.cos(ang) * L; S.aimGZ = bp.z + Math.sin(ang) * L;
    }
  } else {
    if (k['ArrowLeft']) S.aimZ -= 5 * dt * sh; if (k['ArrowRight']) S.aimZ += 5 * dt * sh; if (k['ArrowUp']) S.aimY += 3 * dt * sh; if (k['ArrowDown']) S.aimY -= 3 * dt * sh;
    S.aimZ = clamp(S.aimZ, -GZ - 2.2, GZ + 2.2); S.aimY = clamp(S.aimY, 0.05, GH + 1.1);
  }
  var arrowHeld = k['ArrowLeft'] || k['ArrowRight'] || k['ArrowUp'] || k['ArrowDown'];
  if (mouseOn && !arrowHeld && (mouseMoved || mouseDown || S.tsince < 1.3)) aimFromMouse();
  mouseMoved = false;
  if (S.charging && (k['ShiftLeft'] || k['ShiftRight'])) S.lob = true;
}
var mouseDown = false, mouseMoved = false;

// ---- the skills course --------------------------------------------------------------------------------------------------------
function updateDribble(dt) {
  var P = S.pl, mx = (keys['KeyD'] || keys['ArrowRightX'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0), mz = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0), ix, iz;
  // world axes: +x is "up the pitch" (W), +z is to the right on screen (D)
  ix = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0) + (-joy.z); iz = mx + joy.x;
  var L = hyp(ix, iz); if (L > 1) { ix /= L; iz /= L; }
  if (S.charging) { ix = iz = 0; }
  if (L > 0.1 && !S.skStart && S.gates < 7) S.skStart = true;
  var top = (keys['ShiftLeft'] || keys['ShiftRight'] || sprint) ? 7.4 : 5.4, tvx = ix * top, tvz = iz * top, ac = 24 * dt;
  P.vx += clamp(tvx - P.vx, -ac, ac); P.vz += clamp(tvz - P.vz, -ac, ac);
  P.x += P.vx * dt; P.z += P.vz * dt; P.x = clamp(P.x, -47, GX - 4); P.z = clamp(P.z, -30, 30);
  var spd = hyp(P.vx, P.vz); if (spd > 0.6) P.face = Math.atan2(P.vz, P.vx);
  var hx = Math.cos(P.face), hz = Math.sin(P.face);
  // the ball
  if (bp.held) {
    // spring to a spot just ahead of the feet: lags a little when you turn
    var tx = P.x + hx * 0.6, tz = P.z + hz * 0.6, ex = tx - bp.x, ez = tz - bp.z;
    bp.vx += (ex * 95 - (bp.vx - P.vx) * 15) * dt; bp.vz += (ez * 95 - (bp.vz - P.vz) * 15) * dt;
    bp.x += bp.vx * dt; bp.z += bp.vz * dt; bp.y = BR; bp.vy = 0; bp.vx *= 0.995;
    var dd = hyp(bp.x - P.x, bp.z - P.z); if (dd > 1.45) { bp.held = false; S.ctrl = false; }
    if (dd < 0.38) { bp.x = P.x + (bp.x - P.x) / Math.max(dd, 0.01) * 0.38; bp.z = P.z + (bp.z - P.z) / Math.max(dd, 0.01) * 0.38; }
  } else if (!S.charging) {
    phys(bp, dt); var dd2 = hyp(bp.x - P.x, bp.z - P.z), rel = hyp(bp.vx - P.vx, bp.vz - P.vz);
    if (dd2 < 0.85 && rel < 8) { bp.held = true; S.ctrl = true; }
  }
  // cones
  cones.forEach(function (c) {
    if (c.down) return; var dp = hyp(P.x - c.x, P.z - c.z), db = hyp(bp.x - c.x, bp.z - c.z);
    if (dp < 0.42 || db < 0.32) { c.down = true; c.m.rotation.z = PI / 2 * (bp.vx > 0 ? -1 : 1); c.m.position.y = 0.17; S.skT += 1.0; toast('CONE!', '+1.0 s', '#ff6b35'); N3.sfx('bad', 0.6); if (db < 0.32) { bp.vx *= 0.5; bp.vz *= 0.5; } }
  });
  // gates (the ball has to cross the line between the cones, in order)
  if (S.gates < 7) {
    var g = GATES[S.gates];
    if (g && ((S.pl.px != null && S.pl.px < g.x && P.x >= g.x) || (bp.px != null && bp.px < g.x && bp.x >= g.x)) && Math.abs(bp.z - g.z) < 1.7 && Math.abs(P.z - g.z) < 2.0) {
      g.passed = true; S.gates++; S.score = S.gates * 40; N3.sfx('good'); toast('GATE ' + S.gates + '/7', S.gates < 7 ? 'Next gate is lit' : 'Now finish it!', '#06ffa5');
      if (S.gates === 7) { toast('FINISH!', 'Aim, charge and score past the keeper', '#ffd23f'); }
    }
  }
  S.pl.px = P.x; bp.px = bp.x;
  kicker.root.position.set(P.x, 0, P.z); kicker.speed = spd; N3.face(kicker, hx, hz); kicker.gesture = '';
  // the lit gate pulses
  gateRings.forEach(function (b, i) { var on = i === S.gates; b.material.opacity = on ? 0.35 + 0.25 * Math.sin(S.tsince * 6) : (i < S.gates ? 0.0 : 0.08); });
}
function afterSkillShot() {
  // back to dribbling: the ball goes back to your feet near where you stand
  var P = S.pl; P.vx = P.vz = 0; placeBall(P.x + 0.6, P.z); bp.held = true; S.ctrl = true; kicker.kickT = -1;
  if (S.pl.x > GX - 12) { S.pl.x = GX - 24; S.pl.z = 0; placeBall(S.pl.x + 0.6, S.pl.z); bp.held = true; }
}

// ============================================================================================================================
// actors, visuals, camera
// ============================================================================================================================
function updateActors(dt) {
  var d = DRILLS[S.drill];
  // kicker standing next to the ball while aiming
  if (S.phase === 'ready' && S.drill !== 'skills') {
    var az = S.drill === 'pass' ? Math.atan2(S.aimGZ - bp.z, S.aimGX - bp.x) : Math.atan2(S.aimZ - bp.z, GX - bp.x), ux = Math.cos(az), uz = Math.sin(az), tx = bp.x - ux * 0.55, tz = bp.z - uz * 0.55;
    var kp = kicker.root.position, k = 1 - Math.exp(-dt * 10); kp.x += (tx - kp.x) * k; kp.z += (tz - kp.z) * k; kicker.speed = 0; kicker.kickT = -1; N3.face(kicker, ux, uz); kicker.gesture = 'ready';
    if (S.charging) kicker.gesture = 'ready';
  }
  if (S.phase === 'flight' || S.phase === 'result') { kicker.gesture = 'ready'; if (kicker.kickT >= 0) { kicker.kickT = Math.min(1, kicker.kickT + dt / KDUR); if (kicker.kickT >= 1) kicker.kickT = -1; } kicker.speed = 0; }
  if (S.phase === 'kick' && S.kick && S.kick.contact && kicker.kickT >= 0) { /* handled in updateKick */ }
  // celebration
  kicker.cel = S.phase === 'result' && S.resultKind === 'goal' && S.drill !== 'skills' && S.resT > 0.2 && S.resT < 1.4;
  // wall jump
  if (S.walls) S.walls.forEach(function (w) { if (w.jumpT != null) { w.jumpT += dt; var u = w.jumpT / 0.55; w.p.jumpY = u > 0 && u < 1 ? Math.sin(u * PI) * 0.42 : 0; if (u >= 1) w.jumpT = null; } });
  // team-mate runs to the target, then waits
  if (mate.root.visible && S.mate) {
    var m = S.mate, mp = mate.root.position, dx = m.x - mp.x, dz = m.z - mp.z, dist = hyp(dx, dz);
    if (dist > 0.15) { var st = Math.min(dist, 6.5 * dt); mp.x += dx / dist * st; mp.z += dz / dist * st; mate.speed = 6.2; N3.face(mate, dx, dz); }
    else { mate.speed = 0; m.arrived = true; N3.face(mate, bp.x - mp.x, bp.z - mp.z); mate.gesture = 'ready'; }
    if (S.shot && S.shot.passDone) { /* trapping */ }
    targetRing.visible = targetDisc.visible = S.drill === 'pass' && S.phase !== 'done'; targetRing.position.set(m.x, 0.035, m.z); targetDisc.position.set(m.x, 0.03, m.z);
    var pulse = 1 + 0.06 * Math.sin(S.tsince * 5); targetRing.scale.set(pulse, pulse, pulse);
  }
  [kicker, keeper, mate, defP].concat(wall).forEach(function (p) { if (p.root.visible) N3.pose(p, dt); });
}
function updateVisuals(dt) {
  // ball
  N3.ballAt(ball, bp.x, bp.y, bp.z, true);
  // trail
  trailT += dt; var sp = Math.sqrt(bp.vx * bp.vx + bp.vy * bp.vy + bp.vz * bp.vz);
  if (sp > 13 && trailT > 0.018 && (S.phase === 'flight')) { trailT = 0; var t = TRAIL[trailI++ % TRAIL.length]; t.s.position.set(bp.x, bp.y, bp.z); t.a = 0.55; t.s.scale.set(0.55, 0.55, 1); }
  TRAIL.forEach(function (t) { if (t.a > 0) { t.a = Math.max(0, t.a - dt * 1.7); t.s.material.opacity = t.a; t.s.scale.multiplyScalar(1 - dt * 0.8); } else t.s.material.opacity = 0; });
  // reticle & guide
  var aiming = S.phase === 'ready' && S.drill !== 'pass' && (S.drill !== 'skills' || S.gates >= 7), passAim = S.phase === 'ready' && S.drill === 'pass';
  reticle.visible = aiming; aimGround.visible = passAim;
  if (aiming) {
    reticle.position.set(GX - 0.04, S.aimY, S.aimZ); reticle.rotation.y = PI / 2; var dist = hyp(GX - bp.x, bp.z - S.aimZ), sc = 0.7 + dist * 0.025; reticle.scale.set(sc, sc, sc);
    reticle.userData.mat.color.setHex(S.charging ? (S.pow > 0.82 ? 0xff5050 : 0xffd23f) : 0xffffff);
  }
  if (passAim) { aimGround.position.set(S.aimGX, 0.04, S.aimGZ); var ps = 0.8 + 0.1 * Math.sin(S.tsince * 6); aimGround.scale.set(ps, ps, ps); }
  // dotted guide
  var show = S.guide && (aiming || passAim);
  if (show) {
    var sp2 = shotParams(currentPower()), b = { x: bp.x, y: BR + 0.08, z: bp.z, vx: Math.cos(sp2.el) * Math.cos(sp2.az) * sp2.v0, vy: Math.sin(sp2.el) * sp2.v0, vz: Math.cos(sp2.el) * Math.sin(sp2.az) * sp2.v0, spin: S.curve, bounceEv: false }, i, t = 0, di = 0, stepT = S.drill === 'pass' ? 0.1 : 0.045;
    for (i = 0; i < DOTS.length; i++) {
      var tt = 0; while (tt < stepT) { phys(b, 0.015); tt += 0.015; }
      if (b.x > GX + 0.5 || b.bounceEv && i > 1 && S.drill !== 'pass') break;
      if (b.bounceEv && S.drill === 'pass') b.bounceEv = false;
      var dot = DOTS[di++]; dot.visible = true; dot.position.set(b.x, b.y, b.z); dot.material.opacity = 0.9 - i * 0.03; var s2 = 0.8 + i * 0.03; dot.scale.set(s2, s2, s2);
    }
    for (; di < DOTS.length; di++) DOTS[di].visible = false;
  } else DOTS.forEach(function (dd) { dd.visible = false; });
  // goal zones flash
  ZONES.forEach(function (z) { if (z.flash > 0) { z.flash = Math.max(0, z.flash - dt * 1.4); } z.tint.material.opacity = 0.16 + z.flash * 0.7; });
  // power meter
  if (S.charging || $('power').classList.contains('show')) { $('pfill').style.width = Math.round(S.pow * 100) + '%'; $('ppct').textContent = Math.round(S.pow * 100) + '%'; $('pfill').className = S.pow > 0.82 ? 'over' : ''; }
  $('rcurve').textContent = (S.curve > 0 ? 'R ' : S.curve < 0 ? 'L ' : '') + Math.abs(Math.round(S.curve));
  var dd2 = hyp(GX - bp.x, bp.z); $('rdist').textContent = Math.round(dd2) + ' m';
  // goal net / post flash and screen punch
  if (postFlash > 0) postFlash = Math.max(0, postFlash - dt);
  if (flashCam > 0) flashCam = Math.max(0, flashCam - dt * 1.6);
  // shadows follow the action
  ST.focus(clamp((bp.x + kicker.root.position.x) / 2, -45, 40), clamp(bp.z, -22, 22));
}
var CAMN = ['Auto', 'Behind', 'Side', 'Goal', 'Free'], camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3(), orb = { th: 0.5, ph: 1.0, r: 28, drag: false, px: 0, py: 0, ox: 0, oz: 0 }, camInit = false;
function behindTargets(P, L) {
  var gx = S.drill === 'pass' ? S.aimGX : GX, gz = S.drill === 'pass' ? S.aimGZ : 0, dx = gx - bp.x, dz = gz - bp.z, ln = hyp(dx, dz) || 1, ux = dx / ln, uz = dz / ln;
  var back = S.drill === 'penalty' ? 7.5 : (S.drill === 'longshot' ? 8.5 : 7.2), up = 2.35;
  P.set(bp.x - ux * back + uz * 1.7, up + 0.35 + (S.drill === 'pass' ? 1.0 : 0), bp.z - uz * back - ux * 1.7); L.set(bp.x + ux * 16, 0.9, bp.z + uz * 16);
  if (S.drill !== 'pass') L.set(GX - 5, 1.0, bp.z * 0.3);
}
function updateCamera(dt) {
  var mode = S.camMode, ph = S.phase, P = tmpP, L = tmpL, rate = 4.5, fov = 56;
  if (S.drill === 'skills' && S.gates < 7 && mode !== 4) { var pl = S.pl; P.set(pl.x - 8.5, 3.9, pl.z * 0.7); L.set(pl.x + 9, 0.8, pl.z * 0.55); rate = 5; }
  else if (mode === 4) { P.set(orb.ox + orb.r * Math.sin(orb.ph) * Math.sin(orb.th), orb.r * Math.cos(orb.ph) + 1.5, orb.oz + orb.r * Math.sin(orb.ph) * Math.cos(orb.th)); L.set(orb.ox, 1.5, orb.oz); rate = 10; }
  else if (mode === 2) { var mxp = (bp.x + GX) / 2; P.set(mxp - 3, 8.5, (bp.z > 0 ? -1 : 1) * 26); L.set(mxp + 4, 1, bp.z * 0.2); rate = 3; }
  else if (mode === 3) { P.set(GX + 9, 2.5, clamp(bp.z * 0.5, -6, 6) + 5); L.set(GX - 14, 1.5, bp.z * 0.5); rate = 3; fov = 62; }
  else if (mode === 1 || ph === 'ready' || ph === 'idle' || ph === 'kick' || ph === 'done') { behindTargets(P, L); rate = ph === 'kick' ? 3 : 5; if (ph === 'kick' && S.kick) { var bx = P.x, bz = P.z; P.x = bx; P.z = bz; } }
  else {
    // auto: ball in flight / result → broadcast pull-back view from beside the goal
    var sh = S.shot, side = (sh && sh.from.z > 0) ? -1 : 1, bz2 = bp.z;
    if (ph === 'flight' && bp.x < GX - 16) { var vh = hyp(bp.vx, bp.vz) || 1; P.set(bp.x - bp.vx / vh * 8, 2.6 + bp.y * 0.4, bp.z - bp.vz / vh * 8); L.set(bp.x + bp.vx / vh * 10, Math.max(0.6, bp.y * 0.6), bp.z + bp.vz / vh * 10); rate = 4.5; }
    else { P.set(GX - 11, 2.2, (bz2 > 0 ? -1 : 1) * 10); L.set(GX - 0.5, 1.3, Math.max(-3.5, Math.min(3.5, bz2 * 0.5))); rate = 3.2; fov = 52; }
  }
  if (!isFinite(P.x + P.y + P.z + L.x + L.y + L.z)) return;
  if (!camInit || !isFinite(camPos.x + camPos.y + camPos.z)) { camPos.copy(P); camLook.copy(L); camInit = true; }
  var k = 1 - Math.exp(-dt * rate); camPos.lerp(P, k); camLook.lerp(L, k);
  cam.position.copy(camPos); cam.lookAt(camLook);
  var tf = fov - flashCam * 6; if (Math.abs(cam.fov - tf) > 0.05) { cam.fov += (tf - cam.fov) * (1 - Math.exp(-dt * 6)); cam.updateProjectionMatrix(); }
}

// ============================================================================================================================
// input
// ============================================================================================================================
window.addEventListener('keydown', function (e) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  if (e.repeat) return; keys[e.code] = true; N3.unlock();
  if (e.code === 'Space') { if (!$('veil').classList.contains('hide')) { var g = $('vgo') || $('vretry'); if (g) g.click(); } else startCharge(); }
  else if (e.code === 'KeyC') cycleCam();
  else if (e.code === 'KeyQ') { S.curve = Math.max(-10, S.curve - 1); }
  else if (e.code === 'KeyE') { S.curve = Math.min(10, S.curve + 1); }
  else if (e.code === 'KeyG') { S.guide = !S.guide; $('swa').classList.toggle('on', S.guide); }
  else if (e.code === 'KeyM') toggleSound();
  else if (e.code === 'KeyR') { if (S.phase === 'ready') S.curve = 0; }
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; if (e.code === 'Space') releaseCharge(); });
window.addEventListener('blur', function () { keys = {}; if (S.charging) { S.charging = false; $('power').classList.remove('show'); } });
function pointerNDC(e) { var r = cvs.getBoundingClientRect(); mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1; mouseOn = true; mouseMoved = true; }
cvs.addEventListener('pointermove', function (e) {
  pointerNDC(e);
  if (S.camMode === 4 && orb.drag) { orb.th -= (e.clientX - orb.px) * 0.007; orb.ph = clamp(orb.ph + (e.clientY - orb.py) * 0.007, 0.15, 1.5); orb.px = e.clientX; orb.py = e.clientY; }
});
cvs.addEventListener('pointerdown', function (e) {
  N3.unlock(); pointerNDC(e); try { cvs.setPointerCapture(e.pointerId); } catch (er) {}
  if (S.camMode === 4) { orb.drag = true; orb.px = e.clientX; orb.py = e.clientY; return; }
  mouseDown = true; if (S.phase === 'ready' && !TOUCH) { aimFromMouse(); startCharge(); } else if (S.phase === 'ready') { aimFromMouse(); }
});
cvs.addEventListener('pointerup', function () { orb.drag = false; if (mouseDown) { mouseDown = false; if (!TOUCH) releaseCharge(); } });
cvs.addEventListener('wheel', function (e) { if (S.camMode === 4) { orb.r = clamp(orb.r + e.deltaY * 0.03, 8, 90); e.preventDefault(); } }, { passive: false });
cvs.addEventListener('contextmenu', function (e) { e.preventDefault(); });
function cycleCam() { S.camMode = (S.camMode + 1) % CAMN.length; $('camname').textContent = CAMN[S.camMode]; if (S.camMode === 4) { orb.ox = bp.x + 10; orb.oz = bp.z; } }
function toggleSound() { N3.mute(!N3.isMuted()); $('bsnd').textContent = N3.isMuted() ? '🔇' : '🔊'; try { localStorage.setItem('nom_lab_mute', N3.isMuted() ? '1' : '0'); } catch (e) {} }
$('bcam').addEventListener('click', cycleCam); $('bsnd').addEventListener('click', toggleSound);
$('bstart').addEventListener('click', function () { N3.unlock(); if (S.phase === 'idle' || S.phase === 'done') startDrill(); });
$('breset').addEventListener('click', function () { resetDrill(); showStart(); });
$('swk').addEventListener('click', function () { S.keeperOn = !S.keeperOn; $('swk').classList.toggle('on', S.keeperOn); keeper.root.visible = S.keeperOn || S.drill === 'penalty'; });
$('swa').addEventListener('click', function () { S.guide = !S.guide; $('swa').classList.toggle('on', S.guide); });
// touch controls
(function () {
  var sb = $('shootbtn');
  sb.addEventListener('pointerdown', function (e) { e.preventDefault(); sb.classList.add('held'); try { sb.setPointerCapture(e.pointerId); } catch (er) {} N3.unlock(); startCharge(); });
  var up = function () { sb.classList.remove('held'); releaseCharge(); }; sb.addEventListener('pointerup', up); sb.addEventListener('pointercancel', up);
  $('cl').addEventListener('click', function () { S.curve = Math.max(-10, S.curve - 2); }); $('cr').addEventListener('click', function () { S.curve = Math.min(10, S.curve + 2); });
  var jy = $('joy'), kn = $('knob'), jid = null;
  function mv(e) { var r = jy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2), L = hyp(dx, dy); if (L > 1) { dx /= L; dy /= L; } joy.x = dx; joy.z = dy; kn.style.left = (36 + dx * 36) + 'px'; kn.style.top = (36 + dy * 36) + 'px'; }
  jy.addEventListener('pointerdown', function (e) { jid = e.pointerId; try { jy.setPointerCapture(jid); } catch (er) {} mv(e); N3.unlock(); });
  jy.addEventListener('pointermove', function (e) { if (e.pointerId === jid) mv(e); });
  var jend = function () { jid = null; joy.x = joy.z = 0; kn.style.left = '36px'; kn.style.top = '36px'; }; jy.addEventListener('pointerup', jend); jy.addEventListener('pointercancel', jend);
  $('sprint').addEventListener('pointerdown', function () { sprint = true; }); $('sprint').addEventListener('pointerup', function () { sprint = false; });
})();
function resize() {
  W = window.innerWidth; H = window.innerHeight; rend.setPixelRatio(Q.pr); rend.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
  var narrow = cam.aspect < 1; cam.fov = narrow ? 70 : 56; cam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ============================================================================================================================
// main loop
// ============================================================================================================================
var last = performance.now(), paused = false;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min((now - last) / 1000, 0.05); last = now; if (dt <= 0 || paused) { rend.render(scene, cam); return; }
  update(dt); rend.render(scene, cam);
  if (Q.auto) {
    Q.acc += dt; Q.n++;
    if (Q.n >= 90) {
      var avg = (Q.acc / Q.n) * 1000; Q.acc = 0; Q.n = 0;
      if (avg > 38 && Q.stage < 2) { Q.stage++; if (Q.stage === 1) { ST.sun.castShadow = false; } else { Q.pr = 1; rend.setPixelRatio(1); rend.setSize(W, H, false); } }
    }
  }
}
// test / debug hook: advance the simulation without waiting on animation frames
window.LAB = { S: S, bp: bp, DRILLS: DRILLS, kicker: kicker, keeper: keeper, step: function (sec, dt) { dt = dt || 1 / 60; for (var t = 0; t < sec; t += dt) update(dt); }, fire: fire, startDrill: startDrill, setDrill: setDrill, key: function (c, down) { keys[c] = !!down; }, pause: function (p) { paused = p; }, endDrill: endDrill, cam: cam, rend: rend, GATES: function () { return GATES; }, cones: function () { return cones; }, walls: function () { return S.walls; }, mate: function () { return S.mate; }, startCharge: startCharge, releaseCharge: releaseCharge, startShow: showStart, predict: predictGoalLine, phys: phys, BEST: BEST };
try { if (localStorage.getItem('nom_lab_mute') === '1') { N3.mute(true); $('bsnd').textContent = '🔇'; } } catch (e) {}
resize(); buildTabs(); panelFor('shoot'); setupScene(); hud(); showStart();
requestAnimationFrame(frame);
})();
