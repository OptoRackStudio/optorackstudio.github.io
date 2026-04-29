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

    initPanControls: (canvas, cam) => {
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;

        // Start dragging (Middle Mouse Button or Alt + Left Click)
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                isDragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        // Handle panning
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;

            // Apply delta to camera translation
            cam.tx += dx;
            cam.ty += dy;

            lastX = e.clientX;
            lastY = e.clientY;
        });

        // Stop dragging
        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                canvas.style.cursor = 'default';
            }
        });

        // Handle Zooming (Ctrl + Scroll Wheel)
        canvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                
                const zoomSensitivity = 0.001;
                const zoomDelta = -e.deltaY * zoomSensitivity;
                const prevTz = cam.tz || 1;
                
                // Clamp zoom between 0.1x and 5.0x
                let newTz = Math.min(Math.max(0.1, prevTz + zoomDelta), 5);

                // Get mouse position relative to canvas
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Adjust tx and ty so we zoom into the mouse cursor
                cam.tx = mouseX - (mouseX - cam.tx) * (newTz / prevTz);
                cam.ty = mouseY - (mouseY - cam.ty) * (newTz / prevTz);
                cam.tz = newTz;
            }
        }, { passive: false });
    },

<<<<<<< HEAD
=======
    // ── SMART SPAWN POSITION ───────────────────────────────────────────────────
    
    getSpawnPosition: (cam, modW, modH, startX, startY) => {
        const tx = cam.tx, ty = cam.ty, tz = cam.tz || 1;
        const W = window.innerWidth, H = window.innerHeight;
        
        // Safety Buffers (Avoid UI Panels)
        const PAD_TOP    = 110;
        const PAD_RIGHT  = 280;
        const PAD_BOTTOM = 90;
        const PAD_LEFT   = 400;

        const sL = PAD_LEFT,    sR = W - PAD_RIGHT;
        const sT = PAD_TOP,     sB = H - PAD_BOTTOM;

        // Screen -> World conversion
        const wL = (sL - tx) / tz,  wR = (sR - tx) / tz;
        const wT = (sT - ty) / tz,  wB = (sB - ty) / tz;

        const cx = (wL + wR) / 2;
        const cy = (wT + wB) / 2;

        const originX = (startX !== undefined) ? startX : cx - modW / 2;
        const originY = (startY !== undefined) ? startY : cy - modH / 2;

        const SNAP = 40;
        const stepX = Math.max(Math.ceil((modW + 20) / SNAP) * SNAP, 80);
        const stepY = Math.max(Math.ceil((modH + 20) / SNAP) * SNAP, 80);

        const rects = Object.values(window.moduleControllers || {})
            .map(c => c.getWorldRect ? c.getWorldRect() : null).filter(Boolean);

        const overlaps = (cx2, cy2) => rects.some(r =>
            cx2        < r.x + r.w + 20 &&
            cx2 + modW > r.x       - 20 &&
            cy2        < r.y + r.h + 20 &&
            cy2 + modH > r.y       - 20
        );

        const inBounds = (cx2, cy2) => (
            cx2 >= wL &&
            cx2 + modW <= wR &&
            cy2 >= wT &&
            cy2 + modH <= wB
        );

        const MAX_RINGS = 10;
        for (let ring = 0; ring <= MAX_RINGS; ring++) {
            const candidates = [];
            if (ring === 0) {
                candidates.push([originX, originY]);
            } else {
                for (let dx = -ring; dx <= ring; dx++) {
                    for (let dy = -ring; dy <= ring; dy++) {
                        if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
                            candidates.push([originX + dx * stepX, originY + dy * stepY]);
                        }
                    }
                }
                candidates.sort((a, b) => Math.hypot(a[0] - originX, a[1] - originY) - Math.hypot(b[0] - originX, b[1] - originY));
            }
            for (const [px, py] of candidates) {
                const snapped = [Math.round(px / SNAP) * SNAP, Math.round(py / SNAP) * SNAP];
                if (!overlaps(snapped[0], snapped[1])) {
                    if (inBounds(snapped[0], snapped[1]) || ring > 4) return { x: snapped[0], y: snapped[1] };
                }
            }
        }

        const maxY = rects.reduce((m, r) => Math.max(m, r.y + r.h), originY);
        return { x: Math.round(originX / SNAP) * SNAP, y: Math.round((maxY + 40) / SNAP) * SNAP };
    },
>>>>>>> parent of c440434 (Update camera-system.js)

    focusOnSpawn: (cam, spawnX, spawnY, modW, modH) => {
        if (!cam) return;
        
        const W = window.innerWidth, H = window.innerHeight;
        const PAD_TOP = 110, PAD_RIGHT = 280, PAD_BOTTOM = 90, PAD_LEFT = 400;
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