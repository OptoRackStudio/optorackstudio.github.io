/**
 * OPTORACK PRO - SPAWN MANAGER ("The Brain")
 * Encapsulates all logic for intelligent module placement and camera orchestration.
 */

/**
 * OPTORACK - SPAWN MANAGER (THE BRAIN)
 * Architectural Role: Spatial Intelligence & Heuristic Placement
 * - Calculates optimal coordinates for new modules using interaction proximity.
 * - Prevents overlap with existing modules via a 2D bounding box collision check.
 * - Enforces "Safe UI Margins" to keep modules clear of fixed interface elements.
 */
window.SpawnManager = {
    lastInteractedId: null,

    /**
     * Finds the best world-space position to spawn a new module.
     * Logic:
     * 1. Try to spawn to the right of the last-interacted module if it's visible.
     * 2. Otherwise, find the module closest to the center of the current screen.
     * 3. If no modules exist or are visible, spawn in the center of the safe viewport area.
     * 4. Always use a spiral search to avoid overlaps.
     */
    getSpawnPosition: (cam, modW, modH) => {
        const tx = cam.tx, ty = cam.ty, tz = cam.tz;
        const W = window.innerWidth, H = window.innerHeight;
        
        // Safe UI Margins (sync with globals-and-helpers.js)
        const PAD_TOP = 110, PAD_RIGHT = 280, PAD_BOTTOM = 90, PAD_LEFT = 400;
        const sL = PAD_LEFT, sR = W - PAD_RIGHT;
        const sT = PAD_TOP, sB = H - PAD_BOTTOM;

        // Current world bounds of the "white zone"
        const wL = (sL - tx) / tz, wR = (sR - tx) / tz;
        const wT = (sT - ty) / tz, wB = (sB - ty) / tz;
        const viewportCX = (wL + wR) / 2;
        const viewportCY = (wT + wB) / 2;

        let preferredX = viewportCX - modW / 2;
        let preferredY = viewportCY - modH / 2;

        // Try to find a reference module to spawn next to
        let refModule = null;
        const lastId = window._lastInteractedModuleId;
        
        if (lastId && window.moduleControllers[lastId]) {
            const rect = window.moduleControllers[lastId].getWorldRect();
            // Only use as ref if it's at least partially visible
            const isVisible = rect.x < wR && rect.x + rect.w > wL && rect.y < wB && rect.y + rect.h > wT;
            if (isVisible) refModule = rect;
        }

        if (!refModule) {
            // Find module closest to screen center
            let minDist = Infinity;
            Object.values(window.moduleControllers).forEach(ctrl => {
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
            // Try different directions: Right, then Bottom, then Left, then Top
            const directions = [
                { x: refModule.x + refModule.w + 40, y: refModule.y }, // Right
                { x: refModule.x, y: refModule.y + refModule.h + 40 }, // Bottom
                { x: refModule.x - modW - 40, y: refModule.y },        // Left
                { x: refModule.x, y: refModule.y - modH - 40 }         // Top
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

        // Use the smart spiral search with our preferred starting point
        return window.smartSpawnPos(cam, modW, modH, preferredX, preferredY);
    }
};
