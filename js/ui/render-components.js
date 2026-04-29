const { useState, useEffect, useRef, useMemo, useCallback } = React;

/**
 * OPTORACK - RENDER COMPONENTS
 * Architectural Role: Specialized UI Visualizers
 * - WavetablePanelDisplay: Real-time 3D wavetable and oscilloscope visualization.
 * - MasterLoudnessMonitor: LUFS and Crest factor monitoring for the master bus.
 * - VisualEnginePreview: Mini-preview of the main WebGL engine.
 */

const VisualEnginePreview = ({ height = 200 }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        let frameId;
        const draw = () => {
            frameId = requestAnimationFrame(draw);
            if (canvasRef.current && window.optorackWebGLCanvas) {
                const ctx = canvasRef.current.getContext('2d');
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                ctx.drawImage(window.optorackWebGLCanvas, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }
        };
        draw();
        return () => cancelAnimationFrame(frameId);
    }, []);
    return (
        <div style={{ border: '1px solid rgba(0, 229, 255, 0.3)', borderRadius: '8px', overflow: 'hidden', background: '#000', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, padding: '8px', fontSize: '10px', color: '#00E5FF', background: 'rgba(0,0,0,0.8)', borderBottomRightRadius: '8px', zIndex: 10 }}>LIVE_PREVIEW</div>
            <canvas ref={canvasRef} width={600} height={height * 2} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
        </div>
    );
};

const WavetablePanelDisplay = ({ mod, color, updateParam }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = 1200; const h = 480;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        let animationId;
        const draw = () => {
            animationId = requestAnimationFrame(draw);
            if (!mod || !mod.currentTopo || !mod.params) return;
            ctx.clearRect(0, 0, w, h);
            
            if (window.optorackWebGLCanvas) {
                ctx.globalAlpha = 0.8;
                ctx.globalCompositeOperation = 'screen';
                ctx.drawImage(window.optorackWebGLCanvas, 0, 0, w, h);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1.0;
            }
            
            const resX = Math.floor(mod.params.meshRes || 64); const resZ = 32; 
            const sens = mod.params.sensitivity || 1.0;
            const warpAmt = mod.params.warp || 0;
            const syncAmt = mod.params.sync || 1.0;
            const timeScl = mod.params.timeScl || 1.0;
            const freqScl = mod.params.freqScl || 1.0;
            const ampScl = mod.params.ampScl || 1.0;
            const formantAmt = mod.params.formant || 1.0;
            
            const warpFactor = Math.pow(2, warpAmt * 3);
            const fov = 250; const stepX = (w * 0.8) / resX; const stepZ = (h * 0.8) / resZ;
            
            const dw = window.DW || 160;
            const dh = window.DH || 120;
            
            ctx.save(); ctx.translate(w/2, h/2 + 20); 
            
            for(let z = resZ - 1; z >= 0; z--) {
                for(let x = 0; x < resX; x++) {
                    let phaseX = (x / resX * syncAmt * timeScl) % 1.0;
                    let warpedPhaseX = Math.pow(phaseX, warpFactor);
                    const mapX = Math.floor(warpedPhaseX * (dw - 1));
                    let read_y_norm = (z / resZ * formantAmt * freqScl) % 1.0;
                    const mapY = Math.floor(read_y_norm * (dh - 1));
                    
                    const idx = (dh - 1 - mapY) * dw + mapX;
                    let val = (mod.currentTopo[idx] || 0) * sens * ampScl;
                    if (val > 0.02) { 
                        const x3d = (x - resX/2) * stepX; const z3d = (z - resZ/2) * stepZ; const y3d = -Math.min(val * 100, 150); 
                        const scale3D = fov / Math.max(10, z3d + fov);
                        ctx.fillStyle = color; ctx.globalAlpha = Math.min(1.0, val * 1.5); 
                        ctx.beginPath(); ctx.arc(x3d * scale3D, y3d * scale3D, Math.max(0.5, (val * 4) * scale3D), 0, Math.PI * 2); ctx.fill();
                    }
                }
            }
            
            // Draw Scanline & Oscilloscope logic...
            ctx.restore();
        };
        draw();
        return () => cancelAnimationFrame(animationId);
    }, [mod, color]);

    return <canvas ref={canvasRef} className="visualizer-canvas-full" onPointerDown={(e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = window.clamp((e.clientX - rect.left) / rect.width, 0, 1);
        updateParam(mod.id, 'wtPos', x);
    }} style={{ cursor: 'crosshair' }} />;
};

const MasterLoudnessMonitor = ({ analyser }) => {
    const canvasRef = useRef(null);
    const [stats, setStats] = useState({ lufs: -Infinity, crest: 0 });

    useEffect(() => {
        if (!analyser) return;
        let frameId;
        const data = new Float32Array(analyser.fftSize);
        const draw = () => {
            frameId = requestAnimationFrame(draw);
            analyser.getFloatTimeDomainData(data);
            let sumSq = 0, peak = 0;
            for (let i = 0; i < data.length; i++) {
                const val = data[i]; sumSq += val * val;
                if (Math.abs(val) > peak) peak = Math.abs(val);
            }
            const rms = Math.sqrt(sumSq / data.length);
            const lufsApprox = 20 * Math.log10(rms + 1e-9) + 0.6;
            const peakDb = 20 * Math.log10(peak + 1e-9);
            setStats({ lufs: lufsApprox.toFixed(1), crest: (peakDb - lufsApprox).toFixed(1) });

            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                const w = canvasRef.current.width, h = canvasRef.current.height;
                ctx.clearRect(0, 0, w, h);
                const barWidth = Math.max(0, (lufsApprox + 60) / 60 * w);
                ctx.fillStyle = lufsApprox > -7 ? '#FF0033' : '#00E5FF';
                ctx.fillRect(0, 0, barWidth, h);
            }
        };
        draw();
        return () => cancelAnimationFrame(frameId);
    }, [analyser]);

    return (
        <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>
                <span>LOUDNESS (LUFS)</span>
                <span>CREST (dB)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace', color: stats.lufs > -7 ? '#FF0033' : '#00E5FF' }}>
                <span>{stats.lufs === "-Infinity" ? "---" : stats.lufs}</span>
                <span style={{ color: (stats.crest >= 8 && stats.crest <= 12) ? '#99CC33' : '#FF8E1E' }}>{stats.crest}</span>
            </div>
            <canvas ref={canvasRef} width={200} height={4} style={{ width: '100%', height: '4px', marginTop: '6px', borderRadius: '2px', background: '#222' }} />
        </div>
    );
};

window.WavetablePanelDisplay = WavetablePanelDisplay;
window.MasterLoudnessMonitor = MasterLoudnessMonitor;
window.VisualEnginePreview = VisualEnginePreview;
