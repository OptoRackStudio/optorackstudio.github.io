// VISUALIZERS (RETINA / HIGH-DPI SCALED)
// ═══════════════════════════════════════════════════════════════════════════

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const SpectrumAnalyzer = ({ analyser }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!analyser || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        // Dynamic sizing based on container
        const rect = canvas.getBoundingClientRect();
        const w = rect.width || 220;
        const h = rect.height || 80;
        
        canvas.width = w * dpr; 
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const timeArray = new Float32Array(analyser.frequencyBinCount);
        let animationId;
        let clipTimeout = 0;

        const draw = () => {
            animationId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            analyser.getFloatTimeDomainData(timeArray);
            
            // Check for clipping
            let isClipping = false;
            for(let i=0; i<timeArray.length; i++) {
                if (Math.abs(timeArray[i]) >= 0.99) { isClipping = true; break; }
            }
            if (isClipping) clipTimeout = 15;
            const isRed = clipTimeout > 0;
            if (clipTimeout > 0) clipTimeout--;

            const led = document.getElementById('master-clip-led');
            if (led) {
                led.style.background = isRed ? '#FF0033' : '#300';
                led.style.boxShadow = isRed ? '0 0 10px #FF0033' : 'none';
            }

            const primaryColor = isRed ? '#FF0033' : '#00E5FF';
            const bgColor = isRed ? 'rgba(255, 0, 51, 0.2)' : 'rgba(0, 229, 255, 0.2)';

            ctx.clearRect(0, 0, w, h);
            
            ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '9px Arial'; ctx.textAlign = 'center';
            FREQ_MARKERS.forEach(f => {
                const x = (Math.log(f/20) / Math.log(20000/20)) * w;
                ctx.fillText(f >= 1000 ? `${f/1000}k` : f, x, 10);
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            });

            ctx.beginPath(); ctx.moveTo(0, h);
            const nyquist = analyser.context.sampleRate / 2;
            const logMin = Math.log(20); const logMax = Math.log(20000);
            
            for (let i = 0; i < w; i++) {
                const f = Math.exp(logMin + (i / w) * (logMax - logMin));
                const bin = Math.floor(f / nyquist * dataArray.length);
                let v = dataArray[bin] / 255.0;
                v = Math.max(v, (Math.sin(Date.now() * 0.002 + i * 0.05) * 0.015 + 0.015));
                const y = h - (v * h * 0.95);
                if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
            }
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, primaryColor);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.lineTo(w, h); ctx.fillStyle = grad; ctx.globalAlpha = 0.4; ctx.fill(); ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 15; ctx.shadowColor = primaryColor;
            ctx.strokeStyle = primaryColor; ctx.lineWidth = 2.0; ctx.stroke();
            ctx.shadowBlur = 0;
        };
        draw(); return () => cancelAnimationFrame(animationId);
    }, [analyser]);
    return (
        <div className="spectrum-container" style={{ position: 'relative', width: '100%', height: '80px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
            <canvas ref={canvasRef} className="visualizer-canvas" style={{width:'100%', height:'100%'}} />
            <div id="master-clip-led" style={{ 
                position: 'absolute', top: '5px', right: '5px', width: '8px', height: '8px', 
                borderRadius: '50%', background: '#300', border: '1px solid #111',
                transition: 'background 0.05s ease, box-shadow 0.05s ease'
            }} />
            <div style={{ position: 'absolute', top: '15px', right: '4px', fontSize: '7px', color: '#666', fontWeight: 'bold' }}>CLIP</div>
        </div>
    );
};

const WavetablePanelDisplay = ({ mod, color }) => {
    const canvasRef = useRef(null);
    const bloomRef = useRef(null);
    const lastTrigRef = useRef(0);
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = 600; const h = 240;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        let animationId;
        const draw = () => {
            animationId = requestAnimationFrame(draw);
            if (!mod.currentTopo) return;
            ctx.clearRect(0, 0, w, h);
            
            // Trigger scan bloom when note gates
            if (mod.state && mod.state.lastTrig !== lastTrigRef.current) {
                lastTrigRef.current = mod.state.lastTrig;
                if (bloomRef.current) {
                    bloomRef.current.style.animation = 'none';
                    bloomRef.current.offsetHeight; // reflow
                    bloomRef.current.style.animation = 'scanBloom 0.55s cubic-bezier(0.2, 0.6, 0.4, 1) forwards';
                }
            }
            
            const isMobile = window.innerWidth < 900;
            if (window.optorackWebGLCanvas && !isMobile) {
                ctx.globalAlpha = 0.5;
                ctx.globalCompositeOperation = 'screen';
                ctx.drawImage(window.optorackWebGLCanvas, 0, 0, w, h);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1.0;
            }
            
            const resX = Math.floor(mod.params.meshRes || 64); const resZ = 32; 
            const sens = mod.params.sensitivity || 1.0;
            const warpAmt = mod.params.warp || 0; const bendAmt = mod.params.bend || 0;
            const symAmt = mod.params.sym || 0; const syncAmt = mod.params.sync || 1.0;
            const formantAmt = mod.params.formant || 1.0; const crushAmt = mod.params.crush || 0.0;
            const timeScl = mod.params.timeScl || 1.0; const freqScl = mod.params.freqScl || 1.0;
            const ampScl = mod.params.ampScl || 1.0;
            
            const warpFactor = Math.pow(2, warpAmt * 3);
            const crushSteps = crushAmt > 0 ? Math.floor(lerp(64, 2, crushAmt)) : 0;
            const fov = 250; const stepX = (w * 0.8) / resX; const stepZ = (h * 0.8) / resZ;
            
            ctx.save(); ctx.translate(w/2, h/2 + 20); 
            
            for(let z = resZ - 1; z >= 0; z--) {
                for(let x = 0; x < resX; x++) {
                    let phaseX = x / resX;
                    phaseX = (phaseX * syncAmt * timeScl) % 1.0;
                    if (symAmt > 0) {
                        let symPhase = phaseX < 0.5 ? phaseX * 2 : (1 - phaseX) * 2;
                        phaseX = lerp(phaseX, symPhase, symAmt);
                    }
                    if (bendAmt !== 0) phaseX = clamp(phaseX + Math.sin(phaseX * Math.PI) * bendAmt, 0, 1);
                    let warpedPhaseX = Math.pow(phaseX, warpFactor);
                    const mapX = Math.floor(warpedPhaseX * (DW - 1));
                    
                    let phaseY = z / resZ;
                    let read_y_norm = (phaseY * formantAmt * freqScl) % 1.0;
                    const mapY = Math.floor(read_y_norm * (DH - 1));
                    
                    let val = (mod.currentTopo && mod.currentTopo[(DH - 1 - mapY) * DW + mapX]) ? mod.currentTopo[(DH - 1 - mapY) * DW + mapX] * sens * ampScl : 0;
                    if (formantAmt > 1.0) val *= (0.5 - 0.5 * Math.cos(read_y_norm * 2 * Math.PI));
                    if (crushSteps > 0) val = Math.round(val * crushSteps) / crushSteps;
                    
                    if (val > 0.02) { 
                        const x3d = (x - resX/2) * stepX; const z3d = (z - resZ/2) * stepZ; const y3d = -Math.min(val * 100, 150); 
                        const zDepth = z3d + fov; const scale3D = fov / Math.max(10, zDepth);
                        ctx.fillStyle = color; ctx.globalAlpha = Math.min(1.0, val * 1.5); 
                        ctx.beginPath(); ctx.arc(x3d * scale3D, y3d * scale3D, Math.max(0.5, (val * 4) * scale3D), 0, Math.PI * 2); ctx.fill();
                    }
                }
            }
            
            let scanX_norm = (mod.scanPhase * syncAmt * timeScl) % 1.0;
            if (symAmt > 0) scanX_norm = lerp(scanX_norm, scanX_norm < 0.5 ? scanX_norm*2 : (1-scanX_norm)*2, symAmt);
            if (bendAmt !== 0) scanX_norm = clamp(scanX_norm + Math.sin(scanX_norm * Math.PI) * bendAmt, 0, 1);
            let warpedScanX = Math.pow(scanX_norm, warpFactor);
            const sx3d = (warpedScanX * resX - resX/2) * stepX;
            ctx.strokeStyle = '#FFF'; ctx.shadowBlur = 10; ctx.shadowColor = '#FFF'; ctx.lineWidth = 2; ctx.beginPath();
            
            for(let z = 0; z < resZ; z++) {
                let phaseY = z / resZ;
                let read_y_norm = (phaseY * formantAmt * freqScl) % 1.0;
                let topoVal = (mod.currentTopo && mod.currentTopo[(DH - 1 - Math.floor(read_y_norm * (DH-1))) * DW + Math.floor(warpedScanX * (DW-1))]) || 0;
                let val = topoVal * sens * ampScl;
                const y3d = -Math.min(val * 100, 150);
                const scale3D = fov / Math.max(10, (z - resZ/2) * stepZ + fov);
                if (z === 0) ctx.moveTo(sx3d * scale3D, y3d * scale3D); else ctx.lineTo(sx3d * scale3D, y3d * scale3D);
            }
            ctx.stroke(); 
            
            // DRAW OSCILLOSCOPE FROM SYNTH AUDIO
            if (mod.analyser && mod.analyser.getByteTimeDomainData) {
                const bufferLength = mod.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                mod.analyser.getByteTimeDomainData(dataArray);
                
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#00E5FF';
                ctx.shadowColor = '#00E5FF';
                ctx.beginPath();
                
                const sliceWidth = w / bufferLength;
                let xPos = -w/2;
                
                for(let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const yPos = (v * h/4) - h/2 - 20; // Float above the wavetable
                    if(i === 0) ctx.moveTo(xPos, yPos);
                    else ctx.lineTo(xPos, yPos);
                    xPos += sliceWidth;
                }
                ctx.stroke();
            }
            
            ctx.restore();
        };
        draw();
        return () => cancelAnimationFrame(animationId);
    }, [mod, color]);
    const wtPos = mod.params ? (mod.params.wtPos || 0) : 0;
    return (
        <div className="visualizer-scan-wrapper" style={{ width: '100%', height: '100%' }}>
            <canvas ref={canvasRef} className="visualizer-canvas-full" />
            <div ref={bloomRef} className="scan-bloom-overlay" style={{ left: '-20%', opacity: 0 }} />
            {/* WT POS bar at bottom */}
            <div className="wt-pos-bar-track">
                <div className="wt-pos-bar-fill" style={{ width: `${wtPos * 100}%` }} />
            </div>
            {/* WT POS label */}
            <div style={{
                position: 'absolute', bottom: '6px', left: '8px',
                fontSize: '8px', fontWeight: '900', letterSpacing: '1px',
                color: 'rgba(0,229,255,0.6)', fontFamily: 'Space Mono, monospace',
                textShadow: '0 0 8px rgba(0,229,255,0.4)', pointerEvents: 'none'
            }}>WT POS: {(wtPos * 100).toFixed(1)}%</div>
        </div>
    );
};

