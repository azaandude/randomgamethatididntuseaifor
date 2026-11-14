# NAME-O-MATIC 9000 — Football Platform

A full football simulation platform: real player database, career/manager sims, mini-games, and social features. Everything runs as static HTML/JS — **no backend, no server, no build step**. Host the whole folder anywhere that serves static files (GitHub Pages, Netlify, Vercel, or any web host) and it works.

## ⚠️ Setup — read this first

1. **Upload every file below into the same folder.** Nothing works in isolation — almost every page loads `database.js` directly, and the hub pages link to each other by filename.
2. **Don't just double-click the HTML files locally.** Some features (loading `database.js`, custom 3D models) use browser APIs that are blocked on the `file://` protocol for security reasons. You need a real HTTP server — GitHub Pages is free and takes about two minutes to set up.
3. **`app.html` is large (~640KB).** That's normal — it's the main hub with 25+ tabs built into one file.

## 🗺️ Site map

### Entry points
| File | What it is |
|---|---|
| `index.html` | Homepage — Fortnite-style hub linking to everything, item shop grid |
| `login.html` | Sign in / sign up screen |
| `app.html` | Main app — 25+ tabs, Quick Start modal, AI Saver Mode |

### The database
| File | What it is |
|---|---|
| `database.js` | **The shared data layer.** 1,408 real players across 22 leagues (men's + women's), 71 national teams, a 140-phrase commentary bank. Every other file reads from `window.NOMDB`. |
| `database.html` | Browse the whole database — leagues, clubs, squads, nations, phrase bank |

### Game modes
| File | What it is |
|---|---|
| `career.html` | 3D club management — pick a real club, run a season, interactive shooting moments during big chances |
| `manager.html` | Multi-season strategic management — board confidence, job security, press conferences, youth academy, staff hires, any club in any league |
| `referee.html` | 3D third-person referee simulator — flowing live match, VAR, career progression through 6 tiers |
| `fantasy.html` | Fantasy football — build an XI under a budget, simulate gameweeks |
| `packs.html` | FUT-style card pack opening with a persistent collection binder |
| `radio.html` | Pick any 2 real clubs, listen to a full match unfold as live text commentary |
| `worldcup.html` | Knockout tournament bracket simulator using the 71 real national teams |
| `arcade.html` | **Arcade Cup**: a top-down five-a-side football game with real squads. Quick match against the CPU (4 difficulties, or a **Custom** one with eight sliders), 2-player on one keyboard, watch-the-CPU mode and an 8-team knockout cup that ends in interactive penalty shootouts. Full rules, the same for both sides: fouls, yellow and red cards, free kicks with a wall, penalties you take or save, offside, and VAR reviews that replay the incident with the offside line or the box drawn on it (each rule can be switched off in the menu). You control your goalkeeper on goal kicks and after a catch (hold shoot to punt, pass to roll it out), and nobody can tackle a keeper who has the ball. **3D views** (Three.js, on by default, the 🎥 chip in the menu switches them off): goal replays from a broadcast camera and then from behind the net, VAR reviews with the offside line drawn on the grass, penalties and shootouts from behind the taker, free kicks from behind the ball and goal kicks from behind the keeper. It falls back to the 2D view by itself if WebGL is missing or the device is too slow. Keyboard, gamepad and touch controls, goal replays, half-time tactics, 17 achievements and records saved in your browser. Lines up the real 5 best players of any club or nation in `database.js` by default. **Make it yours:** a *game speed* slider (0.4× slow-motion to 1.6×, also on the pause screen and with the `[` and `]` keys); *Custom difficulty* with eight sliders for the computer (reactions, decisions, shooting, passing, keeper, pressing, pace, tackling) that you can start from any preset; *rebindable keys* for one player and for both players in two-player mode (two keys per action, clashes are sorted out for you, everything is saved); and a *squad editor* (✏️ on the line-up panel): pick any five players (keeper plus four) and three substitutes from the club or nation's full database squad, or use Auto-pick (best five, attacking, defensive, random). Squads are remembered per team and also work in the cup. Open the pause menu (or half time) to make substitutions: rolling changes, the player who comes off rests and recovers energy on the bench, and the computer makes its own changes. A red-carded player cannot be replaced. |

