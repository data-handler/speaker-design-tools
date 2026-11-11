# Diffraction tool: nice to haves

Not core requirements. Build the core graph and polar views first, then consider these.

## 1. Drag-to-position drivers

Let users drag each driver on the baffle and watch the response update live. Existing tools (VituixCAD, The Edge) need typed coordinates and a re-run, so this is a genuine step up.

- **Live updates while dragging.** The edge-source model is cheap (a few hundred edge points × a couple of hundred frequencies), so it should run smoothly in JavaScript, even on a phone. Throttle to animation frames if needed.
- **Precision alongside dragging.** Show X/Y position in mm next to the baffle, directly editable, with arrow-key nudging and optional snap-to-grid. Dragging is for exploring; typed values are for final numbers.
- **Comparison.** Keep a faint "pinned" or "previous" trace on the graph so users can see whether a move improved things.
- **Real-world constraints.** Draw each driver's actual outline from its diameter. Warn on overlap with edges, roundovers or other drivers.
- **Per-driver views.** Tweeter and woofer each get their own diffraction curve, since they're affected in different frequency ranges.
- **Touch support** for mobile and tablet.

## 2. "Explain this" visualisation

An optional view showing how diffraction happens, linked to the graph.

- Animate the direct wavefront expanding from the driver, and each edge point emitting a delayed, inverted secondary wave (the edge-source model made visible).
- Show the interference pattern at a chosen frequency as a heat map.
- Click a peak or dip on the response graph to show the pattern causing it, highlighting the edges most responsible.
- **Label it clearly** as a visualisation of the edge-source model, not a full BEM/field simulation, so it isn't mistaken for one. It ignores cabinet sides and depth, approximates roundovers, and may use a simplified source model.

Purpose: answer "why does my graph look like that?" and build intuition (e.g. why a centred driver gives the biggest ripple). Design decisions still come from the graphs.

## 3. Validation

Credibility matters with the diyAudio audience. In order of effort:

1. **Physics sanity checks**
   - Very large baffle → flat response.
   - Small baffle → ~6dB baffle step, centred roughly where wavelength is comparable to baffle width.
   - Centred driver on a circular baffle → strongest ripple, peaks and dips set by the centre-to-edge distance.
2. **Comparison with existing tools** (main check)
   - Set up identical cases in VituixCAD's diffraction tool and The Edge: same baffle, driver position, source size (point vs piston), listening distance.
   - Export curves, overlay, and measure the dB difference across the band.
   - Test matrix: centred, offset, tall-narrow, wide-short; with and without roundovers; 0°, 30°, 60° off-axis.
   - Expect agreement within about 1dB where the models match; investigate any differences.
3. **Published references:** Olson's classic baffle-shape curves and the examples in Vanderkooy's AES paper.
4. **Real measurements:** gated (quasi-anechoic) REW measurements of a driver on a real baffle, compared by curve shape. Validates the ripple above a few hundred Hz; gating limits low-frequency resolution.
5. **Automated regression tests:** store reference curves from 2 and 3 as test fixtures with tolerances, and run them after every change.

Publishing the comparison plots alongside the tool (e.g. on the site and diyAudio) will help build trust.
