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
    const worldSize = 15000; // Expanded virtual world size for unrestricted movement
    const scale = mapSize / worldSize;

    const draw = () => {
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

        // Draw World Boundaries
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(0, 0, mapSize, mapSize);
        ctx.setLineDash([]);

        const offset = worldSize / 2;

        // Draw Modules
        synths.forEach(s => {
            ctx.fillStyle = '#00E5FF';
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#00E5FF';
            const x = (s.x + offset) * scale;
            const y = (s.y + offset) * scale;
            ctx.fillRect(x - 2, y - 2, 4, 4);
        });

        fxModules.forEach(f => {
            ctx.fillStyle = '#FF00AA';
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#FF00AA';
            const x = (f.x + offset) * scale;
            const y = (f.y + offset) * scale;
            ctx.fillRect(x - 2, y - 2, 4, 4);
        });

        // Draw Viewport Rect
        const viewW = (window.innerWidth / cam.z) * scale;
        const viewH = (window.innerHeight / cam.z) * scale;
        const viewX = (-cam.x + offset) * scale - viewW / 2;
        const viewY = (-cam.y + offset) * scale - viewH / 2;

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(viewX, viewY, viewW, viewH);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(viewX, viewY, viewW, viewH);
    };

    React.useEffect(() => {
        const frame = requestAnimationFrame(function loop() {
            draw();
            requestAnimationFrame(loop);
        });
        return () => cancelAnimationFrame(frame);
    }, [synths, fxModules, cam]);

    const handleInteraction = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const offset = worldSize / 2;
        // Clamp mouse interaction within map bounds
        const cx = Math.max(0, Math.min(mapSize, mouseX));
        const cy = Math.max(0, Math.min(mapSize, mouseY));

        const targetX = -(cx / scale - offset);
        const targetY = -(cy / scale - offset);

        onNavigate(targetX, targetY);
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
                COORD: {Math.round(-cam.x)}, {Math.round(-cam.y)} // ZOOM: {cam.z.toFixed(2)}x
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                .minimap-container {
                    position: absolute; bottom: 80px; right: 20px;
                    width: 180px; padding: 10px; border: 1px solid rgba(0, 229, 255, 0.3);
                    border-radius: 12px; z-index: 10000; cursor: crosshair;
                    user-select: none; transition: all 0.2s;
                }
                .minimap-container:hover { transform: scale(1.05); border-color: #00E5FF; }
                .minimap-header { font-size: 8px; color: #555; letter-spacing: 2px; margin-bottom: 8px; font-weight: bold; }
                .minimap-footer { font-size: 7px; color: #00E5FF; margin-top: 8px; font-weight: bold; font-family: 'Space Mono', monospace; }
                canvas { border-radius: 4px; background: rgba(0,0,0,0.3); width: 100%; height: auto; }

                @media (max-width: 600px) {
                    .minimap-container {
                        width: 140px;
                        bottom: 70px;
                        right: 10px;
                    }
                }
                @media (max-height: 500px) {
                    .minimap-container {
                        width: 120px;
                        bottom: 60px;
                        right: 10px;
                    }
                }
            `}} />
        </div>
    );
};
window.Minimap = Minimap;
