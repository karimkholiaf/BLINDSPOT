# Voiceover script — timed to `docs/blindspot-demo.mp4`

The cut is **52.8 seconds**, comfortably inside the 2:00 cap. It came in shorter than planned because the two loading stretches were sped up rather than padded — a tight demo beats a padded one, and judges watch a lot of these.

Total narration below is **~128 words**, about 52 seconds at a natural 150 wpm. **Do not rush.** If you finish a line early, the silence is doing work.

---

## The beats

| Time | On screen | Say |
|---|---|---|
| **0:00–0:13** | Hero. The cross and the dot. The payoff line reveals. | "Close your left eye, look at the cross, and lean in. The dot vanishes — and you don't see a hole. Your brain fills the gap with more background, confidently, without telling you." |
| **0:13–0:18** | Extraction, sped up. "Writing a rubric for each one." | "Your understanding does the same thing. So Blindspot doesn't quiz you." |
| **0:18–0:29** | Concept map appears. Big-O selected. The wrong explanation types out. | "You upload a lecture, it pulls out the concepts, and you teach one back in your own words. Here's mine." |
| **0:29–0:34** | Assessment spinner, sped up. | *(silence — let the explanation sit there sounding correct)* |
| **0:34–0:53** | Diagnosis card. Red border. The belief, the quote, the correction. | "That sounded right. It's wrong — and it doesn't just mark it wrong. It names the belief: Big-O measures speed, not growth rate. It quotes the phrase that gave me away, and explains why real sorting libraries drop to insertion sort on small arrays. Blindspot finds what you don't know you don't know." |

---

## Delivery notes

- **The pause at 0:29 is the most important thing in the video.** Five seconds of spinner with no narration builds the expectation that the app is about to agree with you. Resist filling it.
- **Read the setup with conviction.** The whole point is that the wrong explanation sounds like a good answer.
- **Don't narrate the interface.** No "now I click here" — the screen already shows that.
- Record in a quiet room. The beats are cut to fixed times, so audio can be assembled row by row if a single take is hard.

## Producing the final file

Record the voiceover as a single WAV or MP3 at least 52.8 seconds long, save it as `docs/voiceover.wav`, then:

```bash
pwsh scripts/add-voiceover.ps1
```

That muxes the audio onto the video, trims to the shorter of the two, and writes `docs/blindspot-demo-final.mp4`.

If no voiceover gets recorded, `docs/blindspot-demo.mp4` is submittable as-is — silent but self-explanatory, since the on-screen text carries the argument. Narration is worth real points on the Pitch & Demo criterion, so record it if there is any time at all.