### Football tools
| File | What it is |
|---|---|
| `tactics.html` | Drag-and-drop formation board, draw arrows/runs, save tactics |
| `quiz.html` | Football trivia pulling questions from the real database |
| `physics.html` | FC26-style shooting/passing practice drills |
| `stadium-explorer.html` | First-person 3D stadium walkthrough |
| `compare.html` | Radar-chart stat comparison between any two real players |
| `guessr.html` | Daily Wordle-style player guessing game |
| `mgrquiz.html` | 8-question quiz matching your decisions to a real manager's known style |
| `transfer.html` | Transfer Market: a 20-day window with negotiation, offers for your players, deadline day and a graded verdict. Fees are model estimates, not real market values |
| `penalties.html` | Penalty Shootout: take five, keep five, sudden death. Real takers and keepers, aim with a moving reticle, dive by zone. Record saved in your browser |
| `kit.html` | Kit Lab: design a fictional shirt (colours, pattern, crest, name, number), save designs in your browser and download as SVG |
| `bingo.html` | Matchday Bingo: a simulated match, tap squares when their event happens. Right calls score, wrong calls cost you |
| `hangman.html` | Football Hangman: guess real player or club names from the database. Hints unlock as you miss |
| `lucky.html` | Feeling Lucky: a spinning wheel that picks a game from the site, with a random challenge |
| `trophy.html` | Unified dashboard pulling your saved stats from 13 games: Career, Manager Mode, Arcade Cup, Transfer Market, Referee, Fantasy, Daily Baller, Packs, Penalty Shootout, Quiz, Hangman, Bingo and Kit Lab. Works out an overall rank from all of them |

### Social / utility
| File | What it is |
|---|---|
| `multiplayer.html` | Prediction battles, leaderboards (Firebase-backed) |
| `community.html` | Live chat channels (Firebase-backed) |
| `connect.html` | AI provider key manager for AI Saver Mode in `app.html` |
| `firebase-config.js` | Firebase credentials used by multiplayer/community |

### Custom 3D models (optional)
| Path | What it is |
|---|---|
| `models/README.txt` | Instructions for dropping your own `.glb` player/referee models into `career.html` and `referee.html`. Fully optional — everything works with built-in placeholder mannequins if you skip this. |

## 🔗 How the linking works

Every page's navigation is hardcoded by filename — `index.html`'s shop grid and quick-links sidebar, and `app.html`'s tab bar and Quick Start modal, both link to every file listed above. As long as filenames aren't changed and everything sits in one folder, nothing needs reconfiguring.

## 📊 Data freshness

`database.js` includes a `meta` object with a `lastFullReview` date and per-league verification timestamps (`window.NOMDB.meta`). `database.html` displays this on load. Squad data doesn't update itself — there's no backend to do that automatically. To refresh any league, ask Claude in a new chat to re-verify it; that's exactly how Portugal, Eredivisie, Brazil, Mexico, and the Women's Super League got added mid-session.

## 🌍 Current database scope

- **22 leagues**: Premier League, Championship, League One/Two, Scottish Premiership/Championship/League One/League Two (England + Scotland full pyramids), La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Brasileirão, Liga Profesional (Argentina), Liga MX, MLS, Saudi Pro League, J1 League, Women's Super League, Egyptian Premier League
- **71 national teams** across UEFA, CONMEBOL, CONCACAF, AFC, CAF
- **1408 players listed** across **318 clubs**. Only **31 clubs** have a full squad (11+ players). Most clubs have only a handful of players, so the database is far from complete. See the coverage table below.
- **Known gap**: Oceania has no domestic league yet, and Africa is covered by Egypt only so far. Ask to have a specific league added if it matters to you.

