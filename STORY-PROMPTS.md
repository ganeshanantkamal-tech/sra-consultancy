# Before / after images for the scroll story

The home page section wipes from the "before" image to the "after" image, so both must show
**the same room from the same camera position**. The reliable way to get that from ChatGPT:

1. Generate the **after** image first (prompt 1).
2. In the same chat, ask ChatGPT to **edit that image** into the before version (prompt 2).
3. Save both as landscape 1536 × 1024 and replace
   `public/images/story-after.jpg` and `public/images/story-before.jpg`.
4. If the damage lands somewhere different from where prompt 2 asks, update the hotspot
   positions (`beforeSpots` / `afterSpots`, in % of the image) in `src/data.js`.

These are illustrations. The site labels them "Representative illustration" so visitors are not
misled into thinking they show a specific SRA job. Replace them with real project photos when available.

Paste each prompt into ChatGPT on its own (not this whole file). Starting with "Create an image"
makes it generate an image rather than reply in text.

The room is a premium, well-styled living room so the section looks aspirational: in the "before"
version only the ceiling and right wall are damaged, the furniture and styling stay beautiful.

## Prompt 1 — after (generate first, in a new chat)

```
Create an image: ultra-realistic interior photograph, landscape 3:2 (1536 × 1024), wide-angle 24 mm lens at eye level, looking straight at the back wall. A beautifully designed living room in a premium modern apartment in Maharashtra, India. Back wall: a large sliding glass door to a balcony with potted plants and a view of green trees and city buildings, sheer white curtains. Smooth white painted ceiling with warm cove lighting along the edges and a slim modern ceiling fan in the centre. Warm white walls; the left wall has a wooden TV unit with a wall-mounted TV; the right wall is a plain warm-white painted wall, fully visible, with only a slim floor lamp near the back corner. Large light beige vitrified-tile floor with a soft textured rug, an L-shaped grey fabric sofa with mustard and white cushions, a wooden centre table with a small plant and books, a tall indoor plant. Warm late-afternoon sunlight, clean, bright, elegant and inviting. Real architectural photography, natural colours, no people, no text, no watermark.
```

## Prompt 2 — before (same chat, edits the image from prompt 1)

```
Edit the image you just made. Keep the camera angle, framing, room layout, furniture, decor, balcony view and lighting exactly the same; the room stays tidy and stylish. Change only the ceiling and the right wall to show water seepage from the terrace above: a brown damp patch with tide-mark rings on the ceiling in the upper-left area, about a third of the way in from the left, near the top; a thin crack running across the ceiling to the right of the fan; a few black fungus spots in the top-right corner where the ceiling meets the wall; bubbling, peeling paint with white powdery efflorescence on the right wall, a little below mid height; a small steel bucket on the floor catching drips. Realistic, noticeable damage but not a ruined room. Ultra-realistic photo, no text, no watermark.
```