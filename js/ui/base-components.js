// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OPTORACK - UI COMPONENT SYSTEM
 * Architectural Role: Design System & Interactive State Wrappers
 * - DraggableWindow: Bridges the gap between absolute world-space and React lifecycle.
 * - ModuleJack/Knob: Localized signal processors that update both visual state and Audio Nodes.
 * - Browser: A portal for structural changes to the DSP graph.
 */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const BrowserItem = ({ title, desc, onClick }) => (
    <div className="browser-item" onPointerDown={(e)=>e.stopPropagation()} onClick={onClick}>
        <div className="browser-item-title">{title}</div>
        <div className="browser-item-desc">{desc}</div>
    </div>
);

const formatKnobValue = (label, val) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    const l = label.toUpperCase();

    // Time params → ms / s
    if (['ATK', 'DEC', 'REL', 'HOLD', 'SMOOTH', 'DECAY', 'DELAY', 'TIME'].includes(l)) {
        if (val < 0.01) return `${Math.round(val * 1000)}ms`;
        if (val < 1)    return `${(val * 1000).toFixed(0)}ms`;
        return `${val.toFixed(2)}s`;
    }
    // Frequency params → Hz / kHz
    if (['CUT', 'LO-CUT', 'HI-CUT', 'CUTOFF', 'FREQ', 'COLOR', 'RATE'].includes(l)) {
        if (val >= 10000) return `${(val / 1000).toFixed(1)}kHz`;
        if (val >= 1000)  return `${(val / 1000).toFixed(2)}kHz`;
        if (val < 1)      return `${val.toFixed(3)}Hz`;
        return `${val.toFixed(1)}Hz`;
    }
    // LFO rate → Hz with fewer decimals
    if (['LFO RT', 'LFO RATE'].includes(l)) return `${val.toFixed(2)}Hz`;
    // dB params
    if (['DRIVE', 'GAIN', 'VOLUME', 'LOW', 'MID', 'HIGH', 'VOL', 'OUT GAIN'].includes(l)) {
        return val >= 0 ? `+${val.toFixed(1)}dB` : `${val.toFixed(1)}dB`;
    }
    // Pitch → semitones
    if (['PITCH', 'P.ENV', 'P-ENV', 'SEMI', 'BEND'].includes(l)) {
        const rounded = Math.round(val);
        return rounded >= 0 ? `+${rounded}st` : `${rounded}st`;
    }
    // Resonance (Q)
    if (['RES', 'RES (Q)', 'Q'].includes(l)) return val.toFixed(1);
    // Unison voices
    if (['UNISON', 'VOICES', 'MESH RES'].includes(l)) return `${Math.round(val)}v`;
    // Sustain / Mix / Level → %
    if (['SUS', 'MIX', 'WET', 'DRY', 'DEPTH'].includes(l)) return `${Math.round(val * 100)}%`;
    // 0–1 levels → %
    if (['LEVEL', 'SUB LVL', 'IN LVL', 'NOISE', 'NOISE LEVEL'].includes(l)) return `${Math.round(val * 100)}%`;
    // Pan → L/R
    if (l === 'PAN') {
        if (Math.abs(val) < 0.02) return 'C';
        return val < 0 ? `L${Math.round(Math.abs(val) * 100)}` : `R${Math.round(val * 100)}`;
    }
    // BPM-sync
    if (l === 'BPM') return `${Math.round(val)}`;
    // Gate %
    if (l === 'GATE') return `${Math.round(val * 100)}%`;
    // WT pos
    if (['WT POS', 'SCAN'].includes(l)) return `${(val * 100).toFixed(1)}%`;
    // FM amount
    if (['FM AMT', 'FM DEPTH', 'FM'].includes(l)) return val.toFixed(2);
    // Crush / bit depth feel
    if (l === 'CRUSH') return val > 0 ? val.toFixed(2) : 'OFF';
    // Generic small integer
    if (Number.isInteger(val)) return `${val}`;
    // Generic float — max 2 meaningful decimals
    if (Math.abs(val) >= 10)  return val.toFixed(1);
    if (Math.abs(val) >= 1)   return val.toFixed(2);
    if (Math.abs(val) >= 0.1) return val.toFixed(3);
    return val.toFixed(2);
};