const DuckerVisualizer = ({ mod }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!mod || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = 400; const h = 120;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        let animationId;
        const draw = () => {
            animationId = requestAnimationFrame(draw);
            ctx.clearRect(0, 0, w, h);
            
            // Draw analyser waveform (background)
            if (mod.currentVisData) {
                const data = mod.currentVisData;
                ctx.beginPath();
                const sliceWidth = w * 1.0 / data.length; let x = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = data[i] / 128.0; const y = v * h / 2;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    x += sliceWidth;
                }
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 1; ctx.stroke();
            }

            // Draw current curve (yellow)
            const dsp = window.OptoRackDSP || window.OptoRackHelpers;
            if (!dsp || !dsp.getDuckerCurve || !mod.params) return;
            const curve = dsp.getDuckerCurve(mod.params.curveId || 0, mod.params.depth || 0);
            ctx.beginPath();
            for (let i = 0; i < curve.length; i++) {
                const x = (i / (curve.length - 1)) * w;
                const y = h - (curve[i] * h);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            
            // Draw playhead
            if (mod.state?.progress !== undefined && mod.state.progress >= 0 && mod.state.progress <= 1) {
                const px = mod.state.progress * w;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.fillRect(px, 0, 2, h);
            }

            // Yellow fill under curve
            ctx.lineTo(w, h); ctx.lineTo(0, h); 
            ctx.fillStyle = 'rgba(255, 204, 0, 0.2)'; ctx.fill();

            // Yellow stroke
            ctx.beginPath();
            for (let i = 0; i < curve.length; i++) {
                const x = (i / (curve.length - 1)) * w;
                const y = h - (curve[i] * h);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = '#FFCC00'; ctx.lineWidth = 3; 
            ctx.shadowBlur = 10; ctx.shadowColor = '#FFCC00';
            ctx.stroke(); ctx.shadowBlur = 0;
        };
        draw(); return () => cancelAnimationFrame(animationId);
    }, [mod]);
    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

const FilterVisualizer = ({ mod, updateParam }) => {
    const canvasRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const w = rect.width; const h = rect.height;
            canvas.width = w * dpr; canvas.height = h * dpr;
            ctx.scale(dpr, dpr);
            canvas.w = w; canvas.h = h; // Store for draw
        };
        resize();
        window.addEventListener('resize', resize);

        let animationId;
        const draw = () => {
            const w = canvas.w || 800; const h = canvas.h || 320;
            animationId = requestAnimationFrame(draw);
            ctx.clearRect(0, 0, w, h);
            
            ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
            for(let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(0, (h/4)*i); ctx.lineTo(w, (h/4)*i); ctx.stroke(); }
            
            ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '10px "Space Mono"'; ctx.textAlign = 'center';
            FREQ_MARKERS.forEach(f => {
                const x = (Math.log(f/20) / Math.log(20000/20)) * w;
                ctx.fillText(f >= 1000 ? `${f/1000}k` : f, x, 15);
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            });
            
            const numPoints = 800; 
            const freqs = new Float32Array(numPoints);
            const mag1 = new Float32Array(numPoints); const phase1 = new Float32Array(numPoints);
            const mag2 = new Float32Array(numPoints); const phase2 = new Float32Array(numPoints);
            
            for(let i=0; i<numPoints; i++) { freqs[i] = 20 * Math.pow(20000/20, i/numPoints); }
            if (mod.fB1 && mod.fB1.getFrequencyResponse) mod.fB1.getFrequencyResponse(freqs, mag1, phase1);
            if (mod.fB2 && mod.fB2.getFrequencyResponse) mod.fB2.getFrequencyResponse(freqs, mag2, phase2);
            
            // Draw 0dB reference line
            ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, h * 0.4); ctx.lineTo(w, h * 0.4); ctx.stroke(); ctx.setLineDash([]);

            ctx.beginPath(); 
            ctx.lineWidth = 4; 
            ctx.strokeStyle = '#99CC33'; 
            
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(153, 204, 51, 0.35)');
            grad.addColorStop(0.4, 'rgba(153, 204, 51, 0.15)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            
            let firstY = h;
            for(let i=0; i<numPoints; i++) {
                let totalMag = mag1[i] * mag2[i]; 
                let db = 20 * Math.log10(Math.max(totalMag, 0.0001)); 
                // Anchor 0dB at 40% height, 80dB range for pro surgical view
                let y = (h * 0.4) - (db * (h / 80));
                y = clamp(y, -10, h + 10);
                const x = (i / numPoints) * w;
                if (i === 0) { ctx.moveTo(x, y); firstY = y; } else { ctx.lineTo(x, y); }
            }
            
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.lineTo(0, firstY);
            ctx.closePath();
            
            ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(153, 204, 51, 0.6)';
            ctx.fill(); 
            ctx.shadowBlur = 0;
            ctx.stroke(); 
            
            const actualCut = mod.actualCut || mod.params?.cut || 1000; 
            const res = mod.params?.res || 0;
            const hX = (Math.log(actualCut/20) / Math.log(20000/20)) * w; 
            const hY = h - (res / 30) * (h * 0.8) - 15; 
            
            ctx.beginPath(); 
            ctx.shadowBlur = 15; ctx.shadowColor = '#FFF';
            ctx.arc(hX, hY, 8, 0, Math.PI*2); 
            ctx.fillStyle = '#FFF'; ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
        };
        draw(); return () => cancelAnimationFrame(animationId);
    }, [mod]);
    
    const handlePointerDown = (e) => {
        e.stopPropagation(); setIsDragging(true);
        const rect = canvasRef.current.getBoundingClientRect();
        const onMove = (me) => {
            const x = clamp(me.clientX - rect.left, 0, rect.width); const y = clamp(me.clientY - rect.top, 0, rect.height);
            const newCut = 20 * Math.pow(20000/20, x/rect.width); const newRes = 30 - (y/rect.height) * 30;
            updateParam(mod.id, 'cut', newCut); updateParam(mod.id, 'res', newRes);
        };
        const onUp = () => { setIsDragging(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    };
    return <canvas ref={canvasRef} className="visualizer-canvas" style={{height:'120px', cursor: isDragging ? 'grabbing' : 'grab'}} onPointerDown={handlePointerDown} />;
};

const EnvVisualizer = ({ mod }) => {
    const canvasRef = useRef(null);
    const bloomRef = useRef(null);
    const lastTrigRef = useRef(0);
    useEffect(() => {
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        // Use actual element width for proper proportions
        const w = canvas.parentElement ? canvas.parentElement.clientWidth || 280 : 280;
        const h = 70;
        canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);
        
        let aniId;
        const draw = () => {
            // Trigger bloom on note gate
            if (mod.state && mod.state.lastTrig !== lastTrigRef.current) {
                lastTrigRef.current = mod.state.lastTrig;
                if (bloomRef.current) {
                    bloomRef.current.style.animation = 'none';
                    bloomRef.current.offsetHeight;
                    bloomRef.current.style.animation = 'scanBloom 0.55s cubic-bezier(0.2, 0.6, 0.4, 1) forwards';
                }
            }

            if (!mod.params) return;
            const { atk, hold, dec, sus, rel } = mod.params;
            ctx.clearRect(0, 0, w, h);
            
            // Subtle grid
            ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
            for(let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(0, (h/4)*i); ctx.lineTo(w, (h/4)*i); ctx.stroke(); }

            const safeHold = hold || 0;
            // Normalize so total always fills the width regardless of params
            const totalTime = Math.max(0.05, atk + safeHold + dec + Math.max(0.2, rel * 0.5) + 0.15);
            const margin = 4;
            const drawW = w - margin * 2;
            const xAtk  = margin + (atk / totalTime) * drawW;
            const xHold = xAtk + (safeHold / totalTime) * drawW;
            const xDec  = xHold + (dec / totalTime) * drawW;
            const xSus  = xDec + (0.15 / totalTime) * drawW;
            const xRel  = margin + drawW;
            const ySus  = 6 + (1 - sus) * (h - 12);

            // Filled shape
            ctx.beginPath();
            ctx.moveTo(margin, h - 2);
            ctx.lineTo(xAtk, 4);
            if(safeHold > 0.001) ctx.lineTo(xHold, 4);
            ctx.quadraticCurveTo(xHold + (xDec - xHold) * 0.6, ySus - 6, xDec, ySus);
            ctx.lineTo(xSus, ySus);
            ctx.quadraticCurveTo(xSus + (xRel - xSus) * 0.6, h - 2, xRel, h - 2);
            ctx.closePath();

            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(0,229,255,0.25)');
            grad.addColorStop(1, 'rgba(0,229,255,0.03)');
            ctx.fillStyle = grad; ctx.fill();

            ctx.beginPath();
            ctx.moveTo(margin, h - 2);
            ctx.lineTo(xAtk, 4);
            if(safeHold > 0.001) ctx.lineTo(xHold, 4);
            ctx.quadraticCurveTo(xHold + (xDec - xHold) * 0.6, ySus - 6, xDec, ySus);
            ctx.lineTo(xSus, ySus);
            ctx.quadraticCurveTo(xSus + (xRel - xSus) * 0.6, h - 2, xRel, h - 2);
            ctx.shadowBlur = 6; ctx.shadowColor = '#00E5FF';
            ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.shadowBlur = 0;

            // Stage dots
            ctx.fillStyle = '#FFF';
            [[xAtk, 4], [xHold > xAtk + 2 ? xHold : -99, 4], [xDec, ySus], [xSus, ySus]]
                .filter(([px]) => px >= margin && px <= xRel)
                .forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2); ctx.fill(); });
            
            // ── REAL-TIME PLAYHEAD ──────────────────────────────────────────
            const dsp = window.OptoRackApp?.cDsp?.current?.modules[mod.id];
            const dspState = dsp?.state;
            if (dspState && dspState.lastTrig > 0) {
                const elapsed = (performance.now() - dspState.lastTrig) / 1000;
                if (elapsed < totalTime) {
                    const px = margin + (elapsed / totalTime) * drawW;
                    ctx.beginPath();
                    ctx.moveTo(px, 0); ctx.lineTo(px, h);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.lineWidth = 1; ctx.stroke();
                    
                    // Glow dot on playhead
                    let py = h - 2;
                    if (elapsed < atk) py = 4 + (1 - elapsed / atk) * (h - 6);
                    else if (elapsed < atk + safeHold) py = 4;
                    else if (elapsed < atk + safeHold + dec) py = 4 + ((elapsed - atk - safeHold) / dec) * (ySus - 4);
                    else py = ySus;
                    
                    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI*2);
                    ctx.fillStyle = '#FFF'; ctx.shadowBlur = 10; ctx.shadowColor = '#00E5FF';
                    ctx.fill(); ctx.shadowBlur = 0;
                }
            }
            
            aniId = requestAnimationFrame(draw);
        };
        draw(); return () => cancelAnimationFrame(aniId);
    }, [mod.params?.atk, mod.params?.hold, mod.params?.dec, mod.params?.sus, mod.params?.rel]);
    return (
        <div className="visualizer-scan-wrapper" style={{ height: '70px', width: '100%' }}>
            <canvas ref={canvasRef} className="visualizer-canvas" style={{ height: '70px', width: '100%' }} />
            <div ref={bloomRef} className="scan-bloom-overlay" style={{ left: '-20%', opacity: 0 }} />
        </div>
    );
};

