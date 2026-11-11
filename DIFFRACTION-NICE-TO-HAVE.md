# Diffraction tool: nice to haves

Not core requirements. Build the core graph and polar views first, then consider these.

## 1. Drag-to-position drivers — done

Implemented: drag the driver on an SVG top-down baffle view (pointer events, so mouse/touch/pen all work the same way) with the response updating live on every move. The numeric X/Y fields stay in sync both ways, arrow keys nudge by 1mm (5mm with Shift) once the driver has focus, and a dashed outline plus warning text appears if the driver overlaps the baffle edge. A "pin this trace" button overlays the current curve as a faint dashed comparison trace so you can see whether a move helped.

Not done (still genuinely future, not just unticked):
- **Snap-to-grid.** Mentioned in the original idea; skipped for now since free dragging plus the numeric fields covers precision adequately.
- **Per-driver views / multiple drivers.** The tool only models a single driver on a baffle right now; multi-driver support (tweeter + woofer each with their own curve) would be a bigger scope change, not a drag-and-drop addition.
- **Roundover-aware overlap warnings.** No roundover modelling exists yet (flat baffles only), so there's nothing to warn about there.

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
