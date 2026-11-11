# Roadmap ideas: workflow, wizard and cabinet designer

Future ideas, to build after the individual tools (diffraction, box modelling) are solid. See HANDOVER.md for core requirements and DIFFRACTION-NICE-TO-HAVE.md for diffraction extras.

## The typical speaker design workflow

How DIY designers usually work, and where each tool fits:

1. **Driver selection:** compare Thiele-Small parameters and published response curves.
2. **Box modelling:** predict bass response for sealed, vented or passive-radiator boxes (WinISD, Unibox, Hornresp, VituixCAD's enclosure tool today).
3. **Baffle layout and diffraction:** The Edge, VituixCAD.
4. **Measurement:** REW, ARTA or HOLMImpulse with a measurement mic, measuring each driver in the actual cabinet. Designing from traced manufacturer graphs is possible but much less reliable.
5. **Crossover design:** VituixCAD, XSim, WinPCD, using those measurements.
6. **Listening and tweaking.**

Professional companies follow the same principles with heavier kit (anechoic chambers or near-field scanners, Klippel analysers, BEM/FEM simulation, Audio Precision/SoundCheck, in-house software).

## How the tools feed into each other

Data flow between tools should be a first-class design concern:

- T/S parameters → box model
- Box model + diffraction → expected baffle response
- Measurements (.frd/.zma) → crossover simulator
- Near-field bass + far-field measurements → merged full-range response

VituixCAD bundles most of this in one program, which is a big reason it's the standard. Our tools should share a common project format so outputs from one load directly into the next.

## Design wizard (strong idea)

A guided path for newcomers through the whole process. For beginners, the hard part isn't any single calculation; it's knowing what to do next and why.

- Steps: goals (size, budget, bass extension, room) → driver choice → box → baffle/diffraction → measurement → crossover → build plan.
- Each step explains what it's for and why it matters, in plain language, and links to the relevant tool with values carried over.
- **Push measurement.** Don't imply a reliable crossover can be designed from datasheets alone; guide users to measure in-box, or clearly label simulated-only results as provisional.
- **Build it last**, as the thread joining the individual tools, not as a monolith.
- Shape it from a beginner's perspective: if a step is confusing to me, it will be to others.

## Cabinet designer (gap in existing tools)

Box modellers work in internal volume and port dimensions, but as far as I know none of the mainstream DIY tools turn that into an actual cabinet. A cabinet designer could:

- Convert target net internal volume into external dimensions, given panel thickness.
- Allow for displacement from drivers, bracing, ports and any internal fittings.
- Suggest sensible internal proportions (avoiding equal dimensions).
- Produce a panel cut list (and possibly a simple layout for cutting from sheet sizes).
- Feed baffle dimensions straight into the diffraction tool, and volume into the box modeller.
