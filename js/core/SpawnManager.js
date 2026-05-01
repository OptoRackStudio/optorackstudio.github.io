/**
 * OPTORACK PRO - SPAWN MANAGER ("The Brain")
 * Architectural Role: Spatial Intelligence & Heuristic Placement
 * - Encapsulates all logic for intelligent module placement and camera orchestration.
 * - Prevents overlap with existing modules via a 2D bounding box collision check.
 * - Enforces "Safe UI Margins" to keep modules clear of fixed interface elements.
 * - Completely self-contained to avoid circular dependencies with camera-system.js.
 */
window.SpawnManager = {
    lastInteractedId: null,

    /**
     * Finds the best world-space position to spawn a new module.
     * Logic:
     * 1. Try to spawn near the last-interacted module if it's visible.
     * 2. Otherwise, find the module closest to the screen center.
     * 3. If no modules exist, spawn in the center of the safe viewport area.
     * 4. Perform a spiral search to find the nearest non-overlapping slot.
     */
    getSpawnPosition: (cam, modW, modH) => {
        if (!cam) return { x: 100, y: 100 }; // Ultra-safe fallback

        const tx = cam.tx, ty = cam.ty, tz = cam.tz || 1;
        const W = window.innerWidth, H = window.innerHeight;
        
        // Safe UI Margins (Avoid overlapping top-bar, library, etc.)
        const PAD_LEFT = Math.min(400, W * 0.35);
        const PAD_RIGHT = Math.min(280, W * 0.25);
        const PAD_TOP = Math.min(110, H * 0.15);
        const PAD_BOTTOM = 90;
        const sL = PAD_LEFT, sR = W - PAD_RIGHT;
        const sT = PAD_TOP, sB = H - PAD_BOTTOM;

        // Convert Screen Safe Zone to World Coordinates
        const wL = (sL - tx) / tz, wR = (sR - tx) / tz;
        const wT = (sT - ty) / tz, wB = (sB - ty) / tz;
        
        const viewportCX = (wL + wR) / 2;
        const viewportCY = (wT + wB) / 2;

        // Default starting point: Center of the safe world viewport
        let preferredX = viewportCX - modW / 2;
        let preferredY = viewportCY - modH / 2;

        // --- PHASE 1: Find a Reference Module for Proximity Spawning ---
        let refModule = null;
        const lastId = window._lastInteractedModuleId;
        
        if (lastId && window.moduleControllers && window.moduleControllers[lastId]) {
            const rect = window.moduleControllers[lastId].getWorldRect();
            // Only use as reference if it's at least partially on-screen
            const isVisible = rect.x < wR && rect.x + rect.w > wL && rect.y < wB && rect.y + rect.h > wT;
            if (isVisible) refModule = rect;
        }

        if (!refModule && window.moduleControllers) {
            // Find module closest to screen center if no last-interacted one is valid
            let minDist = Infinity;
            Object.values(window.moduleControllers).forEach(ctrl => {
                if (!ctrl.getWorldRect) return;
                const rect = ctrl.getWorldRect();
                const isVisible = rect.x < wR && rect.x + rect.w > wL && rect.y < wB && rect.y + rect.h > wT;
                if (isVisible) {
                    const dx = (rect.x + rect.w / 2) - viewportCX;
                    const dy = (rect.y + rect.h / 2) - viewportCY;
                    const dist = dx * dx + dy * dy;
                    if (dist < minDist) {
                        minDist = dist;
                        refModule = rect;
                    }
                }
            });
        }

        if (refModule) {
            // Heuristic: Try Right, then Bottom, then Left, then Top
            const directions = [
                { x: refModule.x + refModule.w + 40, y: refModule.y },
                { x: refModule.x, y: refModule.y + refModule.h + 40 },
                { x: refModule.x - modW - 40, y: refModule.y },
                { x: refModule.x, y: refModule.y - modH - 40 }
            ];

            for (const dir of directions) {
                const isDirVisible = dir.x >= wL && dir.x + modW <= wR && dir.y >= wT && dir.y + modH <= wB;
                if (isDirVisible) {
                    preferredX = dir.x;
                    preferredY = dir.y;
                    break;
                }
            }
        }

        // --- PHASE 2: Spiral Search for Collision-Free Space ---
        const SNAP = 40;
        const stepX = Math.max(Math.ceil((modW + 20) / SNAP) * SNAP, 80);
        const stepY = Math.max(Math.ceil((modH + 20) / SNAP) * SNAP, 80);

        const rects = Object.values(window.moduleControllers || {})
            .map(c => c.getWorldRect ? c.getWorldRect() : null)
            .filter(Boolean);

        const overlaps = (px, py) => rects.some(r =>
            px < r.x + r.w + 20 &&
            px + modW > r.x - 20 &&
            py < r.y + r.h + 20 &&
            py + modH > r.y - 20
        );

        const inBounds = (px, py) => (
            px >= wL && px + modW <= wR &&
            py >= wT && py + modH <= wB
        );

        const MAX_RINGS = 12;
        for (let ring = 0; ring <= MAX_RINGS; ring++) {
            const candidates = [];
            if (ring === 0) {
                candidates.push([preferredX, preferredY]);
            } else {
                for (let dx = -ring; dx <= ring; dx++) {
                    for (let dy = -ring; dy <= ring; dy++) {
                        if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
                            candidates.push([preferredX + dx * stepX, preferredY + dy * stepY]);
                        }
                    }
                }
                // Sort candidates by distance to preferred center
                candidates.sort((a, b) => Math.hypot(a[0] - preferredX, a[1] - preferredY) - Math.hypot(b[0] - preferredX, b[1] - preferredY));
            }

            for (const [px, py] of candidates) {
                const snappedX = Math.round(px / SNAP) * SNAP;
                const snappedY = Math.round(py / SNAP) * SNAP;
                
                if (!overlaps(snappedX, snappedY)) {
                    // prioritize bounds visibility, but ignore if we're deep in the spiral
                    if (inBounds(snappedX, snappedY) || ring > 5) {
                        return { x: snappedX, y: snappedY };
                    }
                }
            }
        }

        // --- PHASE 3: Absolute Fallback (Stack at Bottom) ---
        const maxY = rects.reduce((m, r) => Math.max(m, r.y + r.h), preferredY);
        return { 
            x: Math.round(preferredX / SNAP) * SNAP, 
            y: Math.round((maxY + 40) / SNAP) * SNAP 
        };
    }
};