const Knob = ({label, val = 0, min, max, step, def, onChange, onAssign, isAssigning}) => {
    const [displayVal, setDisplayVal] = useState(val);
    const [isChanging, setIsChanging] = useState(false);
    const targetRef = useRef(val);
    const rafRef = useRef(null);
    const changeTimeoutRef = useRef(null);

    useEffect(() => {
        targetRef.current = val;
        setIsChanging(true);
        if (changeTimeoutRef.current) clearTimeout(changeTimeoutRef.current);
        changeTimeoutRef.current = setTimeout(() => setIsChanging(false), 300);

        if (!rafRef.current) {
            const smooth = () => {
                setDisplayVal(prev => {
                    const diff = targetRef.current - prev;
                    if (Math.abs(diff) < 0.0001) { rafRef.current = null; return targetRef.current; }
                    rafRef.current = requestAnimationFrame(smooth);
                    return prev + diff * 0.15; // Slightly snappier
                });
            };
            rafRef.current = requestAnimationFrame(smooth);
        }
    }, [val]);

    const pct = (displayVal - min) / (max - min); const angle = window.lerp(-135, 135, pct);
    
    const handleDrag = (e) => {
        e.preventDefault(); e.stopPropagation(); 
        if (isAssigning && onAssign) { onAssign(); return; }
        
        let lastY = e.clientY; 
        let lastT = performance.now();
        let currentAccumulator = val;

        const onMove = (moveEvent) => {
            const now = performance.now();
            const dt = Math.max(now - lastT, 1);
            const dy = lastY - moveEvent.clientY;
            const velocity = Math.abs(dy) / dt;
            const velMult = moveEvent.shiftKey ? 0.4 : window.clamp(1 + Math.pow(velocity * 3.0, 2.5), 1, 20);
            const baseSensitivity = moveEvent.shiftKey ? 2500 : 800; 
            const delta = (dy * ((max - min) / baseSensitivity)) * velMult;
            
            currentAccumulator = window.clamp(currentAccumulator + delta, min, max);
            lastY = moveEvent.clientY;
            lastT = now;
            onChange(Math.round(currentAccumulator * 1000000000) / 1000000000);
        };
        const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    };

    return (
        <div className="knob-container" style={{cursor: isAssigning ? 'crosshair' : 'ns-resize'}} onPointerDown={handleDrag} onDoubleClick={(e) => { e.stopPropagation(); onChange(def); }}>
            <div className={`knob-dial ${isChanging ? 'active-glow' : ''}`} style={{ border: isAssigning ? '2px solid #B266FF' : 'none' }}>
                <div className="knob-indicator" style={{ transform:`translate(-50%, -100%) rotate(${isNaN(angle) ? 0 : angle}deg)` }} />
                <div className="knob-ring-bg" />
                <div className="knob-ring-fill" style={{ 
                    background: `conic-gradient(from -135deg, #00E5FF ${pct * 270}deg, transparent 0deg)`,
                    opacity: isChanging ? 0.8 : 0.3
                }} />
            </div>
            <div className="knob-label" style={{color: isAssigning ? '#B266FF' : '#ccc', opacity: isChanging ? 1 : 0.7}}>{label}</div>
            <div className={`knob-value ${isChanging ? 'value-glow' : ''}`}>{formatKnobValue(label, displayVal)}</div>
        </div>
    );
};

const ModuleJack = ({id, n, t=false, type="cv", active=false, patchedColor, domReg, onDown, onUp, onDoubleClick }) => {
    const innerColor = active ? (patchedColor || (type === 'audio' ? '#00E5FF' : '#F78E1E')) : '#111';
    const glow = active ? `0 0 15px ${innerColor}, inset 0 0 5px rgba(255,255,255,0.5)` : 'none';
    
    // Persistent random tilt for hardware realism
    const tilt = useMemo(() => ({
        x: (Math.random() - 0.5) * 6,
        y: (Math.random() - 0.5) * 6
    }), []);

    return (
        <div className="jack-container" style={{justifyContent: t?'flex-start':'flex-end'}}>
           {!t && <div className="jack-label" style={{marginRight: '12px'}}>{n}</div>}
           <div className="jack-wrapper" onPointerDown={onDown} onPointerUp={onUp} onDoubleClick={onDoubleClick} style={{ perspective: '500px' }}>
               <div className="jack-housing" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
                   <div className="jack-rim" />
                   <div className="jack-hole" ref={(el) => { 
                       if (domReg) domReg(el); 
                       else {
                           if (!window.OptoRackJacks) window.OptoRackJacks = {};
                           const key = `${id}_${n}`;
                           if (el) window.OptoRackJacks[key] = el;
                           else delete window.OptoRackJacks[key];
                       }
                   }} style={{ 
                       background: active ? `radial-gradient(circle at center, ${innerColor} 0%, #000 80%)` : '#080808',
                       boxShadow: glow 
                   }}>
                       <div className="jack-inner-barrel" />
                       <div className="jack-glow-point" style={{ 
                           backgroundColor: active ? '#FFF' : 'transparent',
                           opacity: active ? 1 : 0 
                       }} />
                   </div>
               </div>
           </div>
           {t && <div className="jack-label" style={{marginLeft: '12px'}}>{n}</div>}
        </div>
    );
};

