/**
 * OPTORACK - MAIN APPLICATION ORCHESTRATOR
 * Architectural Role: The Central Hub
 * - Manages the global React State for all active modules and routing.
 * - Houses the persistent Audio Graph (cDsp) and the 60fps Physics Render Loop.
 * - Coordinates between UI interaction and the low-level Web Audio/WebGL drivers.
 */


const { useState, useEffect, useRef, useMemo, useCallback } = React;

const MASTER_PROFILES = {
    'NEUTRAL': { threshold: -0.3, ratio: 12, attack: 0.005, release: 0.200, makeup: 1.0 },
    'EDM_CRUSH': { threshold: -1.2, ratio: 20, attack: 0.001, release: 0.080, makeup: 1.8 },
    'PUNCH_MODE': { threshold: -3.0, ratio: 4, attack: 0.030, release: 0.150, makeup: 2.2 },
    'STREAM_SAFE': { threshold: -1.0, ratio: 10, attack: 0.010, release: 0.300, makeup: 1.2 }
};

/**
 * OPTORACK - MAIN APPLICATION ORCHESTRATOR
 * Architectural Role: The Central Hub
 * - Manages the global React State for all active modules and routing.
 * - Houses the persistent Audio Graph (cDsp) and the 60fps Physics Render Loop.
 * - Coordinates between UI interaction and the low-level Web Audio/WebGL drivers.
 */
