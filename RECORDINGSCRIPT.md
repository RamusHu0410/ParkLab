# ParkLab pitch video: recording plan (5 minutes)

## Goal

In five minutes, a viewer should understand three things: the problem (park planning has to balance many residents, a budget and real regulations, and the public rarely sees that), what ParkLab is (a game set in a real park, Wismer Park in Markham), and why it matters (it teaches civic trade-offs by letting people try them).

Spoken pace is about 140 words per minute, so the narration below is about 700 words. Leave the rest of the time for the demo to breathe.

## Before recording

**Setup**
- Run `npm run dev` and open http://localhost:5173 in a clean browser profile, with no extensions, bookmarks bar or notifications.
- Use a 1920×1080 window and set browser zoom to 100%. Hide the dock and turn on Do Not Disturb.
- Let the map tiles and 3D models load once beforehand so they are cached.
- Recording tools: QuickTime or OBS for the screen, plus an external mic or headset if you have one. Record in a quiet room with soft furnishings.

**Rehearse the demo build.** Work out the exact sequence of clicks in advance and note where each facility goes. You need two runs:
1. A failing run: place a facility that breaks a rule (for example a playground overlapping a path or sitting in an existing court's safety zone), then submit to show the rejection.
2. A winning run: a design that passes every rule and makes most residents happy. Practise until you can build it in under 90 seconds of screen time.

**Record in segments.** Capture each section below as its own clip, then join them in iMovie, CapCut or DaVinci Resolve. Retaking one segment is much easier than restarting a five-minute take. Record the voiceover separately if you find it hard to talk and click at once.

## Script

### 0:00–0:30 · Hook

**Screen:** Start on the 3D view of Wismer Park and slowly rotate the camera. Residents walk the paths.

**Say:**
> This is Wismer Park in Markham, Ontario. Thousands of people live around it, and they all want something different from it. A student wants a basketball court. A parent wants another playground. An environmentalist wants it left green. The City has to balance all of that against a budget and a stack of regulations. Most of us never see that trade-off. ParkLab lets you make it yourself.

### 0:30–1:00 · What ParkLab is

**Screen:** Zoom out to show the park boundary on the real map, then hover a few buildings and park features to show the info tooltips.

**Say:**
> ParkLab is a park-design game built on real data. The park boundary comes from the City of Markham, and the streets, paths, courts and trees come from OpenStreetMap. You get a budget of two hundred and fifty thousand dollars and one job: redesign the park so the neighbours are happy and the City approves it.

### 1:00–1:45 · Meet the residents

**Screen:** Open the citizen requests panel. Click through Enoch, Adam, Bob, Colgne and Dylan, pausing on each card's checklist and progress bars.

**Say:**
> Five neighbours each have a request. Adam wants a basketball court and an outdoor gym. Bob wants a plaza and a flower garden. Colgne says the playgrounds are crowded. Dylan wants an unused tennis court turned into a dog run. And Enoch wants the park kept green and soaking up carbon. Each card shows exactly what would satisfy them, and the requests conflict. Every court you add is lawn that Enoch loses.

### 1:45–2:45 · Building, and breaking the rules

**Screen:** Use the construction tabs: draw a path (Paths), paint a flower garden (Areas), and place a playground (Facilities) in a spot that breaks a rule. Show the "!" violation marker. Click Submit and show the rejection.

**Say:**
> You build with real tools. You draw paths, paint woodland or gardens, drop in facilities, and remove what's already there. Every choice costs money. Here I'll squeeze a playground in next to an existing court and submit it.
>
> Rejected. The City checks every design against five rules modelled on real ones: stay inside the park boundary, don't overlap facilities, keep safety clearance around play equipment and courts, follow Ontario's accessibility standard for path widths, and don't build in the protected woodlot or watercourse. Break one and your design goes back.

### 2:45–3:45 · Getting it right

**Screen:** Undo the bad placement. Speed up the winning build to about 2–3× in editing. Show the meters and happiness bars rising as you build. Submit, then hold on the result screen showing stars, average happiness, requests satisfied and CO₂ absorbed.

**Say:**
> So you plan more carefully. A court goes where there's room for its run-off. The old tennis court comes out and becomes grassland for Dylan's dogs. A plaza and flowers go in for Bob. And trees go back in so Enoch's carbon numbers hold up. Watch the residents' happiness climb as each request is met.
>
> Submit again. It passes every rule, and happiness sets the star rating. A design that pushes too much green space under concrete loses a star, even if people like it.

### 3:45–4:30 · Why it matters

**Screen:** Open the government rules panel and show the regulation links. (The sources page, `SourcesPage.tsx`, isn't connected to `App.tsx` yet. Connect it before recording if you want to show it.) Then cut back to residents walking through the finished park.

**Say:**
> Every rule links to its source, so players can read the actual regulation behind it. That's the point of ParkLab. It's a learning tool. When people see why a playground needs clear space around it, or why one more court costs green space, they can take part in real consultations with better questions. Wismer Park is level one. The same approach works for any park with open data.

### 4:30–5:00 · Close

**Screen:** Slow aerial shot of the finished park, then a title card: "ParkLab: design the park your neighbours want", with your name and the project link.

**Say:**
> ParkLab. Learn, design and share parks that the people living nearby will actually love. Thanks for watching.

## Editing checklist

- Trim loading screens and dead mouse movement.
- Speed up long build sequences instead of cutting them, so the viewer can still follow what happened.
- Add a short on-screen label when each rule or resident appears.
- Keep music quiet under the voice, roughly −20 dB below it.
- Add captions. Many people watch with sound off.
- Check the final length is 5:00 or less, and that the 3D view and map attributions (City of Markham, OpenStreetMap) are readable.
