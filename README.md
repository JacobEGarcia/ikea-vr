# UTGÅNG — a VR IKEA horror game

Closing time was 22:00. You fell asleep inside a LÖVKULLA wardrobe. Now the showroom
is dark, the flat-packs whisper, and the staff are restocking. The staff are always
restocking.

Scavenge meatballs, batteries and plåster by day. Survive three nights against the
faceless staff. At dawn on the fourth day the UTGÅNG gates on the north wall open —
run for them.

## Play

- **Live:** https://jacobegarcia.github.io/ikea-vr/
- **Quest 3:** open the link in the headset browser, press ENTER VR.
- **Desktop:** click ENTER THE STORE. WASD move, mouse look, SHIFT run, C crouch,
  F flashlight, E take/eat.

## Mechanics

- Day/night cycle: by day the staff stand frozen at their stations (their heads still
  follow you). At night they patrol, hear sprinting, and see your flashlight beam from
  far away. Crouch and kill the light to stay hidden.
- Vitals: health, stamina, hunger (eat köttbullar), flashlight battery.
- The store layout is fixed — learning the aisles is the advantage.
- Best run (nights survived, escapes) persists in localStorage.

## Tech

Single static site, no build step, no CDN: `index.html` + `main.js` + vendored
`three.module.js` (r160). WebXR `immersive-vr` with `local-floor`, smooth locomotion
on the left stick, snap turn on the right, squeeze/trigger to grab, A toggles the
headlamp, haptic pulses on grabs and hits. Desktop pointer-lock fallback. All geometry
procedural and merged into one mesh per material to stay fast on the Quest; all
textures are generated `<canvas>` (walls, flat-pack labels, price tags, posters);
all audio is synthesized WebAudio (day pad, night drone, staff whisper-noise,
heartbeat, clangs).

Unofficial fan game. Not affiliated with Inter IKEA Systems B.V.
