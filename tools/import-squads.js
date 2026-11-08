#!/usr/bin/env node
/*
 * NAME-O-MATIC squad importer
 *
 * Puts real squads into database.js from a CSV you supply.
 * Nothing here fetches data from the internet. You bring the squad data.
 *
 *   node tools/import-squads.js template <leagueId>        print a CSV skeleton with the league's clubs
 *   node tools/import-squads.js check   <file.csv>         validate only, print a coverage report
 *   node tools/import-squads.js apply   <file.csv>         dry run: show what would change
 *   node tools/import-squads.js apply   <file.csv> --write write database.js (a backup is saved first)
 *
 * CSV columns (header row required):
 *   league,club,name,pos,age,nat,ovr,pac,sho,pas,dri,def,phy
 *   - league: league id, e.g. champ, league1, scotl1
 *   - club:   club name exactly as in database.js (use `template` to copy them)
 *   - pos:    GK CB RB LB CDM CM CAM LM RM LW RW ST CF
 *   - age:    whole number, 15-45
 *   - nat:    ISO country code, e.g. GB-ENG GB-SCT GB-WLS GB-NIR IE NL ES DE FR BR US JP
 *   - ovr, pac, sho, pas, dri, def, phy: optional. Left blank, they are estimated and the
 *     player is marked est:1 so the site can label them as estimates.
 *
 * Rows must name a club that exists in the league. A club's squad is replaced by the rows
 * given for it. Clubs with no rows are left alone.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.js');
const POS = ['GK', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];
const STATS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];

function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }

function loadDb(src) {
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox, { filename: 'database.js' });
  return sandbox.window.NOMDB;
}

function flagFor(code) {
  const special = { 'GB-ENG': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
    'GB-SCT': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
    'GB-WLS': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
    'GB-NIR': '\u{1F3F4}\u{E0067}\u{E0062}\u{E006E}\u{E0069}\u{E0072}\u{E007F}' };
  const c = String(code || '').toUpperCase();
  if (special[c]) return special[c];
  if (!/^[A-Z]{2}$/.test(c)) return null;
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65);
}

// simple CSV parser (no quoted commas needed; fields may be wrapped in "")
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim().length && l.trim()[0] !== '#'; });
  if (!lines.length) return [];
  const head = lines[0].split(',').map(function (h) { return h.trim().toLowerCase(); });
  return lines.slice(1).map(function (line, i) {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [];
    const vals = [];
    let s = line;
    // split respecting quotes
    const out = []; let cur = ''; let q = false;
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    const row = {};
    head.forEach(function (h, idx) { row[h] = out[idx] !== undefined ? out[idx] : ''; });
    row._line = i + 2;
    return row;
  });
}

function findLeague(db, id) { return db.leagues.filter(function (l) { return l.id === id; })[0]; }

function estimate(p, clubRating, seedText) {
  // deterministic small jitter so the same name always gets the same estimate
  let h = 0; for (let i = 0; i < seedText.length; i++) h = (h * 31 + seedText.charCodeAt(i)) >>> 0;
  const jit = (h % 7) - 3;
  const ovr = Math.max(50, Math.min(84, Math.round((clubRating || 70) * 0.92 + jit)));
  const out = { ovr: ovr };
  if (p.pos === 'GK') {
    out.pac = Math.round(ovr * 0.55); out.sho = Math.round(ovr * 0.2); out.pas = Math.round(ovr * 0.7);
    out.dri = Math.round(ovr * 0.6); out.def = ovr; out.phy = Math.max(40, ovr - 4);
  } else {
    STATS.forEach(function (s) { out[s] = Math.max(35, Math.min(95, ovr + ((h >> 3) % 9) - 4)); });
  }
  return out;
}

function validate(db, rows) {
  const errors = [], warnings = [];
  const leagueIds = db.leagues.map(function (l) { return l.id; });
  const byClub = {};
  const seen = {};
  rows.forEach(function (r) {
    const at = 'line ' + r._line;
    if (!r.league || !r.club || !r.name || !r.pos || !r.age || !r.nat) { errors.push(at + ': league, club, name, pos, age and nat are required'); return; }
    if (leagueIds.indexOf(r.league) < 0) { errors.push(at + ': unknown league "' + r.league + '"'); return; }
    const L = findLeague(db, r.league);
    const club = L.clubs.filter(function (c) { return c.name === r.club; })[0];
    if (!club) { errors.push(at + ': club "' + r.club + '" is not in ' + r.league + ' (copy the name from `template`)'); return; }
    if (POS.indexOf(r.pos) < 0) { errors.push(at + ': pos "' + r.pos + '" is not one of ' + POS.join(' ')); return; }
    const age = parseInt(r.age, 10);
    if (!(age >= 15 && age <= 45)) { errors.push(at + ': age "' + r.age + '" must be 15-45'); return; }
    if (!flagFor(r.nat)) { errors.push(at + ': nat "' + r.nat + '" must be an ISO code like GB-ENG or NL'); return; }
    if (r.ovr !== '' && !(parseInt(r.ovr, 10) >= 40 && parseInt(r.ovr, 10) <= 99)) { errors.push(at + ': ovr must be 40-99'); return; }
    const key = r.club + '|' + r.name.toLowerCase();
    if (seen[key]) { errors.push(at + ': duplicate player "' + r.name + '" in ' + r.club); return; }
    seen[key] = true;
    (byClub[r.league + '|' + r.club] = byClub[r.league + '|' + r.club] || []).push(r);
  });
  Object.keys(byClub).forEach(function (k) {
    if (byClub[k].length < 11) warnings.push(k.split('|')[1] + ': only ' + byClub[k].length + ' players (a playable squad needs 11)');
  });
  return { errors: errors, warnings: warnings, byClub: byClub };
}

function playerLiteral(r, est, clubRating) {
  const ovrGiven = r.ovr !== '';
  const seed = r.name + r.club;
  const e = est || {};
  const val = function (k) {
    if (r[k] !== undefined && r[k] !== '') return parseInt(r[k], 10);
    return e[k];
  };
  const isEst = !ovrGiven || STATS.some(function (s) { return r[s] === undefined || r[s] === ''; });
  const ovr = ovrGiven ? parseInt(r.ovr, 10) : e.ovr;
  const q = "'" + String(r.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  return '{name:' + q + ",pos:'" + r.pos + "',nat:'" + flagFor(r.nat) + "',age:" + parseInt(r.age, 10)
    + ',ovr:' + ovr + ',pac:' + val('pac') + ',sho:' + val('sho') + ',pas:' + val('pas') + ',dri:' + val('dri')
    + ',def:' + val('def') + ',phy:' + val('phy') + (isEst ? ',est:1' : '') + '}';
}

// find the players array of a club inside a league block and return [start, end) of "players:[...]"
function locateClubPlayers(src, leagueId, clubName) {
  const lidx = src.indexOf("id:'" + leagueId + "'");
  if (lidx < 0) throw new Error('league block not found: ' + leagueId);
  const nameNeedle = "name:'" + clubName.replace(/'/g, "\\'") + "'";
  let cidx = src.indexOf(nameNeedle, lidx);
  if (cidx < 0) cidx = src.indexOf("name:'" + clubName + "'", lidx);
  if (cidx < 0) throw new Error('club not found in league ' + leagueId + ': ' + clubName);
  const pidx = src.indexOf('players:[', cidx);
  if (pidx < 0) throw new Error('no players array for ' + clubName);
  const open = pidx + 'players:'.length;
  let depth = 0, inStr = false, q = '';
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (ch === '\\') { i++; continue; } if (ch === q) inStr = false; continue; }
    if (ch === "'" || ch === '"') { inStr = true; q = ch; continue; }
    if (ch === '[') depth++;
    if (ch === ']') { depth--; if (depth === 0) return { start: open, end: i + 1 }; }
  }
  throw new Error('unbalanced players array for ' + clubName);
}

function applyRows(src, db, byClub, write) {
  let out = src;
  const report = [];
  // apply from the end of the file backwards so earlier offsets stay valid
  const jobs = Object.keys(byClub).map(function (k) {
    const parts = k.split('|');
    const L = findLeague(db, parts[0]);
    const club = L.clubs.filter(function (c) { return c.name === parts[1]; })[0];
    return { league: parts[0], club: parts[1], rows: byClub[k], rating: club.rating, club_obj: club };
  });
  jobs.forEach(function (j) { j.loc = locateClubPlayers(out, j.league, j.club); });
  jobs.sort(function (a, b) { return b.loc.start - a.loc.start; });
  jobs.forEach(function (j) {
    const lits = j.rows.map(function (r) {
      const est = estimate(r, j.rating, r.name + r.club);
      return playerLiteral(r, est, j.rating);
    });
    const body = 'players:[\n      ' + lits.join(',\n      ') + '\n    ]';
    out = out.slice(0, j.loc.start - 'players:'.length) + body + out.slice(j.loc.end);
    const estCount = j.rows.filter(function (r) { return r.ovr === '' || STATS.some(function (s) { return r[s] === ''; }); }).length;
    const before = (j.club_obj.players || []).length;
    const dropped = Math.max(0, before - j.rows.length);
    report.push(j.club + ' (' + j.league + '): ' + j.rows.length + ' players, ' + estCount + ' estimated, replaces ' + before + ' existing'
      + (dropped ? ' (' + dropped + ' existing players would be dropped)' : ''));
  });
  return { out: out, report: report };
}

function coverage(db) {
  let tc = 0, tp = 0, tf = 0;
  const lines = [];
  db.leagues.forEach(function (l) {
    let pl = 0, full = 0;
    l.clubs.forEach(function (k) { const n = (k.players || []).length; pl += n; if (n >= 11) full++; });
    tc += l.clubs.length; tp += pl; tf += full;
    lines.push(l.id.padEnd(12) + ' clubs ' + String(l.clubs.length).padStart(3) + '  players ' + String(pl).padStart(4) + '  full squads ' + full);
  });
  lines.push('TOTAL        clubs ' + tc + '  players ' + tp + '  full squads ' + tf);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const src = fs.readFileSync(DB_FILE, 'utf8');
  const db = loadDb(src);
  if (!db || !db.leagues) die('could not load database.js');

  if (cmd === 'template') {
    const L = findLeague(db, args[1]);
    if (!L) die('unknown league id. Known: ' + db.leagues.map(function (l) { return l.id; }).join(' '));
    console.log('league,club,name,pos,age,nat,ovr,pac,sho,pas,dri,def,phy');
    L.clubs.forEach(function (c) { console.log(L.id + ',' + c.name + ',,,,,,,,,,,'); });
    return;
  }
  if (cmd === 'coverage') { console.log(coverage(db)); return; }
  if (cmd !== 'check' && cmd !== 'apply') {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 20).join('\n'));
    return;
  }
  const file = args[1];
  if (!file) die('give a CSV file');
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!rows.length) die('CSV is empty');
  const v = validate(db, rows);
  if (v.errors.length) { console.error(v.errors.join('\n')); die(v.errors.length + ' error(s); nothing changed'); }
  v.warnings.forEach(function (w) { console.warn('warning: ' + w); });
  if (cmd === 'check') { console.log('OK: ' + rows.length + ' rows, ' + Object.keys(v.byClub).length + ' clubs'); return; }

  const res = applyRows(src, db, v.byClub, false);
  res.report.forEach(function (r) { console.log('  ' + r); });
  if (!args.includes('--write')) { console.log('Dry run. Add --write to save changes to database.js.'); return; }
  const backup = DB_FILE + '.bak';
  fs.writeFileSync(backup, src);
  fs.writeFileSync(DB_FILE, res.out);
  const after = loadDb(res.out);
  if (!after || !after.leagues) { fs.writeFileSync(DB_FILE, src); die('result did not load; database.js restored from memory'); }
  console.log('Wrote database.js (backup: ' + backup + ')');
  console.log(coverage(after));
}

main();
