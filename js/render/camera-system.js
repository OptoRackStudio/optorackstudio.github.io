/**
 * OPTORACK - CAMERA & SPAWNING SYSTEM
 * Architectural Role: Spatial Orchestration
 * - Manages the global Camera State (tx, ty, tz).
 * - Converts between World and Screen coordinates.
 * - Heuristically finds open space for new modules.
 * - Handles Canvas Panning and Zooming interactions.
 */

window.OptoRackCamera = {

    // ── INTERACTIVE CAMERA CONTROLS ────────────────────────────────────────────
    // (Pan and zoom logic is consolidated in main-app.js handleWheel/Pointer events)

    focusOnSpawn: (cam, spawnX, spawnY, modW, modH) => {
        if (!cam) return;

        const W = window.innerWidth, H = window.innerHeight;
        const PAD_LEFT = Math.min(400, W * 0.35);
        const PAD_RIGHT = Math.min(280, W * 0.25);
        const PAD_TOP = Math.min(110, H * 0.15);
        const PAD_BOTTOM = 90;

        const sL = PAD_LEFT, sR = W - PAD_RIGHT, sT = PAD_TOP, sB = H - PAD_BOTTOM;

        const tz = cam.tz || 1;
        const screenX = spawnX * tz + cam.tx;
        const screenY = spawnY * tz + cam.ty;
        const screenX2 = screenX + modW * tz;
        const screenY2 = screenY + modH * tz;

        const visW = Math.max(0, Math.min(screenX2, sR) - Math.max(screenX, sL));
        const visH = Math.max(0, Math.min(screenY2, sB) - Math.max(screenY, sT));
        const totalW = modW * tz, totalH = modH * tz;
        const visRatio = (totalW > 0 && totalH > 0) ? (visW / totalW) * (visH / totalH) : 0;

        // If at least 80% is visible, don't move camera
        if (visRatio >= 0.8) return;

        // Ideal position: Center the module in the safe white-zone area
        const targetScreenCX = sL + (sR - sL) * 0.45; // Shift slightly left to avoid panels
        const targetScreenCY = sT + (sB - sT) * 0.45;
        const modCX = spawnX + modW / 2;
        const modCY = spawnY + modH / 2;

        const nextTx = targetScreenCX - modCX * tz;
        const nextTy = targetScreenCY - modCY * tz;

        if (!isNaN(nextTx)) cam.tx = nextTx;
        if (!isNaN(nextTy)) cam.ty = nextTy;
    }
};

// Aliases
window.focusCameraOnSpawn = window.OptoRackCamera.focusOnSpawn;