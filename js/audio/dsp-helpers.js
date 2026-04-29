/**
 * OPTORACK - DSP HELPERS
 * Architectural Role: Signal Processing Math & Calibration
 * - Generates lookup tables (curves) for saturation, clipping, and sidechaining.
 * - Handles musical quantization (Midi -> Freq, Scale Mapping).
 * - Stores engineer-calibrated FX presets for consistent EDM production.
 */

window.OptoRackDSP = {
    // ── CURVE GENERATORS ─────────────────────────────────────────────────────
    
    makeDriveCurve: (amount) => {
        const k = amount / 10; 
        const n_samples = 44100; const curve = new Float32Array(n_samples);
        for (let i = 0; i < n_samples; ++i) { 
            const x = (i * 2) / n_samples - 1; 
            curve[i] = Math.tanh(x * (1 + k * 4)) / Math.tanh(1 + k * 4); 
        }
        return curve;
    },

    makeSoftClipCurve: () => {
        const n_samples = 44100; const curve = new Float32Array(n_samples);
        for (let i = 0; i < n_samples; ++i) { 
            const x = (i * 2) / n_samples - 1; 
            curve[i] = Math.tanh(x * 1.4); 
        }
        return curve;
    },

    makeClampCurve: (limit) => {
        const n_samples = 44100; const curve = new Float32Array(n_samples);
        for (let i = 0; i < n_samples; ++i) { 
            const x = (i * 2) / n_samples - 1; 
            curve[i] = Math.max(-limit, Math.min(limit, x)); 
        }
        return curve;
    },

    getDuckerCurve: (curveId, depth) => {
        const resolution = 256;
        const curve = new Float32Array(resolution);
        for (let i = 0; i < resolution; i++) {
            let x = i / (resolution - 1);
            let val = 1.0;
            const smoothing = 0.02;
            switch(curveId) {
                case 0: val = Math.min(1.0, x * 4.0); break;
                case 1: val = Math.min(1.0, x * 10.0); break;
                case 2: val = Math.pow(x, 2.5); break;
                case 3: val = x; break;
                case 4: val = 1.0 - Math.pow(x, 2.0); break;
                case 5: val = 0.5 - 0.5 * Math.cos(x * Math.PI * 2); break;
                default: val = Math.min(1.0, x * 4.0);
            }
            if (x < smoothing && curveId <= 3) val = val * (x / smoothing); 
            curve[i] = 1.0 - (depth * (1.0 - val));
        }
        return curve;
    },

    // ── MUSICAL MATH ─────────────────────────────────────────────────────────

    getBaseFrequency: (note) => {
        const noteMap = { 'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2 };
        return parseFloat((440 * Math.pow(2, noteMap[note] / 12)).toFixed(1));
    },

    quantizeNoteToScale: (rawNote, rootNote, scaleName) => {
        const SCALES = window.OptoRackDSP.SCALES;
        const safeScaleName = (scaleName || 'MINOR').toUpperCase();
        let intervals = SCALES[safeScaleName] || SCALES['MINOR'];
        let roundedNote = Math.round(rawNote);
        let semitonesFromRoot = roundedNote - rootNote;
        let octaveOffset = Math.floor(semitonesFromRoot / 12) * 12;
        let noteInOctave = semitonesFromRoot % 12;
        if (noteInOctave < 0) noteInOctave += 12;
        let closestInterval = intervals.reduce((prev, curr) => {
            return (Math.abs(curr - noteInOctave) < Math.abs(prev - noteInOctave) ? curr : prev);
        });
        return rootNote + octaveOffset + closestInterval;
    },

    SCALES: {
        'MAJOR': [0,2,4,5,7,9,11],
        'MINOR': [0,2,3,5,7,8,10],
        'DORIAN': [0,2,3,5,7,9,10],
        'PHRYGIAN': [0,1,3,5,7,8,10],
        'LYDIAN': [0,2,4,6,7,9,11],
        'MIXOLYDIAN': [0,2,4,5,7,9,10],
        'PENTATONIC': [0,3,5,7,10],
        'CHROMATIC': [0,1,2,3,4,5,6,7,8,9,10,11]
    }
};

// Aliases for compatibility
window.makeDriveCurve = window.OptoRackDSP.makeDriveCurve;
window.makeSoftClipCurve = window.OptoRackDSP.makeSoftClipCurve;
window.makeClampCurve = window.OptoRackDSP.makeClampCurve;