const DraggableWindow = ({ id, title, color, initialX, initialY, initialW, initialH, isGroup, isFixed, onClose, onDuplicate, onCopy, onPaste, onMutate, onDrag, children }) => {
    const winRef = useRef(null); const coreRef = useRef(null);
    const pos = useRef({ x: initialX, y: initialY }); const size = useRef({ w: initialW || null, h: initialH || null });
    const isDraggingRef = useRef(false); const [isMinimized, setIsMinimized] = useState(false); const [isEntering, setIsEntering] = useState(true);

    useEffect(() => { const timer = setTimeout(() => setIsEntering(false), 500); return () => clearTimeout(timer); }, []);
    useEffect(() => {
        window.moduleControllers[id] = {
            moveBy: (dx, dy) => { 
                if (isFixed) return;
                pos.current.x += dx; pos.current.y += dy; 
                if (winRef.current) winRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`; 
                if (onDrag) onDrag(id); 
            },
            getWorldRect: () => ({ 
                x: pos.current.x, 
                y: pos.current.y, 
                w: size.current.w || winRef.current?.offsetWidth || 0, 
                h: size.current.h || winRef.current?.offsetHeight || 0 
            }),
            getWorldPortPos: (portId, isInput) => {
                // If we have the direct element from our global registry, use its actual screen position
                const jackEl = window.OptoRackJacks && window.OptoRackJacks[`${id}_${portId}`];
                if (jackEl) {
                    const r = jackEl.getBoundingClientRect();
                    // Map screen coords back to "world" space (relative to world container)
                    // This is handled by render loop, so just provide absolute center for now
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2, isAbsolute: true };
                }
                // Fallback to approximate position relative to module
                return { x: pos.current.x + 50, y: pos.current.y + 50 }; 
            }
        };
        return () => { delete window.moduleControllers[id]; };
    }, [id, onDrag, isFixed]);

    const handleFocus = () => { window.globalZIndex += 1; if(winRef.current) winRef.current.style.zIndex = window.globalZIndex; window._lastInteractedModuleId = id; };
    useEffect(() => { handleFocus(); if(winRef.current) winRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`; }, []);

    const handlePointerMove = useCallback((e) => {
        if (!winRef.current || !coreRef.current || isEntering || !isDraggingRef.current) return;
        const rect = winRef.current.getBoundingClientRect(); const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx; const dy = e.clientY - cy; const isMobile = window.innerWidth < 768;
        const maxTilt = isMobile ? 2 : 6; const maxLift = isMobile ? 10 : 25;
        const rx = window.clamp((dy / (rect.height / 2)) * -maxTilt, -maxTilt, maxTilt); const ry = window.clamp((dx / (rect.width / 2)) * maxTilt, -maxTilt, maxTilt);
        coreRef.current.style.transform = `translateZ(${maxLift}px) rotateX(${rx}deg) rotateY(${ry}deg)`; 
    }, [isEntering, isGroup]);

    const handlePointerLeave = useCallback(() => {
        if (!coreRef.current || isEntering) return;
        coreRef.current.style.transform = `translateZ(0px) rotateX(0deg) rotateY(0deg)`; 
    }, [isEntering, isGroup]);

    const handleHeaderDown = (e) => {
        e.stopPropagation(); handleFocus(); isDraggingRef.current = true; let lastX = e.clientX; let lastY = e.clientY;
        if (winRef.current) winRef.current.style.transition = 'none'; 

        const onMove = (moveEvent) => {
            try {
                if (isFixed) return;
                const effectiveZoom = winRef.current.getBoundingClientRect().width / winRef.current.offsetWidth;
                const dx = (moveEvent.clientX - lastX) / effectiveZoom; const dy = (moveEvent.clientY - lastY) / effectiveZoom;
                lastX = moveEvent.clientX; lastY = moveEvent.clientY; pos.current.x += dx; pos.current.y += dy;
                if (winRef.current) { winRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`; }
                if (onDrag) onDrag(id); 
            } catch(err) { onUp(); }
        };
        const onUp = () => {
            isDraggingRef.current = false; handlePointerLeave();
            window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
            if (!isFixed) {
                const SNAP = 40; pos.current.x = Math.round(pos.current.x / SNAP) * SNAP; pos.current.y = Math.round(pos.current.y / SNAP) * SNAP;
                if (winRef.current) {
                    winRef.current.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'; winRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
                    setTimeout(() => { if (winRef.current) winRef.current.style.transition = 'none'; }, 300);
                }
                if (onDrag) onDrag(id);
            }
        };
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    };

    const HeaderBtn = ({ label, onClick, colorHover }) => (
        <div className="window-header-btn" onPointerDown={(e) => { e.stopPropagation(); onClick(); }} style={{ '--hover-color': colorHover }}>
            {label}
        </div>
    );

    return (
        <div className="window-container" ref={winRef} onPointerDownCapture={handleFocus} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}
             style={{ position: isFixed ? 'relative' : 'absolute', width: size.current.w ? `${size.current.w}px` : 'max-content', height: size.current.h ? `${size.current.h}px` : 'max-content' }}>
            <div ref={coreRef} className="window-core glass-panel"
                 style={{
                     borderTop: `3px solid ${color}`,
                     transform: isEntering ? `translateZ(-100px) scale(0.9)` : `translateZ(0px) rotateX(0deg) rotateY(0deg)`, opacity: isEntering ? 0 : 1,
                     transition: isEntering ? 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.5s ease-out' : 'transform 0.15s linear, box-shadow 0.2s ease-out'
                 }}>
                <div className="window-header" onPointerDown={handleHeaderDown} onDoubleClick={() => setIsMinimized(!isMinimized)} style={{ cursor: isFixed ? 'default' : 'grab' }}>
                    <div className="window-title" style={{color: color || '#FFF'}}>
                        {title}
                    </div>
                    {!isFixed && (
                        <div className="window-header-controls">
                            {onDuplicate && <HeaderBtn label="DUP" onClick={()=>onDuplicate(id)} colorHover="#00E5FF" />}
                            {onCopy && <HeaderBtn label="CPY" onClick={()=>onCopy(id)} colorHover="#99CC33" />}
                            {onPaste && <HeaderBtn label="PST" onClick={()=>onPaste(id)} colorHover="#F78E1E" />}
                            {onMutate && <HeaderBtn label="MUT" onClick={()=>onMutate(id)} colorHover="#B266FF" />}
                            <HeaderBtn label="–" onClick={()=>setIsMinimized(!isMinimized)} colorHover="#E2E2E2" />
                            <HeaderBtn label="✕" onClick={() => { if(onClose) onClose(id); }} colorHover="#FF0033" />
                        </div>
                    )}
                </div>
                <div className="window-content" onPointerDown={e=>e.stopPropagation()} style={{ padding: isMinimized ? '0' : '16px', display: isMinimized ? 'none' : 'flex' }}>
                    {children}
                </div>
            </div>
        </div>
    );
};

const StepGrid = ({ mod, color, inactiveColor = 'rgba(255,255,255,0.05)' }) => {
    const [step, setStep] = useState(0);
    const [, setTick] = useState(0);
    
    useEffect(() => {
        let id;
        const loop = () => {
            if (mod.state && mod.state.step !== step) {
                setStep(mod.state.step);
            }
            id = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(id);
    }, [mod, step]);

    return (
        <div className="fx-step-grid">
            {(mod.params?.steps || []).map((active, i) => {
                const isPlayhead = step === i;
                return (
                    <div key={i} className="fx-step-btn" onPointerDown={(e)=>{ e.stopPropagation(); const newSteps = [...mod.params.steps]; newSteps[i] = !newSteps[i]; mod.params.steps = newSteps; setTick(p=>p+1); }} 
                         style={{
                             background: isPlayhead ? '#FFF' : (active ? color : inactiveColor),
                             boxShadow: isPlayhead ? '0 0 10px #FFF' : (active ? `0 0 8px ${color}` : 'none')
                         }} />
                );
            })}
        </div>
    );
};

const Slider = ({ label, val, min, max, step, onChange, color = '#00E5FF' }) => {
    return (
        <div className="slider-container" onPointerDown={(e) => e.stopPropagation()}>
            <div className="slider-label-row">
                <span className="slider-label">{label}</span>
                <span className="slider-value">{val.toFixed(2)}</span>
            </div>
            <input 
                type="range" 
                className="cyber-slider"
                min={min} 
                max={max} 
                step={step} 
                value={val} 
                onChange={(e) => onChange(parseFloat(e.target.value))}
                style={{ '--accent': color }}
            />
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
window.Knob = Knob;
window.Slider = Slider;
window.ModuleJack = ModuleJack;
window.DraggableWindow = DraggableWindow;
window.BrowserItem = BrowserItem;
