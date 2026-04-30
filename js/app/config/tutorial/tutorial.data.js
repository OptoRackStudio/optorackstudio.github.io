window.BeginnerGuideData = {
  shortcuts: [
    { key: 'H', action: 'Toggle UI visibility (Hide/Show UI)' },
    { key: 'Mouse Wheel', action: 'Zoom canvas in/out' },
    { key: 'Drag Empty Space', action: 'Pan around the patching world' },
    { key: 'Drag Module Header', action: 'Move modules on the grid' },
    { key: 'Double Click Knob', action: 'Reset parameter to default value' },
    { key: 'Double Click Jack', action: 'Clear all cables from that jack' },
    { key: 'DUP / CPY / PST / MUT', action: 'Duplicate, copy params, paste params, or mutate module params' },
    { key: 'REC', action: 'Start/stop live recording from the Master Buss' }
  ],
  steps: [
    {
      title: 'Welcome To OptoRack',
      body: 'Start by clicking + ADD PHOTOSYNTH. This creates your first synth voice with oscillator, filter, envelope, and modulation built in.'
    },
    {
      title: 'Make The First Sound',
      body: 'Turn up VOLUME on MASTER BUSS, then trigger your synth by routing TRIG from a sequencer or using live input routes. Adjust CUTOFF and RES for immediate tone shaping.'
    },
    {
      title: 'Understand Routing',
      body: 'Patch AUDIO OUT from one module to AUDIO IN of another module. Use cables to build your signal chain from synth to FX to MASTER BUSS.'
    },
    {
      title: 'Build A Sequence',
      body: 'Open + MODULE LIBRARY and add PROBABILITY SEQ or RHYTHM GATE. Route TRIG/PITCH outputs to synth inputs to create movement and rhythm patterns.'
    },
    {
      title: 'Shape With FX Modules',
      body: 'Add FILTER, DELAY, REVERB, EQ, OTT, or SIDECHAIN modules. Route your synth into them, then route back out to MASTER for mix and dynamics control.'
    },
    {
      title: 'Macro Automation',
      body: 'Add LFO MACRO, click ASSIGN, then click a knob target. You can automate filter sweeps, pitch movement, or spatial effects over time.'
    },
    {
      title: 'Save And Iterate',
      body: 'Use SAVE/LOAD for local projects, FILE EXP/FILE IMP for portable project files, and keep experimenting by duplicating modules and mutating parameters.'
    }
  ]
};
