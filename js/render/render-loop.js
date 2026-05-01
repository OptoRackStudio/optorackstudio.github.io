/**
 * OPTORACK - RENDER LOOP ENGINE
 * Architectural Role: 60FPS Orchestration
 * - Synchronizes the Audio DSP state with Visual Shaders.
 * - Manages Verlet Physics for patch cables.
 * - Handles Camera Interpolation and Smooth Parallax.
 * - Processes Video Luma for Spectral Synthesis.
 */

// Math fallbacks in case they are missing from the global scope
const lerp = window.lerp || ((a, b, t) => a + (b - a) * t);
const clamp = window.clamp || ((val, min, max) => Math.min(Math.max(val, min), max));

window.OptoRackRenderLoop = class {
    constructor(config) {
        this.config = config; // { cDsp, camRef, bpmRef, synths, cablesRef, sharedStateRef, etc. }
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.loopId = null;
        this.lumaMap = new Float32Array(64 * 64);
        this.camPixelsCache = new Uint8ClampedArray(64 * 64 * 4);
        this.webglReadCtx = null;
    }

    start() {
        if (this.loopId) return;
        const loop = () => {
            this.tick();
            this.loopId = requestAnimationFrame(loop);
        };
        this.loopId = requestAnimationFrame(loop);
    }

    stop() {
        if (this.loopId) cancelAnimationFrame(this.loopId);
        this.loopId = null;
    }

    tick() {
        try {
            const { cDsp, camRef, bpmRef, synthsRef, fxModulesRef, cablesRef, sharedStateRef, canvasFg, scanCanvas, vRef, worldRef, glContainerRef, disruptCursor, updateParam } = this.config;
        const actx = cDsp.current?.actx;
        const ctActx = actx ? actx.currentTime : 0;
        const sc = window.studioScale || 1;
        const cw = window.innerWidth / sc;
        const ch = window.innerHeight / sc;
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasFg.current;
        if (!canvas) return;
        const fgCtx = canvas.getContext('2d');
        if (!fgCtx) return;

        // Resize canvas to unscaled dimensions
        if (canvas.width !== Math.floor(cw * dpr)) {
            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            canvas.style.width = `${cw}px`;
            canvas.style.height = `${ch}px`;
        }
        fgCtx.resetTransform();
        fgCtx.scale(dpr, dpr);

        // ── CAMERA & PARALLAX ────────────────────────────────────────────────
        const centerX = cw / 2, centerY = ch / 2;
        const scMouseX = disruptCursor.current.x / sc;
        const scMouseY = disruptCursor.current.y / sc;
        const targetLookX = ((scMouseX - centerX) / centerX) * 0.2;
        const targetLookY = ((scMouseY - centerY) / centerY) * 0.2;

        // 1. Prevent NaN Poisoning: Ensure targets are at least 0 or 1
        camRef.current.tx = camRef.current.tx || 0;
        camRef.current.ty = camRef.current.ty || 0;
        camRef.current.tz = camRef.current.tz || 1;
        
        // 2. Safely initialize current positions if undefined
        camRef.current.x = camRef.current.x !== undefined && !isNaN(camRef.current.x) ? camRef.current.x : camRef.current.tx;
        camRef.current.y = camRef.current.y !== undefined && !isNaN(camRef.current.y) ? camRef.current.y : camRef.current.ty;
        camRef.current.z = camRef.current.z !== undefined && !isNaN(camRef.current.z) ? camRef.current.z : camRef.current.tz;

        // 3. Apply Lerp
        camRef.current.lookX = lerp(camRef.current.lookX || 0, targetLookX, 0.015);
        camRef.current.lookY = lerp(camRef.current.lookY || 0, targetLookY, 0.015);
        camRef.current.x = lerp(camRef.current.x, camRef.current.tx, 0.1);
        camRef.current.y = lerp(camRef.current.y, camRef.current.ty, 0.1);
        camRef.current.z = lerp(camRef.current.z, camRef.current.tz, 0.1);

        if (worldRef.current) {
            // CRITICAL FIX: Ensure scaling and panning calculate from the top-left (0,0)
            worldRef.current.style.transformOrigin = '0 0';
            worldRef.current.style.transform = `translate3d(${camRef.current.x}px, ${camRef.current.y}px, 0) scale(${camRef.current.z})`;
        }

        // ── LUMA PROCESSING ──────────────────────────────────────────────────
        // (Assuming DW and DH are globally defined dimensions)
        const DW = window.DW || 64; 
        const DH = window.DH || 64;

        let synthPixels = this.processLuma(scanCanvas, vRef, DW, DH);
        for (let i = 0; i < DW * DH; i++) {
            let luma = (synthPixels[i * 4] * 0.299 + synthPixels[i * 4 + 1] * 0.587 + synthPixels[i * 4 + 2] * 0.114) / 255.0;
            this.lumaMap[i] = Math.pow(luma, 1.5);
        }
        sharedStateRef.current.pixels = synthPixels;

        // ── DSP & LFO SYNC ───────────────────────────────────────────────────
        const now = performance.now();
        let dt = Math.min(0.1, (now - this.lastTime) / 1000);
        this.lastTime = now;
        this.frameCount++;

        const beatDelta = dt * (bpmRef.current / 60);

        Object.values(cDsp.current.modules).forEach(mod => {
            this.updateModuleLogic(mod, dt, ctActx, bpmRef.current, updateParam);
        });

        // ── SYNTH ENGINE (WAVETABLE RE-SYNTHESIS) ─────────────────────────────
        const synths = synthsRef?.current || [];
        synths.forEach(stateObj => {
            const dspObj = cDsp.current.modules[stateObj.id];
            if (!dspObj) return;
            this.processSynthDSP(dspObj, this.lumaMap, ctActx, beatDelta, cablesRef, DW, DH);
        });

        // ── CABLE PHYSICS & DRAWING ──────────────────────────────────────────
        this.drawCables(fgCtx, cw, ch, dpr, cablesRef, camRef.current, disruptCursor.current);
        } catch (e) {
            console.error("OptoRack Critical Render Error:", e);
            this.stop();
            if (window.showOptoError) window.showOptoError(e.message);
        }
    }

    processLuma(scanCanvas, vRef, DW, DH) {
        if (!scanCanvas.current) return this.camPixelsCache;
        const scanCtx = scanCanvas.current.getContext('2d', { willReadFrequently: true });

        if (this.frameCount % 2 === 0 && vRef.current && vRef.current.readyState >= 3) {
            scanCtx.drawImage(vRef.current, 0, 0, DW, DH);
            const data = scanCtx.getImageData(0, 0, DW, DH).data;
            this.camPixelsCache.set(data);
        }

        let pixels = this.camPixelsCache;

        if (window.optorackWebGLCanvas) {
            if (!this.webglReadCtx) {
                const c = document.createElement('canvas'); c.width = DW; c.height = DH;
                this.webglReadCtx = c.getContext('2d', { willReadFrequently: true });
            }
            this.webglReadCtx.drawImage(window.optorackWebGLCanvas, 0, 0, DW, DH);
            pixels = this.webglReadCtx.getImageData(0, 0, DW, DH).data;
        }
        return pixels;
    }

    updateModuleLogic(mod, dt, ctActx, bpm, updateParam) {
        const beatInterval = 60 / bpm;
        if (mod.type === 'MOD_LFO') {
            mod.state.phase = (mod.state.phase + dt * mod.params.rate) % 1.0;
            let val = 0;
            if (mod.params.wave == 0) val = Math.sin(mod.state.phase * Math.PI * 2);
            else if (mod.params.wave == 1) val = Math.abs((mod.state.phase * 4) % 4 - 2) - 1;
            else if (mod.params.wave == 2) val = (mod.state.phase * 2) - 1;
            else if (mod.params.wave == 3) val = mod.state.phase < 0.5 ? 1 : -1;

            mod.state.targets?.forEach(t => {
                const targetMod = this.config.cDsp.current.modules[t.modId];
                if (targetMod && targetMod.baseParams && targetMod.baseParams[t.param] !== undefined) {
                    updateParam(t.modId, t.param, targetMod.baseParams[t.param] + (val * mod.params.depth), true);
                }
            });
        } else if (mod.type === 'FX_RHYTHM') {
            const stepDuration = beatInterval / mod.params.rate;
            if (ctActx >= mod.state.lastTime + stepDuration) {
                mod.state.step = (mod.state.step + 1) % 16;
                mod.state.lastTime = ctActx;
                const isActive = mod.params.steps[mod.state.step];
                const targetGain = isActive ? 1.0 : (1.0 - mod.params.depth);
                mod.nodes.vca.gain.setTargetAtTime(targetGain, ctActx, mod.params.smooth);
            }
        } else if (mod.type === 'FX_SIDECHAIN') {
            const stepDuration = beatInterval / mod.params.rate;
            if (!mod.state.nextScheduleTime) mod.state.nextScheduleTime = ctActx;
            mod.state.progress = 1.0 - ((mod.state.nextScheduleTime - ctActx) / stepDuration);
            while (mod.state.nextScheduleTime < ctActx + 0.1) {
                const curve = window.OptoRackDSP?.getDuckerCurve ? window.OptoRackDSP.getDuckerCurve(mod.params.curveId, mod.params.depth) : [1, 0, 1];
                try {
                    if (mod.nodes?.vca?.gain) {
                        mod.nodes.vca.gain.setTargetAtTime(curve[0], mod.state.nextScheduleTime - 0.005, 0.002);
                        mod.nodes.vca.gain.setValueCurveAtTime(curve, mod.state.nextScheduleTime, stepDuration);
                    }
                } catch (e) { }
                mod.state.nextScheduleTime += stepDuration;
            }
        } else if (mod.type === 'PROB_SEQ') {
            const stepDuration = beatInterval / mod.params.rate;
            if (ctActx >= mod.state.lastTime + stepDuration) {
                mod.state.step = (mod.state.step + 1) % 16;
                mod.currentStep = mod.state.step;
                mod.state.lastTime = ctActx;

                const isActive = mod.params.steps[mod.state.step];
                const stepProb = (mod.params.stepsProb && mod.params.stepsProb[mod.state.step] !== undefined) ? mod.params.stepsProb[mod.state.step] : mod.params.prob;
                if (isActive && Math.random() <= stepProb) {
                    // Trigger Audio Graph Nodes
                    mod.nodes.seqOut.offset.cancelScheduledValues(ctActx);
                    mod.nodes.seqOut.offset.setValueAtTime(1, ctActx);
                    mod.nodes.seqOut.offset.setValueAtTime(0, ctActx + stepDuration * mod.params.gate);

                    // Trigger Logic Flags (for Photosynth internal triggers)
                    const cables = this.config.cablesRef.current;
                    cables.forEach(c => {
                        if (c.srcMod === mod.id && (c.srcPort === 'TRIG' || c.srcPort === 'OUT')) {
                            const destMod = this.config.cDsp.current.modules[c.destMod];
                            if (destMod) destMod.triggerFlag = true;
                        }
                    });

                    // Pitch Generation
                    const scaleRef = this.config.sharedStateRef?.current?.scale || 'MINOR';
                    const SCALES = window.SCALES || { MINOR: [0, 2, 3, 5, 7, 8, 10] };
                    const scaleArr = SCALES[scaleRef] || SCALES['MINOR'];
                    const randomNote = scaleArr[Math.floor(Math.random() * scaleArr.length)];
                    const octave = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
                    const pitchVal = randomNote + (octave * 12);
                    mod.nodes.pitchOut.offset.setValueAtTime(pitchVal, ctActx);
                }
            }
        }
    }

    processSynthDSP(dspObj, lumaMap, ctActx, beatDelta, cablesRef, DW, DH) {
        const beatInterval = 60 / this.config.bpmRef.current;
        dspObj.currentTopo = (dspObj.params.isLive || !dspObj.snapshotTopo) ? lumaMap : dspObj.snapshotTopo;

        if (dspObj.params.wtScan) {
            dspObj.scanPhase = (dspObj.scanPhase + beatDelta * dspObj.params.scanRate * (dspObj.params.timeScl || 1.0) * 0.25) % 1.0;
        } else {
            dspObj.scanPhase = dspObj.params.wtPos;
        }

        const isExtTrig = cablesRef.current.some(c => c.destMod === dspObj.id && c.destPort === 'TRIG');
        let shouldTrigger = false;
        let internalRate = dspObj.params.trigRate || 1;

        if (!isExtTrig) {
            if (ctActx >= dspObj.curTrigT) {
                shouldTrigger = true;
                dspObj.curTrigT = ctActx + (beatInterval / internalRate);
            }
        } else if (dspObj.triggerFlag) {
            shouldTrigger = true;
            dspObj.triggerFlag = false;
        }

        if (!dspObj.state) dspObj.state = { lastTrig: 0, gate: 0, smoothWtPos: dspObj.scanPhase || 0 };
        const state = dspObj.state;

        if ((shouldTrigger || dspObj.params.isLive || state.gate > 0) && dspObj.currentTopo) {
            if (shouldTrigger) {
                const { atk, dec, sus, rel, hold = 0 } = dspObj.params;
                const gateLength = (beatInterval / (isExtTrig ? 4 : internalRate)) * 0.85;
                const paramsToUpdate = [];
                if (dspObj.env?.gain) paramsToUpdate.push(dspObj.env.gain);
                if (dspObj.outNodes?.ENV?.gain) paramsToUpdate.push(dspObj.outNodes.ENV.gain);

                paramsToUpdate.forEach(param => {
                    param.cancelScheduledValues(ctActx);
                    param.setValueAtTime(param.value || 0.0001, ctActx);
                    
                    const tAtk = ctActx + Math.max(0.002, atk);
                    const tHold = tAtk + hold;
                    const tDec = tHold + Math.max(0.002, dec);
                    const tSus = Math.max(ctActx + gateLength - Math.max(0.002, rel), tDec + 0.002);
                    const tRel = tSus + Math.max(0.002, rel);

                    param.linearRampToValueAtTime(1.0, tAtk);
                    if (hold > 0) param.setValueAtTime(1.0, tHold);
                    param.exponentialRampToValueAtTime(Math.max(sus, 0.0001), tDec);
                    param.setValueAtTime(Math.max(sus, 0.0001), tSus);
                    param.exponentialRampToValueAtTime(0.0001, tRel);
                });
                state.lastTrig = performance.now();
                state.gate = 1.0;
                // Auto-clear gate after full ADSR duration for visual/DSP gating
                setTimeout(() => { state.gate = 0; }, (atk + hold + dec + rel + 0.1) * 1000);
            }

            const maxH = 64;
            const real = new Float32Array(maxH); const imag = new Float32Array(maxH);
            const warpExp = Math.pow(2, dspObj.params.warp * 2.5);
            const bendAmt = dspObj.params.bend || 0;
            const symAmt = dspObj.params.sym || 0;
            let phaseX = dspObj.scanPhase;

            // Real-time parameter interpolation support
            if (!state.smoothWtPos) state.smoothWtPos = dspObj.scanPhase;
            state.smoothWtPos = lerp(state.smoothWtPos, dspObj.scanPhase, 0.2);
            phaseX = state.smoothWtPos;

            if (symAmt !== 0) {
                let symPhase = phaseX < 0.5 ? phaseX * 2 : (1 - phaseX) * 2;
                phaseX = lerp(phaseX, symPhase, Math.abs(symAmt));
            }
            if (bendAmt !== 0) {
                phaseX = clamp(phaseX + Math.sin(phaseX * Math.PI) * bendAmt, 0, 1);
            }

            const scanIdx = Math.floor(Math.pow(phaseX, warpExp) * (DW - 1));

            real[1] = 1.0;
            const harmCount = Math.floor(lerp(2, maxH, dspObj.params.harm || 1.0));
            for (let i = 2; i < harmCount; i++) {
                let harmIdx = i * (dspObj.params.sync || 1.0);
                let yNorm = ((harmIdx / maxH) * (dspObj.params.formant || 1.0) * (dspObj.params.freqScl || 1.0)) % 1.0;
                let pxY = DH - 1 - Math.floor(yNorm * (DH - 1));
                let topoVal = dspObj.currentTopo[pxY * DW + scanIdx] || 0;

                let reSynthAmp = (topoVal * (dspObj.params.sensitivity || 1.0) * (dspObj.params.ampScl || 1.0)) / Math.pow(i, 0.75);
                let pureAmp = 1.0 / Math.pow(i, 1.5);
                let amp = lerp(pureAmp, reSynthAmp, dspObj.params.blend !== undefined ? dspObj.params.blend : 0.8);

                let phase = (i * 0.5 * Math.PI * 0.25) + (topoVal * Math.PI);
                real[i] = amp * Math.cos(phase); imag[i] = amp * Math.sin(phase);
            }

            // Throttle Wavetable Update to ~30fps to prevent main-thread congestion
            const now = performance.now();
            if (!dspObj._lastWaveTime || now - dspObj._lastWaveTime > 32) {
                try {
                    const wave = this.config.cDsp.current.actx.createPeriodicWave(real, imag, { disableNormalization: false });
                    dspObj.unisonOscs?.forEach(osc => osc.setPeriodicWave(wave));
                    dspObj._lastWaveTime = now;
                } catch (e) { 
                    console.warn("Wavetable generation failed", e);
                }
            }
        }
    }

    drawCables(ctx, cw, ch, dpr, cablesRef, cam, mouse) {
        ctx.clearRect(0, 0, cw, ch);
        if (!window.moduleControllers) return;

        const dt = 1 / 60;
        const gravity = 0.65; // Increased for more natural sag
        const stiffness = 0.75; // Tuned for better physics response
        const segments = 20; // Silky smooth curves

        cablesRef.current.forEach(c => {
            if (!c._physics) {
                c._physics = Array.from({ length: segments }, () => ({ x: 0, y: 0, oldX: 0, oldY: 0 }));
                c._init = false;
            }

            const srcCtrl = window.moduleControllers[c.srcMod];
            const destCtrl = window.moduleControllers[c.destMod];
            if (!srcCtrl || !destCtrl) return;

            const srcWorld = srcCtrl.getWorldPortPos(c.srcPort, false);
            const destWorld = destCtrl.getWorldPortPos(c.destPort, true);

            const p1 = srcWorld.isAbsolute ? { x: srcWorld.x, y: srcWorld.y } : { x: srcWorld.x * cam.z + cam.x, y: srcWorld.y * cam.z + cam.y };
            const p2 = destWorld.isAbsolute ? { x: destWorld.x, y: destWorld.y } : { x: destWorld.x * cam.z + cam.x, y: destWorld.y * cam.z + cam.y };

            if (!c._init) {
                c._physics.forEach((p, i) => {
                    const ratio = i / (segments - 1);
                    p.x = p.oldX = p1.x + (p2.x - p1.x) * ratio;
                    p.y = p.oldY = p1.y + (p2.y - p1.y) * ratio;
                });
                c._init = true;
            }

            c._physics.forEach((p, i) => {
                if (i === 0) { p.x = p1.x; p.y = p1.y; return; }
                if (i === segments - 1) { p.x = p2.x; p.y = p2.y; return; }

                const vx = (p.x - p.oldX) * 0.98;
                const vy = (p.y - p.oldY) * 0.98;

                p.oldX = p.x;
                p.oldY = p.y;
                p.x += vx;
                p.y += vy + gravity;

                const dx = p.x - (mouse.x / (window.studioScale || 1));
                const dy = p.y - (mouse.y / (window.studioScale || 1));
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 80) {
                    const force = (80 - dist) / 80;
                    p.x += dx * force * 0.1;
                    p.y += dy * force * 0.1;
                }
            });

            const targetLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2) / (segments - 1) * 1.1;
            for (let r = 0; r < 5; r++) {
                for (let i = 0; i < segments - 1; i++) {
                    const a = c._physics[i];
                    const b = c._physics[i + 1];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
                    const diff = ((targetLen - dist) / dist) * stiffness;
                    
                    // Clamp max adjustment per iteration to prevent numeric explosion
                    const clampedDiff = Math.max(-0.5, Math.min(0.5, diff));
                    
                    const offsetX = dx * clampedDiff * 0.5;
                    const offsetY = dy * clampedDiff * 0.5;
                    
                    if (i > 0) { a.x -= offsetX; a.y -= offsetY; }
                    if (i < segments - 2) { b.x += offsetX; b.y += offsetY; }
                }
            }

            ctx.beginPath();
            ctx.moveTo(c._physics[0].x, c._physics[0].y);
            for (let i = 1; i < segments - 1; i++) {
                const xc = (c._physics[i].x + c._physics[i + 1].x) / 2;
                const yc = (c._physics[i].y + c._physics[i + 1].y) / 2;
                ctx.quadraticCurveTo(c._physics[i].x, c._physics[i].y, xc, yc);
            }
            ctx.lineTo(c._physics[segments - 1].x, c._physics[segments - 1].y);

            // 1. DROP SHADOW (The 'Realistic' Depth Pass)
            ctx.shadowBlur = 20 * cam.z;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowOffsetX = 10 * cam.z;
            ctx.shadowOffsetY = 15 * cam.z;
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 6 * cam.z;
            ctx.lineCap = 'round';
            ctx.stroke();

            // 2. OUTER GLOW / GLOSS
            ctx.shadowBlur = 12 * cam.z;
            ctx.shadowColor = c.color;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 6 * cam.z;
            ctx.stroke();

            // 3. THE MAIN CABLE CORE
            ctx.shadowBlur = 8 * cam.z;
            ctx.shadowColor = c.color;
            ctx.strokeStyle = c.color;
            ctx.lineWidth = 3.5 * cam.z;
            ctx.stroke();

            // Inner Highlight / Pulse
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1.2 * cam.z;
            ctx.setLineDash([15, 25]);
            ctx.lineDashOffset = -(performance.now() / 40) % 40;
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw Plug Connectors
            [c._physics[0], c._physics[segments - 1]].forEach((p, idx) => {
                ctx.fillStyle = '#222';
                ctx.strokeStyle = idx === 0 ? '#666' : '#888';
                ctx.lineWidth = 1 * cam.z;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5 * cam.z, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // Inner pin
                ctx.fillStyle = c.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2 * cam.z, 0, Math.PI * 2);
                ctx.fill();
            });
        });

        const drag = this.config.disruptCursor.current;
        const dragRef = this.config.dragCableRef?.current || window._dragCableRef;
        if (drag.down && dragRef) {
            const d = dragRef;
            const ctrl = window.moduleControllers[d.modId];
            if (ctrl) {
                const portPos = ctrl.getWorldPortPos(d.portId, d.isInput);
                if (!portPos) return;
                const p1 = { x: portPos.x * cam.z + cam.x, y: portPos.y * cam.z + cam.y };
                const p2 = { x: mouse.x / (window.studioScale || 1), y: mouse.y / (window.studioScale || 1) };

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                const cp1 = { x: p1.x, y: p1.y + 100 * cam.z };
                const cp2 = { x: p2.x, y: p2.y + 100 * cam.z };
                ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
                const wCol = (this.config.wireColor && this.config.wireColor.current) ? this.config.wireColor.current : (this.config.wireColor || window._activeWireColor || '#FFF');
                ctx.strokeStyle = wCol;
                ctx.lineWidth = 4 * cam.z;
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }
    }
};