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
        this.camPixelsCache = null;
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
            
            if (!sharedStateRef?.current) return;
            const actx = cDsp.current?.actx;
            const ctActx = actx ? actx.currentTime : 0;
            const cw = window.innerWidth, ch = window.innerHeight;
            const dpr = window.devicePixelRatio || 1;
            const fgCtx = canvasFg.current?.getContext('2d');
            if (!fgCtx) return;

            // ── CAMERA & PARALLAX ────────────────────────────────────────────────
            const centerX = cw / 2, centerY = ch / 2;
            const targetLookX = ((disruptCursor.current.x - centerX) / centerX) * 0.2;
            const targetLookY = ((disruptCursor.current.y - centerY) / centerY) * 0.2;

            // 1. Prevent NaN Poisoning: Ensure targets are at least 0 or 1
            if (!camRef.current) camRef.current = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
            const c = camRef.current;
            c.tx = c.tx || 0;
            c.ty = c.ty || 0;
            c.tz = c.tz || 1;
            
            // 2. Safely initialize current positions if undefined
            c.x = (c.x !== undefined && !isNaN(c.x)) ? c.x : c.tx;
            c.y = (c.y !== undefined && !isNaN(c.y)) ? c.y : c.ty;
            c.z = (c.z !== undefined && !isNaN(c.z)) ? c.z : c.tz;

            // 3. Apply Lerp
            c.lookX = lerp(c.lookX || 0, targetLookX, 0.015);
            c.lookY = lerp(c.lookY || 0, targetLookY, 0.015);
            c.x = lerp(c.x, c.tx, 0.1);
            c.y = lerp(c.y, c.ty, 0.1);
            c.z = lerp(c.z, c.tz, 0.1);

            if (worldRef.current) {
                worldRef.current.style.transformOrigin = '0 0';
                worldRef.current.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) scale(${c.z})`;
            }

            // ── LUMA PROCESSING ──────────────────────────────────────────────────
            const DW = window.DW || 64; 
            const DH = window.DH || 64;

            let synthPixels = this.processLuma(scanCanvas, vRef, DW, DH);
            const lumaMap = new Float32Array(DW * DH);
            for (let i = 0; i < DW * DH; i++) {
                let luma = (synthPixels[i * 4] * 0.299 + synthPixels[i * 4 + 1] * 0.587 + synthPixels[i * 4 + 2] * 0.114) / 255.0;
                lumaMap[i] = Math.pow(luma, 1.5);
            }
            sharedStateRef.current.pixels = synthPixels;

            // ── DSP & LFO SYNC ───────────────────────────────────────────────────
            const now = performance.now();
            let dt = Math.min(0.1, (now - this.lastTime) / 1000);
            this.lastTime = now;
            this.frameCount++;

            const beatDelta = dt * (bpmRef.current / 60);

            if (cDsp.current?.modules) {
                Object.values(cDsp.current.modules).forEach(mod => {
                    if (mod) this.updateModuleLogic(mod, dt, ctActx, bpmRef.current, updateParam);
                });
            }

            // ── SYNTH ENGINE (WAVETABLE RE-SYNTHESIS) ─────────────────────────────
            const synths = synthsRef?.current || [];
            synths.forEach(stateObj => {
                const dspObj = cDsp.current.modules[stateObj.id];
                if (!dspObj) return;
                this.processSynthDSP(dspObj, lumaMap, ctActx, beatDelta, cablesRef, DW, DH);
            });

            // ── CABLE PHYSICS & DRAWING ──────────────────────────────────────────
            const viewMode = sharedStateRef.current.viewMode || "PATCHING";
            if (viewMode !== "SLEEP") {
                this.drawCables(fgCtx, cw, ch, dpr, cablesRef, c, disruptCursor.current);
            } else {
                fgCtx.clearRect(0, 0, cw, ch);
            }
        } catch (err) {
            if (this.frameCount % 60 === 0) console.error("RenderLoop Tick Error:", err);
        }
    }

    processLuma(scanCanvas, vRef, DW, DH) {
        if (!scanCanvas.current) return new Uint8ClampedArray(DW * DH * 4);
        const scanCtx = scanCanvas.current.getContext('2d', { willReadFrequently: true });

        if (this.frameCount % 2 === 0 && vRef.current && vRef.current.readyState >= 3) {
            try {
                scanCtx.drawImage(vRef.current, 0, 0, DW, DH);
                this.camPixelsCache = scanCtx.getImageData(0, 0, DW, DH).data;
            } catch (e) { }
        }

        let pixels = this.camPixelsCache || new Uint8ClampedArray(DW * DH * 4);

        // Robust check for WebGL Canvas availability
        const glCanvas = window.optorackWebGLCanvas;
        if (glCanvas && glCanvas.width > 0 && glCanvas.height > 0) {
            if (!this.webglReadCtx) {
                const c = document.createElement('canvas'); c.width = DW; c.height = DH;
                this.webglReadCtx = c.getContext('2d', { willReadFrequently: true });
            }
            try {
                this.webglReadCtx.drawImage(glCanvas, 0, 0, DW, DH);
                pixels = this.webglReadCtx.getImageData(0, 0, DW, DH).data;
            } catch (e) { 
                // Fallback to camera pixels if WebGL draw fails (e.g. context loss)
                pixels = this.camPixelsCache || pixels;
            }
        }
        return pixels;
    }

    updateModuleLogic(mod, dt, ctActx, bpm, updateParam) {
        const beatInterval = 60 / bpm;
        if (mod.type === 'MOD_LFO') {
            mod.state.phase = (mod.state.phase + dt * (mod.params.rate || 1)) % 1.0;
            let val = 0;
            const phase = mod.state.phase;
            if (mod.params.wave == 0) val = Math.sin(phase * Math.PI * 2);
            else if (mod.params.wave == 1) val = Math.abs((phase * 4) % 4 - 2) - 1;
            else if (mod.params.wave == 2) val = (phase * 2) - 1;
            else if (mod.params.wave == 3) val = phase < 0.5 ? 1 : -1;

            mod.state.targets?.forEach(t => {
                const targetMod = this.config.cDsp.current.modules[t.modId];
                if (targetMod && targetMod.baseParams && targetMod.baseParams[t.param] !== undefined) {
                    updateParam(t.modId, t.param, targetMod.baseParams[t.param] + (val * mod.params.depth), true);
                }
            });
        } else if (mod.type === 'FX_RHYTHM') {
            const stepDuration = beatInterval / (mod.params.rate || 4);
            if (ctActx >= (mod.state.lastTime || 0) + stepDuration) {
                mod.state.step = ((mod.state.step || 0) + 1) % 16;
                mod.state.lastTime = ctActx;
                const isActive = mod.params.steps ? mod.params.steps[mod.state.step] : false;
                const targetGain = isActive ? 1.0 : (1.0 - (mod.params.depth || 0.5));
                if(mod.nodes?.vca?.gain) mod.nodes.vca.gain.setTargetAtTime(targetGain, ctActx, mod.params.smooth || 0.01);
            }
        } else if (mod.type === 'FX_SIDECHAIN') {
            const stepDuration = beatInterval / (mod.params.rate || 4);
            if (!mod.state.nextScheduleTime) mod.state.nextScheduleTime = ctActx;
            mod.state.progress = 1.0 - ((mod.state.nextScheduleTime - ctActx) / stepDuration);
            while (mod.state.nextScheduleTime < ctActx + 0.1) {
                const curve = window.OptoRackDSP?.getDuckerCurve ? window.OptoRackDSP.getDuckerCurve(mod.params.curveId, mod.params.depth) : [1, 0, 1];
                try {
                    if (mod.nodes?.vca?.gain) {
                        mod.nodes.vca.gain.setTargetAtTime(curve[0], mod.state.nextScheduleTime - 0.005, 0.002);
                        mod.nodes.vca.gain.setValueCurveAtTime(new Float32Array(curve), mod.state.nextScheduleTime, stepDuration);
                    }
                } catch (e) { }
                mod.state.nextScheduleTime += stepDuration;
            }
        }
    }

    processSynthDSP(dspObj, lumaMap, ctActx, beatDelta, cablesRef, DW, DH) {
        const beatInterval = 60 / this.config.bpmRef.current;
        dspObj.currentTopo = (dspObj.params.isLive || !dspObj.snapshotTopo) ? lumaMap : dspObj.snapshotTopo;

        if (dspObj.params.wtScan) {
            dspObj.scanPhase = ((dspObj.scanPhase || 0) + beatDelta * (dspObj.params.scanRate || 1) * (dspObj.params.timeScl || 1.0) * 0.25) % 1.0;
        } else {
            dspObj.scanPhase = dspObj.params.wtPos || 0;
        }

        const isExtTrig = cablesRef.current.some(c => c.destMod === dspObj.id && c.destPort === 'TRIG');
        let shouldTrigger = false;
        let internalRate = dspObj.params.trigRate || 1;

        if (!isExtTrig) {
            if (ctActx >= (dspObj.curTrigT || 0)) {
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
                const { atk = 0.01, dec = 0.1, sus = 0.5, rel = 0.2, hold = 0 } = dspObj.params;
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
                setTimeout(() => { state.gate = 0; }, (atk + hold + dec + rel + 0.1) * 1000);
            }

            const maxH = 64;
            const real = new Float32Array(maxH); const imag = new Float32Array(maxH);
            const warpExp = Math.pow(2, (dspObj.params.warp || 0) * 2.5);
            const bendAmt = dspObj.params.bend || 0;
            const symAmt = dspObj.params.sym || 0;
            
            state.smoothWtPos = lerp(state.smoothWtPos || 0, dspObj.scanPhase, 0.2);
            let phaseX = state.smoothWtPos;

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

            const now = performance.now();
            if (!dspObj._lastWaveTime || now - dspObj._lastWaveTime > 32) {
                try {
                    const wave = this.config.cDsp.current.actx.createPeriodicWave(real, imag, { disableNormalization: false });
                    dspObj.unisonOscs?.forEach(osc => osc.setPeriodicWave(wave));
                    dspObj._lastWaveTime = now;
                } catch (e) { }
            }
        }
    }

    drawCables(ctx, cw, ch, dpr, cablesRef, cam, mouse) {
        const cables = cablesRef.current;
        const time = performance.now();
        const segments = 32; // Higher resolution for physical realism
        const stiffness = 0.92;
        const gravity = 0.35;
        const airResistance = 0.98;

        cables.forEach(c => {
            const sCtrl = window.moduleControllers && window.moduleControllers[c.srcMod];
            const dCtrl = window.moduleControllers && window.moduleControllers[c.destMod];
            if (!sCtrl || !dCtrl) return;

            const p1World = sCtrl.getJackPos ? sCtrl.getJackPos(c.srcPort, false) : sCtrl.getWorldPortPos(c.srcPort, false);
            const p2World = dCtrl.getJackPos ? dCtrl.getJackPos(c.destPort, true) : dCtrl.getWorldPortPos(c.destPort, true);
            if (!p1World || !p2World) return;

            // Convert world to screen space
            const p1 = { x: p1World.x * cam.z + cam.x, y: p1World.y * cam.z + cam.y };
            const p2 = { x: p2World.x * cam.z + cam.x, y: p2World.y * cam.z + cam.y };

            if (!c._physics) {
                c._physics = [];
                for (let i = 0; i < segments; i++) {
                    const ratio = i / (segments - 1);
                    c._physics.push({
                        x: p1.x + (p2.x - p1.x) * ratio,
                        y: p1.y + (p2.y - p1.y) * ratio,
                        oldX: p1.x + (p2.x - p1.x) * ratio,
                        oldY: p1.y + (p2.y - p1.y) * ratio
                    });
                }
                c._snapStartTime = time;
            }

            const segmentLen = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) / (segments * 0.85);
            const snapAge = time - (c._snapStartTime || time);
            const snapForce = snapAge < 500 ? (1.0 - snapAge / 500) * 15.0 : 0;

            // Verlet Integration
            c._physics.forEach((p, i) => {
                if (i === 0) { p.x = p1.x; p.y = p1.y; return; }
                if (i === segments - 1) { p.x = p2.x; p.y = p2.y; return; }

                const vx = (p.x - p.oldX) * airResistance;
                const vy = (p.y - p.oldY) * airResistance;
                p.oldX = p.x; p.oldY = p.y;
                p.x += vx; p.y += vy + gravity * cam.z;

                if (snapForce > 0) {
                    p.x += (Math.random() - 0.5) * snapForce;
                    p.y += (Math.random() - 0.5) * snapForce;
                }

                // Mouse Interaction
                const dx = p.x - mouse.x; const dy = p.y - mouse.y;
                const mDist = Math.sqrt(dx * dx + dy * dy);
                if (mDist < 120 * cam.z) {
                    const force = (1.0 - mDist / (120 * cam.z)) * 3.0;
                    p.x += dx * force * 0.15; p.y += dy * force * 0.15;
                }
            });

            // Tension constraints
            for (let r = 0; r < 12; r++) {
                for (let i = 0; i < segments - 1; i++) {
                    const a = c._physics[i], b = c._physics[i + 1];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
                    const diff = (segmentLen - d) / d;
                    const ox = dx * diff * 0.5 * stiffness;
                    const oy = dy * diff * 0.5 * stiffness;
                    if (i > 0) { a.x -= ox; a.y -= oy; }
                    if (i < segments - 2) { b.x += ox; b.y += oy; }
                }
            }

            // Draw Path with 3D Tubular Shading
            const drawWireLayer = (width, color, blur, opacity) => {
                ctx.beginPath();
                ctx.moveTo(c._physics[0].x, c._physics[0].y);
                for (let i = 1; i < segments - 2; i++) {
                    const xc = (c._physics[i].x + c._physics[i + 1].x) / 2;
                    const yc = (c._physics[i].y + c._physics[i + 1].y) / 2;
                    ctx.quadraticCurveTo(c._physics[i].x, c._physics[i].y, xc, yc);
                }
                ctx.quadraticCurveTo(c._physics[segments - 2].x, c._physics[segments - 2].y, c._physics[segments - 1].x, c._physics[segments - 1].y);
                
                ctx.lineWidth = width * cam.z;
                ctx.strokeStyle = color;
                ctx.shadowBlur = blur * cam.z;
                ctx.shadowColor = color;
                ctx.globalAlpha = opacity;
                ctx.lineCap = 'round';
                ctx.stroke();
                ctx.globalAlpha = 1.0;
                ctx.shadowBlur = 0;
            };

            // Realistic Layering (Tubular Shading)
            drawWireLayer(12, 'rgba(0,0,0,0.45)', 25, 0.35); // Ambient Occlusion / Shadow
            drawWireLayer(8, c.color, 12, 1.0); // Base Color & Inner Glow
            
            // Sub-pixel "Sheen" Layer
            ctx.setLineDash([12, 4]);
            drawWireLayer(6, 'rgba(0,0,0,0.15)', 0, 0.5); // Micro-Texture
            ctx.setLineDash([]);

            // Specular Reflection (Tubular Highlight)
            drawWireLayer(3, 'rgba(255,255,255,0.25)', 2, 0.4);
            drawWireLayer(1.5, 'rgba(255,255,255,0.6)', 0, 0.7); // Sharp Peak Highlight

            const drawPlug = (p, targetP) => {
                const angle = Math.atan2(targetP.y - p.y, targetP.x - p.x);
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(angle);
                
                const z = cam.z;
                // Strain Relief (Rubberized Ribbing)
                ctx.fillStyle = '#0a0a0a';
                for (let i = 0; i < 3; i++) {
                    ctx.fillRect(i * 4 * z, -4 * z, 2 * z, 8 * z);
                }
                
                // Plug Body (Anodized / Brushed Metal)
                const grad = ctx.createLinearGradient(0, -7 * z, 0, 7 * z);
                grad.addColorStop(0, '#2a2a2a'); 
                grad.addColorStop(0.3, '#555'); 
                grad.addColorStop(0.5, '#777'); 
                grad.addColorStop(0.7, '#444'); 
                grad.addColorStop(1, '#111');
                ctx.fillStyle = grad;
                ctx.beginPath(); 
                ctx.roundRect(-28 * z, -8 * z, 28 * z, 16 * z, 2 * z); 
                ctx.fill();

                // Color Code Ring (Emissive)
                ctx.fillStyle = c.color; 
                ctx.shadowBlur = 10 * z;
                ctx.shadowColor = c.color;
                ctx.fillRect(-12 * z, -8 * z, 4 * z, 16 * z);
                ctx.shadowBlur = 0;

                // Chrome Jack Tip (Machined Polish)
                const chrome = ctx.createLinearGradient(0, -4 * z, 0, 4 * z);
                chrome.addColorStop(0, '#aaa'); 
                chrome.addColorStop(0.4, '#fff'); 
                chrome.addColorStop(0.5, '#eee'); 
                chrome.addColorStop(1, '#888');
                ctx.fillStyle = chrome;
                ctx.beginPath(); 
                ctx.roundRect(-36 * z, -4 * z, 16 * z, 8 * z, [3 * z, 0, 0, 3 * z]); 
                ctx.fill();
                
                if (snapAge < 400) { // High-Energy Connect Flash
                    const flashSize = (400 - snapAge) / 4;
                    const opacity = (400 - snapAge) / 400;
                    const radial = ctx.createRadialGradient(-36 * z, 0, 0, -36 * z, 0, flashSize * z);
                    radial.addColorStop(0, `rgba(255,255,255,${opacity})`);
                    radial.addColorStop(0.4, `rgba(0,229,255,${opacity * 0.5})`);
                    radial.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = radial;
                    ctx.beginPath(); ctx.arc(-36 * z, 0, flashSize * z, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            };

            drawPlug(c._physics[0], c._physics[1]);
            drawPlug(c._physics[segments - 1], c._physics[segments - 2]);
        });

        // Dragging cable (The "Live" wire with Physics)
        const drag = this.config.disruptCursor.current;
        const dragRef = this.config.dragCableRef?.current || window._dragCableRef;
        
        if (drag.down && dragRef) {
            const d = dragRef;
            const ctrl = window.moduleControllers[d.modId];
            if (ctrl) {
                const portPos = ctrl.getWorldPortPos(d.portId, d.isInput);
                if (!portPos) return;
                const p1 = portPos.isAbsolute ? { x: portPos.x, y: portPos.y } : { x: portPos.x * cam.z + cam.x, y: portPos.y * cam.z + cam.y };
                const p2 = { x: mouse.x, y: mouse.y };
                const z = cam.z;

                // Initialize Drag Physics
                if (!this._dragPhysics) {
                    this._dragPhysics = [];
                    for (let i = 0; i < segments; i++) {
                        const ratio = i / (segments - 1);
                        this._dragPhysics.push({
                            x: p1.x + (p2.x - p1.x) * ratio,
                            y: p1.y + (p2.y - p1.y) * ratio,
                            oldX: p1.x + (p2.x - p1.x) * ratio,
                            oldY: p1.y + (p2.y - p1.y) * ratio
                        });
                    }
                }

                // Update Drag Physics
                this._dragPhysics.forEach((p, i) => {
                    if (i === 0) { p.x = p1.x; p.y = p1.y; return; }
                    if (i === segments - 1) { p.x = p2.x; p.y = p2.y; return; }

                    const vx = (p.x - p.oldX) * airResistance;
                    const vy = (p.y - p.oldY) * airResistance;
                    p.oldX = p.x; p.oldY = p.y;
                    p.x += vx; p.y += vy + gravity * z;
                });

                const segmentLenDrag = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) / (segments * 0.9);
                for (let r = 0; r < 8; r++) {
                    for (let i = 0; i < segments - 1; i++) {
                        const a = this._dragPhysics[i], b = this._dragPhysics[i + 1];
                        const dx = b.x - a.x, dy = b.y - a.y;
                        const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
                        const diff = (segmentLenDrag - d) / d;
                        const ox = dx * diff * 0.5 * stiffness;
                        const oy = dy * diff * 0.5 * stiffness;
                        if (i > 0) { a.x -= ox; a.y -= oy; }
                        if (i < segments - 2) { b.x += ox; b.y += oy; }
                    }
                }

                // Draw Dragging Wire
                const wCol = (this.config.wireColor && this.config.wireColor.current) ? this.config.wireColor.current : (this.config.wireColor || window._activeWireColor || '#FFF');
                
                const drawDragLayer = (width, color, blur, opacity) => {
                    ctx.beginPath();
                    ctx.moveTo(this._dragPhysics[0].x, this._dragPhysics[0].y);
                    for (let i = 1; i < segments - 2; i++) {
                        const xc = (this._dragPhysics[i].x + this._dragPhysics[i + 1].x) / 2;
                        const yc = (this._dragPhysics[i].y + this._dragPhysics[i + 1].y) / 2;
                        ctx.quadraticCurveTo(this._dragPhysics[i].x, this._dragPhysics[i].y, xc, yc);
                    }
                    ctx.quadraticCurveTo(this._dragPhysics[segments - 2].x, this._dragPhysics[segments - 2].y, this._dragPhysics[segments - 1].x, this._dragPhysics[segments - 1].y);
                    ctx.lineWidth = width * z;
                    ctx.strokeStyle = color;
                    ctx.shadowBlur = blur * z;
                    ctx.shadowColor = color;
                    ctx.globalAlpha = opacity;
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                    ctx.shadowBlur = 0;
                };

                drawDragLayer(10, 'rgba(0,0,0,0.3)', 15, 0.3); // Shadow
                drawDragLayer(7, wCol, 10, 1.0); // Base
                drawDragLayer(3, 'rgba(255,255,255,0.4)', 0, 0.6); // Highlight

                // Draw plug at mouse
                const pEnd = this._dragPhysics[segments - 1];
                const pPrev = this._dragPhysics[segments - 2];
                const angle = Math.atan2(pEnd.y - pPrev.y, pEnd.x - pPrev.x);
                
                ctx.save();
                ctx.translate(pEnd.x, pEnd.y);
                ctx.rotate(angle);
                
                // Realistic Plug for Dragging
                const grad = ctx.createLinearGradient(0, -7 * z, 0, 7 * z);
                grad.addColorStop(0, '#2a2a2a'); grad.addColorStop(0.5, '#666'); grad.addColorStop(1, '#111');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.roundRect(-28 * z, -7 * z, 28 * z, 14 * z, 3 * z); ctx.fill();
                
                // Color Ring
                ctx.fillStyle = wCol; ctx.fillRect(-10 * z, -7 * z, 4 * z, 14 * z);
                
                // Metal Tip
                const chrome = ctx.createLinearGradient(0, -4 * z, 0, 4 * z);
                chrome.addColorStop(0, '#aaa'); chrome.addColorStop(0.5, '#fff'); chrome.addColorStop(1, '#888');
                ctx.fillStyle = chrome;
                ctx.beginPath(); ctx.roundRect(-36 * z, -3.5 * z, 12 * z, 7 * z, [3 * z, 0, 0, 3 * z]); ctx.fill();
                
                ctx.restore();
            }
        } else {
            this._dragPhysics = null;
        }
    }
}