function App() {
    const { 
        Knob, Slider, ModuleJack, DraggableWindow, BrowserItem, StepGrid,
        WavetablePanelDisplay, EnvVisualizer, FilterVisualizer, LfoVisualizer, ParametricEQ,
        MasterLoudnessMonitor, VisualEnginePreview, WebGLBackground,
        Minimap, LobbyScreen, PerformanceMeter, CPUGraph, ErrorBoundary
    } = window;

    const TWEAKS = window.QuickTweaks || {
        defaults: { viewMode: 'SLEEP', bpm: 128, rootNote: 'C', scale: 'MINOR', quality: 'STANDARD', resolutionProfile: 'PERFORMANCE' },
        ranges: { bpmMin: 40, bpmMax: 240, maxModules: 50, worldSize: 5000 },
        timings: { proTipRotateMs: 8000, loadProjectReconnectDelayMs: 500, panicDurationMs: 3000 },
        labels: { addPhotosynth: '+ ADD PHOTOSYNTH', moduleLibrary: '+ MODULE LIBRARY', returnToCanvas: 'RETURN TO CANVAS' }
    };

    const [viewMode, setViewMode] = useState(TWEAKS.defaults.viewMode);
    const [networkMode, setNetworkMode] = useState('MENU');
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [libraryTab, setLibraryTab] = useState('MODULES');
    const [isProjectsOpen, setIsProjectsOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(true);
    const [isSynthMenuOpen, setIsSynthMenuOpen] = useState(false);

    const [savedProjects, setSavedProjects] = useState([]);
    const [saveDirectoryHandle, setSaveDirectoryHandle] = useState(null);
    const [saveDirectoryPath, setSaveDirectoryPath] = useState('NOT SET');
    const [synths, setSynths] = useState([]);
    const [fxModules, setFxModules] = useState([]);
    const [masterPos, setMasterPos] = useState({ x: 1350, y: 50 });
    const [patchCount, setPatchCount] = useState(0);
    const [wireColor, setWireColor] = useState(window.THEME_CLRS[0]);

    const [bpm, setBpm] = useState(TWEAKS.defaults.bpm);
    const [rootNote, setRootNote] = useState(TWEAKS.defaults.rootNote);
    const [scale, setScale] = useState(TWEAKS.defaults.scale);
    const [quality, setQuality] = useState(TWEAKS.defaults.quality);
    const [resolutionProfile, setResolutionProfile] = useState(window.OptoRackResolution.currentKey || TWEAKS.defaults.resolutionProfile);
    const [startupResolutionProfile, setStartupResolutionProfile] = useState(window.OptoRackResolution.currentKey || TWEAKS.defaults.resolutionProfile);

    const [isVisualsBrowserOpen, setIsVisualsBrowserOpen] = useState(false);
    const [visualTemplate, setVisualTemplate] = useState('PARTICLES');
    const [visualSettings, setVisualSettings] = useState({
        PARTICLES: { size: 5.0, elevationMultiplier: 300.0, speed: 0.5, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        AR_ENVIRONMENT: { depthScale: 600.0, occlusion: 0.8, speed: 1.0, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        HUD_DATAMESH: { hudGlow: 1.5, speed: 0.5, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        DEJA_VU: { pointSize: 2.5, depthScale: 800.0, ghosting: 0.5, speed: 1.0, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        NATURAL_WORLD: { pointSize: 2.0, depthScale: 1200.0, speed: 1.5, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        WIREFRAME_TERRAIN: { elevationMultiplier: 400.0, speed: 1.0, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        NEON_WAVES: { waveCount: 10.0, glowIntensity: 1.5, speed: 1.0, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        GLITCH_MATRIX: { glitchIntensity: 1.0, pixelation: 10.0, speed: 1.5, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        FLUID_CAUSTICS: { viscosity: 0.5, splashForce: 1.5, speed: 0.8, flow: 1.0, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        PHOTO_RECON: { depthScale: 500.0, roomFold: 1.0, speed: 0.5, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        VOXEL_WORLD: { depthScale: 600.0, speed: 0.5, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 },
        LIDAR_SCAN: { depthScale: 600.0, pointSize: 2.0, speed: 0.8, camSens: 1.0, camContrast: 1.0, camFreq: 1.0 }
    });

    const [, setRenderTrigger] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [assignMode, setAssignMode] = useState(null);
    const [wtPresets, setWtPresets] = useState([
        {
            name: "INIT - 4742 CORE",
            topo: new Float32Array(2048),
            params: {
                atk: 0.005, hold: 0.0, dec: 0.5, sus: 0.2, rel: 0.8,
                cut: 2500, res: 1.0, drive: 2, filterType: 'lowpass',
                wtPos: 0.0, scanRate: 0.2, wtScan: true, topoInt: 1.0,
                unison: 1, detune: 0.0, blend: 1.0, warp: 0.0, bend: 0.0, sym: 0.0,
                sync: 1.0, formant: 1.0, crush: 0.0, harm: 1.0, fmAmt: 0.0,
                subOn: true, subLvl: 0.4, noiseOn: false, pEnv: 0,
                timeScl: 1.0, freqScl: 1.0, ampScl: 1.0, isLive: true
            }
        },
        {
            name: "KICK - PRO EDM",
            topo: new Float32Array(2048).fill(0).map((_, i) => Math.exp(-i * 0.02) + (i < 50 ? Math.random() * 0.2 : 0)),
            params: { 
                atk: 0.002, dec: 0.15, sus: 0.0, rel: 0.15, 
                cut: 120, res: 4.5, drive: 22, filterType: 'lowpass',
                unison: 1, pEnv: 85, ampScl: 2.0, fmAmt: 0.2,
                subOn: true, subLvl: 1.0, subFilter: false, 
                oscOn: true, noiseOn: true, noiseLvl: 0.1, noiseColor: 4000,
                isLive: false 
            }
        },
        {
            name: "HI-HAT - METALLIC",
            topo: new Float32Array(2048).fill(0).map((_, i) => Math.random()),
            params: { 
                atk: 0.001, dec: 0.05, sus: 0.0, rel: 0.04, 
                cut: 15000, res: 0.1, drive: 0, filterType: 'highpass',
                pitch: 60, unison: 1, 
                noiseOn: true, noiseLvl: 0.7, noiseFilter: true,
                oscOn: true, subOn: false, 
                formant: 4.5, crush: 0.6, isLive: false,
                ampScl: 0.5
            }
        },
        {
            name: "SNARE - CLINICAL",
            topo: new Float32Array(2048).fill(0).map((_, i) => Math.random() * Math.exp(-i * 0.05)),
            params: { 
                atk: 0.001, dec: 0.08, sus: 0.0, rel: 0.08, 
                cut: 4000, res: 0.5, drive: 8, filterType: 'bandpass',
                unison: 3, detune: 0.1, noiseOn: true, noiseLvl: 0.5,
                ampScl: 1.2, isLive: false 
            }
        },
        {
            name: "BASS - REESE GROWL",
            topo: new Float32Array(2048).fill(0).map((_, i) => (i % 32 < 16 ? 1 : 0)),
            params: { 
                atk: 0.01, dec: 0.4, sus: 0.6, rel: 0.3, 
                cut: 600, res: 2.0, drive: 12, filterType: 'lowpass',
                unison: 9, detune: 0.12, unisonSpread: 1.0,
                subOn: true, subLvl: 0.8, subFilter: true,
                fmAmt: 0.25, isLive: false 
            }
        },
        {
            name: "PAD - NEON WAVES",
            topo: new Float32Array(2048).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.5 + 0.5),
            params: {
                atk: 1.2, dec: 2.0, sus: 0.7, rel: 3.5,
                cut: 1200, res: 1.2, drive: 1.5, filterType: 'lowpass',
                unison: 9, detune: 0.12, blend: 0.6, warp: 0.3, bend: 0.1, sym: 0.4,
                sync: 1.2, formant: 1.0, lfoDepth: 40, lfoRate: 0.15,
                isLive: false
            }
        },
        {
            name: "BASS - 303 ACID",
            topo: new Float32Array(2048).fill(0).map((_, i) => (i % 64 < 32 ? 1 : 0)), 
            params: {
                atk: 0.01, dec: 0.35, sus: 0.15, rel: 0.15,
                cut: 350, res: 22.0, drive: 25, filterType: 'lowpass',
                unison: 1, fmAmt: 0.05, pEnv: 0,
                lfoRate: 1.8, lfoDepth: 95, lfoWave: 0,
                subOn: true, subLvl: 0.3,
                isLive: false
            }
        }
    ]);
    const [tipIndex, setTipIndex] = useState(0);

    const [playersList, setPlayersList] = useState([]);
    const [permissions, setPermissions] = useState({ canPatch: true, canTweak: true });
    const [latency, setLatency] = useState(0);
    const [cursors, setCursors] = useState({});
    const lastMouseEmit = useRef(0);

    const camRef = useRef({ x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 });
    // Expose camRef globally so smartSpawnPos (globals-and-helpers.js) can read it
    window._spawnCamRef = camRef;
    const worldRef = useRef(null);
    const cablesRef = useRef([]);
    const dragCableRef = useRef(null);
    const droppedCablesRef = useRef([]);
    const disruptCursor = useRef({ x: -1000, y: -1000, force: 0, down: false });

    const lastRenderTime = useRef(performance.now());
    const frameCount = useRef(0);
    const bpmRef = useRef(120);
    const scaleRef = useRef('MINOR');
    const rootNoteRef = useRef('C');

    const sharedStateRef = useRef({ scanX: 0, synthParams: null, pixels: null, activeSynthId: null });

    const vRef = useRef(null);
    const canvasFg = useRef(null);
    const scanCanvas = useRef(document.createElement('canvas'));
    const glContainerRef = useRef(null);
    const camPixelsCache = useRef(null);
    // ── SECTION: AUDIO ENGINE PERSISTENCE ───────────────────────────────────
    // Architectural Note: cDsp holds the non-React state (AudioContext, Nodes).
    // This allows audio to persist even when React components unmount/remount.
    const cDsp = useRef({ modules: {}, cameraFailed: false, actx: null, mOut: null, dest: null, recorder: null, chunks: [] });
    const jackElements = useRef({});

    useEffect(() => { bpmRef.current = window.clamp(bpm, TWEAKS.ranges.bpmMin, TWEAKS.ranges.bpmMax); }, [bpm]);
    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => {
        rootNoteRef.current = rootNote;
        if (!cDsp.current.actx) return;
        const ct = cDsp.current.actx.currentTime;
        synths.forEach(s => {
            const mod = cDsp.current.modules[s.id];
            if (mod && window.OptoRackDSP && window.NOTES) {
                const baseFreq = window.OptoRackDSP.getBaseFrequency(window.NOTES[rootNote % 12] || 'C') * Math.pow(2, mod.params.pitch / 12);
                mod.unisonOscs?.forEach(osc => osc.frequency.setTargetAtTime(baseFreq, ct, 0.1));
                const subFreq = baseFreq * Math.pow(2, mod.params.subOct || -1) * Math.pow(2, (mod.params.subSemi || 0) / 12);
                if (mod.subOsc) mod.subOsc.frequency.setTargetAtTime(subFreq, ct, 0.1);
            }
        });
    }, [rootNote, synths]);

    // Integrate Topbar Selectors (replacing redundant DOMContentLoaded listener)
    useEffect(() => {
        const noteToMidi = {
            'C': 60, 'C#': 61, 'D': 62, 'D#': 63, 'E': 64, 'F': 65,
            'F#': 66, 'G': 67, 'G#': 68, 'A': 69, 'A#': 70, 'B': 71
        };

        const noteSelector = document.querySelector('.topbar-note-selector');
        const scaleSelector = document.querySelector('.topbar-scale-selector');

        const onNoteChange = (e) => {
            const noteName = e.target.value.toUpperCase();
            if (noteToMidi[noteName]) {
                setRootNote(noteName); // Sync to React state
                window.OptoRackState.currentRootNote = noteToMidi[noteName];
            }
        };

        const onScaleChange = (e) => {
            setScale(e.target.value.toUpperCase()); // Sync to React state
            window.OptoRackState.currentScale = e.target.value.toLowerCase();
        };

        if (noteSelector) noteSelector.addEventListener('change', onNoteChange);
        if (scaleSelector) scaleSelector.addEventListener('change', onScaleChange);

        return () => {
            if (noteSelector) noteSelector.removeEventListener('change', onNoteChange);
            if (scaleSelector) scaleSelector.removeEventListener('change', onScaleChange);
        };
    }, []);
    useEffect(() => {
        const tips = (window.AppTips && window.AppTips.items) || [];
        const tipCount = tips.length || 1;
        const tipInterval = setInterval(() => setTipIndex(Math.floor(Math.random() * tipCount)), TWEAKS.timings.proTipRotateMs);
        
        window.OptoNetwork.onPlayerListUpdated = (list) => {
            setPlayersList(list);
        };
        
        window.OptoNetwork.onPermissionsChanged = (perms) => {
            setPermissions({ ...perms });
        };
        
        const diagnosticInterval = setInterval(() => {
            if (window.OptoNetwork.latency !== latency) {
                setLatency(window.OptoNetwork.latency);
            }
        }, 1000);
        
        return () => {
            clearInterval(tipInterval);
            clearInterval(diagnosticInterval);
        };
    }, [latency]);

    // CPU PANIC PROTECTION
    useEffect(() => {
        if (viewMode !== 'PATCHING') return;
        let panicTimer = 0;
        let lastTime = performance.now();
        let frameId;

        const checkPerf = () => {
            const now = performance.now();
            const delta = now - lastTime;
            lastTime = now;

            // If a frame takes longer than 100ms (very low FPS / high load)
            if (delta > 100) {
                panicTimer += delta;
            } else {
                panicTimer = Math.max(0, panicTimer - 50);
            }

            if (panicTimer > TWEAKS.timings.panicDurationMs) {
                alert("CRITICAL SYSTEM OVERLOAD: DISCONNECTING TO PREVENT SYSTEM HANG.");
                window.location.reload(); // Hard reset to lobby
            }
            frameId = requestAnimationFrame(checkPerf);
        };
        frameId = requestAnimationFrame(checkPerf);
        return () => cancelAnimationFrame(frameId);
    }, [viewMode]);

    useEffect(() => {
        try {
            const savedPath = localStorage.getItem('optorack_save_dir_label');
            if (savedPath) setSaveDirectoryPath(savedPath);
        } catch (e) { }

        const handlePointerMove = (e) => {
            const now = Date.now();
            if (now - lastMouseEmit.current > 33) { // ~30fps
                if (window.OptoNetwork && (window.OptoNetwork.isHost || (window.OptoNetwork.conn && window.OptoNetwork.conn.open))) {
                    window.OptoNetwork.send({
                        type: 'CURSOR',
                        peerId: window.OptoNetwork.isHost ? 'HOST' : window.OptoNetwork.peer?.id,
                        name: window.OptoNetwork.username,
                        x: e.clientX,
                        y: e.clientY
                    });
                }
                lastMouseEmit.current = now;
            }
        };
        window.addEventListener('pointermove', handlePointerMove);
        return () => window.removeEventListener('pointermove', handlePointerMove);
    }, []);

    const handleNetworkMessage = (msg) => {
        if (msg.type === 'STATE_SYNC') {
            loadProject(msg.data);
            setVisualTemplate(msg.visualTemplate);
        } else if (msg.type === 'PARAM_UPDATE') {
            const mod = cDsp.current.modules[msg.modId];
            if (mod) {
                mod.baseParams[msg.param] = msg.value;
                if (mod.params[msg.param] !== undefined) mod.params[msg.param] = msg.value;
                setRenderTrigger(p => p + 1);
            }
        } else if (msg.type === 'VISUAL_TEMPLATE') {
            setVisualTemplate(msg.template);
        } else if (msg.type === 'CURSOR') {
            setCursors(prev => ({
                ...prev,
                [msg.peerId]: { x: msg.x, y: msg.y, name: msg.name, lastSeen: Date.now() }
            }));
        } else if (msg.type === 'MODULE_MOVE') {
            const isSynth = msg.id.startsWith('VOICE_');
            if (isSynth) {
                setSynths(prev => prev.map(s => s.id === msg.id ? { ...s, x: msg.x, y: msg.y } : s));
            } else {
                setFxModules(prev => prev.map(f => f.id === msg.id ? { ...f, x: msg.x, y: msg.y } : f));
            }
            const ctrl = window.moduleControllers[msg.id];
            if (ctrl) ctrl.moveBy(0, 0); // Trigger visual update in the controller
        } else if (msg.type === 'MASTER_PARAM_UPDATE') {
            const mod = cDsp.current.modules['MASTER'];
            if (mod) {
                mod.baseParams[msg.param] = msg.value;
                if (mod.params[msg.param] !== undefined) mod.params[msg.param] = msg.value;
                setRenderTrigger(p => p + 1);
            }
        } else if (msg.type === 'SCAN_X_SYNC') {
            sharedStateRef.current.scanX = msg.value;
            // Update all synths scanPhase for the visualizer
            synths.forEach(s => {
                const mod = cDsp.current.modules[s.id];
                if (mod) mod.scanPhase = msg.value;
            });
        }
    };

    const handleLobbyStart = (mode) => {
        setNetworkMode(mode);
        setViewMode("SLEEP");
    };

    const INIT_MOTHER_SYSTEM = async (mode) => {
        setNetworkMode(mode);
        const isGuest = mode === 'GUEST';

        const bootRes = window.OptoRackResolution.setProfile(startupResolutionProfile, true);
        setResolutionProfile(bootRes);
        const actx = window.SoundEngine.createAudioContext(quality);
        if (actx.state === 'suspended') await actx.resume();

        scanCanvas.current.width = DW; scanCanvas.current.height = DH;
        const masterVol = actx.createGain(); masterVol.gain.value = 1.0;
        const masterIn = actx.createGain(); masterIn.connect(masterVol);

        // --- PROFESSIONAL EDM MASTER CHAIN (TARGET: -7 LUFS) ---
        const masterHPF = actx.createBiquadFilter(); masterHPF.type = 'highpass'; masterHPF.frequency.value = 20; 
        const masterTilt = actx.createBiquadFilter(); masterTilt.type = 'highshelf'; masterTilt.frequency.value = 5000; masterTilt.gain.value = 0.5;

        // Multiband Simulation (EQ pre-compression)
        const lowShelf = actx.createBiquadFilter(); lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 120; lowShelf.gain.value = 0;

        const softClipper = actx.createWaveShaper(); softClipper.curve = makeSoftClipCurve(); softClipper.oversample = '4x';
        
        // PRO LIMITER: -0.3dB True Peak ceiling, tight lookahead simulation
        const brickwall = actx.createDynamicsCompressor(); brickwall.threshold.value = -0.3; brickwall.ratio.value = 20; brickwall.attack.value = 0.001; brickwall.release.value = 0.080;
        const finalClamp = actx.createWaveShaper(); finalClamp.curve = makeClampCurve(0.99); 

        masterVol.connect(masterHPF); masterHPF.connect(masterTilt); masterTilt.connect(lowShelf); lowShelf.connect(softClipper); 
        softClipper.connect(brickwall); brickwall.connect(finalClamp); finalClamp.connect(actx.destination);
        
        const dest = actx.createMediaStreamDestination(); finalClamp.connect(dest);
        const masterAnalyser = actx.createAnalyser(); masterAnalyser.fftSize = 4096; finalClamp.connect(masterAnalyser);

        cDsp.current.actx = actx; cDsp.current.mOut = masterVol; cDsp.current.dest = dest; cDsp.current.mAnalyser = masterAnalyser;

        cDsp.current.modules['MASTER'] = {
            id: 'MASTER', type: 'MASTER', inNodes: { IN: masterIn }, nodes: { vol: masterVol, hp: masterHPF, tilt: masterTilt, low: lowShelf, soft: softClipper, limit: brickwall, clamp: finalClamp },
            params: { vol: 0.0, profile: 'NEUTRAL', softClip: true, limiter: true, mute: false }, baseParams: { vol: 0.0, profile: 'NEUTRAL', softClip: true, limiter: true, mute: false }
        };

        if (!isGuest) {
            try {
                // Add a 5 second timeout to getUserMedia in case user ignores the prompt
                const getMediaPromise = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 } });
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Camera prompt timeout")), 5000));
                
                const feed = await Promise.race([getMediaPromise, timeoutPromise]);
                if (vRef.current) { vRef.current.srcObject = feed; await vRef.current.play(); }
                
                if (mode === 'HOST') {
                    const vTrack = feed.getVideoTracks()[0];
                    const aTrack = dest.stream.getAudioTracks()[0];
                    if (vTrack && aTrack) {
                        const combined = new MediaStream([vTrack, aTrack]);
                        window.OptoNetwork.streamMedia(combined);
                    }
                    window.OptoNetwork.onPeerDisconnected = () => console.log('Guest left');
                }
            } catch (err) {
                console.warn("Camera blocked or timed out. Using mathematical fallback generator.", err);
                cDsp.current.cameraFailed = true;
                
                // Still setup host audio stream even if camera fails
                if (mode === 'HOST') {
                    const aTrack = dest.stream.getAudioTracks()[0];
                    if (aTrack) {
                        // Create a blank video track if camera fails so the combined stream still works
                        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
                        const blankVideo = canvas.captureStream(30).getVideoTracks()[0];
                        const combined = new MediaStream([blankVideo, aTrack]);
                        window.OptoNetwork.streamMedia(combined);
                    }
                    window.OptoNetwork.onPeerDisconnected = () => console.log('Guest left');
                }
            }
        } else {
            window.OptoNetwork.onStream = (remoteStream) => {
                if (vRef.current) {
                    vRef.current.srcObject = remoteStream;
                    const playPromise = vRef.current.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.log("Autoplay prevented, will play on first click");
                        });
                    }
                }
                const source = actx.createMediaStreamSource(remoteStream);
                source.connect(masterAnalyser);
                source.connect(actx.destination);
            };
            
            // Apply cached stream if it arrived early
            if (window.OptoNetwork.remoteStream) {
                window.OptoNetwork.onStream(window.OptoNetwork.remoteStream);
            }
        }

        if (mode !== 'OFFLINE') {
            window.OptoNetwork.onData = (msg) => {
                handleNetworkMessage(msg);
            };
            if (mode === 'HOST') {
                window.OptoNetwork.onConnected = () => {
                    const state = serializeProject();
                    window.OptoNetwork.send({ type: 'STATE_SYNC', data: state, visualTemplate });
                };
                
                // Real-time ScanX sync from Host
                const scanInterval = setInterval(() => {
                    if (window.OptoNetwork.isHost && networkMode === 'HOST') {
                        const activeId = sharedStateRef.current.activeSynthId || (synths[0]?.id);
                        if (activeId && cDsp.current.modules[activeId]) {
                            window.OptoNetwork.send({ 
                                type: 'SCAN_X_SYNC', 
                                value: cDsp.current.modules[activeId].scanPhase 
                            });
                        }
                    }
                }, 50); // 20fps sync for scan line
                
                cDsp.current._scanSyncInterval = scanInterval;
            }
        }

        setViewMode("PATCHING");
    };

    const broadcastStructuralChange = () => {
        if (window.OptoRackIsLoading) return;
        if (networkMode !== 'OFFLINE' && networkMode !== 'MENU') {
            const state = serializeProject();
            window.OptoNetwork.send({ type: 'STATE_SYNC', data: state, visualTemplate });
        }
    };

    const toggleRecording = () => {
        try {
            if (isRecording) { cDsp.current.recorder.stop(); setIsRecording(false); }
            else {
                cDsp.current.chunks = []; const recorder = new MediaRecorder(cDsp.current.dest.stream, { audioBitsPerSecond: 320000 });
                recorder.ondataavailable = e => cDsp.current.chunks.push(e.data);
                recorder.onstop = () => {
                    const blob = new Blob(cDsp.current.chunks, { type: 'audio/webm' });
                    const url = URL.createObjectURL(blob); const a = document.createElement('a');
                    a.href = url; a.download = `OptoRack_Live_${Date.now()}.webm`; a.click();
                };
                recorder.start(); cDsp.current.recorder = recorder; setIsRecording(true);
            }
        } catch (e) { console.warn("MediaRecorder not supported on this browser."); }
    };

    const serializeProject = () => ({
        synths: synths.map(s => {
            const mod = cDsp.current.modules[s.id];
            return { 
                id: s.id, 
                type: s.type, 
                x: s.x, 
                y: s.y, 
                params: mod ? mod.baseParams : {} 
            };
        }),
        fxModules: fxModules.map(f => {
            const mod = cDsp.current.modules[f.id];
            return { 
                id: f.id, 
                type: f.type, 
                x: f.x, 
                y: f.y, 
                w: f.w, 
                h: f.h, 
                params: mod ? mod.baseParams : {} 
            };
        }),
        cables: cablesRef.current.map(c => ({ srcMod: c.srcMod, srcPort: c.srcPort, destMod: c.destMod, destPort: c.destPort, color: c.color })),
        master: (cDsp.current.modules['MASTER'] ? cDsp.current.modules['MASTER'].baseParams : {}), 
        bpm, scale, rootNote, quality, resolutionProfile, visualTemplate
    });

    const handleModuleDrag = (id) => {
        const ctrl = window.moduleControllers[id];
        if (ctrl) {
            const rect = ctrl.getWorldRect();
            if (networkMode !== 'OFFLINE') {
                window.OptoNetwork.send({ type: 'MODULE_MOVE', id, x: rect.x, y: rect.y });
            }
        }
    };

    const refreshProjectsFromDirectory = async (directoryHandle) => {
        if (!directoryHandle) return;
        try {
            const files = [];
            for await (const entry of directoryHandle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
                    files.push({ name: entry.name, handle: entry });
                }
            }
            files.sort((a, b) => b.name.localeCompare(a.name));
            setSavedProjects(files);
        } catch (e) {
            console.warn('Failed to read project directory', e);
        }
    };

    const chooseSaveDirectory = async () => {
        if (!window.showDirectoryPicker) {
            alert('Directory picker is not supported in this browser runtime.');
            return;
        }
        try {
            const rootHandle = await window.showDirectoryPicker();
            const optoRackSavesHandle = await rootHandle.getDirectoryHandle('OptoRack Saves', { create: true });
            setSaveDirectoryHandle(optoRackSavesHandle);
            const label = `${rootHandle.name}\\OptoRack Saves`;
            setSaveDirectoryPath(label);
            try { localStorage.setItem('optorack_save_dir_label', label); } catch (e) { }
            await refreshProjectsFromDirectory(optoRackSavesHandle);
            setIsProjectsOpen(true);
        } catch (e) {
            console.warn('Directory selection canceled or failed', e);
        }
    };

    const saveProjectToDirectory = async () => {
        if (!saveDirectoryHandle) {
            await chooseSaveDirectory();
            return;
        }
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `OptoRack_Project_${timestamp}.json`;
            const fileHandle = await saveDirectoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(serializeProject(), null, 2));
            await writable.close();
            await refreshProjectsFromDirectory(saveDirectoryHandle);
        } catch (e) {
            console.warn('Failed to save project file', e);
        }
    };

    const loadProjectFromFileHandle = async (fileHandle) => {
        try {
            const file = await fileHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            loadProject(data);
            setIsProjectsOpen(false);
        } catch (e) {
            console.error('Invalid or unreadable project file', e);
        }
    };

    const loadProject = (data) => {
        window.OptoRackIsLoading = true;
        synths.forEach(s => removeModule(s.id, true)); fxModules.forEach(f => removeModule(f.id, false));
        cablesRef.current = []; setPatchCount(0);
        setBpm(data.bpm || TWEAKS.defaults.bpm); setScale(data.scale || TWEAKS.defaults.scale); setRootNote(data.rootNote || TWEAKS.defaults.rootNote); setQuality(data.quality || TWEAKS.defaults.quality);
        const loadedRes = data.resolutionProfile || TWEAKS.defaults.resolutionProfile;
        setResolutionProfile(loadedRes);
        if ((window.OptoRackResolution.currentKey || TWEAKS.defaults.resolutionProfile) !== loadedRes) {
            window.OptoRackResolution.setProfile(loadedRes, true);
            window.location.reload();
            return;
        }
        if (data.master) Object.keys(data.master).forEach(k => updateParam('MASTER', k, data.master[k]));
        data.fxModules.forEach(f => spawnFX(f.type, f.params, f.x, f.y, f.id, f.w, f.h));
        data.synths.forEach(s => spawnSynth(s.params, s.x, s.y, s.id));
        setTimeout(() => {
            data.cables.forEach(c => {
                const sNode = cDsp.current.modules[c.srcMod]?.outNodes[c.srcPort]; const dNode = cDsp.current.modules[c.destMod]?.inNodes[c.destPort];
                if (sNode && dNode) {
                    const cableGain = cDsp.current.actx.createGain(); cableGain.gain.value = 1;
                    sNode.connect(cableGain); cableGain.connect(dNode); cablesRef.current.push({ ...c, cableGain });
                }
            });
            setPatchCount(cablesRef.current.length); setRenderTrigger(p => p + 1);
            window.OptoRackIsLoading = false;
        }, TWEAKS.timings.loadProjectReconnectDelayMs);
    };

    // ── SECTION: MODULE SPAWNING ────────────────────────────────────────────
    // Architectural Note: Determines module initialization logic and hooks
    // the audio nodes directly into the persistent cDsp graph.
    const spawnFX = (type, overrideParams = null, offsetX = null, offsetY = null, forceId = null, forceW = null, forceH = null) => {
        const actx = cDsp.current.actx; 
        const id = forceId || `${type}_${Date.now()}`;
        
        // Use the new Audio Factory
        let newMod = window.OptoRackAudio.createFX(type, actx, overrideParams);
        newMod.id = id;
        newMod.type = type;

        // Determine visual dimensions
        let initialW = forceW || 380; 
        let initialH = forceH || 320;
        if (type === 'FX_EQ') { initialW = 720; initialH = 390; }
        else if (type === 'FX_PRO_REV') { initialW = 480; initialH = 250; }
        else if (type === 'FX_SIDECHAIN') { initialW = 480; initialH = 300; }
        else if (type === 'UTILITY_IO') { initialW = 300; initialH = 200; }

        cDsp.current.modules[id] = newMod;
        
        if (synths.length + fxModules.length >= (TWEAKS.ranges.maxModules || 50)) {
            alert("SYSTEM LIMIT REACHED: Maximum 50 modules allowed.");
            return;
        }
        
        Object.keys(newMod.params).forEach(k => updateParamInternal(newMod, k, newMod.params[k]));

        const hasOffset = Number.isFinite(offsetX) && Number.isFinite(offsetY);
        const slotPos = hasOffset
            ? { x: offsetX, y: offsetY }
            : window.SpawnManager.getSpawnPosition(camRef.current, initialW, initialH);

        const catInfo = Object.values(moduleLibraryByCategory).find(cat => cat.items.some(i => i.id === type));
        const modColor = catInfo ? catInfo.color : '#FFF';

        setFxModules(p => [...p, { id, type, x: slotPos.x, y: slotPos.y, w: initialW, h: initialH, mClr: modColor }]);

        if (!hasOffset) window.OptoRackCamera.focusOnSpawn(camRef.current, slotPos.x, slotPos.y, initialW, initialH);

        setIsBrowserOpen(false);
        broadcastStructuralChange();
    };

    const spawnSynth = useCallback((overrideParams = null, offsetX = null, offsetY = null, forceId = null, template = 'PHOTON_OSCILLATOR') => {
        const actx = cDsp.current.actx;
        if (!actx) return;

        const modId = forceId || `VOICE_${Date.now()}`;
        
        // Use the new Audio Factory
        let newN = window.OptoRackAudio.createSynth(actx, overrideParams, template, window.OptoRackState.currentRootNote);
        newN.id = modId;

        // Visual initialization
        let initialW = 720; 
        let initialH = 680;
        
        const currentCat = Object.values(moduleLibraryByCategory).find(c => c.items.some(i => i.id === 'SYNTH'));
        const synthClr = currentCat ? currentCat.color : '#00E5FF';
        newN.mClr = synthClr;

        cDsp.current.modules[modId] = newN;

        // Apply ALL params to audio nodes on spawn
        Object.keys(newN.params).forEach(k => updateParamInternal(newN, k, newN.params[k]));

        // Use the new Camera/Spawn System
        const hasOffset = Number.isFinite(offsetX) && Number.isFinite(offsetY);
        const slotPos = hasOffset
            ? { x: offsetX, y: offsetY }
            : window.SpawnManager.getSpawnPosition(camRef.current, initialW, initialH);

        setSynths(p => [...p, { id: modId, type: 'SYNTH', x: slotPos.x, y: slotPos.y, w: initialW, h: initialH, mClr: synthClr }]);

        if (!hasOffset) window.OptoRackCamera.focusOnSpawn(camRef.current, slotPos.x, slotPos.y, initialW, initialH);

        setIsBrowserOpen(false);
        broadcastStructuralChange();
    }, [synths.length]);

    const removeModule = (modId, isSynth) => {
        const cablesToRemove = cablesRef.current.filter(c => c.srcMod === modId || c.destMod === modId);
        cablesToRemove.forEach(c => {
            if (c.cableGain) { c.cableGain.gain.setTargetAtTime(0, cDsp.current.actx.currentTime, 0.05); setTimeout(() => { try { c.cableGain.disconnect(); } catch (e) { } }, 100); }
        });
        cablesRef.current = cablesRef.current.filter(c => c.srcMod !== modId && c.destMod !== modId);
        setPatchCount(cablesRef.current.length);

        Object.keys(jackElements.current).forEach(k => { if (k.startsWith(modId + '_')) delete jackElements.current[k]; });

        const mod = cDsp.current.modules[modId];
        if (mod) {
            Object.values(mod.nodes || {}).forEach(n => { try { n.disconnect() } catch (e) { } });
            Object.values(mod.inNodes || {}).forEach(n => { try { n.disconnect() } catch (e) { } });
            Object.values(mod.outNodes || {}).forEach(n => { try { n.disconnect() } catch (e) { } });
            if (mod.unisonOscs) { mod.unisonOscs.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch (e) { } }); }
            if (mod.subOsc) { try { mod.subOsc.stop(); mod.subOsc.disconnect(); } catch (e) { } }
            if (mod.noiseSrc) { try { mod.noiseSrc.stop(); mod.noiseSrc.disconnect(); } catch (e) { } }
            if (mod.lfo) { try { mod.lfo.stop(); mod.lfo.disconnect(); } catch (e) { } }
            if (mod.envCVSource) { try { mod.envCVSource.stop(); mod.envCVSource.disconnect(); } catch (e) { } }
            if (mod.topoCVSource) { try { mod.topoCVSource.stop(); mod.topoCVSource.disconnect(); } catch (e) { } }
        }
        delete cDsp.current.modules[modId];
        if (window.moduleControllers) delete window.moduleControllers[modId];

        if (isSynth) setSynths(p => p.filter(a => a.id !== modId)); else setFxModules(p => p.filter(a => a.id !== modId));
        broadcastStructuralChange();
    };

    const duplicateModule = (id) => {
        const mod = cDsp.current.modules[id]; if (!mod) return;
        const ctrl = window.moduleControllers[id]; const bounds = ctrl ? ctrl.getWorldRect() : { x: 100, y: 100 };
        const clonedParams = JSON.parse(JSON.stringify(mod.baseParams));
        if (mod.type === 'SYNTH') spawnSynth(clonedParams, bounds.x + 40, bounds.y + 40);
        else spawnFX(mod.type, clonedParams, bounds.x + 40, bounds.y + 40);
    };

    const copyParams = (id) => { const mod = cDsp.current.modules[id]; if (mod) window.clipboardParams = { type: mod.type, params: JSON.parse(JSON.stringify(mod.baseParams)) }; };
    const pasteParams = (id) => {
        const mod = cDsp.current.modules[id];
        if (mod && window.clipboardParams && window.clipboardParams.type === mod.type) {
            Object.keys(window.clipboardParams.params).forEach(key => { if (mod.params[key] !== undefined) updateParam(id, key, window.clipboardParams.params[key]); });
        }
    };

    const mutateParams = (id) => {
        const mod = cDsp.current.modules[id]; if (!mod) return;
        Object.keys(mod.params).forEach(key => {
            let val = mod.params[key];
            if (typeof val === 'number') {
                const variation = Math.abs(val) * 0.15 || 0.1;
                updateParam(id, key, val + (Math.random() * variation * 2 - variation));
            } else if (typeof val === 'boolean' && Math.random() > 0.8) updateParam(id, key, !val);
        });
    };

    const randomizeSteps = (id) => {
        const mod = cDsp.current.modules[id];
        if (mod) {
            mod.params.steps = mod.params.steps.map(() => Math.random() > 0.5);
            setRenderTrigger(p => p + 1);
        }
    };

    const handleWheel = (e) => {
        if (viewMode !== "PATCHING" || isBrowserOpen || isProjectsOpen) return;
        const zoomSensitivity = 0.0015; const deltaZ = -e.deltaY * zoomSensitivity;
        const newZ = clamp(camRef.current.tz + deltaZ, 0.2, 2.5); const scaleRatio = newZ / camRef.current.tz;
        
        // Loosen clamp to worldSize * 1.5 to allow reaching edges comfortably
        const worldSize = TWEAKS.ranges.worldSize || 5000;
        const limit = worldSize * 1.5;

        camRef.current.tx = e.clientX - (e.clientX - camRef.current.tx) * scaleRatio;
        camRef.current.ty = e.clientY - (e.clientY - camRef.current.ty) * scaleRatio;
        camRef.current.tz = newZ;
    };

    const handleBgPointerDown = (e) => {
        // Panning Trigger: Middle Mouse (1), Alt+Left (0 + alt), or Left Click on Background
        const isMiddlePan = e.button === 1;
        const isAltPan = e.button === 0 && e.altKey;
        const isBgClick = e.button === 0 && e.target.id === 'bg-interaction';

        if (!isMiddlePan && !isAltPan && !isBgClick) return;
        
        // Check for assignMode (state-synced via ref logic if needed, but here we can just check the current state if this fn is fresh)
        if (assignMode && isBgClick) { setAssignMode(null); return; }
        
        if (isMiddlePan) e.preventDefault();

        document.body.style.cursor = 'grabbing';
        let lastX = e.clientX; 
        let lastY = e.clientY;

        disruptCursor.current.down = true;
        disruptCursor.current.x = e.clientX;
        disruptCursor.current.y = e.clientY;

        const onMove = (moveEvent) => {
            if (!camRef.current) return;
            const worldSize = TWEAKS.ranges.worldSize || 5000;
            const limit = worldSize * 1.5;
            
            // Calculate delta and update target camera position
            camRef.current.tx += (moveEvent.clientX - lastX);
            camRef.current.ty += (moveEvent.clientY - lastY);
            
            lastX = moveEvent.clientX; 
            lastY = moveEvent.clientY;

            disruptCursor.current.x = moveEvent.clientX;
            disruptCursor.current.y = moveEvent.clientY;
        };

        const onUp = () => {
            disruptCursor.current.down = false;
            document.body.style.cursor = '';
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        
        if (isMiddlePan || isAltPan) e.stopPropagation();
    };

    // Keep handleBgPointerDown fresh for the global listener
    const panHandlerRef = useRef(handleBgPointerDown);
    useEffect(() => { panHandlerRef.current = handleBgPointerDown; }, [handleBgPointerDown]);

    // Global Interaction Hook for Navigation (Bypasses stopPropagation on modules)
    useEffect(() => {
        const onGlobalDown = (e) => {
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                panHandlerRef.current(e);
            }
        };
        window.addEventListener('pointerdown', onGlobalDown, { capture: true });
        return () => window.removeEventListener('pointerdown', onGlobalDown, { capture: true });
    }, []);

    const hdPtrUp = () => {
        disruptCursor.current.down = false;
        disruptCursor.current.force = 0.0;
        setTimeout(() => {
            if (dragCableRef.current) {
                droppedCablesRef.current.push({ ...dragCableRef.current, dropTime: performance.now(), dropX: disruptCursor.current.x, dropY: disruptCursor.current.y });
                dragCableRef.current = null;
            }
        }, 50);
    }
    const hdPtrMov = (e) => { if (disruptCursor.current.down || true) { disruptCursor.current.x = e.clientX; disruptCursor.current.y = e.clientY; } }

    const getPatchedColor = (modId, portId, isInput) => {
        const cable = cablesRef.current.find(c => isInput ? (c.destMod === modId && c.destPort === portId) : (c.srcMod === modId && c.srcPort === portId));
        return cable ? cable.color : null;
    };

    const synthsRef = useRef(synths);
    useEffect(() => { synthsRef.current = synths; }, [synths]);
    const fxModulesRef = useRef(fxModules);
    useEffect(() => { fxModulesRef.current = fxModules; }, [fxModules]);

    const wireColorRef = useRef(wireColor);
    useEffect(() => { wireColorRef.current = wireColor; }, [wireColor]);

    useEffect(() => {
        if (viewMode !== "PATCHING") return;
        
        const renderer = new window.OptoRackRenderLoop({
            cDsp, camRef, bpmRef, synthsRef, fxModulesRef, cablesRef, sharedStateRef,
            canvasFg, scanCanvas, vRef, worldRef, glContainerRef,
            disruptCursor, updateParam,
            dragCableRef, wireColor: wireColorRef
        });

        renderer.start();
        return () => renderer.stop();
    }, [viewMode]); // Now ONLY restarts on viewMode change! Very stable.

    const updatePipRegistry = (modId, portId, elm) => { 
        if (!window.OptoRackJacks) window.OptoRackJacks = {};
        if (elm) { 
            jackElements.current[`${modId}_${portId}`] = elm; 
            window.OptoRackJacks[`${modId}_${portId}`] = elm;
        } else {
            delete jackElements.current[`${modId}_${portId}`];
            delete window.OptoRackJacks[`${modId}_${portId}`];
        }
    };

    const handleJackDown = (e, modId, portId, isInput) => {
        if (networkMode === 'GUEST' && !permissions.canPatch) return;
        e.stopPropagation(); if (cDsp.current.actx && cDsp.current.actx.state === 'suspended') cDsp.current.actx.resume();
        if (isInput) {
            const existingIdx = cablesRef.current.findIndex(c => c.destMod === modId && c.destPort === portId);
            if (existingIdx !== -1) {
                const existingCable = cablesRef.current[existingIdx];
                if (existingCable.cableGain) {
                    existingCable.cableGain.gain.setTargetAtTime(0, cDsp.current.actx.currentTime, 0.01);
                    setTimeout(() => { try { existingCable.cableGain.disconnect(); } catch (err) { } }, 50);
                }
                cablesRef.current.splice(existingIdx, 1); setPatchCount(cablesRef.current.length);
                dragCableRef.current = { modId: existingCable.srcMod, portId: existingCable.srcPort, isInput: false };
                window._dragCableRef = dragCableRef.current;
                window._activeWireColor = wireColor;
                disruptCursor.current.down = true; disruptCursor.current.x = e.clientX; disruptCursor.current.y = e.clientY;
                return;
            }
        }
        dragCableRef.current = { modId, portId, isInput }; 
        window._dragCableRef = dragCableRef.current;
        window._activeWireColor = wireColor;
        disruptCursor.current.down = true; disruptCursor.current.x = e.clientX; disruptCursor.current.y = e.clientY;
    };

    const handleJackUp = (modId, portId, isInput) => {
        if (dragCableRef.current) {
            const src = dragCableRef.current; const dest = { modId, portId, isInput };
            if (!src || (src.modId === dest.modId && src.portId === dest.portId)) { 
                dragCableRef.current = null; window._dragCableRef = null; return; 
            }
            if (src.isInput !== dest.isInput) {
                const outJack = src.isInput ? dest : src; const inJack = src.isInput ? src : dest;
                const sNode = cDsp.current.modules[outJack.modId]?.outNodes[outJack.portId]; const dNode = cDsp.current.modules[inJack.modId]?.inNodes[inJack.portId];
                if (sNode && dNode) {
                    const exists = cablesRef.current.find(c => c.srcMod === outJack.modId && c.srcPort === outJack.portId && c.destMod === inJack.modId && c.destPort === inJack.portId);
                    if (!exists) {
                        const cableGain = cDsp.current.actx.createGain(); cableGain.gain.value = 1;
                        sNode.connect(cableGain); cableGain.connect(dNode);
                        const newCables = [...cablesRef.current, { srcMod: outJack.modId, srcPort: outJack.portId, destMod: inJack.modId, destPort: inJack.portId, color: wireColor, cableGain: cableGain }];
                        cablesRef.current = newCables; setPatchCount(newCables.length);
                        broadcastStructuralChange();
                    }
                }
            }
            dragCableRef.current = null;
            window._dragCableRef = null;
        }
    };

    const clearJackCables = (modId, portId, isInput) => {
        const cablesToRemove = cablesRef.current.filter(c => isInput ? (c.destMod === modId && c.destPort === portId) : (c.srcMod === modId && c.srcPort === portId));
        cablesToRemove.forEach(c => {
            if (c.cableGain) { c.cableGain.gain.setTargetAtTime(0, cDsp.current.actx.currentTime, 0.05); setTimeout(() => { try { c.cableGain.disconnect(); } catch (e) { } }, 100); }
        });
        if (cablesToRemove.length > 0) { 
            cablesRef.current = cablesRef.current.filter(c => !cablesToRemove.includes(c)); 
            setPatchCount(cablesRef.current.length); 
            broadcastStructuralChange();
        }
    };

    const updateParamInternal = (mod, param, val) => {
        if (!cDsp.current.actx) return; const ct = cDsp.current.actx.currentTime;

        if (param === 'time' && mod.id.startsWith('FX_DELAY')) mod.nodes.delay.delayTime.setTargetAtTime(val, ct, 0.1);
        if (param === 'feedback' && mod.id.startsWith('FX_DELAY')) mod.nodes.feedback.gain.setTargetAtTime(val, ct, 0.1);
        if (param === 'cutoff' && mod.id.startsWith('FX_DELAY')) mod.nodes.filter.frequency.setTargetAtTime(val, ct, 0.1);
        if (param === 'mix' && mod.id.startsWith('FX_DELAY')) { mod.nodes.wet.gain.setTargetAtTime(val, ct, 0.1); mod.nodes.dry.gain.setTargetAtTime(1.0 - val, ct, 0.1); }

        if (param === 'loGain' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.lowEQ.gain.setTargetAtTime(val, ct, 0.1);
        if (param === 'hiGain' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.hiEQ.gain.setTargetAtTime(val, ct, 0.1);

        if (mod.type === 'FX_EQ') {
            const match = param.match(/b(\d+)([fgq])/);
            if (match) {
                const bIdx = parseInt(match[1]) - 1; const pType = match[2];
                if (pType === 'f') { mod.nodes.bands[bIdx].frequency.cancelScheduledValues(ct); mod.nodes.bands[bIdx].frequency.linearRampToValueAtTime(val, ct + 0.05); }
                if (pType === 'g') { mod.nodes.bands[bIdx].gain.cancelScheduledValues(ct); mod.nodes.bands[bIdx].gain.linearRampToValueAtTime(val, ct + 0.05); }
                if (pType === 'q') { mod.nodes.bands[bIdx].Q.cancelScheduledValues(ct); mod.nodes.bands[bIdx].Q.linearRampToValueAtTime(val, ct + 0.05); }
            }
        }
        if (param === 'mix' && mod.id.startsWith('FX_PRO_REV')) {
            mod.nodes.wet.gain.setTargetAtTime(Math.sin(val * Math.PI / 2), ct, 0.1);
            mod.nodes.dry.gain.setTargetAtTime(Math.cos(val * Math.PI / 2), ct, 0.1);
        }
        if (param === 'distance' && mod.id.startsWith('FX_PRO_REV')) {
            mod.nodes.pre.delayTime.setTargetAtTime(lerp(0.001, 0.15, val), ct, 0.1);
            // Simulate high-frequency dampening over distance (Air absorption)
            if (mod.nodes.hiEQ) {
                mod.nodes.hiEQ.gain.setTargetAtTime(lerp(0, -18, val), ct, 0.1);
                mod.nodes.hiEQ.frequency.setTargetAtTime(lerp(12000, 3000, val), ct, 0.1);
            }
        }

        if (param === 'decay' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.fbs.forEach(fb => fb.gain.setTargetAtTime(val, ct, 0.1));
        if (param === 'size' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.delays.forEach((d, i) => d.delayTime.setTargetAtTime(mod.nodes.baseDelays[i] * val, ct, 0.1));
        if (param === 'loCut' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.lo.frequency.setTargetAtTime(val, ct, 0.1);
        if (param === 'hiCut' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.hi.frequency.setTargetAtTime(val, ct, 0.1);
        if (param === 'spin' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.spin.gain.setTargetAtTime(val, ct, 0.1);
        if (param === 'cut' && mod.id.startsWith('FX_AUTOFILTER')) { mod.nodes.filter1.frequency.setTargetAtTime(val, ct, 0.1); mod.nodes.filter2.frequency.setTargetAtTime(val, ct, 0.1); }        if (mod.id.startsWith('FX_TRANSIENT')) {
            // Simplified transient shaping logic (Actual DSP happens in Worklet or via complex gain routing usually)
            // For now, we simulate the 'impact' via gain bias
            if (param === 'attack') mod.nodes.shaper.gain.setTargetAtTime(val * 1.5, ct, 0.05);
            if (param === 'sustain') mod.nodes.out.gain.setTargetAtTime(val, ct, 0.1);
        }
        if (param === 'res' && mod.id.startsWith('FX_AUTOFILTER')) { mod.nodes.filter1.Q.setTargetAtTime(val * 0.6, ct, 0.1); mod.nodes.filter2.Q.setTargetAtTime(val * 0.6, ct, 0.1); }
        if (param === 'drive' && mod.id.startsWith('FX_AUTOFILTER')) mod.nodes.drive.curve = makeDriveCurve(val);
        if (param === 'lfoRate' && mod.id.startsWith('FX_AUTOFILTER')) mod.nodes.lfo.frequency.setTargetAtTime(val, ct, 0.1);
        if (param === 'lfoAmt' && mod.id.startsWith('FX_AUTOFILTER')) mod.nodes.lfoGain.gain.setTargetAtTime(val, ct, 0.1);
        if (param === 'filterType' && mod.id.startsWith('FX_AUTOFILTER')) { mod.nodes.filter1.type = val; mod.nodes.filter2.type = val; }
        if (param === 'depth' && mod.id.startsWith('FX_OTT')) { mod.nodes.dry.gain.setTargetAtTime(1.0 - val, ct, 0.1); mod.nodes.wet.gain.setTargetAtTime(val, ct, 0.1); }
        if (param === 'low' && mod.id.startsWith('FX_OTT')) mod.nodes.gL.gain.setTargetAtTime(val, ct, 0.1);
        if (param === 'mid' && mod.id.startsWith('FX_OTT')) mod.nodes.gM.gain.setTargetAtTime(val, ct, 0.1);
        if (param === 'high' && mod.id.startsWith('FX_OTT')) mod.nodes.gH.gain.setTargetAtTime(val, ct, 0.1);
        if (param === 'vol' && mod.id.startsWith('UTILITY_IO')) mod.nodes.vol.gain.setTargetAtTime(Math.pow(10, val / 20), ct, 0.1);
        if (param === 'pan' && mod.id.startsWith('UTILITY_IO')) mod.nodes.pan.pan.setTargetAtTime(val, ct, 0.1);
        if (param === 'isMono' && mod.id.startsWith('UTILITY_IO')) { mod.nodes.mono.channelCount = val ? 1 : 2; mod.nodes.mono.channelCountMode = val ? 'explicit' : 'max'; }
    };

    const updateParam = (modId, param, val, isMacro = false) => {
        // Anti-Troll: Check permissions if guest
        if (networkMode === 'GUEST' && !permissions.canTweak) {
            return;
        }
        const mod = cDsp.current.modules[modId];
        if (mod) {
            if (!isMacro) {
                mod.baseParams[param] = val;
                if (networkMode !== 'OFFLINE' && networkMode !== 'MENU') {
                    window.OptoNetwork.send({ type: 'PARAM_UPDATE', modId, param, value: val });
                }
                setRenderTrigger(p => p + 1);
            }
            mod.params[param] = val;
            const ct = cDsp.current.actx?.currentTime || 0;
            if (mod.type === 'SYNTH') {
                sharedStateRef.current.activeSynthId = modId; // Sync WebGL to this synth
                if (param === 'cut') {
                    mod.fB1.frequency.setTargetAtTime(val, ct, 0.02);
                    mod.fB2.frequency.setTargetAtTime(val, ct, 0.02);
                    mod.actualCut = val;
                }
                if (param === 'res') { 
                    mod.fB1.Q.setTargetAtTime(val * 0.7, ct, 0.05); 
                    mod.fB2.Q.setTargetAtTime(val * 0.7, ct, 0.05); 
                    const comp = 1.0 / (1.0 + (val * 0.1));
                    mod.oscGain.gain.setTargetAtTime(comp, ct, 0.05);
                }
                if (param === 'filterType') { mod.fB1.type = val; mod.fB2.type = val; }
                if (param === 'detune' || param === 'unisonSpread') {
                    const detVal = mod.params.detune;
                    const spreadVal = mod.params.unisonSpread;
                    mod.unisonOscs.forEach((osc, i) => {
                        const spreadFactor = (i / (mod.unisonOscs.length - 1)) - 0.5;
                        osc.detune.setTargetAtTime(spreadFactor * detVal * 1200, ct, 0.05);
                        if (mod.unisonPanners[i]) {
                            mod.unisonPanners[i].pan.setTargetAtTime(spreadFactor * spreadVal * 2.0, ct, 0.05);
                        }
                    });
                }
                if (param === 'unison') {
                    const activeCount = Math.min(val, mod.unisonOscs.length);
                    mod.unisonGains.forEach((g, i) => {
                        g.gain.setTargetAtTime(i < activeCount ? 1.0 / Math.sqrt(activeCount) : 0, ct, 0.05);
                    });
                }
                if (param === 'oscOn') mod.oscGain.gain.setTargetAtTime(val ? 1.0 : 0.0, ct, 0.02);
                if (param === 'subOn' || param === 'subLvl') mod.subGain.gain.setTargetAtTime(mod.params.subOn ? mod.params.subLvl : 0.0, ct, 0.02);
                if (param === 'subFilter') { mod.subToFilter.gain.setTargetAtTime(val ? 1.0 : 0.0, ct, 0.02); mod.subToOut.gain.setTargetAtTime(val ? 0.0 : 1.0, ct, 0.02); }
                if (param === 'subPan' && mod.subPanner) mod.subPanner.pan.setTargetAtTime(val, ct, 0.1);
                if (param === 'noiseOn' || param === 'noiseLvl') mod.noiseGain.gain.setTargetAtTime(mod.params.noiseOn ? mod.params.noiseLvl : 0.0, ct, 0.02);
                if (param === 'noiseFilter') { mod.noiseToFilter.gain.setTargetAtTime(val ? 1.0 : 0.0, ct, 0.02); mod.noiseToOut.gain.setTargetAtTime(val ? 0.0 : 1.0, ct, 0.02); }
                if (param === 'noiseColor' && mod.noiseFilterNode) mod.noiseFilterNode.frequency.setTargetAtTime(val, ct, 0.1);
                if (param === 'fmAmt') mod.fmGain.gain.setTargetAtTime(val * 5000, ct, 0.1);
                if (param === 'pEnv') mod.pitchEnvGain.gain.setTargetAtTime(val * 100, ct, 0.1);
                if (param === 'pitch' || param === 'subOct' || param === 'subSemi') {
                    const pitchVal = mod.params.pitch;
                    const subOct = mod.params.subOct || -1;
                    const subSemi = mod.params.subSemi || 0;
                    const baseFreq = window.OptoRackDSP.getBaseFrequency(window.NOTES[rootNoteRef.current % 12] || 'C') * Math.pow(2, pitchVal / 12);
                    mod.unisonOscs.forEach(osc => osc.frequency.setTargetAtTime(baseFreq, ct, 0.1));
                    
                    const subFreq = baseFreq * Math.pow(2, subOct) * Math.pow(2, subSemi / 12);
                    mod.subOsc.frequency.setTargetAtTime(subFreq, ct, 0.1);
                }
                if (param === 'lfoRate') mod.lfo.frequency.setTargetAtTime(val, ct, 0.1);
                if (param === 'lfoDepth') mod.lfoDepth.gain.setTargetAtTime(val, ct, 0.1);
                if (param === 'drive') mod.nodes.synthDrive.gain.setTargetAtTime(Math.pow(10, val / 20), ct, 0.1);
                if (param === 'crush') mod.nodes.bitCrusher.curve = val > 0 ? window.makeClampCurve(1.0 - (val * 0.95)) : window.makeClampCurve(1.0);
                if (param === 'inLvl') {
                    if (mod.audioIn) mod.audioIn.gain.setTargetAtTime(val, ct, 0.1);
                    mod.unisonMaster.gain.setTargetAtTime(val, ct, 0.1);
                }
                if (param === 'lfoWave') mod.lfo.type = ['sine', 'square', 'sawtooth', 'triangle'][val];
            } else if (mod.type === 'MASTER') {
                if (param === 'vol' || param === 'mute') {
                    const db = param === 'vol' ? val : mod.params.vol;
                    const isMuted = param === 'mute' ? val : mod.params.mute;
                    const linear = isMuted ? 0 : Math.pow(10, db / 20);
                    mod.nodes.vol.gain.setTargetAtTime(linear, ct, 0.1);
                }
                if (param === 'softClip') mod.nodes.soft.curve = val ? makeSoftClipCurve() : null;
                if (param === 'limiter') { 
                    mod.nodes.limit.threshold.setTargetAtTime(val ? -1.0 : 0.0, ct, 0.1); 
                    mod.nodes.limit.ratio.setTargetAtTime(val ? 20.0 : 1.0, ct, 0.1); 
                    mod.nodes.limit.knee.setTargetAtTime(val ? 10.0 : 0.0, ct, 0.1);
                    if (mod.nodes.clamp) mod.nodes.clamp.curve = val ? window.makeClampCurve(0.98) : null;
                }
            } else { updateParamInternal(mod, param, val); }

            // Sync Master params
            if (modId === 'MASTER' && networkMode === 'HOST') {
                window.OptoNetwork.send({ type: 'MASTER_PARAM_UPDATE', param, value: val });
            }

            if (!isMacro) setRenderTrigger(p => p + 1);
        }
    };

    const handleKnobAssign = (modId, param) => {
        if (!assignMode) return;
        const lfoMod = cDsp.current.modules[assignMode];
        if (lfoMod && lfoMod.type === 'MOD_LFO') {
            const exists = lfoMod.state.targets.find(t => t.modId === modId && t.param === param);
            if (!exists) lfoMod.state.targets.push({ modId, param });
            else lfoMod.state.targets = lfoMod.state.targets.filter(t => !(t.modId === modId && t.param === param));
        }
        setAssignMode(null);
    };

    const saveWtPreset = (modId) => {
        const mod = cDsp.current.modules[modId]; if (!mod || !mod.currentTopo) return;
        const name = prompt("Name this Photosynth Preset:"); if (!name) return;
        const newPreset = { name, topo: Array.from(mod.currentTopo), params: JSON.parse(JSON.stringify(mod.baseParams)) };
        const updated = [...wtPresets, newPreset]; setWtPresets(updated);
    };

    const loadWtPreset = (modId, presetIdx) => {
        const mod = cDsp.current.modules[modId]; const preset = wtPresets[presetIdx];
        if (mod && preset) {
            // First, reset to a clean state to prevent crosstalk from previous presets
            const defaults = window.OptoRackAudio.getSynthDefaultParams();
            Object.entries(defaults).forEach(([k, v]) => updateParam(modId, k, v));
            
            mod.snapshotTopo = new Float32Array(preset.topo);
            if (preset.params) {
                Object.entries(preset.params).forEach(([k, v]) => {
                    updateParam(modId, k, v);
                });
            }
            updateParam(modId, 'isLive', false); updateParam(modId, 'wtScan', false);
            updateParam(modId, 'showPresets', false); // Auto-back after load
        }
    };

    const isPatched = (modId, portId, isInput) => { return cablesRef.current.some(c => isInput ? (c.destMod === modId && c.destPort === portId) : (c.srcMod === modId && c.srcPort === portId)); };

    const moduleLibraryItems = Object.values((window.ModuleLibrary && window.ModuleLibrary.fx) || {});
    const moduleLibraryByCategory = moduleLibraryItems.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = { color: item.categoryColor, items: [] };
        acc[item.category].items.push(item);
        return acc;
    }, {});

    const handleResolutionChange = (nextProfile) => {
        const safeKey = window.OptoRackResolution.setProfile(nextProfile, true);
        setResolutionProfile(safeKey);
        if (viewMode === 'PATCHING') {
            const shouldReload = window.confirm('Apply new OptoRack resolution now? This will reload the session to rebuild the visual engine at the selected quality.');
            if (shouldReload) window.location.reload();
        }
    };

    return (
        <div className="app-container" onWheel={handleWheel}>

            {/* Visible Webcam Feed in Background */}
            <video ref={vRef} id="video-feed" className="video-feed" playsInline autoPlay muted
                style={{ opacity: viewMode === "PATCHING" ? 0.5 : 0 }}
            />

            {viewMode === "PATCHING" && <WebGLBackground videoRef={vRef} wireColor={wireColor} sharedStateRef={sharedStateRef} visualTemplate={visualTemplate} visualSettings={visualSettings} camRef={camRef} />}

            {/* Black transparent gradient vignette from top to bottom */}
            {viewMode === "PATCHING" && <div className="vignette-overlay" />}

            <div id="bg-interaction" className="bg-interaction" onPointerDown={handleBgPointerDown} onPointerUp={hdPtrUp} onPointerMove={hdPtrMov} />

            {/* Wires Canvas - Z-Index 30 puts it behind the modules (which are 40+) */}
            <canvas ref={canvasFg} className="wires-canvas" />

            {networkMode === 'MENU' && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999 }}>
                    <window.LobbyScreen 
                        onStart={(m) => handleLobbyStart(m)} 
                        savedProjects={savedProjects}
                        onLoadProject={async (handle) => {
                            setNetworkMode('OFFLINE');
                            await INIT_MOTHER_SYSTEM('OFFLINE');
                            await loadProjectFromFileHandle(handle);
                        }}
                    />
                </div>
            )}
            
            {viewMode === "SLEEP" && networkMode !== 'MENU' && (
                <div className="sleep-overlay">
                    <div className="glass-panel sleep-panel">
                        <h2 className="sleep-title">OPTORACK <span style={{ color: '#00E5FF', fontWeight: 'bold' }}>PRO</span></h2>
                        <p className="sleep-text">
                            <b>SPECTROGRAM DSP ENVIRONMENT</b><br />
                            Please ensure all optical sensors are calibrated.<br />
                            Patching cables may result in unexpected resonance.
                        </p>
                        <div className="sleep-startup-config" onPointerDown={(e) => e.stopPropagation()}>
                            <div className="sleep-config-label">STARTUP RESOLUTION PRESET</div>
                            <select value={startupResolutionProfile} onChange={(e) => setStartupResolutionProfile(e.target.value)} style={{ minWidth: '240px' }}>
                                {window.OptoRackResolution.getOptions().map(r => <option key={r} value={r}>{window.OptoRackResolution.profiles[r].label}</option>)}
                            </select>
                            <div className="sleep-config-note">Higher presets improve visual clarity and reduce noise, with more CPU/GPU cost.</div>
                        </div>
                        <div className="sleep-start-btn" onClick={() => INIT_MOTHER_SYSTEM(networkMode)}>
                            [ INITIATE TEST SEQUENCE ]
                        </div>
                    </div>
                </div>
            )}

            {viewMode === "PATCHING" && (
                <>
                    <div className="app-ui-layer">

                        <div className="top-bar">
                            <div className="top-bar-left">
                                <div className="glass-panel creation-tools" style={{ position: 'relative' }}>
                                    <button onPointerDown={(e) => e.stopPropagation()} onClick={() => {
                                        if (networkMode === 'GUEST' && !permissions.canPatch) return;
                                        spawnSynth(null, null, null, null, 'PHOTON_OSCILLATOR');
                                    }} className="top-btn cyan-glow" style={{ opacity: (networkMode === 'GUEST' && !permissions.canPatch) ? 0.5 : 1 }}>
                                        + 4742 PHOTOSYNTH
                                    </button>

                                    <button onPointerDown={(e) => e.stopPropagation()} onClick={() => {
                                        if (networkMode === 'GUEST' && !permissions.canPatch) return;
                                        setIsBrowserOpen(true);
                                    }} className="top-btn" style={{ opacity: (networkMode === 'GUEST' && !permissions.canPatch) ? 0.5 : 1 }}>
                                        LIBRARY
                                    </button>
                                    <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setIsVisualsBrowserOpen(true)} className="top-btn">
                                        VISUALS
                                    </button>
                                    <div className="divider" />
                                    <div className="color-dots">
                                        {window.THEME_CLRS.map(c => (
                                            <div key={c} className="color-dot" onPointerDown={(e) => e.stopPropagation()} onClick={() => setWireColor(c)} style={{ backgroundColor: c, border: wireColor === c ? '2px solid #FFF' : '2px solid transparent' }} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="top-bar-center">
                                <div className="glass-panel global-console">
                                    <div className="console-group">
                                        <span className="tiny-label">BPM</span>
                                        <input type="range" min={TWEAKS.ranges.bpmMin} max={TWEAKS.ranges.bpmMax} value={bpm} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => setBpm(Number(e.target.value))} className="top-range" />
                                        <span className="console-val cyan">{bpm}</span>
                                    </div>
                                    <div className="divider" />
                                    <div className="console-group">
                                        <select value={rootNote} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => setRootNote(e.target.value)} className="top-select">
                                            {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                        <select value={scale} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => setScale(e.target.value)} className="top-select">
                                            <option value="MAJOR">😊 MAJOR</option>
                                            <option value="MINOR">😢 MINOR</option>
                                            <option value="DORIAN">🌀 DORIAN</option>
                                            <option value="PHRYGIAN">🔥 PHRYGIAN</option>
                                            <option value="LYDIAN">✨ LYDIAN</option>
                                            <option value="MIXOLYDIAN">🎸 MIXOLYDIAN</option>
                                            <option value="LOCRIAN">🌑 LOCRIAN</option>
                                            <option value="PENTATONIC">⛩️ PENTATONIC</option>
                                            <option value="BLUES">🎷 BLUES</option>
                                        </select>
                                    </div>
                                    <div className="divider desktop-only" />
                                    <div className="perf-readout desktop-only">
                                        <window.PerformanceMeter />
                                        <window.CPUGraph />
                                    </div>
                                </div>
                            </div>

                            <div className="top-bar-right">
                                <div className="glass-panel session-mgnt">
                                {networkMode === 'OFFLINE' && (
                                    <>
                                        <button onClick={async () => {
                                            try {
                                                await window.OptoNetwork.initHost();
                                                setNetworkMode('HOST');
                                                const aTrack = cDsp.current.dest.stream.getAudioTracks()[0];
                                                let vTrack;
                                                if (vRef.current && vRef.current.srcObject) {
                                                    vTrack = vRef.current.srcObject.getVideoTracks()[0];
                                                } else {
                                                    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
                                                    vTrack = canvas.captureStream(30).getVideoTracks()[0];
                                                }
                                                if (vTrack && aTrack) {
                                                    const combined = new MediaStream([vTrack, aTrack]);
                                                    window.OptoNetwork.streamMedia(combined);
                                                }
                                            } catch(e) { console.error('Failed to go online', e); }
                                        }} className="top-btn cyan-glow">GO ONLINE (HOST)</button>
                                        <div className="divider" />
                                    </>
                                )}

                                {networkMode === 'HOST' && (
                                    <>
                                        <div className="console-group">
                                            <span className="tiny-label">ID:</span>
                                            <span className="console-val">{window.OptoNetwork.lobbyId}</span>
                                        </div>
                                        <div className="divider" />
                                    </>
                                )}

                                {networkMode !== 'OFFLINE' && (
                                    <div className="player-list-container">
                                        <span className="console-val cyan" style={{ cursor: 'pointer' }} onClick={() => {
                                            const el = document.getElementById('player-dropdown');
                                            el.style.display = el.style.display === 'none' ? 'block' : 'none';
                                        }}>
                                            {playersList.length}P
                                        </span>
                                        <div id="player-dropdown" className="glass-panel player-dropdown">
                                            {playersList.map((p, i) => (
                                                <div key={i} className="player-row">
                                                    <span>{p} {i === 0 ? '(HOST)' : ''}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="divider" />
                                    </div>
                                )}

                                {networkMode !== 'GUEST' && (
                                    <>
                                        <button onClick={saveProjectToDirectory} className="top-btn">SAVE</button>
                                        <button onClick={async () => { if (saveDirectoryHandle) await refreshProjectsFromDirectory(saveDirectoryHandle); setIsProjectsOpen(!isProjectsOpen); }} className="top-btn">LOAD</button>
                                        <div className="divider" />
                                        <button onClick={chooseSaveDirectory} className="top-btn">DIR</button>
                                    </>
                                )}
                                </div>
                            </div>
                        </div>

                        {/* NAVIGATION MINIMAP */}
                        <window.Minimap 
                            synths={synths} 
                            fxModules={fxModules} 
                            cam={camRef.current} 
                            onNavigate={(x, y) => {
                                // Update targets for smooth lerping
                                camRef.current.tx = x;
                                camRef.current.ty = y;
                            }}
                        />

                        {/* RENDER CURSORS */}
                        {Object.entries(cursors).map(([peerId, c]) => {
                            if (Date.now() - c.lastSeen > 2000) return null; // hide stale cursors
                            return (
                                <div key={peerId} style={{
                                    position: 'absolute', left: c.x, top: c.y, pointerEvents: 'none', zIndex: 9999,
                                    transition: 'left 0.05s linear, top 0.05s linear'
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M4 4L9 20L12 14L18 11L4 4Z" fill="#00E5FF" stroke="#FFF" strokeWidth="1"/>
                                    </svg>
                                    <div style={{ background: 'rgba(0, 229, 255, 0.8)', color: '#000', fontSize: '10px', fontWeight: 'bold', padding: '2px 4px', borderRadius: '4px', position: 'absolute', left: 15, top: 15, whiteSpace: 'nowrap' }}>
                                        {c.name}
                                    </div>
                                </div>
                            );
                        })}

                        <window.TipsPanel assignMode={assignMode} tipIndex={tipIndex} />
                        <window.BeginnerGuidePanel isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

                        {/* Floating Master IO removed per user request to avoid duplication */}

                        {isBrowserOpen && (
                            <div className="browser-overlay" onPointerDown={(e) => e.stopPropagation()}>
                                <div className="browser-sidebar">
                                    <div className="lobby-logo" style={{ marginBottom: '60px' }}>
                                        OPTO<span className="cyan">RACK</span>
                                        <div className="logo-sub">MODULE_LIBRARY</div>
                                    </div>
                                    <div className="nav-group">
                                        <button className={`nav-item ${libraryTab === 'MODULES' ? 'active' : ''}`} onClick={() => setLibraryTab('MODULES')}>
                                            <span className="icon">◈</span>
                                            <span className="label">FX MODULES</span>
                                        </button>
                                        <button className={`nav-item ${libraryTab === 'PRESETS' ? 'active' : ''}`} onClick={() => setLibraryTab('PRESETS')}>
                                            <span className="icon">◈</span>
                                            <span className="label">SYNTH PRESETS</span>
                                        </button>
                                    </div>
                                    <div className="sidebar-footer">
                                        <div className="system-tag">V5.0_CORE_FX</div>
                                    </div>
                                </div>
                                <div className="browser-content-area">
                                    <div className="browser-header-minimal">
                                        <div className="browser-title-big">BROWSE <span>{libraryTab}</span></div>
                                        <div className="browser-close-btn" onClick={() => setIsBrowserOpen(false)}>
                                            RETURN_TO_PATCHING
                                        </div>
                                    </div>
                                    <div className="browser-grid">
                                        {libraryTab === 'MODULES' && Object.entries(moduleLibraryByCategory).map(([categoryName, categoryData]) => (
                                            <React.Fragment key={categoryName}>
                                                {categoryData.items.map(item => (
                                                    <BrowserItem key={item.id} title={item.title} desc={item.desc} onClick={() => spawnFX(item.id)} />
                                                ))}
                                            </React.Fragment>
                                        ))}
                                        
                                        {libraryTab === 'PRESETS' && wtPresets.map((preset, idx) => (
                                            <div key={idx} className="browser-item" onClick={() => {
                                                const activeId = sharedStateRef.current.activeSynthId || (synths[0]?.id);
                                                if (activeId) {
                                                    loadWtPreset(activeId, idx);
                                                    setIsBrowserOpen(false);
                                                } else {
                                                    alert("No active Photosynth found! Please spawn or click a Photosynth first.");
                                                }
                                            }}>
                                                <div className="browser-item-title">{preset.name}</div>
                                                <div className="browser-item-desc">
                                                    {preset.params ? (
                                                        <>
                                                            <span style={{ color: '#00E5FF', fontWeight: 'bold' }}>FULL STATE</span>{' '}—
                                                            ATK {(preset.params.atk || 0).toFixed(3)}s ·
                                                            DEC {(preset.params.dec || 0).toFixed(2)}s ·
                                                            SUS {Math.round((preset.params.sus || 0) * 100)}% ·
                                                            REL {(preset.params.rel || 0).toFixed(2)}s
                                                            {preset.params.unison && <span style={{ display: 'block', marginTop: '4px', color: '#B266FF' }}>
                                                                {preset.params.unison} VOICES · CUT {Math.round(preset.params.cut || 0)}Hz
                                                            </span>}
                                                        </>
                                                    ) : 'Topology waveform snapshot only.'}
                                                </div>
                                                <div style={{ marginTop: '8px', fontSize: '10px', color: 'rgba(0,229,255,0.6)', letterSpacing: '1px' }}>◈ CLICK TO LOAD INTO ACTIVE SYNTH</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {isVisualsBrowserOpen && (
                            <div className="browser-overlay visuals-overlay" onPointerDown={(e) => e.stopPropagation()}>
                                <div className="browser-sidebar">
                                    <div className="lobby-logo" style={{ marginBottom: '60px' }}>
                                        OPTO<span className="cyan">RACK</span>
                                        <div className="logo-sub">VISUAL_ENGINE</div>
                                    </div>
                                    <div className="nav-group">
                                        {['TEMPLATES', 'MODIFIERS', 'POST_FX'].map(cat => (
                                            <button key={cat} className={`nav-item ${cat === 'TEMPLATES' ? 'active' : ''}`}>
                                                <span className="icon">◈</span>
                                                <span className="label">{cat}</span>
                                                {cat === 'TEMPLATES' && <div className="active-indicator" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="browser-content-area">
                                    <div className="browser-header-minimal">
                                        <div className="browser-title-big">VISUAL <span>SYSTEM</span></div>
                                        <div className="browser-close-btn" onClick={() => setIsVisualsBrowserOpen(false)}>
                                            CLOSE_VISUAL_CONFIG
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '40px' }}>
                                        <div style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
                                            <div className="system-tag" style={{ marginBottom: '20px' }}>SELECT_TEMPLATE</div>
                                            <div className="browser-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '20px' }}>
                                                {['AR_ENVIRONMENT', 'HUD_DATAMESH', 'VOXEL_WORLD', 'LIDAR_SCAN', 'PHOTO_RECON', 'DEJA_VU', 'NATURAL_WORLD', 'PARTICLES', 'WIREFRAME_TERRAIN', 'NEON_WAVES', 'GLITCH_MATRIX', 'FLUID_CAUSTICS'].map(tmpl => (
                                                    <div key={tmpl} 
                                                        onClick={() => setVisualTemplate(tmpl)}
                                                        className="browser-item"
                                                        style={{ 
                                                            borderColor: visualTemplate === tmpl ? '#00E5FF' : 'rgba(255,255,255,0.1)',
                                                            background: visualTemplate === tmpl ? 'rgba(0, 229, 255, 0.1)' : 'rgba(255,255,255,0.03)',
                                                            padding: '12px'
                                                        }}>
                                                        <div className="browser-item-title" style={{ fontSize: '12px' }}>{tmpl.replace('_', ' ')}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            <VisualEnginePreview height={300} />
                                            
                                            <div className="system-tag">ADJUST_PARAMETERS</div>
                                            <div className="glass-panel" style={{ padding: '30px', borderRadius: '16px', flex: 1 }}>
                                                {visualTemplate === 'AR_ENVIRONMENT' && (
                                                    <>
                                                        <Slider label="DEPTH_SCALE" val={visualSettings.AR_ENVIRONMENT.depthScale} min={0} max={2000} step={10} onChange={(v) => setVisualSettings(p => ({...p, AR_ENVIRONMENT: {...p.AR_ENVIRONMENT, depthScale: v}}))} />
                                                        <Slider label="OCCLUSION" val={visualSettings.AR_ENVIRONMENT.occlusion} min={0} max={1} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, AR_ENVIRONMENT: {...p.AR_ENVIRONMENT, occlusion: v}}))} />
                                                        <Slider label="SCAN_SPEED" val={visualSettings.AR_ENVIRONMENT.speed} min={0} max={5} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, AR_ENVIRONMENT: {...p.AR_ENVIRONMENT, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'HUD_DATAMESH' && (
                                                    <>
                                                        <Slider label="HUD_GLOW" val={visualSettings.HUD_DATAMESH.hudGlow} min={0} max={5} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, HUD_DATAMESH: {...p.HUD_DATAMESH, hudGlow: v}}))} />
                                                        <Slider label="DRIFT" val={visualSettings.HUD_DATAMESH.speed} min={0} max={5} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, HUD_DATAMESH: {...p.HUD_DATAMESH, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'DEJA_VU' && (
                                                    <>
                                                        <Slider label="POINT_SIZE" val={visualSettings.DEJA_VU.pointSize} min={0.1} max={10} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, DEJA_VU: {...p.DEJA_VU, pointSize: v}}))} />
                                                        <Slider label="DEPTH_SCALE" val={visualSettings.DEJA_VU.depthScale} min={0} max={2000} step={10} onChange={(v) => setVisualSettings(p => ({...p, DEJA_VU: {...p.DEJA_VU, depthScale: v}}))} />
                                                        <Slider label="GHOSTING" val={visualSettings.DEJA_VU.ghosting} min={0} max={1} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, DEJA_VU: {...p.DEJA_VU, ghosting: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'NATURAL_WORLD' && (
                                                    <>
                                                        <Slider label="POINT_SIZE" val={visualSettings.NATURAL_WORLD.pointSize} min={0.1} max={10} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, NATURAL_WORLD: {...p.NATURAL_WORLD, pointSize: v}}))} />
                                                        <Slider label="DEPTH_SCALE" val={visualSettings.NATURAL_WORLD.depthScale} min={0} max={2000} step={10} onChange={(v) => setVisualSettings(p => ({...p, NATURAL_WORLD: {...p.NATURAL_WORLD, depthScale: v}}))} />
                                                        <Slider label="DRIFT" val={visualSettings.NATURAL_WORLD.speed} min={0} max={5} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, NATURAL_WORLD: {...p.NATURAL_WORLD, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'PARTICLES' && (
                                                    <>
                                                        <Slider label="POINT_SIZE" val={visualSettings.PARTICLES.size} min={1} max={20} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, PARTICLES: {...p.PARTICLES, size: v}}))} />
                                                        <Slider label="ELEVATION" val={visualSettings.PARTICLES.elevationMultiplier} min={0} max={1000} step={10} onChange={(v) => setVisualSettings(p => ({...p, PARTICLES: {...p.PARTICLES, elevationMultiplier: v}}))} />
                                                        <Slider label="DRIFT_SPEED" val={visualSettings.PARTICLES.speed} min={0} max={3} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, PARTICLES: {...p.PARTICLES, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'WIREFRAME_TERRAIN' && (
                                                    <>
                                                        <Slider label="ELEVATION" val={visualSettings.WIREFRAME_TERRAIN.elevationMultiplier} min={0} max={1000} step={10} onChange={(v) => setVisualSettings(p => ({...p, WIREFRAME_TERRAIN: {...p.WIREFRAME_TERRAIN, elevationMultiplier: v}}))} />
                                                        <Slider label="SCAN_SPEED" val={visualSettings.WIREFRAME_TERRAIN.speed} min={0} max={3} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, WIREFRAME_TERRAIN: {...p.WIREFRAME_TERRAIN, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'NEON_WAVES' && (
                                                    <>
                                                        <Slider label="WAVE_COUNT" val={visualSettings.NEON_WAVES.waveCount} min={1} max={50} step={1} onChange={(v) => setVisualSettings(p => ({...p, NEON_WAVES: {...p.NEON_WAVES, waveCount: v}}))} />
                                                        <Slider label="GLOW_INTENSITY" val={visualSettings.NEON_WAVES.glowIntensity} min={0.1} max={5.0} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, NEON_WAVES: {...p.NEON_WAVES, glowIntensity: v}}))} />
                                                        <Slider label="PULSE_SPEED" val={visualSettings.NEON_WAVES.speed} min={0} max={5} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, NEON_WAVES: {...p.NEON_WAVES, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'GLITCH_MATRIX' && (
                                                    <>
                                                        <Slider label="GLITCH_AMT" val={visualSettings.GLITCH_MATRIX.glitchIntensity} min={0} max={5} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, GLITCH_MATRIX: {...p.GLITCH_MATRIX, glitchIntensity: v}}))} />
                                                        <Slider label="RESOLUTION" val={visualSettings.GLITCH_MATRIX.pixelation} min={1} max={50} step={1} onChange={(v) => setVisualSettings(p => ({...p, GLITCH_MATRIX: {...p.GLITCH_MATRIX, pixelation: v}}))} />
                                                        <Slider label="STREAM_SPEED" val={visualSettings.GLITCH_MATRIX.speed} min={0} max={5} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, GLITCH_MATRIX: {...p.GLITCH_MATRIX, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'FLUID_CAUSTICS' && (
                                                    <>
                                                        <Slider label="VISCOSITY" val={visualSettings.FLUID_CAUSTICS.viscosity} min={0} max={1} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, FLUID_CAUSTICS: {...p.FLUID_CAUSTICS, viscosity: v}}))} />
                                                        <Slider label="SPLASH_FORCE" val={visualSettings.FLUID_CAUSTICS.splashForce} min={0.1} max={5.0} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, FLUID_CAUSTICS: {...p.FLUID_CAUSTICS, splashForce: v}}))} />
                                                        <Slider label="FLOW_RATE" val={visualSettings.FLUID_CAUSTICS.flow} min={0} max={5} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, FLUID_CAUSTICS: {...p.FLUID_CAUSTICS, flow: v}}))} />
                                                        <Slider label="SIM_SPEED" val={visualSettings.FLUID_CAUSTICS.speed} min={0} max={3} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, FLUID_CAUSTICS: {...p.FLUID_CAUSTICS, speed: v}}))} />
                                                    </>
                                                )}
                                                
                                                <div className="system-tag" style={{ marginTop: '20px', color: '#00E5FF' }}>GLOBAL_CAMERA_CALIBRATION</div>
                                                <Slider label="CAM_SENSITIVITY" val={visualSettings[visualTemplate].camSens} min={0} max={5} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, [visualTemplate]: {...p[visualTemplate], camSens: v}}))} />
                                                <Slider label="CAM_CONTRAST" val={visualSettings[visualTemplate].camContrast} min={0.5} max={3} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, [visualTemplate]: {...p[visualTemplate], camContrast: v}}))} />
                                                <Slider label="CAM_FREQUENCY" val={visualSettings[visualTemplate].camFreq} min={0.1} max={10} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, [visualTemplate]: {...p[visualTemplate], camFreq: v}}))} />
                                                {visualTemplate === 'PHOTO_RECON' && (
                                                    <>
                                                        <Slider label="DEPTH_SCALE" val={visualSettings.PHOTO_RECON.depthScale} min={0} max={2000} step={10} onChange={(v) => setVisualSettings(p => ({...p, PHOTO_RECON: {...p.PHOTO_RECON, depthScale: v}}))} />
                                                        <Slider label="ROOM_FOLD" val={visualSettings.PHOTO_RECON.roomFold} min={0} max={1} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, PHOTO_RECON: {...p.PHOTO_RECON, roomFold: v}}))} />
                                                        <Slider label="SCAN_SPEED" val={visualSettings.PHOTO_RECON.speed} min={0} max={3} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, PHOTO_RECON: {...p.PHOTO_RECON, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'VOXEL_WORLD' && (
                                                    <>
                                                        <Slider label="DEPTH_SCALE" val={visualSettings.VOXEL_WORLD.depthScale} min={0} max={2000} step={10} onChange={(v) => setVisualSettings(p => ({...p, VOXEL_WORLD: {...p.VOXEL_WORLD, depthScale: v}}))} />
                                                        <Slider label="SPEED" val={visualSettings.VOXEL_WORLD.speed} min={0} max={3} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, VOXEL_WORLD: {...p.VOXEL_WORLD, speed: v}}))} />
                                                    </>
                                                )}
                                                {visualTemplate === 'LIDAR_SCAN' && (
                                                    <>
                                                        <Slider label="DEPTH_SCALE" val={visualSettings.LIDAR_SCAN.depthScale} min={0} max={2000} step={10} onChange={(v) => setVisualSettings(p => ({...p, LIDAR_SCAN: {...p.LIDAR_SCAN, depthScale: v}}))} />
                                                        <Slider label="POINT_SIZE" val={visualSettings.LIDAR_SCAN.pointSize} min={0.5} max={10} step={0.1} onChange={(v) => setVisualSettings(p => ({...p, LIDAR_SCAN: {...p.LIDAR_SCAN, pointSize: v}}))} />
                                                        <Slider label="SPEED" val={visualSettings.LIDAR_SCAN.speed} min={0} max={3} step={0.01} onChange={(v) => setVisualSettings(p => ({...p, LIDAR_SCAN: {...p.LIDAR_SCAN, speed: v}}))} />
                                                    </>
                                                )}
                                                {/* Add more sliders for other templates similarly */}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="projects-panel" onPointerDown={(e) => e.stopPropagation()} style={{ transform: isProjectsOpen ? 'translateX(0)' : 'translateX(100%)' }}>
                            <div className="projects-header">
                                <div>
                                    <div className="projects-title">PROJECTS///</div>
                                    <div className="projects-subtitle">LIBRARY</div>
                                </div>
                                <div className="projects-close" onClick={() => setIsProjectsOpen(false)}>✕</div>
                            </div>
                            <div className="projects-list">
                                <div className="project-item" style={{ cursor: 'default', paddingBottom: '10px' }}>
                                    <div className="project-name">SAVE DIRECTORY</div>
                                    <div className="project-date">{saveDirectoryPath}</div>
                                </div>
                                {savedProjects.map((p, i) => (
                                    <div key={i} className="project-item" onClick={() => loadProjectFromFileHandle(p.handle)}>
                                        <div className="project-name">{p.name}</div>
                                        <div className="project-date">MANUAL FILE</div>
                                    </div>
                                ))}
                                {savedProjects.length === 0 && (
                                    <div className="empty-projects">NO PROJECT FILES FOUND. CLICK SET SAVE DIR, THEN SAVE.</div>
                                )}
                            </div>
                        </div>
                    </div>

                        {cDsp.current.modules['MASTER'] && (
                            <window.DraggableWindow id="MASTER" title="PRO MASTER BUSS" color="#FF0033" initialX={20} initialY={80} onDrag={() => {}} isFixed={true}>
                                <div className="master-layout" style={{ padding: '12px', minWidth: '320px' }}>
                                    <div className="master-col-left" style={{ paddingRight: '12px' }}>
                                        <ModuleJack id="MASTER" n="AUD" t={true} type="audio" active={isPatched('MASTER', 'IN', true)} patchedColor={getPatchedColor('MASTER', 'IN', true)} domReg={(d) => updatePipRegistry('MASTER', 'IN', d)} onDown={(e) => handleJackDown(e, 'MASTER', 'IN', true)} onUp={() => handleJackUp('MASTER', 'IN', true)} onDoubleClick={() => clearJackCables('MASTER', 'IN', true)} />
                                        <div className="master-rec-row">
                                            <div className="master-rec-btn" onPointerDown={(e) => { e.stopPropagation(); toggleRecording(); }} 
                                                style={{ background: isRecording ? '#FF0033' : '#111', boxShadow: isRecording ? '0 0 10px #FF0033' : 'none', width: '15px', height: '15px' }} />
                                            <span style={{ fontSize: '8px', color: isRecording ? '#FF0033' : '#666' }}>REC</span>
                                        </div>
                                    </div>

                                    <div className="master-col-mid" style={{ padding: '0 12px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <Knob label="OUT GAIN" val={cDsp.current.modules['MASTER'].params.vol} min={-60} max={12.0} step={0.1} def={0.0} onChange={(v) => updateParam('MASTER', 'vol', v)} />
                                            <div className="master-profile-box">
                                                <div className="tiny-label" style={{ marginBottom: '4px' }}>MASTER_PROFILE</div>
                                                <select className="top-select" value={cDsp.current.modules['MASTER'].params.profile || 'NEUTRAL'} 
                                                    onChange={(e) => {
                                                        const pKey = e.target.value;
                                                        const p = MASTER_PROFILES[pKey];
                                                        updateParam('MASTER', 'profile', pKey);
                                                        // Update actual nodes
                                                        const limit = cDsp.current.modules['MASTER'].nodes.limit;
                                                        limit.threshold.setTargetAtTime(p.threshold, cDsp.current.actx.currentTime, 0.05);
                                                        limit.ratio.setTargetAtTime(p.ratio, cDsp.current.actx.currentTime, 0.05);
                                                        limit.attack.setTargetAtTime(p.attack, cDsp.current.actx.currentTime, 0.05);
                                                        limit.release.setTargetAtTime(p.release, cDsp.current.actx.currentTime, 0.05);
                                                    }}
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    style={{ width: '100%', fontSize: '8px' }}
                                                >
                                                    {Object.keys(MASTER_PROFILES).map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="master-toggles" style={{ padding: '0 12px' }}>
                                        <div className="master-toggle-row" onPointerDown={(e) => { e.stopPropagation(); updateParam('MASTER', 'softClip', !cDsp.current.modules['MASTER'].params.softClip); }}>
                                            <div className="master-toggle-btn" style={{ background: cDsp.current.modules['MASTER'].params.softClip ? '#FF0033' : '#111' }} />
                                            <div className="master-toggle-label">SOFT CLIP</div>
                                        </div>
                                        <div className="master-toggle-row" onPointerDown={(e) => { e.stopPropagation(); updateParam('MASTER', 'limiter', !cDsp.current.modules['MASTER'].params.limiter); }}>
                                            <div className="master-toggle-btn" style={{ background: cDsp.current.modules['MASTER'].params.limiter ? '#FF0033' : '#111' }} />
                                            <div className="master-toggle-label">BRICKWALL</div>
                                        </div>
                                        <div className="master-toggle-row" onPointerDown={(e) => { e.stopPropagation(); updateParam('MASTER', 'mute', !cDsp.current.modules['MASTER'].params.mute); }}>
                                            <div className="master-toggle-btn" style={{ background: cDsp.current.modules['MASTER'].params.mute ? '#FF0033' : '#111' }} />
                                            <div className="master-toggle-label">MUTE</div>
                                        </div>
                                    </div>

                                    <div className="master-col-right" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '12px' }}>
                                        <SpectrumAnalyzer analyser={cDsp.current.mAnalyser} />
                                        <MasterLoudnessMonitor analyser={cDsp.current.mAnalyser} />
                                    </div>
                                </div>
                            </window.DraggableWindow>
                        )}

                        <div className="world-layer" ref={worldRef}>

                        {fxModules.map(fx => {
                            const mod = cDsp.current.modules[fx.id];
                            if (!mod) return null;

                            if (fx.type === 'MOD_LFO') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="LFO MACRO" color="#B266FF" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-knob-row" style={{ alignItems: 'center' }}>
                                        <Knob label="RATE" val={mod.params.rate} min={0.1} max={20} step={0.1} def={1.0} onChange={(v) => updateParam(fx.id, 'rate', v)} onAssign={() => handleKnobAssign(fx.id, 'rate')} isAssigning={assignMode} />
                                        <Knob label="DEPTH" val={mod.params.depth} min={0} max={100} step={1} def={50} onChange={(v) => updateParam(fx.id, 'depth', v)} onAssign={() => handleKnobAssign(fx.id, 'depth')} isAssigning={assignMode} />
                                        <div className="fx-select-col">
                                            <select value={mod.params.wave} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => updateParam(fx.id, 'wave', Number(e.target.value))}>
                                                <option value="0">SINE</option>
                                                <option value="1">TRI</option>
                                                <option value="2">SAW</option>
                                                <option value="3">SQR</option>
                                            </select>
                                            <div className="fx-select-label">WAVE</div>
                                        </div>
                                        <div style={{ borderLeft: '1px solid var(--serum-border)', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <button onPointerDown={e => e.stopPropagation()} onClick={() => setAssignMode(assignMode === fx.id ? null : fx.id)}
                                                style={{ background: assignMode === fx.id ? '#B266FF' : 'rgba(255,255,255,0.05)', color: assignMode === fx.id ? '#111' : '#E2E2E2', border: '1px solid var(--serum-border)', padding: '6px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', animation: assignMode === fx.id ? 'pulse 1s infinite' : 'none' }}>
                                                {assignMode === fx.id ? 'ASSIGNING...' : 'ASSIGN'}
                                            </button>
                                            <div style={{ fontSize: '9px', color: '#ccc', textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{mod.state.targets.length} TARGETS</div>
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'FX_EQ') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="16-BAND PARAGRAPHIC EQ" color="#99CC33" initialX={fx.x} initialY={fx.y} initialW={fx.w} initialH={fx.h} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onDrag={handleModuleDrag}>
                                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px', position: 'relative' }}>
                                        {mod.params.showPresets && (
                                            <div className="preset-overlay animate-in" onPointerDown={e => e.stopPropagation()}>
                                                <div className="preset-overlay-header">
                                                    <span>EQ PRESETS</span>
                                                    <div className="preset-close" onClick={() => updateParam(fx.id, 'showPresets', false)}>✕</div>
                                                </div>
                                                <div className="preset-grid">
                                                    {window.FX_PRESETS['FX_EQ'].map(p => (
                                                        <div key={p.name} className="preset-option" onClick={() => { Object.entries(p.params).forEach(([k,v]) => updateParam(fx.id, k, v)); updateParam(fx.id, 'showPresets', false); }}>{p.name}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <ModuleJack id={fx.id} n="IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            <div style={{ fontSize: '10px', color: '#FFF', fontWeight: 'bold', opacity: 0.8 }}>SURGICAL PRECISION MODE [16-BAND]</div>
                                            <button className="fx-preset-btn" onPointerDown={e => e.stopPropagation()} onClick={() => updateParam(fx.id, 'showPresets', !mod.params.showPresets)}>PRESETS</button>
                                            <ModuleJack id={fx.id} n="OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                        <div style={{ flex: 1, position: 'relative', border: '1px solid var(--serum-border)', borderRadius: '4px', overflow: 'hidden', background: 'transparent', minHeight: '220px' }}>
                                            <ParametricEQ mod={mod} updateParam={(p, v) => updateParam(fx.id, p, v)} />
                                        </div>
                                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>SCROLL OVER NODE TO ADJUST Q-FACTOR (BANDWIDTH)</div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'FX_DELAY') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="ECHO / DELAY" color="#F78E1E" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout" style={{ position: 'relative' }}>
                                        {mod.params.showPresets && (
                                            <div className="preset-overlay animate-in" onPointerDown={e => e.stopPropagation()}>
                                                <div className="preset-overlay-header">
                                                    <span>DELAY PRESETS</span>
                                                    <div className="preset-close" onClick={() => updateParam(fx.id, 'showPresets', false)}>✕</div>
                                                </div>
                                                <div className="preset-grid">
                                                    {window.FX_PRESETS['FX_DELAY'].map(p => (
                                                        <div key={p.name} className="preset-option" onClick={() => { Object.entries(p.params).forEach(([k,v]) => updateParam(fx.id, k, v)); updateParam(fx.id, 'showPresets', false); }}>{p.name}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="fx-jack-col left">
                                            <ModuleJack id={fx.id} n="IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            <button className="fx-preset-btn mini" onPointerDown={e => e.stopPropagation()} onClick={() => updateParam(fx.id, 'showPresets', !mod.params.showPresets)}>PRST</button>
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="TIME" val={mod.params.time} min={0.01} max={2.0} step={0.01} def={0.3} onChange={(v) => updateParam(fx.id, 'time', v)} onAssign={() => handleKnobAssign(fx.id, 'time')} isAssigning={assignMode} />
                                            <Knob label="FEEDBACK" val={mod.params.feedback} min={0} max={1.2} step={0.01} def={0.4} onChange={(v) => updateParam(fx.id, 'feedback', v)} onAssign={() => handleKnobAssign(fx.id, 'feedback')} isAssigning={assignMode} />
                                            <Knob label="CUTOFF" val={mod.params.cutoff} min={100} max={10000} step={10} def={3000} onChange={(v) => updateParam(fx.id, 'cutoff', v)} onAssign={() => handleKnobAssign(fx.id, 'cutoff')} isAssigning={assignMode} />
                                            <Knob label="MIX" val={mod.params.mix} min={0} max={1} step={0.01} def={0.5} onChange={(v) => updateParam(fx.id, 'mix', v)} onAssign={() => handleKnobAssign(fx.id, 'mix')} isAssigning={assignMode} />
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack id={fx.id} n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'FX_AUTOFILTER') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="ANALOG FILTER" color="#99CC33" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout" style={{ position: 'relative' }}>
                                        {mod.params.showPresets && (
                                            <div className="preset-overlay animate-in" onPointerDown={e => e.stopPropagation()}>
                                                <div className="preset-overlay-header">
                                                    <span>FILTER PRESETS</span>
                                                    <div className="preset-close" onClick={() => updateParam(fx.id, 'showPresets', false)}>✕</div>
                                                </div>
                                                <div className="preset-grid">
                                                    {window.FX_PRESETS['FX_AUTOFILTER'].map(p => (
                                                        <div key={p.name} className="preset-option" onClick={() => { Object.entries(p.params).forEach(([k,v]) => updateParam(fx.id, k, v)); updateParam(fx.id, 'showPresets', false); }}>{p.name}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="fx-jack-col left">
                                            <ModuleJack id={fx.id} n="IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            <button className="fx-preset-btn mini" onPointerDown={e => e.stopPropagation()} onClick={() => updateParam(fx.id, 'showPresets', !mod.params.showPresets)}>PRST</button>
                                        </div>
                                        <div className="fx-knob-row">
                                            <div className="fx-select-col" style={{ marginRight: '8px' }}>
                                                <select value={mod.params.filterType} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => updateParam(fx.id, 'filterType', e.target.value)}>
                                                    <option value="lowpass">LOWPASS 24</option>
                                                    <option value="highpass">HIGHPASS 24</option>
                                                    <option value="bandpass">BANDPASS</option>
                                                    <option value="notch">NOTCH</option>
                                                </select>
                                                <div className="fx-select-label">MODE</div>
                                            </div>
                                            <Knob label="FREQ" val={mod.params.cut} min={20} max={20000} step={10} def={1000} onChange={(v) => updateParam(fx.id, 'cut', v)} onAssign={() => handleKnobAssign(fx.id, 'cut')} isAssigning={assignMode} />
                                            <Knob label="RES (Q)" val={mod.params.res} min={0} max={30} step={0.5} def={5} onChange={(v) => updateParam(fx.id, 'res', v)} onAssign={() => handleKnobAssign(fx.id, 'res')} isAssigning={assignMode} />
                                            <Knob label="DRIVE" val={mod.params.drive} min={0} max={50} step={1} def={10} onChange={(v) => updateParam(fx.id, 'drive', v)} onAssign={() => handleKnobAssign(fx.id, 'drive')} isAssigning={assignMode} />
                                            <Knob label="LFO RT" val={mod.params.lfoRate} min={0.1} max={20} step={0.1} def={1.0} onChange={(v) => updateParam(fx.id, 'lfoRate', v)} onAssign={() => handleKnobAssign(fx.id, 'lfoRate')} isAssigning={assignMode} />
                                            <Knob label="LFO AMT" val={mod.params.lfoAmt} min={0} max={5000} step={10} def={500} onChange={(v) => updateParam(fx.id, 'lfoAmt', v)} onAssign={() => handleKnobAssign(fx.id, 'lfoAmt')} isAssigning={assignMode} />
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack id={fx.id} n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'FX_PRO_REV') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="SPATIAL REVERB" color="#00E5FF" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout" style={{ position: 'relative' }}>
                                        {mod.params.showPresets && (
                                            <div className="preset-overlay animate-in" onPointerDown={e => e.stopPropagation()}>
                                                <div className="preset-overlay-header">
                                                    <span>REVERB PRESETS</span>
                                                    <div className="preset-close" onClick={() => updateParam(fx.id, 'showPresets', false)}>✕</div>
                                                </div>
                                                <div className="preset-grid">
                                                    {window.FX_PRESETS['FX_PRO_REV'].map(p => (
                                                        <div key={p.name} className="preset-option" onClick={() => { Object.entries(p.params).forEach(([k,v]) => updateParam(fx.id, k, v)); updateParam(fx.id, 'showPresets', false); }}>{p.name}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="module-io-bar">
                                            <div className="io-group inputs">
                                                <div className="io-tag">INPUTS</div>
                                                <div className="io-jacks" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <ModuleJack id={fx.id} n="AUD" type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                                    <button className="fx-preset-btn mini" onPointerDown={e => e.stopPropagation()} onClick={() => updateParam(fx.id, 'showPresets', !mod.params.showPresets)}>PRST</button>
                                                </div>
                                            </div>
                                            <div className="io-divider" />
                                            <div className="io-group outputs">
                                                <div className="io-tag">OUTPUTS</div>
                                                <div className="io-jacks">
                                                    <ModuleJack id={fx.id} n="AUD" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="fx-knob-row">
                                            <div className="fx-group">
                                                <Knob label="MIX" val={mod.params.mix} min={0} max={1} step={0.01} def={0.44} onChange={(v) => updateParam(fx.id, 'mix', v)} onAssign={() => handleKnobAssign(fx.id, 'mix')} isAssigning={assignMode} />
                                                <Knob label="PREDELAY" val={mod.params.distance} min={0} max={0.2} step={0.001} def={0.0} onChange={(v) => updateParam(fx.id, 'distance', v)} onAssign={() => handleKnobAssign(fx.id, 'distance')} isAssigning={assignMode} />
                                            </div>
                                            <div className="fx-group" style={{ justifyContent: 'center', padding: '16px 24px' }}>
                                                <Knob label="DECAY" val={mod.params.decay} min={0.1} max={0.99} step={0.01} def={0.80} onChange={(v) => updateParam(fx.id, 'decay', v)} onAssign={() => handleKnobAssign(fx.id, 'decay')} isAssigning={assignMode} />
                                            </div>
                                            <div className="fx-group">
                                                <Knob label="SIZE" val={mod.params.size} min={0.5} max={5.0} step={0.05} def={2.2} onChange={(v) => updateParam(fx.id, 'size', v)} onAssign={() => handleKnobAssign(fx.id, 'size')} isAssigning={assignMode} />
                                                <Knob label="WIDTH" val={mod.params.width} min={0.0} max={2.0} step={0.01} def={1.07} onChange={(v) => updateParam(fx.id, 'width', v)} onAssign={() => handleKnobAssign(fx.id, 'width')} isAssigning={assignMode} />
                                            </div>
                                            <div className="fx-group">
                                                <div className="fx-group-row">
                                                    <Knob label="LOW FREQ" val={mod.params.loCut} min={20} max={1000} step={10} def={400} onChange={(v) => updateParam(fx.id, 'loCut', v)} />
                                                    <Knob label="HIGH FREQ" val={mod.params.hiCut} min={1000} max={20000} step={10} def={9000} onChange={(v) => updateParam(fx.id, 'hiCut', v)} />
                                                </div>
                                                <div className="fx-group-row">
                                                    <Knob label="LOW GAIN" val={mod.params.loGain} min={-24} max={12} step={0.5} def={0.0} onChange={(v) => updateParam(fx.id, 'loGain', v)} />
                                                    <Knob label="HIGH GAIN" val={mod.params.hiGain} min={-24} max={12} step={0.5} def={-1.5} onChange={(v) => updateParam(fx.id, 'hiGain', v)} />
                                                </div>
                                            </div>
                                            <div className="fx-group">
                                                <Knob label="RATE" val={mod.params.spinRate} min={0.1} max={5.0} step={0.01} def={0.4} onChange={(v) => { updateParam(fx.id, 'spinRate', v); mod.nodes.spinLfo.frequency.value = v; }} />
                                                <Knob label="DEPTH" val={mod.params.spin} min={0} max={1} step={0.01} def={0.32} onChange={(v) => updateParam(fx.id, 'spin', v)} />
                                            </div>
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack id={fx.id} n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'FX_SIDECHAIN') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="KICKSTART DUCKER" color="#FFCC00" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout kickstart-layout" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <ModuleJack id={fx.id} n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            <div className="ks-rates" style={{ display: 'flex', gap: '5px' }}>
                                                {[{l:'1/8', v:2}, {l:'1/4', v:1}, {l:'1/2', v:0.5}, {l:'1/1', v:0.25}].map(r => (
                                                    <div key={r.l} onPointerDown={(e) => { e.stopPropagation(); updateParam(fx.id, 'rate', r.v); }} style={{ padding: '4px 8px', background: mod.params.rate === r.v ? '#FFCC00' : '#222', color: mod.params.rate === r.v ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', borderRadius: '4px' }}>{r.l}</div>
                                                ))}
                                            </div>
                                            <ModuleJack id={fx.id} n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                            <div style={{ width: '80px' }}>
                                                <Knob label="MIX" val={mod.params.depth} min={0} max={1} step={0.01} def={1.0} onChange={(v) => updateParam(fx.id, 'depth', v)} onAssign={() => handleKnobAssign(fx.id, 'depth')} isAssigning={assignMode} />
                                            </div>
                                            <div style={{ flex: 1, height: '120px', background: '#111', borderRadius: '4px', overflow: 'hidden' }}>
                                                <DuckerVisualizer mod={mod} />
                                            </div>
                                        </div>
                                        <div className="ks-curves" style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                            {[0, 1, 2, 3, 4, 5].map(cId => (
                                                <div key={cId} onPointerDown={(e) => { e.stopPropagation(); updateParam(fx.id, 'curveId', cId); }} style={{ width: '40px', height: '30px', background: mod.params.curveId === cId ? '#FFCC00' : '#222', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <svg width="30" height="20" viewBox="0 0 30 20">
                                                        {cId === 0 && <path d="M 0 20 L 0 5 Q 15 5 30 20" fill="none" stroke={mod.params.curveId === cId ? '#000' : '#FFCC00'} strokeWidth="2" />}
                                                        {cId === 1 && <path d="M 0 20 L 0 5 Q 5 5 30 20" fill="none" stroke={mod.params.curveId === cId ? '#000' : '#FFCC00'} strokeWidth="2" />}
                                                        {cId === 2 && <path d="M 0 20 L 0 20 Q 20 20 30 5 L 30 20" fill="none" stroke={mod.params.curveId === cId ? '#000' : '#FFCC00'} strokeWidth="2" />}
                                                        {cId === 3 && <path d="M 0 20 L 0 20 Q 15 5 30 5 L 30 20" fill="none" stroke={mod.params.curveId === cId ? '#000' : '#FFCC00'} strokeWidth="2" />}
                                                        {cId === 4 && <path d="M 0 5 L 0 5 Q 20 5 30 20 L 30 20" fill="none" stroke={mod.params.curveId === cId ? '#000' : '#FFCC00'} strokeWidth="2" />}
                                                        {cId === 5 && <path d="M 0 10 Q 7.5 0 15 10 T 30 10" fill="none" stroke={mod.params.curveId === cId ? '#000' : '#FFCC00'} strokeWidth="2" />}
                                                    </svg>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'FX_OTT') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="TRUE OTT MULTIBAND" color="#00E5FF" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout" style={{ position: 'relative' }}>
                                        {mod.params.showPresets && (
                                            <div className="preset-overlay animate-in" onPointerDown={e => e.stopPropagation()}>
                                                <div className="preset-overlay-header">
                                                    <span>OTT PRESETS</span>
                                                    <div className="preset-close" onClick={() => updateParam(fx.id, 'showPresets', false)}>✕</div>
                                                </div>
                                                <div className="preset-grid">
                                                    {window.FX_PRESETS['FX_OTT'].map(p => (
                                                        <div key={p.name} className="preset-option" onClick={() => { Object.entries(p.params).forEach(([k,v]) => updateParam(fx.id, k, v)); updateParam(fx.id, 'showPresets', false); }}>{p.name}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="fx-jack-col left">
                                            <ModuleJack id={fx.id} n="IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            <button className="fx-preset-btn mini" onPointerDown={e => e.stopPropagation()} onClick={() => updateParam(fx.id, 'showPresets', !mod.params.showPresets)}>PRST</button>
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="DEPTH" val={mod.params.depth} min={0} max={1} step={0.01} def={1.0} onChange={(v) => updateParam(fx.id, 'depth', v)} onAssign={() => handleKnobAssign(fx.id, 'depth')} isAssigning={assignMode} />
                                            <Knob label="HIGH" val={mod.params.high} min={0} max={10} step={0.1} def={5.0} onChange={(v) => updateParam(fx.id, 'high', v)} onAssign={() => handleKnobAssign(fx.id, 'high')} isAssigning={assignMode} />
                                            <Knob label="MID" val={mod.params.mid} min={0} max={10} step={0.1} def={3.0} onChange={(v) => updateParam(fx.id, 'mid', v)} onAssign={() => handleKnobAssign(fx.id, 'mid')} isAssigning={assignMode} />
                                            <Knob label="LOW" val={mod.params.low} min={0} max={10} step={0.1} def={4.0} onChange={(v) => updateParam(fx.id, 'low', v)} onAssign={() => handleKnobAssign(fx.id, 'low')} isAssigning={assignMode} />
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack id={fx.id} n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'FX_RHYTHM') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="RHYTHM GATE" color="#F78E1E" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout" style={{ gap: '20px' }}>
                                        <div className="fx-jack-col left">
                                            <ModuleJack id={fx.id} n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="DEPTH" val={mod.params.depth} min={0} max={1} step={0.01} def={1.0} onChange={(v) => updateParam(fx.id, 'depth', v)} onAssign={() => handleKnobAssign(fx.id, 'depth')} isAssigning={assignMode} />
                                            <Knob label="SMOOTH" val={mod.params.smooth} min={0.01} max={0.5} step={0.01} def={0.05} onChange={(v) => updateParam(fx.id, 'smooth', v)} onAssign={() => handleKnobAssign(fx.id, 'smooth')} isAssigning={assignMode} />
                                            <div className="fx-select-col">
                                                <select value={mod.params.rate} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => updateParam(fx.id, 'rate', Number(e.target.value))}>
                                                    <option value="0.5">1/2</option>
                                                    <option value="0.75">3/4</option>
                                                    <option value="1">1/4</option>
                                                    <option value="1.5">3/8</option>
                                                    <option value="2">1/8</option>
                                                    <option value="4">1/16</option>
                                                    <option value="8">1/32</option>
                                                </select>
                                                <div className="fx-select-label">RATE</div>
                                            </div>
                                        </div>
                                        <StepGrid mod={mod} color="#F78E1E" />
                                        <div className="fx-jack-col right">
                                            <ModuleJack id={fx.id} n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'PROB_SEQ') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="16-STEP PROBABILITY" color="#F78E1E" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout" style={{ gap: '20px' }}>
                                        <div className="fx-knob-row" style={{ gap: '12px' }}>
                                            <Knob label="GLB PROB" val={mod.params.prob} min={0} max={1} step={0.01} def={0.8} onChange={(v) => updateParam(fx.id, 'prob', v)} onAssign={() => handleKnobAssign(fx.id, 'prob')} isAssigning={assignMode} />
                                            <Knob label="GATE" val={mod.params.gate} min={0.1} max={1.0} step={0.05} def={0.5} onChange={(v) => updateParam(fx.id, 'gate', v)} onAssign={() => handleKnobAssign(fx.id, 'gate')} isAssigning={assignMode} />
                                            <div className="fx-select-col">
                                                <select value={mod.params.rate} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => updateParam(fx.id, 'rate', Number(e.target.value))}>
                                                    <option value="0.5">1/2</option>
                                                    <option value="0.75">3/4</option>
                                                    <option value="1">1/4</option>
                                                    <option value="1.5">3/8</option>
                                                    <option value="2">1/8</option>
                                                    <option value="4">1/16</option>
                                                    <option value="8">1/32</option>
                                                </select>
                                                <div className="fx-select-label">RATE</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ fontSize: '8px', color: '#F78E1E', fontWeight: 'bold' }}>TRIGGERS</div>
                                                <StepGrid mod={mod} color="#F78E1E" />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '8px', color: '#FFF', fontWeight: 'bold', opacity: 0.6 }}>CHANCE (%)</div>
                                                    <div style={{ fontSize: '8px', color: '#FFF', opacity: 0.3 }}>DRAG BARS</div>
                                                </div>
                                                <div className="fx-step-grid prob-bars" style={{ display: 'flex', gap: '4px', height: '40px', alignItems: 'flex-end' }}>
                                                    {(mod.params.stepsProb || Array(16).fill(0.8)).map((p, idx) => (
                                                        <div key={idx} 
                                                            onPointerDown={(e) => {
                                                                e.stopPropagation();
                                                                const rect = e.currentTarget.parentElement.getBoundingClientRect();
                                                                const update = (me) => {
                                                                    const ry = clamp(1.0 - (me.clientY - rect.top) / rect.height, 0, 1);
                                                                    const newProbs = [...(mod.params.stepsProb || Array(16).fill(0.8))];
                                                                    newProbs[idx] = Math.round(ry * 100) / 100;
                                                                    updateParam(fx.id, 'stepsProb', newProbs);
                                                                };
                                                                const up = () => { window.removeEventListener('pointermove', update); window.removeEventListener('pointerup', up); };
                                                                window.addEventListener('pointermove', update); window.addEventListener('pointerup', up);
                                                                update(e);
                                                            }}
                                                            style={{ 
                                                                flex: 1, 
                                                                height: `${p * 100}%`, 
                                                                background: mod.state.step === idx ? '#FFF' : `rgba(247, 142, 30, ${0.2 + p * 0.8})`,
                                                                borderRadius: '1px',
                                                                transition: 'height 0.1s ease, background 0.1s ease'
                                                            }} 
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <button className="fx-rnd-btn" onPointerDown={(e) => { e.stopPropagation(); randomizeSteps(fx.id); if (mod.params.stepsProb) mod.params.stepsProb = mod.params.stepsProb.map(() => Math.random()); }}>RANDOMIZE ALL</button>
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack id={fx.id} n="TRIG OUT" type="cv" active={isPatched(fx.id, 'TRIG', false)} patchedColor={getPatchedColor(fx.id, 'TRIG', false)} domReg={(d) => updatePipRegistry(fx.id, 'TRIG', d)} onDown={(e) => handleJackDown(e, fx.id, 'TRIG', false)} onUp={() => handleJackUp(fx.id, 'TRIG', false)} onDoubleClick={() => clearJackCables(fx.id, 'TRIG', false)} />
                                            <ModuleJack id={fx.id} n="PITCH OUT" type="cv" active={isPatched(fx.id, 'PITCH', false)} patchedColor={getPatchedColor(fx.id, 'PITCH', false)} domReg={(d) => updatePipRegistry(fx.id, 'PITCH', d)} onDown={(e) => handleJackDown(e, fx.id, 'PITCH', false)} onUp={() => handleJackUp(fx.id, 'PITCH', false)} onDoubleClick={() => clearJackCables(fx.id, 'PITCH', false)} />
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            if (fx.type === 'UTILITY_IO') return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title="UTILITY / AMP" color="#E2E2E2" initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onCopy={() => copyParams(fx.id)} onPaste={() => pasteParams(fx.id)} onMutate={() => mutateParams(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout">
                                        <div className="fx-jack-col left">
                                            <ModuleJack id={fx.id} n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="GAIN" val={mod.params.vol} min={-60} max={6.0} step={0.1} def={0.0} onChange={(v) => updateParam(fx.id, 'vol', v)} onAssign={() => handleKnobAssign(fx.id, 'vol')} isAssigning={assignMode} />
                                            <Knob label="PAN" val={mod.params.pan} min={-1} max={1} step={0.01} def={0.0} onChange={(v) => updateParam(fx.id, 'pan', v)} onAssign={() => handleKnobAssign(fx.id, 'pan')} isAssigning={assignMode} />
                                            <div className="fx-select-col">
                                                <div className="master-toggle-btn" onPointerDown={(e) => { e.stopPropagation(); updateParam(fx.id, 'isMono', !mod.params.isMono); }}
                                                    style={{ background: mod.params.isMono ? '#00E5FF' : '#111' }} />
                                                <span className="fx-select-label">MONO</span>
                                            </div>
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack id={fx.id} n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );

                            return (
                                <window.DraggableWindow key={fx.id} id={fx.id} title={fx.type.replace('FX_', '')} color={fx.mClr} initialX={fx.x} initialY={fx.y} onClose={() => removeModule(fx.id, false)} onDuplicate={() => duplicateModule(fx.id)} onDrag={handleModuleDrag}>
                                    <div className="fx-layout">
                                        <div className="fx-panel">
                                            <div className="knob-row">
                                                {Object.keys(mod.params).map(p => (
                                                    <Knob key={p} label={p.toUpperCase()} val={mod.params[p]} min={mod.pMeta[p].min} max={mod.pMeta[p].max} step={mod.pMeta[p].step} def={mod.pMeta[p].def} onChange={(v) => updateParam(fx.id, p, v)} onAssign={() => handleKnobAssign(fx.id, p)} isAssigning={assignMode} />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="fx-io">
                                            <div className="fx-io-col">
                                                <ModuleJack id={fx.id} n="IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d) => updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            </div>
                                            <div className="fx-io-col">
                                                <ModuleJack id={fx.id} n="OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d) => updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                            </div>
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );
                        })}

                        {synths.map((ac, i) => {
                            const mod = cDsp.current.modules[ac.id];
                            if (!mod) return null;
                            const waveNames = ['SINE', 'SQR', 'SAW', 'TRI'];
                            return (
                                <window.DraggableWindow key={ac.id} id={ac.id} title="4742 PHOTOSYNTH" color={ac.mClr} initialX={ac.x} initialY={ac.y} onClose={() => removeModule(ac.id, true)} onDuplicate={() => duplicateModule(ac.id)} onCopy={() => copyParams(ac.id)} onPaste={() => pasteParams(ac.id)} onMutate={() => mutateParams(ac.id)} onDrag={handleModuleDrag}>
                                    <div className="synth-layout" style={{ minWidth: '400px' }}>
                                        
                                        {/* TAB NAVIGATION */}
                                        <div className="synth-tab-bar">
                                            {['ENGINE', 'FILTER', 'VOICING', 'MOD'].map(tab => (
                                                <div key={tab} 
                                                    className={`synth-tab ${mod.params.activeTab === tab ? 'active' : ''}`}
                                                    onPointerDown={(e) => { e.stopPropagation(); updateParam(ac.id, 'activeTab', tab); }}
                                                >
                                                    {tab}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="synth-main-content">
                                            {/* ENGINE TAB: OSC & VOICING */}
                                            {mod.params.activeTab === 'ENGINE' && (
                                                <div className="synth-tab-content animate-in">
                                                    <div className="synth-row">
                                                        <div className="synth-panel" style={{ flex: 1 }}>
                                                            <div className="synth-panel-header">
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span>WAVETABLE OSCILLATOR</span>
                                                                    <span style={{ fontSize: '8px', color: '#00E5FF', fontWeight: 'normal', letterSpacing: '0.5px', marginTop: '2px', opacity: 0.8 }}>
                                                                        X: TIME • Y: PITCH • LUMA: AMP (CLICK TO SCRUB)
                                                                    </span>
                                                                </div>
                                                                <div className="synth-header-controls">
                                                                    <div className="synth-live-btn" onPointerDown={(e) => {
                                                                        e.stopPropagation(); const newLive = !mod.params.isLive; updateParam(ac.id, 'isLive', newLive);
                                                                        if (!newLive) { const mod = cDsp.current.modules[ac.id]; mod.snapshotTopo = new Float32Array(mod.currentTopo); }
                                                                    }} style={{ border: `1px solid ${mod.params.isLive ? '#FF0033' : '#00E5FF'}`, color: mod.params.isLive ? '#FF0033' : '#00E5FF' }}>
                                                                        {mod.params.isLive ? 'LIVE' : 'SNAP'}
                                                                    </div>
                                                                    <button className="synth-live-btn" onPointerDown={e => {
                                                                        e.stopPropagation();
                                                                        updateParam(ac.id, 'showPresets', !mod.params.showPresets);
                                                                    }} style={{ background: mod.params.showPresets ? 'var(--accent-cyan)' : 'transparent', color: mod.params.showPresets ? '#000' : 'var(--accent-cyan)', fontWeight: '900', border: '1px solid var(--accent-cyan)' }}>
                                                                        {mod.params.showPresets ? 'VIEW WAVE' : 'BROWSE LIBRARY'}
                                                                    </button>
                                                                    <button className="synth-save-btn" onPointerDown={e => e.stopPropagation()} onClick={() => saveWtPreset(ac.id)}>SAVE</button>
                                                                </div>
                                                            </div>
                                                            <div className="synth-panel-content">
                                                                <div className="synth-display-wrapper">
                                                                    {mod.params.showPresets ? (
                                                                        <div onWheel={(e) => e.stopPropagation()} className="wt-library-panel">
                                                                            <div className="wt-library-header">
                                                                                <div className="wt-library-title">OSC SNAPSHOT LIBRARY</div>
                                                                                <div className="wt-library-close" onPointerDown={(e) => { e.stopPropagation(); updateParam(ac.id, 'showPresets', false); }}>✕ CLOSE</div>
                                                                            </div>
                                                                            <div className="wt-library-grid">
                                                                                {wtPresets.map((p, idx) => (
                                                                                    <div key={idx}
                                                                                        className="wt-preset-card"
                                                                                        onPointerDown={(e) => { e.stopPropagation(); loadWtPreset(ac.id, idx); }}
                                                                                    >
                                                                                        <div className="wt-preset-name">{p.name}</div>
                                                                                        <div className="wt-preset-tag">{p.params ? '◈ FULL STATE' : '◇ TOPOLOGY'}</div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <WavetablePanelDisplay mod={mod} color={ac.mClr} updateParam={updateParam} />
                                                                    )}
                                                                </div>
                                                                <div className="knob-row" style={{ flexWrap: 'wrap' }}>
                                                                    <Knob label="WT POS" val={mod.params.wtPos} min={0} max={1} step={0.01} def={0} onChange={(v) => updateParam(ac.id, 'wtPos', v)} />
                                                                    <Knob label="PITCH" val={mod.params.pitch || 0} min={-64} max={64} step={1} def={0} onChange={(v) => updateParam(ac.id, 'pitch', Math.round(v))} />
                                                                    <Knob label="X-TIME" val={mod.params.timeScl} min={0.1} max={4.0} step={0.01} def={1.0} onChange={(v) => updateParam(ac.id, 'timeScl', v)} />
                                                                    <Knob label="Y-PITCH" val={mod.params.freqScl} min={0.1} max={4.0} step={0.01} def={1.0} onChange={(v) => updateParam(ac.id, 'freqScl', v)} />
                                                                    <Knob label="WARP" val={mod.params.warp} min={-1} max={1} step={0.01} def={0.1} onChange={(v) => updateParam(ac.id, 'warp', v)} />
                                                                    <Knob label="BEND" val={mod.params.bend} min={-1} max={1} step={0.01} def={0} onChange={(v) => updateParam(ac.id, 'bend', v)} />
                                                                    <Knob label="SYNC" val={mod.params.sync} min={0.5} max={8.0} step={0.01} def={1.0} onChange={(v) => updateParam(ac.id, 'sync', v)} />
                                                                    <Knob label="FORMANT" val={mod.params.formant} min={0.5} max={8.0} step={0.01} def={1.0} onChange={(v) => updateParam(ac.id, 'formant', v)} />
                                                                    <Knob label="CRUSH" val={mod.params.crush} min={0} max={1} step={0.01} def={0} onChange={(v) => updateParam(ac.id, 'crush', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* ADSR ENVELOPE — always visible in ENGINE tab */}
                                                    <div className="synth-row" style={{ marginTop: '8px' }}>
                                                        <div className="synth-panel" style={{ flex: 1.6 }}>
                                                            <div className="synth-panel-header"><span>AMP ENVELOPE (ADSR)</span></div>
                                                            <div className="synth-panel-content">
                                                                <EnvVisualizer mod={mod} />
                                                                <div className="knob-row">
                                                                    <Knob label="ATK" val={mod.params.atk} min={0.001} max={5.0} step={0.001} def={0.005} onChange={(v) => updateParam(ac.id, 'atk', v)} />
                                                                    <Knob label="DEC" val={mod.params.dec} min={0.01} max={4.0} step={0.01} def={0.6} onChange={(v) => updateParam(ac.id, 'dec', v)} />
                                                                    <Knob label="SUS" val={mod.params.sus} min={0.0} max={1.0} step={0.01} def={0.1} onChange={(v) => updateParam(ac.id, 'sus', v)} />
                                                                    <Knob label="REL" val={mod.params.rel} min={0.01} max={8.0} step={0.01} def={1.5} onChange={(v) => updateParam(ac.id, 'rel', v)} />
                                                                    <Knob label="HOLD" val={mod.params.hold || 0} min={0} max={2.0} step={0.01} def={0} onChange={(v) => updateParam(ac.id, 'hold', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="synth-panel" style={{ flex: 1 }}>
                                                            <div className="synth-panel-header"><span>PITCH MOD</span></div>
                                                            <div className="synth-panel-content">
                                                                <div className="knob-row" style={{ flexWrap: 'wrap' }}>
                                                                    <Knob label="P-ENV" val={mod.params.pEnv} min={-100} max={100} step={1} def={0} onChange={(v) => updateParam(ac.id, 'pEnv', v)} />
                                                                    <Knob label="FM AMT" val={mod.params.fmAmt} min={0} max={1} step={0.01} def={0.15} onChange={(v) => updateParam(ac.id, 'fmAmt', v)} />
                                                                    <Knob label="DRIVE" val={mod.params.drive} min={0} max={60} step={1} def={5} onChange={(v) => updateParam(ac.id, 'drive', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* VOICING TAB */}
                                            {mod.params.activeTab === 'VOICING' && (
                                                <div className="synth-tab-content animate-in">
                                                    <div className="synth-row" style={{ gap: '15px' }}>
                                                        <div className="synth-panel" style={{ flex: 1.2 }}>
                                                            <div className="synth-panel-header"><span>UNISON & SPREAD</span></div>
                                                            <div className="synth-panel-content">
                                                                <div className="knob-row">
                                                                    <Knob label="VOICES" val={mod.params.unison} min={1} max={16} step={1} def={7} onChange={(v) => updateParam(ac.id, 'unison', v)} />
                                                                    <Knob label="DETUNE" val={mod.params.detune} min={0} max={0.5} step={0.0001} def={0.05} onChange={(v) => updateParam(ac.id, 'detune', v)} />
                                                                    <Knob label="SPREAD" val={mod.params.unisonSpread} min={0} max={1} step={0.01} def={0.8} onChange={(v) => updateParam(ac.id, 'unisonSpread', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="synth-panel" style={{ flex: 1 }}>
                                                            <div className="synth-panel-header"><span>SUB LAYER</span></div>
                                                            <div className="synth-panel-content">
                                                                <div className="knob-row">
                                                                    <Knob label="LEVEL" val={mod.params.subLvl} min={0} max={1} step={0.01} def={0.3} onChange={(v) => updateParam(ac.id, 'subLvl', v)} />
                                                                    <Knob label="OCTAVE" val={mod.params.subOct} min={-2} max={0} step={1} def={-1} onChange={(v) => updateParam(ac.id, 'subOct', v)} />
                                                                    <Knob label="PAN" val={mod.params.subPan} min={-1} max={1} step={0.01} def={0} onChange={(v) => updateParam(ac.id, 'subPan', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="synth-row">
                                                        <div className="synth-panel" style={{ flex: 1 }}>
                                                            <div className="synth-panel-header"><span>NOISE LAYER</span></div>
                                                            <div className="synth-panel-content">
                                                                <div className="knob-row">
                                                                    <Knob label="LEVEL" val={mod.params.noiseLvl} min={0} max={1} step={0.01} def={0.1} onChange={(v) => updateParam(ac.id, 'noiseLvl', v)} />
                                                                    <Knob label="COLOR" val={mod.params.noiseColor} min={100} max={15000} step={10} def={8000} onChange={(v) => updateParam(ac.id, 'noiseColor', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* FILTER TAB */}
                                            {mod.params.activeTab === 'FILTER' && (
                                                <div className="synth-tab-content animate-in">
                                                    <div className="synth-panel">
                                                        <div className="synth-panel-header"><span>FILTER SCULPTING</span></div>
                                                        <div className="synth-panel-content">
                                                            <select value={mod.params.filterType} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => updateParam(ac.id, 'filterType', e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
                                                                <option value="lowpass">LOWPASS 24</option>
                                                                <option value="highpass">HIGHPASS 24</option>
                                                                <option value="bandpass">BANDPASS</option>
                                                                <option value="notch">NOTCH</option>
                                                            </select>
                                                            <FilterVisualizer mod={mod} updateParam={updateParam} />
                                                            <div className="knob-row">
                                                                <Knob label="CUTOFF" val={mod.params.cut} min={20} max={20000} step={10} def={6000} onChange={(v) => updateParam(ac.id, 'cut', v)} />
                                                                <Knob label="RES" val={mod.params.res} min={0} max={30} step={0.5} def={1.5} onChange={(v) => updateParam(ac.id, 'res', v)} />
                                                                <Knob label="DRIVE" val={mod.params.drive} min={0} max={50} step={1} def={5} onChange={(v) => updateParam(ac.id, 'drive', v)} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* MOD TAB */}
                                            {mod.params.activeTab === 'MOD' && (
                                                <div className="synth-tab-content animate-in">
                                                    <div className="synth-row">
                                                        <div className="synth-panel" style={{ flex: 1.5 }}>
                                                            <div className="synth-panel-header"><span>ENV 1 (AMP)</span></div>
                                                            <div className="synth-panel-content">
                                                                <EnvVisualizer mod={mod} />
                                                                <div className="knob-row">
                                                                    <Knob label="ATK" val={mod.params.atk} min={0.0} max={1.0} step={0.005} def={0.005} onChange={(v) => updateParam(ac.id, 'atk', v)} />
                                                                    <Knob label="DEC" val={mod.params.dec} min={0.0} max={1.0} step={0.005} def={0.6} onChange={(v) => updateParam(ac.id, 'dec', v)} />
                                                                    <Knob label="SUS" val={mod.params.sus} min={0.0} max={1.0} step={0.01} def={0.1} onChange={(v) => updateParam(ac.id, 'sus', v)} />
                                                                    <Knob label="REL" val={mod.params.rel} min={0.0} max={3.0} step={0.01} def={1.5} onChange={(v) => updateParam(ac.id, 'rel', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="synth-panel" style={{ flex: 1 }}>
                                                            <div className="synth-panel-header"><span>LFO 1</span></div>
                                                            <div className="synth-panel-content">
                                                                <LfoVisualizer mod={mod} />
                                                                <div className="knob-row">
                                                                    <Knob label="RATE" val={mod.params.lfoRate} min={0.01} max={20} step={0.01} def={0.2} onChange={(v) => updateParam(ac.id, 'lfoRate', v)} />
                                                                    <Knob label="DEPTH" val={mod.params.lfoDepth} min={0} max={100} step={1} def={35} onChange={(v) => updateParam(ac.id, 'lfoDepth', v)} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* I/O FOOTER — matches all other modules */}
                                        <div className="fx-layout" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '4px', paddingTop: '6px' }}>
                                            <div className="fx-jack-col left">
                                                <ModuleJack id={ac.id} n="AUDIO IN" t={true} type="audio" active={isPatched(ac.id, 'AUDIO', true)} patchedColor={getPatchedColor(ac.id, 'AUDIO', true)} domReg={(d) => updatePipRegistry(ac.id, 'AUDIO', d)} onDown={(e) => handleJackDown(e, ac.id, 'AUDIO', true)} onUp={() => handleJackUp(ac.id, 'AUDIO', true)} onDoubleClick={() => clearJackCables(ac.id, 'AUDIO', true)} />
                                                <ModuleJack id={ac.id} n="TRIG IN" t={true} type="cv" active={isPatched(ac.id, 'TRIG', true)} patchedColor={getPatchedColor(ac.id, 'TRIG', true)} domReg={(d) => updatePipRegistry(ac.id, 'TRIG', d)} onDown={(e) => handleJackDown(e, ac.id, 'TRIG', true)} onUp={() => handleJackUp(ac.id, 'TRIG', true)} onDoubleClick={() => clearJackCables(ac.id, 'TRIG', true)} />
                                                <ModuleJack id={ac.id} n="FILTER" t={true} type="cv" active={isPatched(ac.id, 'FLT', true)} patchedColor={getPatchedColor(ac.id, 'FLT', true)} domReg={(d) => updatePipRegistry(ac.id, 'FLT', d)} onDown={(e) => handleJackDown(e, ac.id, 'FLT', true)} onUp={() => handleJackUp(ac.id, 'FLT', true)} onDoubleClick={() => clearJackCables(ac.id, 'FLT', true)} />
                                                <ModuleJack id={ac.id} n="PITCH" t={true} type="cv" active={isPatched(ac.id, 'PITCH', true)} patchedColor={getPatchedColor(ac.id, 'PITCH', true)} domReg={(d) => updatePipRegistry(ac.id, 'PITCH', d)} onDown={(e) => handleJackDown(e, ac.id, 'PITCH', true)} onUp={() => handleJackUp(ac.id, 'PITCH', true)} onDoubleClick={() => clearJackCables(ac.id, 'PITCH', true)} />
                                                <ModuleJack id={ac.id} n="WT POS" t={true} type="cv" active={isPatched(ac.id, 'WT', true)} patchedColor={getPatchedColor(ac.id, 'WT', true)} domReg={(d) => updatePipRegistry(ac.id, 'WT', d)} onDown={(e) => handleJackDown(e, ac.id, 'WT', true)} onUp={() => handleJackUp(ac.id, 'WT', true)} onDoubleClick={() => clearJackCables(ac.id, 'WT', true)} />
                                            </div>
                                            <div style={{ flex: 1 }} />
                                            <div className="fx-jack-col right">
                                                <ModuleJack id={ac.id} n="AUDIO OUT" type="audio" active={isPatched(ac.id, 'AUDIO', false)} patchedColor={getPatchedColor(ac.id, 'AUDIO', false)} domReg={(d) => updatePipRegistry(ac.id, 'AUDIO', d)} onDown={(e) => handleJackDown(e, ac.id, 'AUDIO', false)} onUp={() => handleJackUp(ac.id, 'AUDIO', false)} onDoubleClick={() => clearJackCables(ac.id, 'AUDIO', false)} />
                                                <ModuleJack id={ac.id} n="ENV OUT" type="cv" active={isPatched(ac.id, 'ENV', false)} patchedColor={getPatchedColor(ac.id, 'ENV', false)} domReg={(d) => updatePipRegistry(ac.id, 'ENV', d)} onDown={(e) => handleJackDown(e, ac.id, 'ENV', false)} onUp={() => handleJackUp(ac.id, 'ENV', false)} onDoubleClick={() => clearJackCables(ac.id, 'ENV', false)} />
                                                <ModuleJack id={ac.id} n="LFO OUT" type="cv" active={isPatched(ac.id, 'LFO', false)} patchedColor={getPatchedColor(ac.id, 'LFO', false)} domReg={(d) => updatePipRegistry(ac.id, 'LFO', d)} onDown={(e) => handleJackDown(e, ac.id, 'LFO', false)} onUp={() => handleJackUp(ac.id, 'LFO', false)} onDoubleClick={() => clearJackCables(ac.id, 'LFO', false)} />
                                            </div>
                                        </div>
                                    </div>
                                </window.DraggableWindow>
                            );
                        })}
                        </div>
                    </>
                )}
            </div>
        );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<window.ErrorBoundary><App /></window.ErrorBoundary>);