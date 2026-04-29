/**
 * OPTORACK - GLOBAL CONSTANTS & BOOTSTRAP
 * Architectural Role: Primary System Definitions
 */

window.DW = 160; window.DH = 120;
window.globalZIndex = 100;
window.THEME_CLRS = ['#00E5FF', '#99CC33', '#F78E1E', '#FF0033', '#B266FF', '#E2E2E2'];
window.clamp = (v, min, max) => Math.max(min, Math.min(max, v));
window.lerp = (a,b,t) => a + (b-a)*t;
window.smartSpawnPos = (cam, w, h) => {
    console.warn("LEGACY: window.smartSpawnPos was called. Routing to window.SpawnManager.getSpawnPosition.");
    if (window.SpawnManager && window.SpawnManager.getSpawnPosition) {
        return window.SpawnManager.getSpawnPosition(cam, w, h);
    }
    return { x: 100, y: 100 };
};

// ── RESOLUTION MANAGEMENT ───────────────────────────────────────────────────

window.OptoRackResolution = window.OptoRackResolution || {};
window.OptoRackResolution.profiles = {
    PERFORMANCE: { w: 160, h: 120, label: 'PERFORMANCE (160x120)' },
    BALANCED: { w: 240, h: 180, label: 'BALANCED (240x180)' },
    HIGH: { w: 320, h: 240, label: 'HIGH (320x240)' },
    ULTRA: { w: 480, h: 360, label: 'ULTRA (480x360)' },
    QHD: { w: 1280, h: 720, label: 'QHD (1280x720)' },
    FHD: { w: 1920, h: 1080, label: 'FHD (1920x1080)' },
    UHD_4K: { w: 3840, h: 2160, label: 'UHD 4K (3840x2160)' }
};

window.OptoRackResolution.getOptions = () => Object.keys(window.OptoRackResolution.profiles);

window.OptoRackResolution.currentKey = 'PERFORMANCE';

window.OptoRackResolution.setProfile = (profileKey, persist = true) => {
    const profile = window.OptoRackResolution.profiles[profileKey] || window.OptoRackResolution.profiles.PERFORMANCE;
    window.OptoRackResolution.currentKey = profileKey;
    window.DW = profile.w;
    window.DH = profile.h;
    if (persist) {
        try { localStorage.setItem('optorack_resolution_profile', profileKey); } catch (e) {}
    }
    return profileKey;
};

// Auto-load saved resolution
try {
    const savedRes = localStorage.getItem('optorack_resolution_profile');
    window.OptoRackResolution.setProfile(savedRes || 'PERFORMANCE', false);
} catch (e) {
    window.OptoRackResolution.setProfile('PERFORMANCE', false);
}

// ── GLOBAL STATE & SHARED REFS ───────────────────────────────────────────────

window.moduleControllers = {}; 
window.clipboardParams = null; 
window.OptoRackState = window.OptoRackState || {
    currentRootNote: 60,
    currentScale: 'MINOR'
};

window.PRO_TIPS = [
    "TIP: THE BACKGROUND WEBGL MESH SYNCS TO THE LAST TWEAKED PHOTOSYNTH",
    "TIP: INCREASE 'P.ENV' TO CREATE PUNCHY KICKS AND DEEP 808 BASSES",
    "TIP: ROUTE AUDIO INTO A PHOTOSYNTH TO PROCESS IT THROUGH ITS FILTER & ADSR",
    "TIP: CLICK 'ASSIGN' ON AN LFO, THEN CLICK A KNOB TO MACRO AUTOMATE IT",
    "TIP: INCREASE 'FM AMT' TO MODULATE THE UNISON STACK WITH THE SUB OSCILLATOR"
];

window.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
window.FREQ_MARKERS = [20, 50, 100, 200, 500, 1000, 2500, 5000, 10000, 20000];