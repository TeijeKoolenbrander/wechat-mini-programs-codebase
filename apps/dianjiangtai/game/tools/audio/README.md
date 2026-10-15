# 点将台 audio

**Original, procedurally generated, (c) studio.** No samples, no recordings and no existing tunes. Every sound is
synthesised by `gen.js` in this folder; the melody is original, written on the 五声 scale (宫 D, 商 E, 角 F#, 徵 A, 羽 B).

| file | what | length | size |
|---|---|---|---|
| `bgm.mp3` | 古琴 (Karplus-Strong, slides, open-string drone) and 琵琶 (brighter, off-beat picking), small reverb, 56 bpm, 16 bars, loops | 68.6 s | 402 KB |
| `flip.mp3` | wood on lacquer: two damped taps | 0.35 s | 2.4 KB |
| `drum.mp3` | twelve 战鼓 hits 0.7 s apart (one per battle of the reveal), the last one heavier | 9.8 s | 58 KB |
| `bell.mp3` | one 编钟 strike (inharmonic partials, 一钟双音 minor-third pair) for 12-0 | 4.2 s | 25 KB |
| `tap.mp3` | soft UI tap | 0.1 s | 0.9 KB |

Mono, 22.05 kHz, 48 kbps mp3 (InnerAudioContext plays mp3 on iOS and Android). Output goes to `../../audio/`, the
`audio` subpackage in `game.json`.

## Rebuild
    cd apps/dianjiangtai/game/tools/audio
    npm install
    node gen.js          # add --wav to also write wav files for listening
Output is deterministic (seeded noise). lamejs 1.2.1 is the encoder; its package entry is broken under Node, so
`gen.js` evaluates the bundled `lame.all.js` instead.

## Loop note
The music buffer is rendered with its tails wrapped around the end and the reverb run twice, so the signal itself is
continuous across the loop point. mp3 adds about 50 ms of encoder padding, so a very quiet gap at the seam is possible
on some devices; the last bar is a soft ring-out so it is hard to hear. Check on a real device in the device pass.
