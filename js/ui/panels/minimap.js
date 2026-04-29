/**
 * OPTORACK - NAVIGATION RADAR (MINIMAP)
 * Architectural Role: World-Space Visual Proxy
 * - Translates 2D canvas clicks into world-space Camera Targets.
 * - Renders a high-level overview of the infinite synth graph.
 */
const Minimap = ({ synths, fxModules, cam, onNavigate }) => {
    const canvasRef = React.useRef(null);
    const [isDragging, setIsDragging] = React.useState(false);

    // Minimap configuration
    const mapSize = 200; // px
    const worldSize = 10000; // Match SpawnManager scale or logical world bounds
    const scale = mapSize / worldSize;

    const draw = () => {
        try {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, mapSize, mapSize);

            // Draw grid
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
            ctx.beginPath();
            for (let i = 0; i <= mapSize; i += mapSize / 10) {
                ctx.moveTo(i, 0); ctx.lineTo(i, mapSize);
                ctx.moveTo(0, i); ctx.lineTo(mapSize, i);
            }
            ctx.stroke();

            // Draw World Boundaries (Center-relative)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(0, 0, mapSize, mapSize);
            ctx.setLineDash([]);

            const offset = worldSize / 2;

            // Draw Modules
            if (synths) {
                synths.forEach(s => {
                    const ctrl = window.moduleControllers && window.moduleControllers[s.id];
                    const rect = ctrl ? ctrl.getWorldRect() : { x: s.x, y: s.y };
                    
                    ctx.fillStyle = '#00E5FF';
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = '#00E5FF';
                    const x = (rect.x + offset) * scale;
                    const y = (rect.y + offset) * scale;
                    ctx.fillRect(x - 2, y - 2, 4, 4);
                });
            }

            if (fxModules) {
                fxModules.forEach(f => {
                    const ctrl = window.moduleControllers && window.moduleControllers[f.id];
                    const rect = ctrl ? ctrl.getWorldRect() : { x: f.x, y: f.y };

                    ctx.fillStyle = '#FF00AA';
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = '#FF00AA';
                    const x = (rect.x + offset) * scale;
                    const y = (rect.y + offset) * scale;
                    ctx.fillRect(x - 2, y - 2, 4, 4);
                });
            }

            // Draw Viewport Rect
            if (cam) {
                const tz = cam.z || cam.tz || 1;
                const tx = cam.x || cam.tx || 0;
                const ty = cam.y || cam.ty || 0;

                const x1 = (-tx) / tz;
                const y1 = (-ty) / tz;
                const x2 = (window.innerWidth - tx) / tz;
                const y2 = (window.innerHeight - ty) / tz;

                const viewX = (x1 + offset) * scale;
                const viewY = (y1 + offset) * scale;
                const viewW = (x2 - x1) * scale;
                const viewH = (y2 - y1) * scale;

                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(viewX, viewY, viewW, viewH);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.fillRect(viewX, viewY, viewW, viewH);
            }
        } catch (e) {
            // Silently skip failed frames
        }
    };

    React.useEffect(() => {
        let frameId;
        const loop = () => {
            draw();
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [synths, fxModules, cam]);

    const handleInteraction = (e) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const offset = worldSize / 2;
        const cx = Math.max(0, Math.min(mapSize, mouseX));
        const cy = Math.max(0, Math.min(mapSize, mouseY));

        const worldX = (cx / scale) - offset;
        const worldY = (cy / scale) - offset;

        const tz = cam.z || cam.tz || 1;
        const tx = (window.innerWidth / 2) - (worldX * tz);
        const ty = (window.innerHeight / 2) - (worldY * tz);

        onNavigate(tx, ty);
    };

    return (
        <div className="minimap-container glass-panel" onPointerDown={(e) => { e.stopPropagation(); setIsDragging(true); handleInteraction(e); }}>
            <div className="minimap-header">NAVIGATION_RADAR</div>
            <canvas 
                ref={canvasRef} 
                width={mapSize} 
                height={mapSize} 
                onPointerMove={(e) => { if (isDragging) handleInteraction(e); }}
                onPointerUp={() => setIsDragging(false)}
                onPointerLeave={() => setIsDragging(false)}
            />
            <div className="minimap-footer">
                WORLD: {Math.round((-cam.x)/cam.z)}, {Math.round((-cam.y)/cam.z)} // ZOOM: {cam.z.toFixed(2)}x
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                .minimap-container {
                    position: absolute; bottom: 20px; right: 20px;
                    width: 200px; padding: 10px; border: 1px solid rgba(0, 229, 255, 0.2);
                    border-radius: 12px; z-index: 10000; cursor: crosshair;
                    user-select: none; transition: transform 0.2s, opacity 0.3s;
                    backdrop-filter: blur(10px); background: rgba(0,0,0,0.4);
                }
                .minimap-container:hover { transform: scale(1.02); border-color: #00E5FF; }
                .minimap-header { font-size: 8px; color: rgba(255,255,255,0.4); letter-spacing: 2px; margin-bottom: 8px; font-weight: bold; }
                .minimap-footer { font-size: 7px; color: #00E5FF; margin-top: 8px; font-weight: bold; font-family: 'Space Mono', monospace; opacity: 0.8; }
                canvas { border-radius: 4px; background: rgba(0,0,0,0.3); width: 100%; height: auto; }

                /* MOBILE RESPONSIVENESS */
                @media (max-width: 1080px) {
                    .minimap-container {
                        width: 150px; bottom: 10px; right: 10px; padding: 6px;
                    }
                    .minimap-header { display: none; }
                    .minimap-footer { font-size: 6px; }
                }
                @media (max-height: 800px) {
                    .minimap-container { transform: scale(0.85); transform-origin: bottom right; }
                }
            `}} />
        </div>
    );
};
window.Minimap = Minimap;