## Database coverage (current)

| League | Clubs | Players listed | Clubs with a full squad (11+) |
|---|---|---:|---:|
| Premier League | 20 | 355 | 17 |
| EFL Championship | 24 | 192 | 3 |
| La Liga | 20 | 148 | 3 |
| Bundesliga | 18 | 79 | 1 |
| Serie A | 20 | 114 | 2 |
| Ligue 1 | 18 | 76 | 1 |
| Eredivisie | 18 | 80 | 2 |
| Primeira Liga | 18 | 48 | 0 |
| MLS | 8 | 22 | 0 |
| J1 League | 8 | 18 | 0 |
| Saudi Pro League | 8 | 24 | 0 |
| Scottish Premiership | 12 | 57 | 1 |
| EFL League One | 24 | 0 | 0 |
| EFL League Two | 24 | 0 | 0 |
| Scottish Championship | 10 | 0 | 0 |
| Scottish League One | 10 | 0 | 0 |
| Scottish League Two | 10 | 0 | 0 |
| Brasileirão Série A | 10 | 51 | 1 |
| Liga Profesional | 8 | 25 | 0 |
| Liga MX | 8 | 25 | 0 |
| Women's Super League | 12 | 57 | 0 |
| Egyptian Premier League | 10 | 37 | 0 |
| **Total** | **318** | **1408** | **31** |

## 🐛 Known limitations (stated plainly)

- No real backend — all progress (career saves, pack collections, quiz streaks) is stored in **your browser's localStorage**, per-device, per-browser. Clearing browser data erases it.
- Squad data is manually researched and verified per-league, not pulled from a live sports API — see "Data freshness" above.
- Most clubs have only a handful of players. Lower divisions (League One/Two in England, Scottish League One/Two and the Scottish Championship) have club names and stadiums but no player squads yet.
- Player ratings (ovr, pac, sho and so on) are estimates, not official ratings. Squad names come from research, not a live feed, so they can be out of date.

## Running offline

Everything here works with no connection after the first visit: the service worker (`sw.js`) caches every page and asset, and `fonts/` and `vendor/` hold the fonts and Three.js locally.

- **Works offline:** all single-player games, the database, Trophy Cabinet, Manager Mode, Transfer Market, Referee Career, Career Mode, Fantasy, Packs, Radio, Quiz, Tactics, Penalty Shootout, Arcade Cup, Kit Lab, Matchday Bingo, Football Hangman and the 3D pages.
- **Needs internet:** sign-in and cloud saves (`login.html`), community chat (`community.html`), online multiplayer (`multiplayer.html`), the AI Connect page and the AI features in `app.html`. These show a clear message offline; the rest of the site still works.
- Service workers need the site served over `http://localhost` or `https://`. Opening the files straight from disk (`file://`) skips the offline cache.
- Clearing site data removes the cache and your saved progress. Each page updates its cache on the next online visit.

## Adding real squads (tools/import-squads.js)

The importer puts squads into `database.js` from a CSV you provide. It doesn't fetch data itself.

```
node tools/import-squads.js template champ      # CSV skeleton with the league's club names
node tools/import-squads.js check   my.csv      # validate only
node tools/import-squads.js apply   my.csv      # dry run: shows what would change
node tools/import-squads.js apply   my.csv --write   # save (a database.js.bak backup is made first)
node tools/import-squads.js coverage            # per-league coverage report
```

- Columns: `league,club,name,pos,age,nat,ovr,pac,sho,pas,dri,def,phy`. `ovr` and the stats are optional. If you leave them blank, the player is marked `est:1` and the stats are estimates.
- A club's squad is replaced by the rows given for it. The dry run shows how many existing players would be dropped, so check that before you use `--write`.
- Nationality uses ISO codes such as `GB-ENG`, `GB-SCT`, `NL`, `IE`.
- Ages and nationalities should come from a source you're allowed to use. The tool doesn't check them against the internet.