const LfoVisualizer = ({ mod }) => {
    const canvasRef = useRef(null);
    const bloomRef = useRef(null);
    const lastTrigRef = useRef(0);
    useEffect(() => {
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1; const w = 120; const h = 60;
        canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);

        let aniId;
        const draw = () => {
            // Trigger bloom
            if (mod.state && mod.state.lastTrig !== lastTrigRef.current) {
                lastTrigRef.current = mod.state.lastTrig;
                if (bloomRef.current) {
                    bloomRef.current.style.animation = 'none';
                    bloomRef.current.offsetHeight;
                    bloomRef.current.style.animation = 'scanBloom 0.55s cubic-bezier(0.2, 0.6, 0.4, 1) forwards';
                }
            }

            if (!mod.params) return;
            const { lfoWave: wave, lfoRate: rate } = mod.params;
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke();

            // LFO fill gradient
            ctx.beginPath();
            for(let x=0; x<w; x++) {
                let phase = x / w; let val = 0;
                if (wave === 0) val = Math.sin(phase * Math.PI * 2); 
                else if (wave === 1) val = Math.abs((phase * 4) % 4 - 2) - 1; 
                else if (wave === 2) val = (phase * 2) - 1; 
                else if (wave === 3) val = phase < 0.5 ? 1 : -1; 
                let y = h/2 - (val * (h/2 - 4));
                if (x===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            const lfoGrad = ctx.createLinearGradient(0, 0, 0, h);
            lfoGrad.addColorStop(0, 'rgba(178, 102, 255, 0.2)');
            lfoGrad.addColorStop(1, 'rgba(178, 102, 255, 0)');
            ctx.lineTo(w, h/2); ctx.lineTo(0, h/2);
            ctx.fillStyle = lfoGrad; ctx.fill();

            ctx.beginPath(); ctx.strokeStyle = '#B266FF'; ctx.lineWidth = 2;
            ctx.shadowBlur = 6; ctx.shadowColor = '#B266FF';
            for(let x=0; x<w; x++) {
                let phase = x / w; let val = 0;
                if (wave === 0) val = Math.sin(phase * Math.PI * 2); 
                else if (wave === 1) val = Math.abs((phase * 4) % 4 - 2) - 1; 
                else if (wave === 2) val = (phase * 2) - 1; 
                else if (wave === 3) val = phase < 0.5 ? 1 : -1; 
                let y = h/2 - (val * (h/2 - 4));
                if (x===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke(); ctx.shadowBlur = 0;

            // Animated Playhead Dot
            const time = performance.now() / 1000;
            const curPhase = (time * rate) % 1.0;
            let curVal = 0;
            if (wave === 0) curVal = Math.sin(curPhase * Math.PI * 2); 
            else if (wave === 1) curVal = Math.abs((curPhase * 4) % 4 - 2) - 1; 
            else if (wave === 2) curVal = (curPhase * 2) - 1; 
            else if (wave === 3) curVal = curPhase < 0.5 ? 1 : -1;
            
            ctx.beginPath(); ctx.arc(curPhase * w, h/2 - (curVal * (h/2 - 4)), 3.5, 0, Math.PI*2);
            ctx.fillStyle = '#FFF'; ctx.shadowBlur = 10; ctx.shadowColor = '#B266FF'; ctx.fill(); ctx.shadowBlur = 0;
            
            aniId = requestAnimationFrame(draw);
        };
        draw(); return () => cancelAnimationFrame(aniId);
    }, [mod.params?.lfoWave, mod.params?.lfoRate]);
    return (
        <div className="visualizer-scan-wrapper" style={{ height: '60px' }}>
            <canvas ref={canvasRef} className="visualizer-canvas" style={{height:'60px'}} />
            <div ref={bloomRef} className="scan-bloom-overlay" style={{ left: '-20%', opacity: 0 }} />
        </div>
    );
};


const ParametricEQ = ({ mod, updateParam }) => {
    const canvasRef = useRef(null);
    const dragNodeRef = useRef(null);
    const hoverNodeRef = useRef(null);
    const [, forceRender] = useState(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            canvas._w = rect.width;
            canvas._h = rect.height;
        };
        resize();
        window.addEventListener('resize', resize);

        const bands = mod.nodes?.bands;
        const analyser = mod.nodes?.analyser;
        if (!bands || !analyser) return;
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        let animId;

        const LOG_MIN = Math.log(20);
        const LOG_MAX = Math.log(20000);
        const freqToX = (f, w) => (Math.log(Math.max(f, 20)) - LOG_MIN) / (LOG_MAX - LOG_MIN) * w;
        const dbToY = (db, h) => h / 2 - db * (h / 40);
        const xToFreq = (x, w) => Math.exp(LOG_MIN + (x / w) * (LOG_MAX - LOG_MIN));
        const yToDb = (y, h) => (h / 2 - y) / (h / 40);

        const draw = () => {
            const w = canvas._w || 600;
            const h = canvas._h || 300;
            ctx.clearRect(0, 0, w, h);

            // --- Grid ---
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, h / 8 * i); ctx.lineTo(w, h / 8 * i); ctx.stroke(); }

            // --- Zone labels ---
            const zones = [{ name: 'SUB', f: 20 }, { name: 'BASS', f: 40 }, { name: 'LOW MID', f: 160 }, { name: 'MID', f: 500 }, { name: 'UP MID', f: 2500 }, { name: 'HIGH', f: 5000 }, { name: 'EXT HIGH', f: 10000 }];
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            zones.forEach(z => {
                const x = freqToX(z.f, w);
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h);
                ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();
                ctx.fillText(z.name, x + 24, 13);
            });

            // --- Spectrum background (purely visual, never affects curve) ---
            analyser.getByteFrequencyData(freqData);
            const hasSignal = freqData.some(v => v > 0);
            if (hasSignal) {
                const sliceW = w / (freqData.length / 2);
                for (let i = 0; i < freqData.length / 2; i++) {
                    const val = freqData[i];
                    if (val > 2) {
                        const intensity = val / 255;
                        ctx.fillStyle = `rgba(${Math.floor(30 + 180 * intensity)}, ${Math.floor(30 + 60 * intensity * intensity)}, ${Math.floor(80 - 50 * intensity)}, ${intensity * 0.45})`;
                        ctx.fillRect(i * sliceW, h * (1 - intensity * 0.8), Math.ceil(sliceW), h * intensity * 0.8);
                    }
                }
            }

            // --- EQ Curve (always drawn from mod.params, NEVER from analyser) ---
            const numPts = Math.floor(w);
            const freqs = new Float32Array(numPts);
            for (let i = 0; i < numPts; i++) freqs[i] = xToFreq(i, w);

            const magResponses = bands.map(() => new Float32Array(numPts));
            const phaseResponses = bands.map(() => new Float32Array(numPts));
            bands.forEach((b, i) => { if (b && b.getFrequencyResponse) b.getFrequencyResponse(freqs, magResponses[i], phaseResponses[i]); });

            // Filled curve
            ctx.beginPath();
            for (let i = 0; i < numPts; i++) {
                let mag = 1.0;
                for (let j = 0; j < bands.length; j++) mag *= magResponses[j][i];
                const db = 20 * Math.log10(Math.max(mag, 1e-6));
                const y = dbToY(db, h);
                if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i, y);
            }
            ctx.lineTo(w, h / 2); ctx.lineTo(0, h / 2); ctx.closePath();
            ctx.fillStyle = 'rgba(0, 229, 255, 0.07)';
            ctx.fill();

            // Curve line
            ctx.beginPath();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#00E5FF';
            ctx.shadowBlur = 6; ctx.shadowColor = '#00E5FF';
            for (let i = 0; i < numPts; i++) {
                let mag = 1.0;
                for (let j = 0; j < bands.length; j++) mag *= magResponses[j][i];
                const db = 20 * Math.log10(Math.max(mag, 1e-6));
                const y = dbToY(db, h);
                if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 0dB center line
            ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]);

            // --- Band nodes with collision spread ---
            const nodePositions = bands.map((_, i) => {
                const f = mod.params[`b${i + 1}f`] || 100;
                const db = mod.params[`b${i + 1}g`] || 0;
                return { x: freqToX(f, w), y: dbToY(db, h), i };
            });

            // Spread overlapping nodes horizontally
            for (let a = 0; a < nodePositions.length; a++) {
                for (let b2 = a + 1; b2 < nodePositions.length; b2++) {
                    const dx = nodePositions[b2].x - nodePositions[a].x;
                    const dy = nodePositions[b2].y - nodePositions[a].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 18 && dist > 0.01) {
                        const push = (18 - dist) / 2;
                        const nx = dx / dist; const ny = dy / dist;
                        nodePositions[a].x -= nx * push;
                        nodePositions[a].y -= ny * push;
                        nodePositions[b2].x += nx * push;
                        nodePositions[b2].y += ny * push;
                    }
                }
            }

            // Clamp all node positions to canvas bounds so edge bands (20Hz, 20kHz) are never clipped
            const PAD = 12;
            nodePositions.forEach(pos => {
                pos.x = Math.max(PAD, Math.min(w - PAD, pos.x));
                pos.y = Math.max(PAD, Math.min(h - PAD, pos.y));
            });

            nodePositions.forEach(({ x, y, i }) => {
                const isDragging = dragNodeRef.current === i;
                const isHovered = hoverNodeRef.current === i;
                const q = mod.params[`b${i + 1}q`] || 1;
                const qRadius = Math.max(6, Math.min(14, q * 2));
                const hue = Math.round((i / bands.length) * 360);

                // Q ring indicator
                if (isDragging || isHovered) {
                    ctx.beginPath();
                    ctx.arc(x, y, qRadius + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.4)`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                ctx.beginPath();
                ctx.arc(x, y, 9, 0, Math.PI * 2);
                ctx.fillStyle = isDragging ? '#FFF' : `hsl(${hue}, 75%, 60%)`;
                ctx.shadowBlur = isDragging ? 15 : (isHovered ? 10 : 4);
                ctx.shadowColor = `hsl(${hue}, 80%, 70%)`;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = isDragging ? '#111' : '#fff';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(i + 1, x, y);
            });

            animId = requestAnimationFrame(draw);
        };

        draw();
        return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
    }, [mod]);

    const getNodeAt = (ex, ey) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ex - rect.left; const y = ey - rect.top;
        const w = rect.width; const h = rect.height;
        let closest = -1; let minDist = 22;
        for (let i = 0; i < mod.nodes.bands.length; i++) {
            const f = mod.params[`b${i + 1}f`] || 100;
            const db = mod.params[`b${i + 1}g`] || 0;
            const LOG_MIN = Math.log(20); const LOG_MAX = Math.log(20000);
            const nx = (Math.log(Math.max(f, 20)) - LOG_MIN) / (LOG_MAX - LOG_MIN) * w;
            const ny = h / 2 - db * (h / 40);
            const dist = Math.sqrt((nx - x) ** 2 + (ny - y) ** 2);
            if (dist < minDist) { minDist = dist; closest = i; }
        }
        return closest;
    };

    const handlePointerMove = (e) => {
        if (dragNodeRef.current !== null) return;
        const hit = getNodeAt(e.clientX, e.clientY);
        if (hit !== hoverNodeRef.current) { hoverNodeRef.current = hit; forceRender(p => p + 1); }
    };

    const handlePointerDown = (e) => {
        e.stopPropagation();
        const hit = getNodeAt(e.clientX, e.clientY);
        if (hit === -1) return;
        dragNodeRef.current = hit;
        forceRender(p => p + 1);

        const rect = canvasRef.current.getBoundingClientRect();
        const w = rect.width; const h = rect.height;
        const LOG_MIN = Math.log(20); const LOG_MAX = Math.log(20000);

        const onMove = (me) => {
            const mx = clamp(me.clientX - rect.left, 0, w);
            const my = clamp(me.clientY - rect.top, 0, h);
            const newF = Math.exp(LOG_MIN + (mx / w) * (LOG_MAX - LOG_MIN));
            const newG = clamp((h / 2 - my) / (h / 40), -18, 18);
            const ct = mod.nodes.bands[hit].context.currentTime;
            mod.nodes.bands[hit].frequency.setTargetAtTime(newF, ct, 0.01);
            mod.nodes.bands[hit].gain.setTargetAtTime(newG, ct, 0.01);
            mod.params[`b${hit + 1}f`] = newF;
            mod.params[`b${hit + 1}g`] = newG;
            mod.baseParams[`b${hit + 1}f`] = newF;
            mod.baseParams[`b${hit + 1}g`] = newG;
        };
        const onUp = () => {
            updateParam(`b${hit + 1}f`, mod.params[`b${hit + 1}f`]);
            dragNodeRef.current = null;
            forceRender(p => p + 1);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const handleWheel = (e) => {
        e.stopPropagation();
        // Find closest node to cursor at ALL TIMES (not just when dragging)
        let target = dragNodeRef.current !== null ? dragNodeRef.current : getNodeAt(e.clientX, e.clientY);
        if (target === -1 || target === null) return;
        const currentQ = mod.params[`b${target + 1}q`] || 1.0;
        const newQ = clamp(currentQ * (e.deltaY > 0 ? 0.9 : 1.1), 0.1, 18.0);
        const ct = mod.nodes.bands[target].context.currentTime;
        mod.nodes.bands[target].Q.setTargetAtTime(newQ, ct, 0.01);
        mod.params[`b${target + 1}q`] = newQ;
        mod.baseParams[`b${target + 1}q`] = newQ;
        updateParam(`b${target + 1}q`, newQ);
    };

    const handlePointerLeave = () => { hoverNodeRef.current = null; forceRender(p => p + 1); };

    return <canvas ref={canvasRef} className="eq-canvas"
        style={{ cursor: dragNodeRef.current !== null ? 'grabbing' : 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
    />;
};


const WebGLBackground = ({ videoRef, wireColor, sharedStateRef, visualTemplate = 'PARTICLES', visualSettings = {}, camRef }) => {
    const containerRef = useRef(null);
    const sceneRef = useRef(null);
    const materialRef = useRef(null);
    
    const settingsRef = useRef(visualSettings);
    useEffect(() => { settingsRef.current = visualSettings; }, [visualSettings]);

    useEffect(() => {
        if (!containerRef.current) return;
        try {
            const w = window.innerWidth; const h = window.innerHeight;
            const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x050505, 0.001); sceneRef.current = scene;
            const camera = new THREE.PerspectiveCamera(50, w / h, 1, 3000); camera.position.set(0, 100, 600); camera.lookAt(0, 0, 0);
            const renderer = new THREE.WebGLRenderer({ 
                antialias: true, 
                alpha: true, 
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
                desynchronized: true
            });
            renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            containerRef.current.appendChild(renderer.domElement);
            window.optorackWebGLCanvas = renderer.domElement;

            const DW = window.DW || 64;
            const DH = window.DH || 64;

            const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; const context = canvas.getContext('2d');
            const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
            gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)'); gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = gradient; context.fillRect(0, 0, 32, 32); const particleTexture = new THREE.CanvasTexture(canvas);
            let dataTexture; let dataCanvas; let imageData;
            if (videoRef && videoRef.current) {
                dataTexture = new THREE.VideoTexture(videoRef.current);
                dataTexture.minFilter = THREE.LinearFilter;
                dataTexture.magFilter = THREE.LinearFilter;
                dataTexture.format = THREE.RGBAFormat;
            } else {
                dataCanvas = document.createElement('canvas'); dataCanvas.width = DW; dataCanvas.height = DH;
                dataTexture = new THREE.CanvasTexture(dataCanvas); dataTexture.minFilter = THREE.LinearFilter; dataTexture.magFilter = THREE.LinearFilter;
                imageData = new ImageData(DW, DH);
            }
            
            // Optimization: Reduce vertex count for mobile stability (256x192 vs 512x384)
            const geometry = new THREE.PlaneGeometry(1600, 1200, 256, 192); geometry.rotateX(-Math.PI / 2);
            const fullGeom = new THREE.PlaneGeometry(window.innerWidth * 2, window.innerHeight * 2);
            const geometries = [geometry, fullGeom];
            let material;
            let renderObject;

            const commonUniforms = {
                tVideo: { value: dataTexture }, uColor: { value: new THREE.Color(wireColor) },
                uTime: { value: 0.0 }, uScanX: { value: 0.0 }, uWarp: { value: 0.0 }, uBend: { value: 0.0 }, uSym: { value: 0.0 },
                uSync: { value: 1.0 }, uFormant: { value: 1.0 }, uTimeScl: { value: 1.0 }, uFreqScl: { value: 1.0 }, uAmpScl: { value: 1.0 },
                uNoiseLvl: { value: 0.0 }, uCrush: { value: 0.0 }, uHarm: { value: 1.0 }, uFmAmt: { value: 0.0 }, uLfoAmt: { value: 0.0 },
                uCamSens: { value: 1.0 }, uCamContrast: { value: 1.0 }, uCamFreq: { value: 1.0 }
            };

            const shaderUtils = `
                float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
                
                // Simplex 3D noise
                vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
                vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
                float snoise(vec3 v){ 
                  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                  vec3 i  = floor(v + dot(v, C.yyy) );
                  vec3 x0 =   v - i + dot(i, C.xxx) ;
                  vec3 g = step(x0.yzx, x0.xyz);
                  vec3 l = 1.0 - g;
                  vec3 i1 = min( g.xyz, l.zxy );
                  vec3 i2 = max( g.xyz, l.zxy );
                  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
                  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
                  vec3 x3 = x0 - 1. + 3.0 * C.xxx;
                  i = mod(i, 289.0 ); 
                  vec4 p = permute( permute( permute( 
                             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                  float n_ = 1.0/7.0;
                  vec3  ns = n_ * D.wyz - D.xzx;
                  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
                  vec4 x_ = floor(j * ns.z);
                  vec4 y_ = floor(j - 7.0 * x_ );
                  vec4 x = x_ *ns.x + ns.yyyy;
                  vec4 y = y_ *ns.x + ns.yyyy;
                  vec4 h = 1.0 - abs(x) - abs(y);
                  vec4 b0 = vec4( x.xy, y.xy );
                  vec4 b1 = vec4( x.zw, y.zw );
                  vec4 s0 = floor(b0)*2.0 + 1.0;
                  vec4 s1 = floor(b1)*2.0 + 1.0;
                  vec4 sh = -step(h, vec4(0.0));
                  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                  vec3 p0 = vec3(a0.xy,h.x);
                  vec3 p1 = vec3(a0.zw,h.y);
                  vec3 p2 = vec3(a1.xy,h.z);
                  vec3 p3 = vec3(a1.zw,h.w);
                  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                  m = m * m;
                  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
                }
                
                float fbm(vec3 p) {
                    float v = 0.0; float a = 0.5; vec3 shift = vec3(100);
                    for (int i = 0; i < 4; ++i) { v += a * snoise(p); p = p * 2.0 + shift; a *= 0.5; }
                    return v;
                }
                float getCamData(sampler2D tex, vec2 uv, float sens, float contrast) {
                    vec4 c = texture2D(tex, uv);
                    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
                    luma = pow(luma, contrast) * sens;
                    return clamp(luma, 0.0, 2.0);
                }
            `;

            if (visualTemplate === 'WIREFRAME_TERRAIN') {
                material = new THREE.ShaderMaterial({
                    wireframe: true,
                    uniforms: { ...commonUniforms, uElevationMult: { value: 400.0 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uWarp; uniform float uBend; uniform float uSym;
                        uniform float uSync; uniform float uFormant; uniform float uTimeScl; uniform float uFreqScl; uniform float uAmpScl;
                        uniform float uElevationMult; uniform float uHarm;
                        varying vec2 vUv; varying float vElevation;
                        void main() {
                            vUv = uv; vec3 pos = position;
                            float phase = uv.x; phase = mod(phase * uSync * uTimeScl * uHarm, 1.0);
                            if (uSym > 0.0) { float symPhase = phase < 0.5 ? phase * 2.0 : (1.0 - phase) * 2.0; phase = mix(phase, symPhase, uSym); }
                            if (uBend != 0.0) phase = clamp(phase + sin(phase * 3.14159) * uBend, 0.0, 1.0);
                            float warpFactor = pow(2.0, uWarp * 3.0); float warpedPhase = pow(phase, warpFactor);
                            float read_y_norm = mod(uv.y * uFormant * uFreqScl, 1.0);
                            float luma = getCamData(tVideo, vec2(uv.x, uv.y), uCamSens, uCamContrast);
                            vElevation = luma;
                            pos.y += luma * uElevationMult; 
                            pos.y += fbm(vec3(pos.x * 0.002 * uCamFreq, pos.z * 0.002 * uCamFreq, uTime * 0.2)) * 80.0 * luma;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform vec3 uColor; uniform float uScanX; uniform float uHarm;
                        varying float vElevation; varying vec2 vUv;
                        void main() {
                            float distToScan = abs(vUv.x - uScanX); float scanGlow = smoothstep(0.02, 0.0, distToScan) * 1.5;
                            vec3 baseColor = mix(uColor * 0.2, uColor * (1.0 + uHarm*0.5), vElevation);
                            vec3 finalColor = baseColor + (uColor * scanGlow);
                            gl_FragColor = vec4(finalColor, 0.4 + vElevation * 0.6);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(geometry, material);

            } else if (visualTemplate === 'NEON_WAVES') {
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uWaveCount: { value: 10.0 }, uGlow: { value: 1.5 } },
                    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                    fragmentShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform vec3 uColor; uniform float uScanX;
                        uniform float uWarp; uniform float uBend; uniform float uSym; uniform float uSync; uniform float uFormant; uniform float uTimeScl; uniform float uFreqScl; uniform float uAmpScl;
                        uniform float uWaveCount; uniform float uGlow; uniform float uHarm;
                        varying vec2 vUv;
                        void main() {
                            float phase = vUv.x; phase = mod(phase * uSync * uTimeScl, 1.0);
                            if (uSym > 0.0) { float symPhase = phase < 0.5 ? phase * 2.0 : (1.0 - phase) * 2.0; phase = mix(phase, symPhase, uSym); }
                            if (uBend != 0.0) phase = clamp(phase + sin(phase * 3.14159) * uBend, 0.0, 1.0);
                            float warpFactor = pow(2.0, uWarp * 3.0); float warpedPhase = pow(phase, warpFactor);
                            float read_y_norm = mod(vUv.y * uFormant * uFreqScl, 1.0);
                            float luma = getCamData(tVideo, vec2(warpedPhase, read_y_norm), uCamSens, uCamContrast);
                            
                            float lines = 0.0;
                            int harms = int(max(1.0, uHarm * 5.0));
                            for(int i=1; i<=5; i++) {
                                if (i > harms) break;
                                float fi = float(i);
                                float noiseVal = snoise(vec3(vUv.x * 2.0, vUv.y * 2.0, uTime * 0.1 * fi));
                                float line = sin(vUv.y * uWaveCount * fi * 3.14159 + uTime * fi + luma * 10.0 + noiseVal * 2.0);
                                lines += (uGlow * 0.02) / abs(line);
                            }
                            
                            float distToScan = abs(vUv.x - uScanX); float scanGlow = smoothstep(0.02, 0.0, distToScan) * 0.5;
                            vec3 finalColor = uColor * lines * (0.5 + luma) + (uColor * scanGlow);
                            gl_FragColor = vec4(finalColor, clamp(lines, 0.0, 1.0));
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(fullGeom, material);
                camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'DEJA_VU') {
                const dejaGeom = new THREE.PlaneGeometry(1600, 1200, 256, 192); geometries.push(dejaGeom);
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uPointSize: { value: 2.0 }, uDepthScale: { value: 800.0 }, uGhosting: { value: 0.5 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uAmpScl; uniform float uDepthScale; uniform float uPointSize;
                        uniform float uFmAmt; uniform float uLfoAmt;
                        varying vec2 vUv; varying vec3 vColor; varying float vLuma;
                        void main() {
                            vUv = uv; 
                            vec4 tex = texture2D(tVideo, uv);
                            float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114)) * uAmpScl;
                            vLuma = luma;
                            
                            vec3 pos = position;
                            // Environment folding: create a 'room' or 'void'
                            float noise = fbm(vec3(pos.x * 0.001, pos.y * 0.001, uTime * 0.3 + luma));
                            pos.z += luma * uDepthScale;
                            pos.z += noise * 300.0 * (1.0 + uFmAmt);
                            
                            // 3D Environment warp
                            float angle = pos.x * 0.002 + uTime * 0.5;
                            pos.x += cos(angle) * luma * 100.0;
                            pos.y += sin(angle) * luma * 100.0;
                            
                            vColor = tex.rgb;
                            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                            gl_PointSize = (uPointSize + luma * 15.0) * (1200.0 / length(mvPosition.xyz));
                            gl_Position = projectionMatrix * mvPosition;
                        }
                    `,
                    fragmentShader: `
                        varying vec2 vUv; varying vec3 vColor; varying float vLuma;
                        uniform vec3 uColor; uniform float uTime; uniform float uScanX; uniform float uGhosting;
                        void main() {
                            if (length(gl_PointCoord - 0.5) > 0.5) discard;
                            
                            float scan = smoothstep(0.01, 0.0, abs(vUv.x - uScanX));
                            vec3 col = mix(vColor, uColor, 0.4);
                            col += uColor * scan * 2.0;
                            
                            // Procedural ghosting/glitch
                            float glitch = step(0.98, fract(sin(vUv.y * 100.0 + uTime) * 43758.5453));
                            col = mix(col, vec3(1.0), glitch * uGhosting * vLuma);
                            
                            gl_FragColor = vec4(col, 0.7 + scan * 0.3);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Points(dejaGeom, material);
                camera.position.set(0, 100, 700); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'NATURAL_WORLD') {
                const natGeom = new THREE.PlaneGeometry(2000, 1500, 256, 192); geometries.push(natGeom);
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uPointSize: { value: 1.5 }, uDepthScale: { value: 1200.0 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uAmpScl; uniform float uDepthScale; uniform float uPointSize;
                        uniform float uFmAmt; uniform float uLfoAmt;
                        varying vec2 vUv; varying vec3 vColor; varying float vLuma;
                        void main() {
                            vUv = uv;
                            vec4 tex = texture2D(tVideo, uv);
                            float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114)) * uAmpScl;
                            vLuma = luma;
                            
                            vec3 pos = position;
                            
                            // Procedural Nature: Forests & Growth
                            // Low frequency drives roots/ground, High frequency drives swarms/air
                            float ground = fbm(vec3(pos.x * 0.001, pos.y * 0.001, 0.0));
                            float growth = fbm(vec3(pos.x * 0.005, pos.y * 0.005, uTime * 0.1)) * luma;
                            
                            pos.z += ground * 200.0;
                            pos.z += growth * uDepthScale;
                            
                            // Flocking / Swarm behavior (High-end energy)
                            float swarm = snoise(vec3(pos.x * 0.01, pos.y * 0.01, uTime * 0.8)) * luma;
                            pos.x += swarm * 150.0 * uLfoAmt;
                            pos.y += swarm * 150.0 * uLfoAmt;
                            pos.z += swarm * 300.0 * uFmAmt;
                            
                            vColor = tex.rgb;
                            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                            gl_PointSize = (uPointSize + luma * 12.0) * (1000.0 / length(mvPosition.xyz));
                            gl_Position = projectionMatrix * mvPosition;
                        }
                    `,
                    fragmentShader: `
                        varying vec2 vUv; varying vec3 vColor; varying float vLuma;
                        uniform vec3 uColor; uniform float uTime;
                        void main() {
                            if (length(gl_PointCoord - 0.5) > 0.5) discard;
                            
                            // Nature Palette: Greens, Moss, Bioluminescence
                            vec3 natureCol = mix(vec3(0.1, 0.2, 0.05), vec3(0.4, 0.8, 0.2), vLuma);
                            natureCol = mix(natureCol, uColor, 0.3);
                            
                            // Bioluminescent pulses
                            float pulse = sin(vLuma * 10.0 - uTime * 3.0) * 0.5 + 0.5;
                            natureCol += vec3(0.8, 1.0, 0.6) * pulse * vLuma;
                            
                            gl_FragColor = vec4(natureCol, 0.6 + vLuma * 0.4);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Points(natGeom, material);
                camera.position.set(0, 300, 1000); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'AR_ENVIRONMENT') {
                const arGeom = new THREE.PlaneGeometry(2000, 1500, 256, 192); geometries.push(arGeom);
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uDepthScale: { value: 600.0 }, uOcclusion: { value: 0.8 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uAmpScl; uniform float uDepthScale;
                        varying vec2 vUv; varying vec3 vColor; varying float vLuma;
                        void main() {
                            vUv = uv;
                            vec4 tex = texture2D(tVideo, uv);
                            float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114)) * uAmpScl;
                            vLuma = luma;
                            
                            vec3 pos = position;
                            // Anchoring to luma-depth
                            pos.z += luma * uDepthScale;
                            
                            // Holographic grid alignment
                            float grid = step(0.95, fract(pos.x * 0.05)) + step(0.95, fract(pos.y * 0.05));
                            pos.z += grid * 20.0 * luma;
                            
                            vColor = tex.rgb;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                        }
                    `,
                    fragmentShader: `
                        varying vec2 vUv; varying vec3 vColor; varying float vLuma;
                        uniform vec3 uColor; uniform float uTime; uniform float uOcclusion;
                        void main() {
                            vec3 col = mix(vColor, uColor, 0.3);
                            
                            // AR Scanlines
                            float scan = sin(vUv.y * 800.0 + uTime * 10.0) * 0.1 + 0.9;
                            col *= scan;
                            
                            // Depth-based transparency (occlusion proxy)
                            float alpha = mix(1.0, 0.4, (1.0 - vLuma) * uOcclusion);
                            
                            gl_FragColor = vec4(col, alpha);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(arGeom, material);
                camera.position.set(0, 100, 800); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'HUD_DATAMESH') {
                const hudGeom = new THREE.PlaneGeometry(2000, 1500, 128, 96); geometries.push(hudGeom);
                material = new THREE.ShaderMaterial({
                    wireframe: true,
                    uniforms: { ...commonUniforms, uHudGlow: { value: 1.0 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uAmpScl;
                        varying vec2 vUv; varying float vLuma;
                        void main() {
                            vUv = uv;
                            vec4 tex = texture2D(tVideo, uv);
                            float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114)) * uAmpScl;
                            vLuma = luma;
                            
                            vec3 pos = position;
                            // Data spikes
                            if (fract(pos.x * 0.1) < 0.02 || fract(pos.y * 0.1) < 0.02) {
                                pos.z += luma * 400.0;
                            }
                            
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                        }
                    `,
                    fragmentShader: `
                        varying vec2 vUv; varying float vLuma;
                        uniform vec3 uColor; uniform float uTime; uniform float uHudGlow;
                        void main() {
                            // Holographic markers
                            float grid = step(0.98, fract(vUv.x * 20.0)) + step(0.98, fract(vUv.y * 20.0));
                            vec3 col = uColor * (0.5 + vLuma * 2.0);
                            col += vec3(0.0, 1.0, 1.0) * grid * uHudGlow;
                            
                            // Moving scan bar
                            float bar = smoothstep(0.01, 0.0, abs(fract(vUv.y - uTime * 0.2) - 0.5));
                            col += vec3(1.0) * bar * 0.5;
                            
                            gl_FragColor = vec4(col, 0.3 + grid * 0.7 + bar * 0.5);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(hudGeom, material);
                camera.position.set(0, 0, 800); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'GLITCH_MATRIX') {
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uGlitchIntensity: { value: 1.0 }, uPixelation: { value: 10.0 } },
                    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                    fragmentShader: `
                        uniform sampler2D tVideo; uniform float uTime; uniform vec3 uColor;
                        uniform float uCrush; uniform float uWarp; uniform float uFmAmt; uniform float uGlitchIntensity; uniform float uPixelation;
                        varying vec2 vUv;
                        ${shaderUtils}
                        void main() {
                            vec2 uv = vUv;
                            float pix = max(1.0, floor(uCrush * 50.0 + uPixelation));
                            uv = floor(uv * pix) / pix;
                            
                            float tear = hash(vec2(0.0, uv.y + uTime)) * uFmAmt * uGlitchIntensity * 0.1;
                            uv.x += tear;
                            
                            float r = texture2D(tVideo, uv + vec2(uWarp * 0.05, 0.0)).r;
                            float g = texture2D(tVideo, uv).g;
                            float b = texture2D(tVideo, uv - vec2(uWarp * 0.05, 0.0)).b;
                            float luma = dot(vec3(r,g,b), vec3(0.299, 0.587, 0.114));
                            
                            vec3 color = mix(vec3(r,g,b), uColor * luma * 2.0, 0.5);
                            if (hash(uv + uTime) < (uCrush * 0.1)) color = vec3(1.0); // random white static
                            
                            gl_FragColor = vec4(color, luma * 0.8 + 0.2);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(fullGeom, material);
                camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'FLUID_CAUSTICS') {
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uViscosity: { value: 0.5 }, uSplash: { value: 1.5 }, uFlow: { value: 1.0 } },
                    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                    fragmentShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform vec3 uColor;
                        uniform float uLfoAmt; uniform float uFmAmt; uniform float uSplash; uniform float uViscosity; uniform float uFlow;
                        uniform float uCamSens; uniform float uCamContrast; uniform float uCamFreq;
                        varying vec2 vUv;
                        
                        void main() {
                            vec2 uv = vUv;
                            // Procedural Flow base
                            float n = snoise(vec3(uv * 3.0 * uCamFreq, uTime * 0.1 * uFlow));
                            
                            // Camera Interaction
                            float luma = getCamData(tVideo, uv, uCamSens, uCamContrast);
                            
                            // Advanced Caustics approximation
                            vec2 p = uv * 8.0 * uCamFreq + n * 2.0;
                            for(int i=1; i<5; i++) {
                                float fi = float(i);
                                p += vec2(sin(p.y + uTime * 0.3 + fi + luma * 2.0), cos(p.x + uTime * 0.3 + fi + luma * 2.0)) * (0.4 + luma * 0.4);
                            }
                            
                            float caustic = sin(p.x + p.y + luma * 15.0 * uSplash);
                            caustic = pow(abs(caustic), 6.0) * (2.0 + luma * 3.0);
                            
                            // Fluid displacement
                            vec2 offset = vec2(snoise(vec3(uv * 4.0, uTime * 0.2)), snoise(vec3(uv * 4.0, -uTime * 0.2))) * 0.15 * uSplash * luma;
                            vec4 tex = texture2D(tVideo, uv + offset);
                            float finalLuma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
                            
                            vec3 color = mix(uColor * 0.05, uColor, caustic * (0.3 + luma * 1.5));
                            color += uColor * finalLuma * 0.7 * (1.0 + caustic);
                            
                            // Add a bioluminescent glow
                            vec3 glow = vec3(0.0, 0.8, 1.0) * caustic * 0.3;
                            color += glow;
                            
                            gl_FragColor = vec4(color, 0.85 + caustic * 0.15);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(fullGeom, material);
                camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'PHOTO_RECON') {
                material = new THREE.ShaderMaterial({
                    wireframe: true,
                    uniforms: { ...commonUniforms, uDepthScale: { value: 500.0 }, uRoomFold: { value: 1.0 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uScanX;
                        uniform float uSync; uniform float uTimeScl; uniform float uAmpScl;
                        uniform float uDepthScale; uniform float uRoomFold;
                        varying vec2 vUv; varying float vLuma; varying vec3 vWorldPos;
                        void main() {
                            vUv = uv; vec3 pos = position;
                            if (uv.x < 0.2 && uRoomFold > 0.0) { pos.x = -600.0; pos.z = (0.2 - uv.x) * 3000.0; }
                            else if (uv.x > 0.8 && uRoomFold > 0.0) { pos.x = 600.0; pos.z = (uv.x - 0.8) * 3000.0; }
                            if (uv.y < 0.25 && uRoomFold > 0.0) { pos.y = -400.0; pos.z += (0.25 - uv.y) * 1600.0; }
                            vec4 tex = texture2D(tVideo, uv); float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114)) * uAmpScl;
                            vLuma = luma; pos.z += luma * uDepthScale; 
                            pos.z += snoise(vec3(pos.x * 0.01, pos.y * 0.01, uTime)) * 20.0;
                            vWorldPos = pos; gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform vec3 uColor; uniform float uScanX; uniform float uTime;
                        varying vec2 vUv; varying float vLuma; varying vec3 vWorldPos;
                        void main() {
                            float distToScan = abs(vUv.x - uScanX); float scanLine = smoothstep(0.01, 0.0, distToScan);
                            vec3 color = uColor * (0.3 + vLuma * 1.5); color += uColor * scanLine * 2.0;
                            float grid = sin(vWorldPos.x * 0.05) * sin(vWorldPos.y * 0.05) * sin(vWorldPos.z * 0.05);
                            grid = smoothstep(0.9, 1.0, grid); color += uColor * grid * 0.5;
                            gl_FragColor = vec4(color, 0.6 + scanLine * 0.4);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(geometry, material);
                camera.position.set(0, 200, 800); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'VOXEL_WORLD') {
                const res = 80;
                const voxelGeom = new THREE.BoxGeometry(10, 10, 10); geometries.push(voxelGeom);
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uDepthScale: { value: 600.0 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uAmpScl; uniform float uDepthScale;
                        varying vec3 vColor; varying vec3 vNormal;
                        void main() {
                            vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                            vec2 vUv = vec2((iPos.x / (80.0 * 12.0)) + 0.5, (iPos.z / (80.0 * 12.0)) + 0.5);
                            vec4 tex = texture2D(tVideo, vUv);
                            float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114)) * uAmpScl;
                            vec3 pos = position;
                            pos.y += luma * uDepthScale;
                            pos.y += snoise(vec3(iPos.x * 0.01, iPos.z * 0.01, uTime)) * 15.0;
                            vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
                            vColor = tex.rgb;
                            vNormal = (instanceMatrix * vec4(normal, 0.0)).xyz;
                            gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
                        }
                    `,
                    fragmentShader: `
                        varying vec3 vColor; varying vec3 vNormal; uniform vec3 uColor;
                        void main() {
                            vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
                            float diff = max(dot(normalize(vNormal), lightDir), 0.2);
                            vec3 col = mix(vColor, uColor, 0.2);
                            col *= (0.4 + diff * 0.6);
                            gl_FragColor = vec4(col, 1.0);
                        }
                    `,
                });
                renderObject = new THREE.InstancedMesh(voxelGeom, material, res * res);
                const dummy = new THREE.Object3D();
                for (let i = 0; i < res; i++) {
                    for (let j = 0; j < res; j++) {
                        dummy.position.set((i - res/2) * 12, 0, (j - res/2) * 12); dummy.updateMatrix();
                        renderObject.setMatrixAt(i * res + j, dummy.matrix);
                    }
                }
                camera.position.set(0, 600, 800); camera.lookAt(0, 0, 0);

            } else if (visualTemplate === 'LIDAR_SCAN') {
                const lidarGeom = new THREE.PlaneGeometry(1600, 1200, 400, 300); geometries.push(lidarGeom);
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uPointSize: { value: 2.0 }, uDepthScale: { value: 600.0 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uAmpScl; uniform float uDepthScale; uniform float uPointSize;
                        varying vec2 vUv; varying vec3 vColor;
                        void main() {
                            vUv = uv; vec4 tex = texture2D(tVideo, uv); float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114)) * uAmpScl;
                            vec3 pos = position; pos.z += luma * uDepthScale; 
                            float scan = snoise(vec3(uv.y * 10.0, uTime, 0.0));
                            pos.x += scan * 20.0 * luma;
                            vColor = tex.rgb; gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                            gl_PointSize = (uPointSize + luma * 10.0) * (1000.0 / length(gl_Position.xyz));
                        }
                    `,
                    fragmentShader: `
                        varying vec2 vUv; varying vec3 vColor; uniform vec3 uColor; uniform float uTime;
                        void main() {
                            if (length(gl_PointCoord - 0.5) > 0.5) discard;
                            vec3 col = mix(vColor, uColor, 0.5); float s = sin(vUv.y * 500.0 + uTime * 10.0) * 0.5 + 0.5;
                            col *= (0.8 + s * 0.2); gl_FragColor = vec4(col, 1.0);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Points(lidarGeom, material);
                camera.position.set(0, 200, 800); camera.lookAt(0, 0, 0);
            } else if (visualTemplate === 'BLUEPRINT') {
                const blueGeom = new THREE.PlaneGeometry(5000, 5000, 50, 50); geometries.push(blueGeom);
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, uGridSize: { value: 100.0 } },
                    vertexShader: `
                        varying vec2 vUv; varying vec3 vWorldPos;
                        void main() {
                            vUv = uv; vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform vec3 uColor; uniform float uTime; uniform float uGridSize;
                        varying vec2 vUv; varying vec3 vWorldPos;
                        void main() {
                            vec2 grid = abs(fract(vWorldPos.xy / uGridSize - 0.5) - 0.5) / fwidth(vWorldPos.xy / uGridSize);
                            float line = min(grid.x, grid.y);
                            float gridVal = 1.0 - smoothstep(0.0, 1.0, line);
                            
                            vec2 subGrid = abs(fract(vWorldPos.xy / (uGridSize * 0.1) - 0.5) - 0.5) / fwidth(vWorldPos.xy / (uGridSize * 0.1));
                            float subLine = min(subGrid.x, subGrid.y);
                            float subGridVal = 1.0 - smoothstep(0.0, 0.5, subLine);

                            vec3 bgColor = vec3(0.02, 0.05, 0.2); // Deep blueprint blue
                            vec3 gridColor = mix(bgColor, uColor, 0.3 * gridVal + 0.1 * subGridVal);
                            
                            // Procedural "schematic" lines
                            float schematic = step(0.998, sin(vWorldPos.x * 0.001 + uTime * 0.2)) * step(0.5, sin(vWorldPos.y * 0.02));
                            gridColor += uColor * schematic * 0.5;

                            gl_FragColor = vec4(gridColor, 0.8);
                        }
                    `,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                });
                renderObject = new THREE.Mesh(blueGeom, material);
                renderer.setClearColor(0x050a20, 1);
            } else {
                material = new THREE.ShaderMaterial({
                    uniforms: { ...commonUniforms, tParticle: { value: particleTexture }, uElevationMult: { value: 300.0 }, uSize: { value: 5.0 } },
                    vertexShader: `
                        ${shaderUtils}
                        uniform sampler2D tVideo; uniform float uTime; uniform float uWarp; uniform float uBend; uniform float uSym;
                        uniform float uSync; uniform float uFormant; uniform float uTimeScl; uniform float uFreqScl; uniform float uAmpScl;
                        uniform float uElevationMult; uniform float uSize;
                        uniform float uNoiseLvl; uniform float uCrush;
                        uniform float uCamSens; uniform float uCamContrast; uniform float uCamFreq;
                        varying vec2 vUv; varying float vElevation;
                        void main() {
                            vUv = uv; vec3 pos = position;
                            if (uCrush > 0.0) { float pix = max(1.0, 50.0 - uCrush * 45.0); pos.xy = floor(pos.xy / pix) * pix; }
                            float phase = uv.x; phase = mod(phase * uSync * uTimeScl, 1.0);
                            if (uSym > 0.0) { float symPhase = phase < 0.5 ? phase * 2.0 : (1.0 - phase) * 2.0; phase = mix(phase, symPhase, uSym); }
                            if (uBend != 0.0) phase = clamp(phase + sin(phase * 3.14159) * uBend, 0.0, 1.0);
                            float warpFactor = pow(2.0, uWarp * 3.0); float warpedPhase = pow(phase, warpFactor);
                            float read_y_norm = mod(uv.y * uFormant * uFreqScl, 1.0);
                            float luma = getCamData(tVideo, vec2(uv.x, uv.y), uCamSens, uCamContrast);
                            vElevation = luma;
                            
                            float n = snoise(vec3(pos.x * 0.005 * uCamFreq, pos.y * 0.005 * uCamFreq, uTime * 0.1));
                            pos.x += n * uNoiseLvl * 100.0;
                            pos.z += n * uNoiseLvl * 100.0;
                            
                            pos.y += luma * uElevationMult; 
                            pos.y += snoise(vec3(pos.x * 0.01 * uCamFreq, pos.z * 0.01 * uCamFreq, uTime * 0.5)) * 20.0 * luma;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0); gl_PointSize = uSize + (luma * 10.0); 
                        }
                    `,
                    fragmentShader: `
                        uniform vec3 uColor; uniform sampler2D tParticle; uniform float uScanX;
                        varying float vElevation; varying vec2 vUv;
                        void main() {
                            vec4 particleColor = texture2D(tParticle, gl_PointCoord);
                            float distToScan = abs(vUv.x - uScanX); float scanGlow = smoothstep(0.02, 0.0, distToScan) * 1.5;
                            float baseAlpha = 0.45 + (vElevation * 0.55);
                            vec3 baseColor = mix(uColor * 0.5, vec3(1.0), vElevation);
                            vec3 finalColor = baseColor + (uColor * scanGlow);
                            gl_FragColor = vec4(finalColor, particleColor.a * (baseAlpha + scanGlow));
                        }
                    `,
                    transparent: true, blending: THREE.NormalBlending, depthWrite: false
                });
                renderObject = new THREE.Points(geometry, material);
            }
            
            materialRef.current = material;
            scene.add(renderObject);
            let animationId; const clock = new THREE.Clock();

            const animate = () => {
                animationId = requestAnimationFrame(animate);
                
                if (camRef && camRef.current) {
                    const c = camRef.current;
                    const tx = typeof c.tx === 'number' ? c.tx : 0;
                    const ty = typeof c.ty === 'number' ? c.ty : 0;
                    const tz = typeof c.tz === 'number' ? c.tz : 1;
                    
                    const targetX = -tx * 0.0; // Locked background parallax
                    const targetY = ty * 0.0;
                    const targetZ = 800;       // Locked background depth
                    
                    camera.position.x += (targetX - camera.position.x) * 0.1;
                    camera.position.y += (targetY - camera.position.y) * 0.1;
                    camera.position.z += (targetZ - camera.position.z) * 0.1;
                    camera.lookAt(0, 0, 0); // Always look at world center
                }

                if (sharedStateRef.current) {
                    const u = material.uniforms;
                    if (u.uScanX) u.uScanX.value = sharedStateRef.current.scanX;
                    const p = sharedStateRef.current.synthParams;
                    if (p) {
                        if (u.uWarp) u.uWarp.value = p.warp || 0; if (u.uBend) u.uBend.value = p.bend || 0;
                        if (u.uSym) u.uSym.value = p.sym || 0; if (u.uSync) u.uSync.value = p.sync || 1.0;
                        if (u.uFormant) u.uFormant.value = p.formant || 1.0; if (u.uTimeScl) u.uTimeScl.value = p.timeScl || 1.0;
                        if (u.uFreqScl) u.uFreqScl.value = p.freqScl || 1.0; if (u.uAmpScl) u.uAmpScl.value = p.ampScl || 1.0;
                        if (u.uNoiseLvl) u.uNoiseLvl.value = p.noiseLvl || 0.0; if (u.uCrush) u.uCrush.value = p.crush || 0.0;
                        if (u.uHarm) u.uHarm.value = p.harm || 1.0; if (u.uFmAmt) u.uFmAmt.value = p.fmAmt || 0.0;
                        if (u.uLfoAmt) u.uLfoAmt.value = p.lfoAmt || 0.0;
                    }
                    if (material.userData.shader) {
                        const s = material.userData.shader;
                        if (p && s.uniforms.uAmpScl) s.uniforms.uAmpScl.value = p.ampScl || 1.0;
                    }
                    if (dataCanvas && sharedStateRef.current.pixels && imageData) {
                        const ctx = dataCanvas.getContext('2d');
                        imageData.data.set(sharedStateRef.current.pixels);
                        ctx.putImageData(imageData, 0, 0);
                        dataTexture.needsUpdate = true;
                    }
                }
                
                const settings = settingsRef.current[visualTemplate];
                if (settings) {
                    const u = material.uniforms;
                    if (u.uElevationMult) u.uElevationMult.value = settings.elevationMultiplier;
                    if (u.uSize) u.uSize.value = settings.size;
                    if (u.uWaveCount) u.uWaveCount.value = settings.waveCount;
                    if (u.uGlow) u.uGlow.value = settings.glowIntensity;
                    if (u.uGlitchIntensity) u.uGlitchIntensity.value = settings.glitchIntensity;
                    if (u.uPixelation) u.uPixelation.value = settings.pixelation;
                    if (u.uViscosity) u.uViscosity.value = settings.viscosity;
                    if (u.uSplash) u.uSplash.value = settings.splashForce;
                    if (u.uFlow) u.uFlow.value = settings.flow || 1.0;
                    if (u.uCamSens) u.uCamSens.value = settings.camSens || 1.0;
                    if (u.uCamContrast) u.uCamContrast.value = settings.camContrast || 1.0;
                    if (u.uCamFreq) u.uCamFreq.value = settings.camFreq || 1.0;
                    if (u.uDepthScale) u.uDepthScale.value = settings.depthScale;
                    if (u.uRoomFold) u.uRoomFold.value = settings.roomFold;
                    if (u.uPointSize) u.uPointSize.value = settings.pointSize;
                    if (u.uGhosting) u.uGhosting.value = settings.ghosting || 0.5;
                    
                    const currentBpm = (sharedStateRef.current && sharedStateRef.current.bpm) ? sharedStateRef.current.bpm : 120.0;
                    const bpmMultiplier = currentBpm / 120.0;
                    const delta = clock.getDelta() * (settings.speed !== undefined ? settings.speed : 1.0) * bpmMultiplier;
                    if (u.uTime) u.uTime.value += delta;
                    if (material.userData.shader) {
                        const s = material.userData.shader;
                        if (s.uniforms.uTime) s.uniforms.uTime.value += delta;
                        if (s.uniforms.uDepthScale && settings.depthScale) s.uniforms.uDepthScale.value = settings.depthScale;
                    }
                } else {
                    const currentBpm = (sharedStateRef.current && sharedStateRef.current.bpm) ? sharedStateRef.current.bpm : 120.0;
                    if (material.uniforms.uTime) material.uniforms.uTime.value += clock.getDelta() * (currentBpm / 120.0);
                }

                renderer.render(scene, camera);
            };
            animate();
            const handleResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
            window.addEventListener('resize', handleResize);
            return () => { 
                window.removeEventListener('resize', handleResize); 
                cancelAnimationFrame(animationId); 
                geometries.forEach(g => g?.dispose());
                material.dispose(); 
                particleTexture.dispose(); 
                dataTexture.dispose(); 
                renderer.dispose(); 
                if (containerRef.current) containerRef.current.innerHTML = ''; 
            };
        } catch (e) { console.warn("WebGL Background failed.", e); }
    }, [visualTemplate, camRef]);

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.children.forEach(child => { if (child.material && child.material.uniforms) child.material.uniforms.uColor.value.set(wireColor); });
        }
    }, [wireColor]);

    return <div ref={containerRef} className="webgl-container" />;
};
window.WebGLBackground = WebGLBackground;
window.EnvVisualizer = EnvVisualizer;
window.FilterVisualizer = FilterVisualizer;
window.LfoVisualizer = LfoVisualizer;
window.ParametricEQ = ParametricEQ;

// ═══════════════════════════════════════════════════════════════════════════
