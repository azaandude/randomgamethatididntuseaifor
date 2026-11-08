NAME-O-MATIC 9000 — CUSTOM 3D MODELS
=====================================

Drop your own .glb (glTF binary) 3D models in this folder to replace
the default placeholder mannequins used by BOTH referee.html and
career.html's match day 3D scenes.

FILES IT LOOKS FOR (exact names):
  player_home.glb   -> the blue/home team players on the pitch
  player_away.glb   -> the red/away team players on the pitch
  referee.glb       -> the referee character
  ball.glb          -> the match ball (optional)

You don't need all four. Any file you don't add just falls back to
the default built-in mannequin/ball automatically — nothing breaks
if this folder is empty or only has one or two files in it.

HOW IT WORKS
------------
Every model you add is automatically:
  1. Rescaled to the correct height (players/referee: 1.8m, ball: 0.22m)
  2. Recentred so its feet sit exactly on the pitch — no floating,
     no sinking into the ground
This happens no matter what scale or units your model was exported at.

If your model faces the wrong direction (e.g. walks backwards), open
referee.html, find the MODEL_CONFIG object near the top of the
<script> section, and adjust that model's "rotationOffset" value in
radians:
    0          = no change
    Math.PI    = 180° (face the opposite way)
    Math.PI/2  = 90° turn

IMPORTANT — HOSTING REQUIREMENT
--------------------------------
This only works when referee.html is served from a real web server
(GitHub Pages, Netlify, any normal hosting). It will NOT work if you
just double-click the HTML file and open it directly in your browser
(file:// URLs) — browsers block local file loading for security
reasons. Upload the whole folder (including this "models" folder) to
GitHub Pages or similar, and it'll work.

FORMAT NOTES
------------
- Use .glb (binary glTF), not .gltf + separate texture files — glb
  bundles everything into one file, which is simplest to drop in here.
- Keep file sizes reasonable (a few MB each) for fast loading —
  this is a browser game, not a AAA engine.
- Only use models you have the rights to use (models you made
  yourself, or ones licensed for this kind of use).

That's it — drop your files in, refresh referee.html, and check the
"CUSTOM MODELS" panel in the top-right during a match to confirm
each one loaded ("Your model") vs fell back to default ("Default").
