function App() {
    const TWEAKS = window.QuickTweaks || {
        defaults: { viewMode: 'SLEEP', bpm: 128, rootNote: 'C', scale: 'MINOR', quality: 'STANDARD', resolutionProfile: 'PERFORMANCE' },
        ranges: { bpmMin: 40, bpmMax: 240 },
        timings: { proTipRotateMs: 8000, loadProjectReconnectDelayMs: 500 },
        labels: { addPhotosynth: '+ ADD PHOTOSYNTH', moduleLibrary: '+ MODULE LIBRARY', returnToCanvas: 'RETURN TO CANVAS' }
    };

    const [viewMode, setViewMode] = useState(TWEAKS.defaults.viewMode);
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [isProjectsOpen, setIsProjectsOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(true);
    
    const [savedProjects, setSavedProjects] = useState([]);
    const [saveDirectoryHandle, setSaveDirectoryHandle] = useState(null);
    const [saveDirectoryPath, setSaveDirectoryPath] = useState('NOT SET');
    const [synths, setSynths] = useState([]); 
    const [fxModules, setFxModules] = useState([]); 
    const [patchCount, setPatchCount] = useState(0); 
    const [wireColor, setWireColor] = useState(THEME_CLRS[0]);
    
    const [bpm, setBpm] = useState(TWEAKS.defaults.bpm);
    const [rootNote, setRootNote] = useState(TWEAKS.defaults.rootNote);
    const [scale, setScale] = useState(TWEAKS.defaults.scale);
    const [quality, setQuality] = useState(TWEAKS.defaults.quality);
    const [resolutionProfile, setResolutionProfile] = useState(window.OptoRackResolution.currentKey || TWEAKS.defaults.resolutionProfile);
    const [startupResolutionProfile, setStartupResolutionProfile] = useState(window.OptoRackResolution.currentKey || TWEAKS.defaults.resolutionProfile);
    
    const [, setRenderTrigger] = useState(0); 
    const [isRecording, setIsRecording] = useState(false);
    const [assignMode, setAssignMode] = useState(null); 
    const [wtPresets, setWtPresets] = useState([]);
    const [tipIndex, setTipIndex] = useState(0);

    const camRef = useRef({ x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 });
    const worldRef = useRef(null);
    const cablesRef = useRef([]); 
    const dragCableRef = useRef(null); 
    const disruptCursor = useRef({x: -1000, y: -1000, force: 0, down: false});
    
    const lastRenderTime = useRef(performance.now());
    const frameCount = useRef(0);
    const bpmRef = useRef(120);
    const scaleRef = useRef('MINOR');
    const rootNoteRef = useRef('C');
    
    const sharedStateRef = useRef({ scanX: 0, synthParams: null, pixels: null, activeSynthId: null });
    
    const vRef = useRef(null);
    const canvasFg = useRef(null); 
    const scanCanvas = useRef(document.createElement('canvas'));
    const cDsp = useRef({ modules: {}, cameraFailed: false, actx: null, mOut: null, dest: null, recorder: null, chunks: [] }); 
    const jackElements = useRef({}); 

    useEffect(() => { bpmRef.current = clamp(bpm, TWEAKS.ranges.bpmMin, TWEAKS.ranges.bpmMax); }, [bpm]);
    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { rootNoteRef.current = rootNote; }, [rootNote]);
    useEffect(() => {
        const tips = (window.AppTips && window.AppTips.items) || [];
        const tipCount = tips.length || 1;
        const tipInterval = setInterval(() => setTipIndex(Math.floor(Math.random() * tipCount)), TWEAKS.timings.proTipRotateMs);
        return () => clearInterval(tipInterval);
    }, []);
    
    useEffect(() => { 
        try {
            const savedPath = localStorage.getItem('optorack_save_dir_label');
            if (savedPath) setSaveDirectoryPath(savedPath);
        } catch(e) {}
    }, []);

    const INIT_MOTHER_SYSTEM = async () => {
        const bootRes = window.OptoRackResolution.setProfile(startupResolutionProfile, true);
        setResolutionProfile(bootRes);
        const actx = window.SoundEngine.createAudioContext(quality);
        if (actx.state === 'suspended') await actx.resume(); 

        scanCanvas.current.width = DW; scanCanvas.current.height = DH;
        const masterVol = actx.createGain(); masterVol.gain.value = 1.0; 
        const masterIn = actx.createGain(); masterIn.connect(masterVol);
        
        const softClipper = actx.createWaveShaper(); softClipper.curve = null; softClipper.oversample = '4x';
       const brickwall = actx.createDynamicsCompressor(); brickwall.threshold.value = -6.0; brickwall.ratio.value = 20; brickwall.attack.value = 0.001; brickwall.release.value = 0.15;
        masterVol.connect(softClipper); softClipper.connect(brickwall); brickwall.connect(actx.destination);
        const dest = actx.createMediaStreamDestination(); brickwall.connect(dest);
        const masterAnalyser = actx.createAnalyser(); masterAnalyser.fftSize = 4096; brickwall.connect(masterAnalyser);

        cDsp.current.actx = actx; cDsp.current.mOut = masterVol; cDsp.current.dest = dest; cDsp.current.mAnalyser = masterAnalyser;

        cDsp.current.modules['MASTER'] = {
            id: 'MASTER', type: 'MASTER', inNodes: { IN: masterIn }, nodes: { vol: masterVol, soft: softClipper, limit: brickwall },
            params: { vol: 0.0, softClip: false, limiter: true }, baseParams: { vol: 0.0, softClip: false, limiter: true }
        };

        try {
            const feed = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment', width:640, height:480}});
            if (vRef.current) { vRef.current.srcObject = feed; await vRef.current.play(); }
        } catch (err) { 
            console.warn("Camera blocked. Using mathematical fallback generator.");
            cDsp.current.cameraFailed = true; 
        }
        setViewMode("PATCHING");
    };

    const toggleRecording = () => {
        try {
            if (isRecording) { cDsp.current.recorder.stop(); setIsRecording(false); } 
            else {
                cDsp.current.chunks = []; const recorder = new MediaRecorder(cDsp.current.dest.stream);
                recorder.ondataavailable = e => cDsp.current.chunks.push(e.data);
                recorder.onstop = () => {
                    const blob = new Blob(cDsp.current.chunks, { type: 'audio/webm' });
                    const url = URL.createObjectURL(blob); const a = document.createElement('a');
                    a.href = url; a.download = `OptoRack_Live_${Date.now()}.webm`; a.click();
                };
                recorder.start(); cDsp.current.recorder = recorder; setIsRecording(true);
            }
        } catch(e) { console.warn("MediaRecorder not supported on this browser."); }
    };

    const serializeProject = () => ({
        synths: synths.map(s => ({ id: s.id, type: s.type, x: s.gPos.x, y: s.gPos.y, params: cDsp.current.modules[s.id].baseParams })),
        fxModules: fxModules.map(f => ({ id: f.id, type: f.type, x: f.x, y: f.y, w: f.w, h: f.h, params: cDsp.current.modules[f.id].baseParams })),
        cables: cablesRef.current.map(c => ({ srcMod: c.srcMod, srcPort: c.srcPort, destMod: c.destMod, destPort: c.destPort, color: c.color })),
        master: cDsp.current.modules['MASTER'].baseParams, bpm, scale, rootNote, quality, resolutionProfile
    });

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
            try { localStorage.setItem('optorack_save_dir_label', label); } catch (e) {}
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
        if(data.master) Object.keys(data.master).forEach(k => updateParam('MASTER', k, data.master[k]));
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
            setPatchCount(cablesRef.current.length); setRenderTrigger(p=>p+1);
        }, TWEAKS.timings.loadProjectReconnectDelayMs);
    };

    const spawnFX = (type, overrideParams = null, offsetX = null, offsetY = null, forceId = null, forceW = null, forceH = null) => {
        const actx = cDsp.current.actx; const id = forceId || `${type}_${Date.now()}`;
        let newMod = { id, type, inNodes: {}, outNodes: {}, nodes: {}, params: {}, baseParams: {} };
        let initialW = forceW; let initialH = forceH;

        if (type === 'FX_EQ') {
            const eqIn = actx.createGain(); const eqOut = actx.createGain();
            const analyser = actx.createAnalyser(); analyser.fftSize = 2048; eqIn.connect(analyser);
            const freqs = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
            const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
            const bands = freqs.map((f, i) => { const filter = actx.createBiquadFilter(); filter.type = types[i]; filter.frequency.value = f; filter.Q.value = 1.0; filter.gain.value = 0; return filter; });
            eqIn.connect(bands[0]); for(let i=0; i<9; i++) bands[i].connect(bands[i+1]); bands[9].connect(eqOut);
            newMod.inNodes = { IN: eqIn }; newMod.outNodes = { OUT: eqOut }; newMod.nodes = { bands, analyser };
            newMod.params = overrideParams || { b1f: 31.5, b1g: -12, b1q: 1, b2f: 63, b2g: 3, b2q: 1, b3f: 125, b3g: 0, b3q: 1, b4f: 250, b4g: -4, b4q: 1, b5f: 500, b5g: 0, b5q: 1, b6f: 1000, b6g: 0, b6q: 1, b7f: 2000, b7g: 0, b7q: 1, b8f: 4000, b8g: 2, b8q: 1, b9f: 8000, b9g: 0, b9q: 1, b10f: 16000, b10g: 0, b10q: 1 };
            initialW = forceW || 600; initialH = forceH || 350;
        }
        else if (type === 'MOD_LFO') {
            newMod.params = overrideParams || { rate: 1.0, depth: 50, wave: 0 }; newMod.state = { phase: 0, targets: [] }; 
            initialW = forceW || 380; initialH = forceH || 320;
        }

        else if (type === 'FX_DELAY') {
            const dIn = actx.createGain(); const dOut = actx.createGain();
            const delay = actx.createDelay(5.0); delay.delayTime.value = 0.3;
            const feedback = actx.createGain(); feedback.gain.value = 0.4;
            const filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 3000;
            const wet = actx.createGain(); wet.gain.value = 0.5;
            const dry = actx.createGain(); dry.gain.value = 1.0;

            dIn.connect(dry); dry.connect(dOut);
            dIn.connect(delay); delay.connect(filter); filter.connect(feedback);
            feedback.connect(delay); delay.connect(wet); wet.connect(dOut);

            newMod.inNodes = { IN: dIn }; newMod.outNodes = { OUT: dOut };
            newMod.nodes = { delay, feedback, filter, wet, dry };
            newMod.params = overrideParams || { time: 0.3, feedback: 0.4, mix: 0.5, cutoff: 3000 };
            initialW = forceW || 380; initialH = forceH || 220;
        }

        else if (type === 'FX_PRO_REV') {
            const revIn = actx.createGain(); const revOut = actx.createGain(); const revWet = actx.createGain(); const revDry = actx.createGain();
            const preDelay = actx.createDelay(1.0); preDelay.delayTime.value = 0.03;
            const loCut = actx.createBiquadFilter(); loCut.type = 'highpass'; loCut.frequency.value = 200;
            const hiCut = actx.createBiquadFilter(); hiCut.type = 'lowpass'; hiCut.frequency.value = 8000;
            
            // "Distance" air absorption filter (soft lowpass)
            const airAbsorb = actx.createBiquadFilter(); airAbsorb.type = 'lowshelf'; airAbsorb.frequency.value = 4000; airAbsorb.gain.value = 0;

            revIn.connect(revDry); revDry.connect(revOut); revIn.connect(preDelay); 
            preDelay.connect(loCut); loCut.connect(hiCut); hiCut.connect(airAbsorb);
            
            // Tighter, prime-number delays for a buttery smooth, non-echoing reverb tail
            const baseDelays = [0.0113, 0.0167, 0.0223, 0.0293, 0.0347, 0.0419]; 
            const revDelays = baseDelays.map(t => { const d = actx.createDelay(1.0); d.delayTime.value = t; return d; });
            const revFbs = revDelays.map(() => { const g = actx.createGain(); g.gain.value = 0.85; return g; });
            const spinLfo = actx.createOscillator(); spinLfo.frequency.value = 0.5; spinLfo.start();
            const spinGain = actx.createGain(); spinGain.gain.value = 0.002; spinLfo.connect(spinGain);
           revDelays.forEach((d, i) => { 
                airAbsorb.connect(d); // Route through air absorption
                d.connect(revFbs[i]); 
                revFbs[i].connect(revDelays[(i+1) % 6]); // Spread across all 6 lines
                d.connect(revWet); 
                spinGain.connect(d.delayTime); 
            });
            revWet.connect(revOut); 
            newMod.inNodes = { IN: revIn }; newMod.outNodes = { OUT: revOut };
            newMod.params = overrideParams || { mix: 0.45, distance: 0.0, decay: 0.88, size: 2.5, width: 1.0, loCut: 400, hiCut: 9000, loGain: 0.0, hiGain: -1.5, spinRate: 0.4, spin: 0.32 };
            // Add shelves for EQ mapping
            const lowShelf = actx.createBiquadFilter(); lowShelf.type = 'lowshelf'; lowShelf.frequency.value = newMod.params.loCut; lowShelf.gain.value = newMod.params.loGain;
            const highShelf = actx.createBiquadFilter(); highShelf.type = 'highshelf'; highShelf.frequency.value = newMod.params.hiCut; highShelf.gain.value = newMod.params.hiGain;
            
            // Re-route
            revIn.connect(revDry); revDry.connect(revOut); revIn.connect(preDelay); 
            preDelay.connect(loCut); loCut.connect(hiCut); hiCut.connect(lowShelf); lowShelf.connect(highShelf);
            
            newMod.nodes = { wet: revWet, dry: revDry, pre: preDelay, lo: loCut, hi: hiCut, lowEQ: lowShelf, hiEQ: highShelf, fbs: revFbs, delays: revDelays, baseDelays: baseDelays, spin: spinGain, spinLfo };
            initialW = forceW || 480; initialH = forceH || 250;
        } 
        else if (type === 'FX_RHYTHM') {
            const rgIn = actx.createGain(); const rgOut = actx.createGain(); const rgVCA = actx.createGain(); rgVCA.gain.value = 1.0;
            rgIn.connect(rgVCA); rgVCA.connect(rgOut); 
            newMod.inNodes = { IN: rgIn }; newMod.outNodes = { OUT: rgOut };
            // Ducks on 1, 5, 9, 13 (the kick) and glides back up over ~150ms
            newMod.params = overrideParams || { 
                depth: 1.0, 
                smooth: 0.15, 
                rate: 4, 
                steps: [false, true, true, true, false, true, true, true, false, true, true, true, false, true, true, true] 
            };
            newMod.nodes = { vca: rgVCA }; newMod.state = { step: 0, lastTime: 0 };
            initialW = forceW || 380; initialH = forceH || 320;
        }
        else if (type === 'FX_AUTOFILTER') {
            const afIn = actx.createGain(); const afOut = actx.createGain();
            const afFilter1 = actx.createBiquadFilter(); afFilter1.type = 'lowpass'; afFilter1.frequency.value = 1000; afFilter1.Q.value = 5;
            const afFilter2 = actx.createBiquadFilter(); afFilter2.type = 'lowpass'; afFilter2.frequency.value = 1000; afFilter2.Q.value = 5;
            const afDrive = actx.createWaveShaper(); afDrive.curve = makeDriveCurve(10);
            const afLfo = actx.createOscillator(); afLfo.frequency.value = 1.0; afLfo.start();
            const afLfoGain = actx.createGain(); afLfoGain.gain.value = 500;
            afLfo.connect(afLfoGain); afLfoGain.connect(afFilter1.frequency); afLfoGain.connect(afFilter2.frequency);
            afIn.connect(afFilter1); afFilter1.connect(afFilter2); afFilter2.connect(afDrive); afDrive.connect(afOut);
            newMod.inNodes = { IN: afIn }; newMod.outNodes = { OUT: afOut };
            newMod.params = overrideParams || { cut: 1000, res: 5, drive: 10, lfoRate: 1.0, lfoAmt: 500, filterType: 'lowpass' };
            newMod.nodes = { filter1: afFilter1, filter2: afFilter2, drive: afDrive, lfo: afLfo, lfoGain: afLfoGain };
            initialW = forceW || 380; initialH = forceH || 320;
        }
        
        else if (type === 'FX_SIDECHAIN') {
            const scIn = actx.createGain(); const scOut = actx.createGain();
            const scTrigIn = actx.createGain();
            const scVca = actx.createGain(); scVca.gain.value = 1.0;
            const scAnalyzer = actx.createAnalyser(); scAnalyzer.fftSize = 64; scAnalyzer.smoothingTimeConstant = 0.2;
            
            scIn.connect(scVca); scVca.connect(scOut);
            scTrigIn.connect(scAnalyzer); // Envelope follower picks up trigger

            newMod.inNodes = { IN: scIn, TRIG: scTrigIn }; newMod.outNodes = { OUT: scOut };
            newMod.nodes = { vca: scVca, analyser: scAnalyzer };
            newMod.params = overrideParams || { threshold: 0.1, ratio: 0.8, attack: 0.01, release: 0.2 };
            newMod.state = { currentDuck: 1.0 };
            initialW = forceW || 380; initialH = forceH || 240;
        }
        
        
        else if (type === 'FX_OTT') {
            const ottIn = actx.createGain(); const ottOut = actx.createGain();
            const dryGain = actx.createGain(); dryGain.gain.value = 0; const wetGain = actx.createGain(); wetGain.gain.value = 1;
            ottIn.connect(dryGain); dryGain.connect(ottOut);
            const splitL = actx.createBiquadFilter(); splitL.type = 'lowpass'; splitL.frequency.value = 150;
            const splitM = actx.createBiquadFilter(); splitM.type = 'bandpass'; splitM.frequency.value = 1500; splitM.Q.value = 0.5;
            const splitH = actx.createBiquadFilter(); splitH.type = 'highpass'; splitH.frequency.value = 2500;
            const compL = actx.createDynamicsCompressor(); compL.threshold.value = -40; compL.ratio.value = 12; compL.attack.value = 0.02; compL.release.value = 0.2;
            const compM = actx.createDynamicsCompressor(); compM.threshold.value = -35; compM.ratio.value = 10;
            const compH = actx.createDynamicsCompressor(); compH.threshold.value = -30; compH.ratio.value = 8;
            const gainL = actx.createGain(); gainL.gain.value = 4.0; const gainM = actx.createGain(); gainM.gain.value = 3.0; const gainH = actx.createGain(); gainH.gain.value = 5.0;
            ottIn.connect(splitL); splitL.connect(compL); compL.connect(gainL); gainL.connect(wetGain);
            ottIn.connect(splitM); splitM.connect(compM); compM.connect(gainM); gainM.connect(wetGain);
            ottIn.connect(splitH); splitH.connect(compH); compH.connect(gainH); gainH.connect(wetGain);
            wetGain.connect(ottOut);
            newMod.inNodes = { IN: ottIn }; newMod.outNodes = { OUT: ottOut };
            newMod.params = overrideParams || { depth: 1.0, low: 4.0, mid: 3.0, high: 5.0 };
            newMod.nodes = { dry: dryGain, wet: wetGain, splitL, splitM, splitH, cL: compL, cM: compM, cH: compH, gL: gainL, gM: gainM, gH: gainH };
            initialW = forceW || 380; initialH = forceH || 320;
        }
        else if (type === 'PROB_SEQ') {
            const seqOut = actx.createConstantSource(); seqOut.offset.value = 1; seqOut.start();
            const seqGain = actx.createGain(); seqGain.gain.value = 0; seqOut.connect(seqGain);
            const pitchOut = actx.createConstantSource(); pitchOut.offset.value = 1; pitchOut.start();
            const pitchGain = actx.createGain(); pitchGain.gain.value = 1; pitchOut.connect(pitchGain);
            newMod.outNodes = { TRIG: seqGain, PITCH: pitchGain }; newMod.nodes = { seqOut, pitchOut };
            newMod.params = overrideParams || { prob: 0.8, rate: 4, gate: 0.5, steps: Array(16).fill(true) };
            newMod.state = { step: 0, lastTime: 0 }; newMod.currentStep = 0;
            initialW = forceW || 380; initialH = forceH || 320;
        }
        else if (type === 'UTILITY_IO') {
            const uIn = actx.createGain(); 
            const uMono = actx.createGain(); 
            const uVol = actx.createGain();
            const uPan = actx.createStereoPanner();
            const uOut = actx.createGain();
            
            uIn.connect(uMono); uMono.connect(uVol); uVol.connect(uPan); uPan.connect(uOut);
            
            newMod.inNodes = { IN: uIn }; newMod.outNodes = { OUT: uOut }; 
            newMod.nodes = { vol: uVol, pan: uPan, mono: uMono };
            newMod.params = overrideParams || { vol: 0.0, pan: 0.0, isMono: false };
            initialW = forceW || 300; initialH = forceH || 200;
        }

        newMod.baseParams = JSON.parse(JSON.stringify(newMod.params));
        cDsp.current.modules[id] = newMod;
        Object.keys(newMod.params).forEach(k => updateParamInternal(newMod, k, newMod.params[k]));

        const slotPos = getNextGridSlot(initialW, initialH);
        setFxModules(p => [...p, { id, type, x: offsetX ?? slotPos.x, y: offsetY ?? slotPos.y, w: initialW, h: initialH }]);
        setIsBrowserOpen(false);
    };

    const spawnSynth = useCallback((overrideParams = null, offsetX = null, offsetY = null, forceId = null) => {
        if(!cDsp.current.actx) return;
        
        let gDat = { x: 20, y: 20, w: 60, h: 60, cx: 50, cy: 50, cCount: 100 };
        const cAc = cDsp.current.actx;
        
        const MAX_UNISON = 16;
        const unisonOscs = []; const unisonGains = []; const unisonPanners = [];
        const unisonMaster = cAc.createGain(); unisonMaster.gain.value = 1.0;

       const preFilterMix = cAc.createGain(); preFilterMix.gain.value = 1.0;
        const postFilterMix = cAc.createGain(); postFilterMix.gain.value = 1.0;
        
        const oscGain = cAc.createGain(); oscGain.gain.value = 1.0;
        const audioIn = cAc.createGain(); audioIn.gain.value = 1.0;
        audioIn.connect(unisonMaster);
        unisonMaster.connect(oscGain); oscGain.connect(preFilterMix);

        const subOsc = cAc.createOscillator(); subOsc.type = 'sine'; subOsc.start();
        const subGain = cAc.createGain(); subGain.gain.value = 0.0;
        const subToFilter = cAc.createGain(); subToFilter.gain.value = 1.0;
        const subToOut = cAc.createGain(); subToOut.gain.value = 0.0;
        const fmGain = cAc.createGain(); fmGain.gain.value = 0.0;
        subOsc.connect(subGain); subGain.connect(subToFilter); subGain.connect(subToOut);
        subToFilter.connect(preFilterMix); subToOut.connect(postFilterMix);
        subOsc.connect(fmGain);

        const bufferSize = cAc.sampleRate * 2; const noiseBuffer = cAc.createBuffer(1, bufferSize, cAc.sampleRate);
        const output = noiseBuffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const noiseSrc = cAc.createBufferSource(); noiseSrc.buffer = noiseBuffer; noiseSrc.loop = true; noiseSrc.start();
        const noiseGain = cAc.createGain(); noiseGain.gain.value = 0.0;
        const noiseToFilter = cAc.createGain(); noiseToFilter.gain.value = 1.0;
        const noiseToOut = cAc.createGain(); noiseToOut.gain.value = 0.0;
        noiseSrc.connect(noiseGain); noiseGain.connect(noiseToFilter); noiseGain.connect(noiseToOut);
        noiseToFilter.connect(preFilterMix); noiseToOut.connect(postFilterMix);

        const moLPF1 = cAc.createBiquadFilter(); moLPF1.type = 'lowpass'; moLPF1.Q.value = 0; moLPF1.frequency.value=1000;
        const moLPF2 = cAc.createBiquadFilter(); moLPF2.type = 'lowpass'; moLPF2.Q.value = 0; moLPF2.frequency.value=1000;
        
        const softClipper = cAc.createWaveShaper(); softClipper.curve = makeSoftClipCurve(); softClipper.oversample = '2x';
        preFilterMix.connect(softClipper); softClipper.connect(moLPF1);

        for(let i=0; i<MAX_UNISON; i++) {
            const osc = cAc.createOscillator(); const gain = cAc.createGain(); const panner = cAc.createStereoPanner();
            osc.connect(gain); gain.connect(panner); panner.connect(unisonMaster); 
            fmGain.connect(osc.frequency); 
            osc.start();
            unisonOscs.push(osc); unisonGains.push(gain); unisonPanners.push(panner);
        }
        
        const lfo = cAc.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 2.0;
        const lfoSmooth = cAc.createBiquadFilter(); lfoSmooth.type = 'lowpass'; lfoSmooth.frequency.value = 20; 
        const lfoDepth = cAc.createGain(); lfoDepth.gain.value = 1.0; const lfoOut = cAc.createGain(); lfoOut.gain.value = 1.0;
        lfo.connect(lfoSmooth); lfoSmooth.connect(lfoDepth); lfoDepth.connect(lfoOut);

        const evVCA = cAc.createGain(); evVCA.gain.value = 0;
        const panner = cAc.createStereoPanner(); panner.pan.value = 0;
        const audioOut = cAc.createGain(); audioOut.gain.value = 1.0;
        
       moLPF1.connect(moLPF2); moLPF2.connect(postFilterMix); postFilterMix.connect(evVCA); evVCA.connect(panner); panner.connect(audioOut);

        const envCVSource = cAc.createConstantSource(); envCVSource.offset.value = 1.0; envCVSource.start();
        const envCVOut = cAc.createGain(); envCVOut.gain.value = 0; envCVSource.connect(envCVOut); 

        const topoCVSource = cAc.createConstantSource(); topoCVSource.offset.value = 1.0; topoCVSource.start();
        const topoCVOut = cAc.createGain(); topoCVOut.gain.value = 0; topoCVSource.connect(topoCVOut);

        const inFlt = cAc.createGain(); inFlt.gain.value = 5000; inFlt.connect(moLPF1.frequency); inFlt.connect(moLPF2.frequency); 
        const inPitch = cAc.createGain(); inPitch.gain.value = 1; 
        unisonOscs.forEach(osc => inPitch.connect(osc.detune));
        inPitch.connect(subOsc.detune);
        const inTrig = cAc.createGain(); inTrig.gain.value = 1; 
        
        const pitchEnvGain = cAc.createGain(); pitchEnvGain.gain.value = 0;
        envCVOut.connect(pitchEnvGain); pitchEnvGain.connect(inPitch);

        const inWt = cAc.createGain(); inWt.gain.value = 1;

        lfo.start();

        const modId = forceId || `VOICE_${Date.now()}`; 
        
        // Tuned defaults for a polished "Crystal" Pluck/Pad
        const defaultParams = { 
            atk: 0.005, hold: 0.0, dec: 0.6, sus: 0.1, rel: 1.5,
            cut: 6000, res: 1.5, drive: 5, filterType: 'lowpass',
            pitch: 0, lfoWave: 0, lfoRate: 0.2, lfoDepth: 35,
            wtPos: 0.0, scanRate: 0.3, wtScan: true, topoInt: 1.0,
            unison: 7, detune: 0.05, blend: 0.9, warp: 0.1, bend: 0.0, sym: 0.0,
            sync: 1.0, formant: 1.0, crush: 0.0, harm: 1.0, fmAmt: 0.15,
            meshRes: 64, sensitivity: 1.0, isLive: true,
            
            oscOn: true, subOn: true, subFilter: true, noiseOn: false, noiseFilter: true,
            subLvl: 0.3, // Lowered from 0.65
            noiseLvl: 0.1, // Lowered from 0.2
            inLvl: 1.0, 
            pEnv: 0.0,
            timeScl: 1.0, freqScl: 1.0, ampScl: 1.0,
            ...(overrideParams || {})
        };

        let newN = {
           id: modId, type: 'SYNTH',
           unisonOscs, unisonGains, unisonPanners, unisonMaster, subOsc, subGain, noiseSrc, noiseGain, fmGain,
           oscGain, subToFilter, subToOut, noiseToFilter, noiseToOut,
           lfo: lfo, lfoDepth: lfoDepth, lfoSmooth: lfoSmooth,
           fB1: moLPF1, fB2: moLPF2, env: evVCA, panner: panner, envCVSource, topoCVSource, pitchEnvGain, audioIn,
           outNodes: { AUDIO: audioOut, ENV: envCVOut, TOPO: topoCVOut, LFO: lfoOut },
           inNodes: { AUDIO: audioIn, FLT: inFlt, PITCH: inPitch, TRIG: inTrig, WT: inWt },
           gPos: gDat, mClr: THEME_CLRS[synths.length % THEME_CLRS.length],
           curTrigT: 0, wavePhase: Math.random() * 100, triggerFlag: false, scanPhase: 0,
           currentTopo: null, snapshotTopo: null,
           params: defaultParams, baseParams: JSON.parse(JSON.stringify(defaultParams))
        };
        
        cDsp.current.modules[modId] = newN;
        if (overrideParams) { 
            newN.fB1.Q.value = newN.params.res * 0.6; newN.fB2.Q.value = newN.params.res * 0.6; 
            newN.fB1.type = newN.params.filterType; newN.fB2.type = newN.params.filterType;
            newN.fmGain.gain.value = newN.params.fmAmt * 5000;
            newN.pitchEnvGain.gain.value = newN.params.pEnv * 100;
            newN.audioIn.gain.value = newN.params.inLvl;
        }

        const slotPos = getNextGridSlot(700, 550);
        setSynths(p => [...p, { ...newN, x: offsetX ?? slotPos.x, y: offsetY ?? slotPos.y }]);
        setIsBrowserOpen(false);
    }, [synths.length]);

    const removeModule = (modId, isSynth) => {
        const cablesToRemove = cablesRef.current.filter(c => c.srcMod === modId || c.destMod === modId);
        cablesToRemove.forEach(c => {
            if(c.cableGain) { c.cableGain.gain.setTargetAtTime(0, cDsp.current.actx.currentTime, 0.05); setTimeout(() => { try { c.cableGain.disconnect(); } catch(e){} }, 100); }
        });
        cablesRef.current = cablesRef.current.filter(c => c.srcMod !== modId && c.destMod !== modId);
        setPatchCount(cablesRef.current.length);

        Object.keys(jackElements.current).forEach(k => { if(k.startsWith(modId + '_')) delete jackElements.current[k]; });

        const mod = cDsp.current.modules[modId];
        if(mod) {
            Object.values(mod.nodes || {}).forEach(n => { try{n.disconnect()}catch(e){} });
            Object.values(mod.inNodes || {}).forEach(n => { try{n.disconnect()}catch(e){} });
            Object.values(mod.outNodes || {}).forEach(n => { try{n.disconnect()}catch(e){} });
            if(mod.unisonOscs) { mod.unisonOscs.forEach(osc => { try{osc.stop(); osc.disconnect();}catch(e){} }); }
            if(mod.subOsc) { try{mod.subOsc.stop(); mod.subOsc.disconnect();}catch(e){} }
            if(mod.noiseSrc) { try{mod.noiseSrc.stop(); mod.noiseSrc.disconnect();}catch(e){} }
            if(mod.lfo) { try{mod.lfo.stop(); mod.lfo.disconnect();}catch(e){} }
            if(mod.envCVSource) { try{mod.envCVSource.stop(); mod.envCVSource.disconnect();}catch(e){} }
            if(mod.topoCVSource) { try{mod.topoCVSource.stop(); mod.topoCVSource.disconnect();}catch(e){} }
        }
        delete cDsp.current.modules[modId];
        if (window.moduleControllers) delete window.moduleControllers[modId];
        
        if(isSynth) setSynths(p => p.filter(a => a.id !== modId)); else setFxModules(p => p.filter(a => a.id !== modId));
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
        if(mod) {
            mod.params.steps = mod.params.steps.map(() => Math.random() > 0.5);
            setRenderTrigger(p=>p+1);
        }
    };

    const handleWheel = (e) => {
        if (viewMode !== "PATCHING" || isBrowserOpen || isProjectsOpen) return;
        const zoomSensitivity = 0.0015; const deltaZ = -e.deltaY * zoomSensitivity;
        const newZ = clamp(camRef.current.tz + deltaZ, 0.2, 2.5); const scaleRatio = newZ / camRef.current.tz;
        camRef.current.tx = e.clientX - (e.clientX - camRef.current.tx) * scaleRatio;
        camRef.current.ty = e.clientY - (e.clientY - camRef.current.ty) * scaleRatio;
        camRef.current.tz = newZ;
    };

    const handleBgPointerDown = (e) => {
        if (e.target.id !== 'bg-interaction') return;
        if (assignMode) { setAssignMode(null); return; } 
        let lastX = e.clientX; let lastY = e.clientY;
        
        disruptCursor.current.down = true;
        disruptCursor.current.x = e.clientX;
        disruptCursor.current.y = e.clientY;

        const onMove = (moveEvent) => { 
            camRef.current.tx += (moveEvent.clientX - lastX); 
            camRef.current.ty += (moveEvent.clientY - lastY); 
            lastX = moveEvent.clientX; lastY = moveEvent.clientY; 
            
            disruptCursor.current.x = moveEvent.clientX;
            disruptCursor.current.y = moveEvent.clientY;
        };
        const onUp = () => { 
            disruptCursor.current.down = false;
            window.removeEventListener('pointermove', onMove); 
            window.removeEventListener('pointerup', onUp); 
        };
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    };

    const hdPtrUp = () => { disruptCursor.current.down = false; disruptCursor.current.force = 0.0; setTimeout(() => { dragCableRef.current = null; }, 50); }
    const hdPtrMov = (e) => { if(disruptCursor.current.down) { disruptCursor.current.x = e.clientX; disruptCursor.current.y = e.clientY; } }

    const getPatchedColor = (modId, portId, isInput) => {
        const cable = cablesRef.current.find(c => isInput ? (c.destMod === modId && c.destPort === portId) : (c.srcMod === modId && c.srcPort === portId));
        return cable ? cable.color : null;
    };

    useEffect(() => {
        if (viewMode !== "PATCHING") return;
        const fgCtx = canvasFg.current?.getContext('2d');
        if (!fgCtx) return;

        const scanCtx = scanCanvas.current.getContext('2d', { willReadFrequently: true });
        let loopId;

        const rafCoreRender = () => {
            const cw = window.innerWidth;
            const ch = window.innerHeight;
            const dpr = window.devicePixelRatio || 1;

            if (fgCtx.canvas.width !== Math.floor(cw * dpr)) {
                fgCtx.canvas.width = Math.floor(cw * dpr);
                fgCtx.canvas.height = Math.floor(ch * dpr);
                fgCtx.canvas.style.width = `${cw}px`;
                fgCtx.canvas.style.height = `${ch}px`;
                fgCtx.scale(dpr, dpr);
            } else {
                fgCtx.clearRect(0, 0, cw, ch);
            }

            // --- Camera Smoothing ---
            camRef.current.x = lerp(camRef.current.x, camRef.current.tx, 0.15);
            camRef.current.y = lerp(camRef.current.y, camRef.current.ty, 0.15);
            camRef.current.z = lerp(camRef.current.z, camRef.current.tz, 0.15);

            if (worldRef.current) {
                worldRef.current.style.transform = `translate(${camRef.current.x}px, ${camRef.current.y}px) scale(${camRef.current.z})`;
            }

            // --- Pixel & Luma Mapping ---
            let pixels;
            try {
                if (vRef.current && vRef.current.readyState >= 3) {
                    scanCtx.drawImage(vRef.current, 0, 0, DW, DH);
                }
                pixels = scanCtx.getImageData(0, 0, DW, DH).data;
            } catch (e) {
                pixels = new Uint8ClampedArray(DW * DH * 4);
            }

            const lumaMap = new Float32Array(DW * DH);
            for (let i = 0; i < DW * DH; i++) {
                let luma = (pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114) / 255.0;
                lumaMap[i] = Math.pow(luma, 1.5);
            }

            const ctActx = cDsp.current.actx.currentTime;
            const now = performance.now();
            let dt = (now - lastRenderTime.current) / 1000;
            if (dt > 0.1) dt = 0.1;
            lastRenderTime.current = now;

            const currentTInterval = 60 / bpmRef.current;
            const beatDelta = dt * (bpmRef.current / 60);

            // --- FX & LFO Logic ---
            Object.values(cDsp.current.modules).forEach(mod => {
                if (mod.type === 'MOD_LFO') {
                    mod.state.phase = (mod.state.phase + dt * mod.params.rate) % 1.0;
                    let val = 0;
                    if (mod.params.wave == 0) val = Math.sin(mod.state.phase * Math.PI * 2);
                    else if (mod.params.wave == 1) val = Math.abs((mod.state.phase * 4) % 4 - 2) - 1;
                    else if (mod.params.wave == 2) val = (mod.state.phase * 2) - 1;
                    else if (mod.params.wave == 3) val = mod.state.phase < 0.5 ? 1 : -1;
                    
                    mod.state.targets.forEach(t => {
                        const targetMod = cDsp.current.modules[t.modId];
                        if (targetMod) updateParam(t.modId, t.param, targetMod.baseParams[t.param] + (val * mod.params.depth), true);
                    });
                } else if (mod.type === 'FX_RHYTHM') {
                    const stepDuration = currentTInterval / mod.params.rate;
                    if (ctActx >= mod.state.lastTime + stepDuration) {
                        mod.state.step = (mod.state.step + 1) % 16;
                        mod.state.lastTime = ctActx;
                        const isActive = mod.params.steps[mod.state.step];
                        const targetGain = isActive ? 1.0 : (1.0 - mod.params.depth);
                        mod.nodes.vca.gain.setTargetAtTime(targetGain, ctActx, mod.params.smooth);
                    }
                } else if (mod.type === 'PROB_SEQ') {
                    const stepDuration = currentTInterval / mod.params.rate;
                    if (ctActx >= mod.state.lastTime + stepDuration) {
                        mod.state.step = (mod.state.step + 1) % 16;
                        mod.currentStep = mod.state.step;
                        mod.state.lastTime = ctActx;
                        
                        const isActive = mod.params.steps[mod.state.step];
                        if (isActive && Math.random() <= mod.params.prob) {
                            // Trigger
                            mod.nodes.seqOut.offset.cancelScheduledValues(ctActx);
                            mod.nodes.seqOut.offset.setValueAtTime(1, ctActx);
                            mod.nodes.seqOut.offset.setValueAtTime(0, ctActx + stepDuration * mod.params.gate);
                            
                            // Pitch
                            const scaleArr = SCALES[scaleRef.current] || SCALES['MINOR'];
                            const randomNote = scaleArr[Math.floor(Math.random() * scaleArr.length)];
                            const octave = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
                            const pitchVal = randomNote + (octave * 12);
                            mod.nodes.pitchOut.offset.setValueAtTime(pitchVal, ctActx);
                        }
                    }
                } else if (mod.type === 'FX_SIDECHAIN') {
                    const data = new Uint8Array(mod.nodes.analyser.frequencyBinCount);
                    mod.nodes.analyser.getByteTimeDomainData(data);
                    let peak = 0;
                    for (let i = 0; i < data.length; i++) {
                        const val = Math.abs((data[i] / 128.0) - 1.0);
                        if (val > peak) peak = val;
                    }
                    
                    let targetGain = 1.0;
                    if (peak > mod.params.threshold) {
                        const over = peak - mod.params.threshold;
                        targetGain = Math.max(0.0, 1.0 - (over * mod.params.ratio * 5.0));
                    }
                    
                    if (targetGain < mod.state.currentDuck) {
                        mod.state.currentDuck = targetGain;
                        mod.nodes.vca.gain.setTargetAtTime(targetGain, ctActx, mod.params.attack);
                    } else {
                        mod.state.currentDuck = targetGain;
                        mod.nodes.vca.gain.setTargetAtTime(targetGain, ctActx, mod.params.release);
                    }
                }
            });

            // --- Unified Synth Engine ---
            synths.forEach((stateObj, zIx) => {
                const dspObj = cDsp.current.modules[stateObj.id];
                if (!dspObj) return;

                dspObj.currentTopo = (dspObj.params.isLive || !dspObj.snapshotTopo) ? lumaMap : dspObj.snapshotTopo;

                if (dspObj.params.wtScan) {
                    dspObj.scanPhase = (dspObj.scanPhase + beatDelta * dspObj.params.scanRate * (dspObj.params.timeScl || 1.0) * 0.25) % 1.0;
                } else {
                    dspObj.scanPhase = dspObj.params.wtPos;
                }

                const isExtTrig = cablesRef.current.some(c => c.destMod === dspObj.id && c.destPort === 'TRIG');
                let shouldTrigger = false;
                let internalRate = (zIx % 3 === 0) ? 1 : 2;

                if (!isExtTrig) {
                    if (ctActx >= dspObj.curTrigT) {
                        shouldTrigger = true;
                        dspObj.curTrigT = ctActx + (currentTInterval / internalRate);
                    }
                } else if (dspObj.triggerFlag) {
                    shouldTrigger = true;
                    dspObj.triggerFlag = false;
                }

                if (shouldTrigger && dspObj.currentTopo) {
                    const { atk, dec, sus, rel, hold = 0 } = dspObj.params;
                    const gateLength = (currentTInterval / (isExtTrig ? 4 : internalRate)) * 0.85;

                    [dspObj.env.gain, dspObj.outNodes.ENV.gain].forEach(param => {
                        param.cancelScheduledValues(ctActx);
                        param.setTargetAtTime(1.0, ctActx, Math.max(0.005, atk));
                        param.setTargetAtTime(sus, ctActx + atk + hold, Math.max(0.005, dec));
                        param.setTargetAtTime(0.0001, ctActx + gateLength, Math.max(0.005, rel));
                    });

                    // Wavetable Generation
                    const maxH = 64;
                    const real = new Float32Array(maxH);
                    const imag = new Float32Array(maxH);
                    const scanIdx = Math.floor(Math.pow(dspObj.scanPhase, Math.pow(2, dspObj.params.warp * 3)) * (DW - 1));

                    for (let i = 1; i < maxH * dspObj.params.harm; i++) {
                        let yNorm = (i / maxH * dspObj.params.formant * dspObj.params.freqScl) % 1.0;
                        let val = dspObj.currentTopo[(DH - 1 - Math.floor(yNorm * (DH - 1))) * DW + scanIdx] * dspObj.params.sensitivity * dspObj.params.ampScl;
                        val *= 1.0 / Math.pow(i, 0.65);
                        real[i] = isNaN(val) || !isFinite(val) ? 0 : val;
                    }
                    try {
                        const wave = cDsp.current.actx.createPeriodicWave(real, imag);
                        dspObj.unisonOscs.forEach(osc => osc.setPeriodicWave(wave));
                    } catch (e) {}
                }

                let targetCut = clamp(dspObj.params.cut + ((dspObj.currentTopo.reduce((a, b) => a + b, 0) / dspObj.currentTopo.length) * 2000), 20, 20000);
                dspObj.fB1.frequency.setTargetAtTime(targetCut, ctActx, 0.05);
                dspObj.fB2.frequency.setTargetAtTime(targetCut, ctActx, 0.05);
            });

            // --- Global Visuals & Cables ---
            let activeId = sharedStateRef.current.activeSynthId || (synths[0]?.id);
            if (activeId && cDsp.current.modules[activeId]) {
                sharedStateRef.current.scanX = cDsp.current.modules[activeId].scanPhase;
                sharedStateRef.current.synthParams = cDsp.current.modules[activeId].params;
            }
            sharedStateRef.current.pixels = pixels;

            cablesRef.current.forEach(c => {
                const fNode = jackElements.current[`${c.srcMod}_${c.srcPort}`];
                const tNode = jackElements.current[`${c.destMod}_${c.destPort}`];
                if (fNode && tNode) {
                    const f = fNode.getBoundingClientRect();
                    const t = tNode.getBoundingClientRect();
                    const fp = { x: f.left + f.width / 2, y: f.top + f.height / 2 };
                    const tp = { x: t.left + t.width / 2, y: t.top + t.height / 2 };
                    fgCtx.beginPath();
                    fgCtx.strokeStyle = c.color;
                    fgCtx.lineWidth = 3 * camRef.current.z;
                    fgCtx.moveTo(fp.x, fp.y);
                    fgCtx.quadraticCurveTo((fp.x + tp.x) / 2, (fp.y + tp.y) / 2 + 100 * camRef.current.z, tp.x, tp.y);
                    fgCtx.stroke();
                }
            });

            loopId = requestAnimationFrame(rafCoreRender);
        };

        loopId = requestAnimationFrame(rafCoreRender);
        return () => cancelAnimationFrame(loopId);
    }, [viewMode, synths, fxModules, wireColor]);

    const updatePipRegistry = (modId, portId, elm) => { if(elm) { jackElements.current[`${modId}_${portId}`] = elm; } };
    
    const handleJackDown = (e, modId, portId, isInput) => {
        e.stopPropagation(); if (cDsp.current.actx && cDsp.current.actx.state === 'suspended') cDsp.current.actx.resume();
        if (isInput) {
            const existingIdx = cablesRef.current.findIndex(c => c.destMod === modId && c.destPort === portId);
            if (existingIdx !== -1) {
                const existingCable = cablesRef.current[existingIdx];
                if(existingCable.cableGain) {
                    existingCable.cableGain.gain.setTargetAtTime(0, cDsp.current.actx.currentTime, 0.01);
                    setTimeout(() => { try { existingCable.cableGain.disconnect(); } catch(err){} }, 50);
                }
                cablesRef.current.splice(existingIdx, 1); setPatchCount(cablesRef.current.length);
                dragCableRef.current = { modId: existingCable.srcMod, portId: existingCable.srcPort, isInput: false };
                disruptCursor.current.down = true; disruptCursor.current.x = e.clientX; disruptCursor.current.y = e.clientY;
                return;
            }
        }
        dragCableRef.current = { modId, portId, isInput }; disruptCursor.current.down = true; disruptCursor.current.x = e.clientX; disruptCursor.current.y = e.clientY;
    };

    const handleJackUp = (modId, portId, isInput) => {
        if (dragCableRef.current) {
            const src = dragCableRef.current; const dest = { modId, portId, isInput };
            if (src.modId === dest.modId && src.portId === dest.portId) { dragCableRef.current = null; return; }
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
                    }
                }
            }
            dragCableRef.current = null;
        }
    };

    const clearJackCables = (modId, portId, isInput) => {
        const cablesToRemove = cablesRef.current.filter(c => isInput ? (c.destMod === modId && c.destPort === portId) : (c.srcMod === modId && c.srcPort === portId));
        cablesToRemove.forEach(c => {
            if(c.cableGain) { c.cableGain.gain.setTargetAtTime(0, cDsp.current.actx.currentTime, 0.05); setTimeout(() => { try { c.cableGain.disconnect(); } catch(e){} }, 100); }
        });
        if (cablesToRemove.length > 0) { cablesRef.current = cablesRef.current.filter(c => !cablesToRemove.includes(c)); setPatchCount(cablesRef.current.length); }
    };

    const updateParamInternal = (mod, param, val) => {
        if (!cDsp.current.actx) return; const ct = cDsp.current.actx.currentTime;
        
        if(param === 'time' && mod.id.startsWith('FX_DELAY')) mod.nodes.delay.delayTime.setTargetAtTime(val, ct, 0.1);
        if(param === 'feedback' && mod.id.startsWith('FX_DELAY')) mod.nodes.feedback.gain.setTargetAtTime(val, ct, 0.1);
        if(param === 'cutoff' && mod.id.startsWith('FX_DELAY')) mod.nodes.filter.frequency.setTargetAtTime(val, ct, 0.1);
        if(param === 'mix' && mod.id.startsWith('FX_DELAY')) { mod.nodes.wet.gain.setTargetAtTime(val, ct, 0.1); mod.nodes.dry.gain.setTargetAtTime(1.0 - val, ct, 0.1); }
        
        if(param === 'loGain' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.lowEQ.gain.setTargetAtTime(val, ct, 0.1);
        if(param === 'hiGain' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.hiEQ.gain.setTargetAtTime(val, ct, 0.1);

        if(mod.type === 'FX_EQ') {
            const match = param.match(/b(\d+)([fgq])/);
            if (match) {
                const bIdx = parseInt(match[1]) - 1; const pType = match[2];
                if (pType === 'f') { mod.nodes.bands[bIdx].frequency.cancelScheduledValues(ct); mod.nodes.bands[bIdx].frequency.linearRampToValueAtTime(val, ct + 0.05); }
                if (pType === 'g') { mod.nodes.bands[bIdx].gain.cancelScheduledValues(ct); mod.nodes.bands[bIdx].gain.linearRampToValueAtTime(val, ct + 0.05); }
                if (pType === 'q') { mod.nodes.bands[bIdx].Q.cancelScheduledValues(ct); mod.nodes.bands[bIdx].Q.linearRampToValueAtTime(val, ct + 0.05); }
            }
        }
        if(param === 'mix' && mod.id.startsWith('FX_PRO_REV')) { 
            mod.nodes.wet.gain.setTargetAtTime(Math.sin(val * Math.PI / 2), ct, 0.1); 
            mod.nodes.dry.gain.setTargetAtTime(Math.cos(val * Math.PI / 2), ct, 0.1); 
        }
        if(param === 'distance' && mod.id.startsWith('FX_PRO_REV')) { 
            mod.nodes.pre.delayTime.setTargetAtTime(lerp(0.001, 0.15, val), ct, 0.1); 
            // Simulate high-frequency dampening over distance (Air absorption)
            if (mod.nodes.hiEQ) { 
                mod.nodes.hiEQ.gain.setTargetAtTime(lerp(0, -18, val), ct, 0.1);
                mod.nodes.hiEQ.frequency.setTargetAtTime(lerp(12000, 3000, val), ct, 0.1);
            } 
        } 
        
        if(param === 'decay' && mod.id.startsWith('FX_PRO_REV'))  mod.nodes.fbs.forEach(fb => fb.gain.setTargetAtTime(val, ct, 0.1));
        if(param === 'size' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.delays.forEach((d, i) => d.delayTime.setTargetAtTime(mod.nodes.baseDelays[i] * val, ct, 0.1));
        if(param === 'loCut' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.lo.frequency.setTargetAtTime(val, ct, 0.1);
        if(param === 'hiCut' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.hi.frequency.setTargetAtTime(val, ct, 0.1);
        if(param === 'spin' && mod.id.startsWith('FX_PRO_REV')) mod.nodes.spin.gain.setTargetAtTime(val, ct, 0.1);
        if(param === 'cut' && mod.id.startsWith('FX_AUTOFILTER')) { mod.nodes.filter1.frequency.setTargetAtTime(val, ct, 0.1); mod.nodes.filter2.frequency.setTargetAtTime(val, ct, 0.1); }
        if(param === 'res' && mod.id.startsWith('FX_AUTOFILTER')) { mod.nodes.filter1.Q.setTargetAtTime(val * 0.6, ct, 0.1); mod.nodes.filter2.Q.setTargetAtTime(val * 0.6, ct, 0.1); }
        if(param === 'drive' && mod.id.startsWith('FX_AUTOFILTER')) mod.nodes.drive.curve = makeDriveCurve(val);
        if(param === 'lfoRate' && mod.id.startsWith('FX_AUTOFILTER')) mod.nodes.lfo.frequency.setTargetAtTime(val, ct, 0.1);
        if(param === 'lfoAmt' && mod.id.startsWith('FX_AUTOFILTER')) mod.nodes.lfoGain.gain.setTargetAtTime(val, ct, 0.1);
        if(param === 'filterType' && mod.id.startsWith('FX_AUTOFILTER')) { mod.nodes.filter1.type = val; mod.nodes.filter2.type = val; }
        if(param === 'depth' && mod.id.startsWith('FX_OTT')) { mod.nodes.dry.gain.setTargetAtTime(1.0 - val, ct, 0.1); mod.nodes.wet.gain.setTargetAtTime(val, ct, 0.1); }
        if(param === 'low' && mod.id.startsWith('FX_OTT')) mod.nodes.gL.gain.setTargetAtTime(val, ct, 0.1);
        if(param === 'mid' && mod.id.startsWith('FX_OTT')) mod.nodes.gM.gain.setTargetAtTime(val, ct, 0.1);
        if(param === 'high' && mod.id.startsWith('FX_OTT')) mod.nodes.gH.gain.setTargetAtTime(val, ct, 0.1);
        if(param === 'vol' && mod.id.startsWith('UTILITY_IO')) mod.nodes.vol.gain.setTargetAtTime(Math.pow(10, val / 20), ct, 0.1);
        if(param === 'pan' && mod.id.startsWith('UTILITY_IO')) mod.nodes.pan.pan.setTargetAtTime(val, ct, 0.1);
        if(param === 'isMono' && mod.id.startsWith('UTILITY_IO')) { mod.nodes.mono.channelCount = val ? 1 : 2; mod.nodes.mono.channelCountMode = val ? 'explicit' : 'max'; }
    };

    const updateParam = (modId, param, val, isMacro = false) => {
        const mod = cDsp.current.modules[modId];
        if(mod) {
            if (!isMacro) mod.baseParams[param] = val; 
            mod.params[param] = val; 
            const ct = cDsp.current.actx?.currentTime || 0;
            if(mod.type === 'SYNTH') {
                sharedStateRef.current.activeSynthId = modId; // Sync WebGL to this synth
                if(param === 'res') { mod.fB1.Q.setTargetAtTime(val * 0.6, ct, 0.1); mod.fB2.Q.setTargetAtTime(val * 0.6, ct, 0.1); }
                if(param === 'filterType') { mod.fB1.type = val; mod.fB2.type = val; }
                if(param === 'oscOn') mod.oscGain.gain.setTargetAtTime(val ? 1.0 : 0.0, ct, 0.02);
                if(param === 'subOn' || param === 'subLvl') mod.subGain.gain.setTargetAtTime(mod.params.subOn ? mod.params.subLvl : 0.0, ct, 0.02);
                if(param === 'subFilter') { mod.subToFilter.gain.setTargetAtTime(val ? 1.0 : 0.0, ct, 0.02); mod.subToOut.gain.setTargetAtTime(val ? 0.0 : 1.0, ct, 0.02); }
                if(param === 'noiseOn' || param === 'noiseLvl') mod.noiseGain.gain.setTargetAtTime(mod.params.noiseOn ? mod.params.noiseLvl : 0.0, ct, 0.02);
                if(param === 'noiseFilter') { mod.noiseToFilter.gain.setTargetAtTime(val ? 1.0 : 0.0, ct, 0.02); mod.noiseToOut.gain.setTargetAtTime(val ? 0.0 : 1.0, ct, 0.02); }
                if(param === 'fmAmt') mod.fmGain.gain.setTargetAtTime(val * 5000, ct, 0.1);
                if(param === 'pEnv') mod.pitchEnvGain.gain.setTargetAtTime(val * 100, ct, 0.1);
                if(param === 'inLvl') {
                    mod.audioIn.gain.setTargetAtTime(val, ct, 0.1);
                    mod.unisonMaster.gain.setTargetAtTime(val, ct, 0.1); 
                }
                if(param === 'lfoWave') mod.lfo.type = ['sine', 'square', 'sawtooth', 'triangle'][val];
            } else if (mod.type === 'MASTER') {
                if(param === 'vol') mod.nodes.vol.gain.setTargetAtTime(Math.pow(10, val / 20), ct, 0.1);
                if(param === 'softClip') mod.nodes.soft.curve = val ? makeSoftClipCurve() : null;
                if(param === 'limiter') { mod.nodes.limit.threshold.setTargetAtTime(val ? -1 : 0, ct, 0.1); mod.nodes.limit.ratio.setTargetAtTime(val ? 20 : 1, ct, 0.1); }
            } else { updateParamInternal(mod, param, val); }
            if (!isMacro) setRenderTrigger(p=>p+1);
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
        const name = prompt("Name this Wavetable Preset:"); if (!name) return;
        const newPreset = { name, topo: Array.from(mod.currentTopo) };
        const updated = [...wtPresets, newPreset]; setWtPresets(updated);
    };

    const loadWtPreset = (modId, presetIdx) => {
        const mod = cDsp.current.modules[modId]; const preset = wtPresets[presetIdx];
        if (mod && preset) {
            mod.snapshotTopo = new Float32Array(preset.topo);
            updateParam(modId, 'isLive', false); updateParam(modId, 'wtScan', false); 
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
            
            {viewMode === "PATCHING" && <WebGLBackground videoRef={vRef} wireColor={wireColor} sharedStateRef={sharedStateRef} />}
            
            {/* Black transparent gradient vignette from top to bottom */}
            {viewMode === "PATCHING" && <div className="vignette-overlay" />}

            <div id="bg-interaction" className="bg-interaction" onPointerDown={handleBgPointerDown} onPointerUp={hdPtrUp} onPointerMove={hdPtrMov} />
            
            {/* Wires Canvas - Z-Index 30 puts it behind the modules (which are 40+) */}
            <canvas ref={canvasFg} className="wires-canvas" />
            
            {viewMode === "SLEEP" && (
                <div className="sleep-overlay">
                    <div className="glass-panel sleep-panel">
                        <h2 className="sleep-title">OPTORACK <span style={{color:'#00E5FF', fontWeight:'bold'}}>PRO</span></h2>
                        <p className="sleep-text">
                            <b>SPECTROGRAM DSP ENVIRONMENT</b><br/>
                            Please ensure all optical sensors are calibrated.<br/>
                            Patching cables may result in unexpected resonance.
                        </p>
                        <div className="sleep-startup-config" onPointerDown={(e)=>e.stopPropagation()}>
                            <div className="sleep-config-label">STARTUP RESOLUTION PRESET</div>
                            <select value={startupResolutionProfile} onChange={(e)=>setStartupResolutionProfile(e.target.value)} style={{minWidth:'240px'}}>
                                {window.OptoRackResolution.getOptions().map(r => <option key={r} value={r}>{window.OptoRackResolution.profiles[r].label}</option>)}
                            </select>
                            <div className="sleep-config-note">Higher presets improve visual clarity and reduce noise, with more CPU/GPU cost.</div>
                        </div>
                        <div className="sleep-start-btn" onClick={()=>INIT_MOTHER_SYSTEM()}>
                            [ INITIATE TEST SEQUENCE ]
                        </div>
                    </div>
                </div>
            )}
            
            {viewMode === "PATCHING" && (
                <>
                <div className="app-ui-layer">
                    
                    <div className="top-bar">
                       <div className="top-bar-group">
                           <div onPointerDown={(e)=>e.stopPropagation()} onClick={()=>spawnSynth()} className="btn-outline glass-panel" style={{borderColor: '#00E5FF', color: '#00E5FF'}}>
                                {TWEAKS.labels.addPhotosynth}
                           </div>
                           <div onPointerDown={(e)=>e.stopPropagation()} onClick={() => setIsBrowserOpen(true)} className="btn-outline glass-panel">
                                {TWEAKS.labels.moduleLibrary}
                           </div>
                           <div onPointerDown={(e)=>e.stopPropagation()} onClick={() => setIsGuideOpen((prev) => !prev)} className="btn-outline glass-panel">
                                {isGuideOpen ? 'HIDE GUIDE' : 'BEGINNER GUIDE'}
                           </div>
                       </div>

                       <div className="top-bar-group">
                           <PerformanceMeter />
                           <div className="glass-panel color-picker">
                               {THEME_CLRS.map(c => (
                                   <div key={c} className="color-dot" onPointerDown={(e)=>e.stopPropagation()} onClick={()=>setWireColor(c)} style={{backgroundColor:c, border: wireColor===c ? '2px solid #FFF' : '2px solid transparent'}} />
                               ))}
                           </div>
                           <div className="glass-panel bpm-controls">
                               <span className="bpm-label">BPM</span>
                               <input type="range" min={TWEAKS.ranges.bpmMin} max={TWEAKS.ranges.bpmMax} value={bpm} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>setBpm(Number(e.target.value))} style={{width:'80px', accentColor:'#00E5FF'}} />
                               <span className="bpm-value">{bpm}</span>
                               <div className="divider" />
                               
                               <select value={rootNote} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>setRootNote(e.target.value)}>
                                   {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
                               </select>
                               <select value={scale} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>setScale(e.target.value)}>
                                   {window.SoundEngine.getScaleOptions().map(s => <option key={s} value={s}>{s}</option>)}
                               </select>
                               <select value={quality} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>setQuality(e.target.value)}>
                                   {window.SoundEngine.getQualityOptions().map(q => <option key={q} value={q}>{q}</option>)}
                               </select>
                               <select value={resolutionProfile} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>handleResolutionChange(e.target.value)}>
                                   {window.OptoRackResolution.getOptions().map(r => <option key={r} value={r}>{window.OptoRackResolution.profiles[r].label}</option>)}
                               </select>
                               <span className="bpm-label" style={{marginLeft:'4px'}}>{getBaseFrequency(rootNote)}Hz</span>
                           </div>
                       </div>

                       <div className="top-bar-group glass-panel file-controls">
                           <button onClick={saveProjectToDirectory} className="btn-outline file-btn">SAVE</button>
                           <button onClick={async () => { if (saveDirectoryHandle) await refreshProjectsFromDirectory(saveDirectoryHandle); setIsProjectsOpen(!isProjectsOpen); }} className="btn-outline file-btn">LOAD</button>
                           <div className="divider" />
                           <button onClick={chooseSaveDirectory} className="btn-outline file-btn">SET SAVE DIR</button>
                       </div>
                    </div>

                    <TipsPanel assignMode={assignMode} tipIndex={tipIndex} />
                    <BeginnerGuidePanel isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

                    {cDsp.current.modules['MASTER'] && (
                        <div style={{ position: 'absolute', top: 80, left: 20, pointerEvents: 'auto' }}>
                            <DraggableWindow id="MASTER" title="MASTER BUSS" color="#E2E2E2" initialX={0} initialY={0} isFixed={true}>
                                <div className="master-layout">
                                    <div className="master-col-left">
                                        <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched('MASTER', 'IN', true)} patchedColor={getPatchedColor('MASTER', 'IN', true)} domReg={(d)=>updatePipRegistry('MASTER', 'IN', d)} 
                                            onDown={(e) => handleJackDown(e, 'MASTER', 'IN', true)} onUp={() => handleJackUp('MASTER', 'IN', true)} onDoubleClick={() => clearJackCables('MASTER', 'IN', true)} />
                                        <div className="master-rec-row">
                                            <div className="master-rec-btn" onPointerDown={(e)=>{ e.stopPropagation(); toggleRecording(); }}
                                                 style={{background: isRecording ? '#FF0033' : '#333', boxShadow: isRecording ? '0 0 10px #FF0033' : 'inset 0 2px 4px rgba(0,0,0,0.5)', animation: isRecording ? 'pulse 1s infinite' : 'none'}} />
                                            <span className="master-rec-label" style={{color: isRecording ? '#FF0033' : '#ccc'}}>REC</span>
                                        </div>
                                    </div>
                                    <div className="master-col-mid">
                                        <Knob label="VOLUME" val={cDsp.current.modules['MASTER'].params.vol} min={-60} max={6.0} step={0.1} def={0.0} onChange={(v)=>updateParam('MASTER', 'vol', v)} onAssign={()=>handleKnobAssign('MASTER', 'vol')} isAssigning={assignMode} />
                                        <div className="master-toggles">
                                            <div className="master-toggle-row">
                                                <div className="master-toggle-btn" onPointerDown={(e)=>{ e.stopPropagation(); updateParam('MASTER', 'softClip', !cDsp.current.modules['MASTER'].params.softClip); }} 
                                                     style={{background: cDsp.current.modules['MASTER'].params.softClip ? '#00E5FF' : '#111'}} />
                                                <span className="master-toggle-label">SOFT CLIP</span>
                                            </div>
                                            <div className="master-toggle-row">
                                                <div className="master-toggle-btn" onPointerDown={(e)=>{ e.stopPropagation(); updateParam('MASTER', 'limiter', !cDsp.current.modules['MASTER'].params.limiter); }} 
                                                     style={{background: cDsp.current.modules['MASTER'].params.limiter ? '#FF0033' : '#111'}} />
                                                <span className="master-toggle-label">LIMITER</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="master-col-right">
                                        <SpectrumAnalyzer analyser={cDsp.current.mAnalyser} />
                                    </div>
                                </div>
                            </DraggableWindow>
                        </div>
                    )}

                    {isBrowserOpen && (
                        <div className="browser-overlay" onPointerDown={(e)=>e.stopPropagation()}>
                            <div className="browser-header">
                                <div className="browser-title">MODULE <span style={{fontWeight:'bold'}}>LIBRARY</span></div>
                                <div className="browser-close" onClick={()=>setIsBrowserOpen(false)}>
                                    {TWEAKS.labels.returnToCanvas}
                                </div>
                            </div>
                            <div className="browser-content">
                                <div className="browser-list">
                                    {Object.entries(moduleLibraryByCategory).map(([categoryName, categoryData]) => (
                                        <React.Fragment key={categoryName}>
                                            <div className="browser-category" style={{color: categoryData.color}}>{categoryName}</div>
                                            {categoryData.items.map(item => (
                                                <BrowserItem key={item.id} title={item.title} desc={item.desc} onClick={()=>spawnFX(item.id)} />
                                            ))}
                                        </React.Fragment>
                                    ))}

                                </div>
                            </div>
                        </div>
                    )}

                    <div className="projects-panel" onPointerDown={(e)=>e.stopPropagation()} style={{ transform: isProjectsOpen ? 'translateX(0)' : 'translateX(100%)' }}>
                        <div className="projects-header">
                            <div>
                                <div className="projects-title">PROJECTS///</div>
                                <div className="projects-subtitle">LIBRARY</div>
                            </div>
                            <div className="projects-close" onClick={()=>setIsProjectsOpen(false)}>✕</div>
                        </div>
                        <div className="projects-list">
                            <div className="project-item" style={{cursor:'default', paddingBottom:'10px'}}>
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
                <div className="world-layer" ref={worldRef}>
                        
                        {fxModules.map(fx => {
                            const mod = cDsp.current.modules[fx.id];
                            if(!mod) return null;

                            if(fx.type === 'MOD_LFO') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="LFO MACRO" color="#B266FF" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)}>
                                    <div className="fx-knob-row" style={{alignItems:'center'}}>
                                        <Knob label="RATE" val={mod.params.rate} min={0.1} max={20} step={0.1} def={1.0} onChange={(v)=>updateParam(fx.id, 'rate', v)} onAssign={()=>handleKnobAssign(fx.id, 'rate')} isAssigning={assignMode} />
                                        <Knob label="DEPTH" val={mod.params.depth} min={0} max={100} step={1} def={50} onChange={(v)=>updateParam(fx.id, 'depth', v)} onAssign={()=>handleKnobAssign(fx.id, 'depth')} isAssigning={assignMode} />
                                        <div className="fx-select-col">
                                            <select value={mod.params.wave} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>updateParam(fx.id, 'wave', Number(e.target.value))}>
                                                <option value="0">SINE</option>
                                                <option value="1">TRI</option>
                                                <option value="2">SAW</option>
                                                <option value="3">SQR</option>
                                            </select>
                                            <div className="fx-select-label">WAVE</div>
                                        </div>
                                        <div style={{borderLeft:'1px solid var(--serum-border)', paddingLeft:'16px', display:'flex', flexDirection:'column', gap:'8px'}}>
                                            <button onPointerDown={e=>e.stopPropagation()} onClick={() => setAssignMode(assignMode === fx.id ? null : fx.id)} 
                                                    style={{background: assignMode === fx.id ? '#B266FF' : 'rgba(255,255,255,0.05)', color: assignMode === fx.id ? '#111' : '#E2E2E2', border:'1px solid var(--serum-border)', padding:'6px 12px', borderRadius:'4px', fontSize:'10px', fontWeight:'bold', cursor:'pointer', animation: assignMode === fx.id ? 'pulse 1s infinite' : 'none'}}>
                                                {assignMode === fx.id ? 'ASSIGNING...' : 'ASSIGN'}
                                            </button>
                                            <div style={{fontSize:'9px', color:'#ccc', textAlign:'center', textShadow: '0 1px 3px rgba(0,0,0,0.9)'}}>{mod.state.targets.length} TARGETS</div>
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'FX_EQ') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="10-BAND PARAGRAPHIC EQ" color="#99CC33" initialX={fx.x} initialY={fx.y} initialW={fx.w} initialH={fx.h} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)}>
                                    <div style={{display:'flex', flexDirection:'column', height:'100%', gap:'10px'}}>
                                       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                        <div style={{flex:1, position:'relative', border:'1px solid var(--serum-border)', borderRadius:'4px', overflow:'hidden', background:'transparent'}}>
                                            <ParametricEQ mod={mod} updateParam={(p,v)=>updateParam(fx.id, p, v)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'FX_DELAY') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="ECHO / DELAY" color="#F78E1E" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout">
                                        <div className="fx-jack-col left">
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="TIME" val={mod.params.time} min={0.01} max={2.0} step={0.01} def={0.3} onChange={(v)=>updateParam(fx.id, 'time', v)} onAssign={()=>handleKnobAssign(fx.id, 'time')} isAssigning={assignMode} />
                                            <Knob label="FEEDBACK" val={mod.params.feedback} min={0} max={1.2} step={0.01} def={0.4} onChange={(v)=>updateParam(fx.id, 'feedback', v)} onAssign={()=>handleKnobAssign(fx.id, 'feedback')} isAssigning={assignMode} />
                                            <Knob label="CUTOFF" val={mod.params.cutoff} min={100} max={10000} step={10} def={3000} onChange={(v)=>updateParam(fx.id, 'cutoff',v)} onAssign={()=>handleKnobAssign(fx.id, 'cutoff')} isAssigning={assignMode} />
                                            <Knob label="MIX" val={mod.params.mix} min={0} max={1} step={0.01} def={0.5} onChange={(v)=>updateParam(fx.id, 'mix', v)} onAssign={()=>handleKnobAssign(fx.id, 'mix')} isAssigning={assignMode} />
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'FX_AUTOFILTER') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="FILTER (24dB)" color="#99CC33" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout">
                                        <div className="fx-jack-col left">
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <div className="fx-select-col" style={{marginRight:'8px'}}>
                                                <select value={mod.params.filterType} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>updateParam(fx.id, 'filterType', e.target.value)}>
                                                    <option value="lowpass">LOWPASS 24</option>
                                                    <option value="highpass">HIGHPASS 24</option>
                                                    <option value="bandpass">BANDPASS</option>
                                                    <option value="notch">NOTCH</option>
                                                </select>
                                                <div className="fx-select-label">MODE</div>
                                            </div>
                                            <Knob label="FREQ" val={mod.params.cut} min={20} max={20000} step={10} def={1000} onChange={(v)=>updateParam(fx.id, 'cut', v)} onAssign={()=>handleKnobAssign(fx.id, 'cut')} isAssigning={assignMode} />
                                            <Knob label="RES (Q)" val={mod.params.res} min={0} max={30} step={0.5} def={5} onChange={(v)=>updateParam(fx.id, 'res', v)} onAssign={()=>handleKnobAssign(fx.id, 'res')} isAssigning={assignMode} />
                                            <Knob label="DRIVE" val={mod.params.drive} min={0} max={50} step={1} def={10} onChange={(v)=>updateParam(fx.id, 'drive', v)} onAssign={()=>handleKnobAssign(fx.id, 'drive')} isAssigning={assignMode} />
                                            <Knob label="LFO RT" val={mod.params.lfoRate} min={0.1} max={20} step={0.1} def={1.0} onChange={(v)=>updateParam(fx.id, 'lfoRate', v)} onAssign={()=>handleKnobAssign(fx.id, 'lfoRate')} isAssigning={assignMode} />
                                            <Knob label="LFO AMT" val={mod.params.lfoAmt} min={0} max={5000} step={10} def={500} onChange={(v)=>updateParam(fx.id, 'lfoAmt', v)} onAssign={()=>handleKnobAssign(fx.id, 'lfoAmt')} isAssigning={assignMode} />
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                           if(fx.type === 'FX_PRO_REV') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="SPATIAL REVERB" color="#00E5FF" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout">
                                        <div className="fx-jack-col left">
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <div className="fx-group">
                                                <Knob label="MIX" val={mod.params.mix} min={0} max={1} step={0.01} def={0.44} onChange={(v)=>updateParam(fx.id, 'mix', v)} onAssign={()=>handleKnobAssign(fx.id, 'mix')} isAssigning={assignMode} />
                                                <Knob label="PREDELAY" val={mod.params.distance} min={0} max={0.2} step={0.001} def={0.0} onChange={(v)=>updateParam(fx.id, 'distance', v)} onAssign={()=>handleKnobAssign(fx.id, 'distance')} isAssigning={assignMode} />
                                            </div>
                                            <div className="fx-group" style={{justifyContent:'center', padding:'16px 24px'}}>
                                                <Knob label="DECAY" val={mod.params.decay} min={0.1} max={0.99} step={0.01} def={0.80} onChange={(v)=>updateParam(fx.id, 'decay', v)} onAssign={()=>handleKnobAssign(fx.id, 'decay')} isAssigning={assignMode} />
                                            </div>
                                            <div className="fx-group">
                                                <Knob label="SIZE" val={mod.params.size} min={0.5} max={5.0} step={0.05} def={2.2} onChange={(v)=>updateParam(fx.id, 'size', v)} onAssign={()=>handleKnobAssign(fx.id, 'size')} isAssigning={assignMode} />
                                                <Knob label="WIDTH" val={mod.params.width} min={0.0} max={2.0} step={0.01} def={1.07} onChange={(v)=>updateParam(fx.id, 'width', v)} onAssign={()=>handleKnobAssign(fx.id, 'width')} isAssigning={assignMode} />
                                            </div>
                                            <div className="fx-group">
                                                <div className="fx-group-row">
                                                    <Knob label="LOW FREQ" val={mod.params.loCut} min={20} max={1000} step={10} def={400} onChange={(v)=>updateParam(fx.id, 'loCut', v)} />
                                                    <Knob label="HIGH FREQ" val={mod.params.hiCut} min={1000} max={20000} step={10} def={9000} onChange={(v)=>updateParam(fx.id, 'hiCut', v)} />
                                                </div>
                                                <div className="fx-group-row">
                                                    <Knob label="LOW GAIN" val={mod.params.loGain} min={-24} max={12} step={0.5} def={0.0} onChange={(v)=>updateParam(fx.id, 'loGain', v)} />
                                                    <Knob label="HIGH GAIN" val={mod.params.hiGain} min={-24} max={12} step={0.5} def={-1.5} onChange={(v)=>updateParam(fx.id, 'hiGain', v)} />
                                                </div>
                                            </div>
                                            <div className="fx-group">
                                                <Knob label="RATE" val={mod.params.spinRate} min={0.1} max={5.0} step={0.01} def={0.4} onChange={(v)=>{updateParam(fx.id, 'spinRate', v); mod.nodes.spinLfo.frequency.value = v;}} />
                                                <Knob label="DEPTH" val={mod.params.spin} min={0} max={1} step={0.01} def={0.32} onChange={(v)=>updateParam(fx.id, 'spin', v)} />
                                            </div>
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'FX_SIDECHAIN') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="SIDECHAIN DUCKER" color="#FF0033" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout">
                                        <div className="fx-jack-col left">
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                            <ModuleJack n="TRIG IN" t={true} type="audio" active={isPatched(fx.id, 'TRIG', true)} patchedColor={getPatchedColor(fx.id, 'TRIG', true)} domReg={(d)=>updatePipRegistry(fx.id, 'TRIG', d)} onDown={(e) => handleJackDown(e, fx.id, 'TRIG', true)} onUp={() => handleJackUp(fx.id, 'TRIG', true)} onDoubleClick={() => clearJackCables(fx.id, 'TRIG', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="THRESH" val={mod.params.threshold} min={0.01} max={1.0} step={0.01} def={0.1} onChange={(v)=>updateParam(fx.id, 'threshold', v)} onAssign={()=>handleKnobAssign(fx.id, 'threshold')} isAssigning={assignMode} />
                                            <Knob label="RATIO" val={mod.params.ratio} min={0.1} max={1.0} step={0.01} def={0.8} onChange={(v)=>updateParam(fx.id, 'ratio', v)} onAssign={()=>handleKnobAssign(fx.id, 'ratio')} isAssigning={assignMode} />
                                            <Knob label="ATTACK" val={mod.params.attack} min={0.001} max={0.1} step={0.001} def={0.01} onChange={(v)=>updateParam(fx.id, 'attack', v)} onAssign={()=>handleKnobAssign(fx.id, 'attack')} isAssigning={assignMode} />
                                            <Knob label="RELEASE" val={mod.params.release} min={0.05} max={1.0} step={0.01} def={0.2} onChange={(v)=>updateParam(fx.id, 'release', v)} onAssign={()=>handleKnobAssign(fx.id, 'release')} isAssigning={assignMode} />
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'FX_OTT') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="TRUE OTT MULTIBAND" color="#00E5FF" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout">
                                        <div className="fx-jack-col left">
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="DEPTH" val={mod.params.depth} min={0} max={1} step={0.01} def={1.0} onChange={(v)=>updateParam(fx.id, 'depth', v)} onAssign={()=>handleKnobAssign(fx.id, 'depth')} isAssigning={assignMode} />
                                            <Knob label="HIGH" val={mod.params.high} min={0} max={10} step={0.1} def={5.0} onChange={(v)=>updateParam(fx.id, 'high', v)} onAssign={()=>handleKnobAssign(fx.id, 'high')} isAssigning={assignMode} />
                                            <Knob label="MID" val={mod.params.mid} min={0} max={10} step={0.1} def={3.0} onChange={(v)=>updateParam(fx.id, 'mid', v)} onAssign={()=>handleKnobAssign(fx.id, 'mid')} isAssigning={assignMode} />
                                            <Knob label="LOW" val={mod.params.low} min={0} max={10} step={0.1} def={4.0} onChange={(v)=>updateParam(fx.id, 'low', v)} onAssign={()=>handleKnobAssign(fx.id, 'low')} isAssigning={assignMode} />
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'FX_RHYTHM') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="RHYTHM GATE" color="#F78E1E" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout" style={{gap:'20px'}}>
                                        <div className="fx-jack-col left">
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="DEPTH" val={mod.params.depth} min={0} max={1} step={0.01} def={1.0} onChange={(v)=>updateParam(fx.id, 'depth', v)} onAssign={()=>handleKnobAssign(fx.id, 'depth')} isAssigning={assignMode} />
                                            <Knob label="SMOOTH" val={mod.params.smooth} min={0.01} max={0.5} step={0.01} def={0.05} onChange={(v)=>updateParam(fx.id, 'smooth', v)} onAssign={()=>handleKnobAssign(fx.id, 'smooth')} isAssigning={assignMode} />
                                            <div className="fx-select-col">
                                                <select value={mod.params.rate} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>updateParam(fx.id, 'rate', Number(e.target.value))}>
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
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'PROB_SEQ') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="16-STEP PROBABILITY" color="#F78E1E" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout" style={{gap:'20px'}}>
                                        <div className="fx-knob-row" style={{gap:'12px'}}>
                                            <Knob label="PROB %" val={mod.params.prob} min={0} max={1} step={0.01} def={0.8} onChange={(v)=> { mod.params.prob = v; setRenderTrigger(p=>p+1); }} onAssign={()=>handleKnobAssign(fx.id, 'prob')} isAssigning={assignMode} />
                                            <Knob label="GATE" val={mod.params.gate} min={0.1} max={1.0} step={0.05} def={0.5} onChange={(v)=> { mod.params.gate = v; setRenderTrigger(p=>p+1); }} onAssign={()=>handleKnobAssign(fx.id, 'gate')} isAssigning={assignMode} />
                                            <div className="fx-select-col">
                                                <select value={mod.params.rate} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>{ mod.params.rate = Number(e.target.value); setRenderTrigger(p=>p+1); }}>
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
                                        <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                            <StepGrid mod={mod} color="#F78E1E" />
                                            <button className="fx-rnd-btn" onPointerDown={(e)=>{ e.stopPropagation(); randomizeSteps(fx.id); }}>RND</button>
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack n="TRIG OUT" type="cv" active={isPatched(fx.id, 'TRIG', false)} patchedColor={getPatchedColor(fx.id, 'TRIG', false)} domReg={(d)=>updatePipRegistry(fx.id, 'TRIG', d)} onDown={(e) => handleJackDown(e, fx.id, 'TRIG', false)} onUp={() => handleJackUp(fx.id, 'TRIG', false)} onDoubleClick={() => clearJackCables(fx.id, 'TRIG', false)} />
                                            <ModuleJack n="PITCH OUT" type="cv" active={isPatched(fx.id, 'PITCH', false)} patchedColor={getPatchedColor(fx.id, 'PITCH', false)} domReg={(d)=>updatePipRegistry(fx.id, 'PITCH', d)} onDown={(e) => handleJackDown(e, fx.id, 'PITCH', false)} onUp={() => handleJackUp(fx.id, 'PITCH', false)} onDoubleClick={() => clearJackCables(fx.id, 'PITCH', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            if(fx.type === 'UTILITY_IO') return (
                                <DraggableWindow key={fx.id} id={fx.id} title="UTILITY / AMP" color="#E2E2E2" initialX={fx.x} initialY={fx.y} onClose={()=>removeModule(fx.id, false)} onDuplicate={()=>duplicateModule(fx.id)} onCopy={()=>copyParams(fx.id)} onPaste={()=>pasteParams(fx.id)} onMutate={()=>mutateParams(fx.id)}>
                                    <div className="fx-layout">
                                        <div className="fx-jack-col left">
                                            <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(fx.id, 'IN', true)} patchedColor={getPatchedColor(fx.id, 'IN', true)} domReg={(d)=>updatePipRegistry(fx.id, 'IN', d)} onDown={(e) => handleJackDown(e, fx.id, 'IN', true)} onUp={() => handleJackUp(fx.id, 'IN', true)} onDoubleClick={() => clearJackCables(fx.id, 'IN', true)} />
                                        </div>
                                        <div className="fx-knob-row">
                                            <Knob label="GAIN" val={mod.params.vol} min={-60} max={6.0} step={0.1} def={0.0} onChange={(v)=>updateParam(fx.id, 'vol', v)} onAssign={()=>handleKnobAssign(fx.id, 'vol')} isAssigning={assignMode} />
                                            <Knob label="PAN" val={mod.params.pan} min={-1} max={1} step={0.01} def={0.0} onChange={(v)=>updateParam(fx.id, 'pan', v)} onAssign={()=>handleKnobAssign(fx.id, 'pan')} isAssigning={assignMode} />
                                            <div className="fx-select-col">
                                                <div className="master-toggle-btn" onPointerDown={(e)=>{ e.stopPropagation(); updateParam(fx.id, 'isMono', !mod.params.isMono); }} 
                                                     style={{background: mod.params.isMono ? '#00E5FF' : '#111'}} />
                                                <span className="fx-select-label">MONO</span>
                                            </div>
                                        </div>
                                        <div className="fx-jack-col right">
                                            <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(fx.id, 'OUT', false)} patchedColor={getPatchedColor(fx.id, 'OUT', false)} domReg={(d)=>updatePipRegistry(fx.id, 'OUT', d)} onDown={(e) => handleJackDown(e, fx.id, 'OUT', false)} onUp={() => handleJackUp(fx.id, 'OUT', false)} onDoubleClick={() => clearJackCables(fx.id, 'OUT', false)} />
                                        </div>
                                    </div>
                                </DraggableWindow>
                            );

                            return null;
                        })}

                       {synths.map((ac, i) => {
                            const waveNames = ['SINE', 'SQR', 'SAW', 'TRI'];
                            return (
                                <DraggableWindow key={ac.id} id={ac.id} title={`${ac.id.slice(-4)} PHOTOSYNTH`} color={ac.mClr} initialX={ac.gPos.x} initialY={ac.gPos.y} onClose={() => removeModule(ac.id, true)} onDuplicate={()=>duplicateModule(ac.id)} onCopy={()=>copyParams(ac.id)} onPaste={()=>pasteParams(ac.id)} onMutate={()=>mutateParams(ac.id)}>
                                    
                                    <div className="synth-layout">
                                        
                                        {/* TOP ROW: OSC & FILTER */}
                                        <div className="synth-row">
                                            
                                            {/* OSCILLATOR PANEL */}
                                            <div className="synth-panel" style={{ flex: 2 }}>
                                                <div className="synth-panel-header">
                                                    <span>WAVETABLE OSCILLATOR</span>
                                                    <div className="synth-header-controls">
                                                        <div className="synth-live-btn" onPointerDown={(e)=>{
                                                            e.stopPropagation(); const newLive = !ac.params.isLive; updateParam(ac.id, 'isLive', newLive);
                                                            if (!newLive) { const mod = cDsp.current.modules[ac.id]; mod.snapshotTopo = new Float32Array(mod.currentTopo); }
                                                        }} style={{border:`1px solid ${ac.params.isLive ? '#FF0033' : '#00E5FF'}`, color:ac.params.isLive ? '#FF0033' : '#00E5FF'}}>
                                                            {ac.params.isLive ? 'LIVE' : 'SNAP'}
                                                        </div>
                                                        <select onPointerDown={e=>e.stopPropagation()} onChange={(e)=>loadWtPreset(ac.id, e.target.value)}>
                                                            <option value="">Load WT...</option>
                                                            {wtPresets.map((p, idx) => <option key={idx} value={idx}>{p.name}</option>)}
                                                        </select>
                                                        <button className="synth-save-btn" onPointerDown={e=>e.stopPropagation()} onClick={()=>saveWtPreset(ac.id)}>SAVE</button>
                                                    </div>
                                                </div>
                                                <div className="synth-panel-content">
                                                    <div className="synth-display-wrapper">
                                                        <WavetablePanelDisplay mod={cDsp.current.modules[ac.id] || ac} color={ac.mClr} />
                                                    </div>
                                                    <div className="knob-row">
                                                        <Knob label="WT POS" val={ac.params.wtPos} min={0} max={1} step={0.01} def={0} onChange={(v)=>updateParam(ac.id, 'wtPos', v)} onAssign={()=>handleKnobAssign(ac.id, 'wtPos')} isAssigning={assignMode} />
                                                        <Knob label="X-TIME" val={ac.params.timeScl} min={0.1} max={4.0} step={0.01} def={1.0} onChange={(v)=>updateParam(ac.id, 'timeScl', v)} onAssign={()=>handleKnobAssign(ac.id, 'timeScl')} isAssigning={assignMode} />
                                                        <Knob label="Y-PITCH" val={ac.params.freqScl} min={0.1} max={4.0} step={0.01} def={1.0} onChange={(v)=>updateParam(ac.id, 'freqScl', v)} onAssign={()=>handleKnobAssign(ac.id, 'freqScl')} isAssigning={assignMode} />
                                                        <Knob label="Z-AMP" val={ac.params.ampScl} min={0.1} max={5.0} step={0.01} def={1.0} onChange={(v)=>updateParam(ac.id, 'ampScl', v)} onAssign={()=>handleKnobAssign(ac.id, 'ampScl')} isAssigning={assignMode} />
                                                        <Knob label="WARP" val={ac.params.warp} min={-1} max={1} step={0.01} def={0.1} onChange={(v)=>updateParam(ac.id, 'warp', v)} onAssign={()=>handleKnobAssign(ac.id, 'warp')} isAssigning={assignMode} />
                                                        <Knob label="BEND" val={ac.params.bend} min={-1} max={1} step={0.01} def={0} onChange={(v)=>updateParam(ac.id, 'bend', v)} onAssign={()=>handleKnobAssign(ac.id, 'bend')} isAssigning={assignMode} />
                                                        <Knob label="SYM" val={ac.params.sym} min={0} max={1} step={0.01} def={0} onChange={(v)=>updateParam(ac.id, 'sym', v)} onAssign={()=>handleKnobAssign(ac.id, 'sym')} isAssigning={assignMode} />
                                                        <Knob label="SYNC" val={ac.params.sync} min={1} max={4} step={0.01} def={1.0} onChange={(v)=>updateParam(ac.id, 'sync', v)} onAssign={()=>handleKnobAssign(ac.id, 'sync')} isAssigning={assignMode} />
                                                        <Knob label="FORMANT" val={ac.params.formant} min={1} max={4} step={0.01} def={1.0} onChange={(v)=>updateParam(ac.id, 'formant', v)} onAssign={()=>handleKnobAssign(ac.id, 'formant')} isAssigning={assignMode} />
                                                        <Knob label="CRUSH" val={ac.params.crush} min={0} max={1} step={0.01} def={0.0} onChange={(v)=>updateParam(ac.id, 'crush', v)} onAssign={()=>handleKnobAssign(ac.id, 'crush')} isAssigning={assignMode} />
                                                        <Knob label="HARM" val={ac.params.harm} min={0} max={1} step={0.01} def={1.0} onChange={(v)=>updateParam(ac.id, 'harm', v)} onAssign={()=>handleKnobAssign(ac.id, 'harm')} isAssigning={assignMode} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* FILTER PANEL */}
                                            <div className="synth-panel" style={{ flex: 1 }}>
                                                <div className="synth-panel-header"><span>FILTER</span></div>
                                                <div className="synth-panel-content" style={{ justifyContent: 'space-between' }}>
                                                    <div style={{display:'flex', justifyContent:'center', marginBottom:'10px'}}>
                                                        <select value={ac.params.filterType} onPointerDown={(e)=>e.stopPropagation()} onChange={(e)=>updateParam(ac.id, 'filterType', e.target.value)} style={{width:'100%'}}>
                                                            <option value="lowpass">LOWPASS 24</option>
                                                            <option value="highpass">HIGHPASS 24</option>
                                                            <option value="bandpass">BANDPASS</option>
                                                            <option value="notch">NOTCH</option>
                                                        </select>
                                                    </div>
                                                    <FilterVisualizer mod={ac} updateParam={updateParam} />
                                                    <div className="knob-row">
                                                        <Knob label="CUTOFF" val={ac.params.cut} min={20} max={20000} step={10} def={6000} onChange={(v)=>updateParam(ac.id, 'cut', v)} onAssign={()=>handleKnobAssign(ac.id, 'cut')} isAssigning={assignMode} />
                                                        <Knob label="RES" val={ac.params.res} min={0} max={30} step={0.5} def={1.5} onChange={(v)=>updateParam(ac.id, 'res', v)} onAssign={()=>handleKnobAssign(ac.id, 'res')} isAssigning={assignMode} />
                                                        <Knob label="DRIVE" val={ac.params.drive} min={0} max={50} step={1} def={5} onChange={(v)=>updateParam(ac.id, 'drive', v)} onAssign={()=>handleKnobAssign(ac.id, 'drive')} isAssigning={assignMode} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* BOTTOM ROW: ENV, LFO, SUB/NOISE */}
                                        <div className="synth-row">
                                            
                                            {/* ENV PANEL */}
                                            <div className="synth-panel" style={{ flex: 1.2 }}>
                                                <div className="synth-panel-header"><span>ENV 1</span></div>
                                                <div className="synth-panel-content">
                                                    <EnvVisualizer atk={ac.params.atk} dec={ac.params.dec} sus={ac.params.sus} rel={ac.params.rel} />
                                                    <div className="knob-row">
                                                        <Knob label="ATK" val={ac.params.atk} min={0.0} max={1.0} step={0.005} def={0.005} onChange={(v)=>updateParam(ac.id, 'atk', v)} onAssign={()=>handleKnobAssign(ac.id, 'atk')} isAssigning={assignMode} />
                                                        <Knob label="HOLD" val={ac.params.hold} min={0.0} max={1.0} step={0.005} def={0.0} onChange={(v)=>updateParam(ac.id, 'hold', v)} onAssign={()=>handleKnobAssign(ac.id, 'hold')} isAssigning={assignMode} />
                                                            <Knob label="DEC" val={ac.params.dec} min={0.0} max={1.0} step={0.005} def={0.6} onChange={(v)=>updateParam(ac.id, 'dec', v)} onAssign={()=>handleKnobAssign(ac.id, 'dec')} isAssigning={assignMode} />
                                                        <Knob label="SUS" val={ac.params.sus} min={0.0} max={1.0} step={0.01} def={0.1} onChange={(v)=>updateParam(ac.id, 'sus', v)} onAssign={()=>handleKnobAssign(ac.id, 'sus')} isAssigning={assignMode} />
                                                        <Knob label="REL" val={ac.params.rel} min={0.0} max={3.0} step={0.01} def={1.5} onChange={(v)=>updateParam(ac.id, 'rel', v)} onAssign={()=>handleKnobAssign(ac.id, 'rel')} isAssigning={assignMode} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* LFO PANEL */}
                                            <div className="synth-panel" style={{ flex: 1 }}>
                                                <div className="synth-panel-header"><span>LFO 1</span></div>
                                                <div className="synth-panel-content">
                                                    <LfoVisualizer wave={ac.params.lfoWave} />
                                                    <div className="knob-row">
                                                        <Knob label="RATE" val={ac.params.lfoRate} min={0.1} max={20} step={0.1} def={0.5} onChange={(v)=>updateParam(ac.id, 'lfoRate', v)} onAssign={()=>handleKnobAssign(ac.id, 'lfoRate')} isAssigning={assignMode} />
                                                        <Knob label="DEPTH" val={ac.params.lfoDepth} min={0} max={100} step={1} def={15} onChange={(v)=>updateParam(ac.id, 'lfoDepth', v)} onAssign={()=>handleKnobAssign(ac.id, 'lfoDepth')} isAssigning={assignMode} />
                                                        <div className="fx-select-col">
                                                            <div className="synth-wave-btn" onPointerDown={(e)=>e.stopPropagation()} onClick={() => updateParam(ac.id, 'lfoWave', (ac.params.lfoWave + 1) % 4)}>
                                                                {waveNames[ac.params.lfoWave]}
                                                            </div>
                                                            <div className="fx-select-label">WAVE</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="synth-panel" style={{ flex: 1.5 }}>
                                                <div className="synth-panel-header"><span>VOICING & SUB</span></div>
                                                <div className="synth-panel-content" style={{ justifyContent: 'flex-end' }}>
                                                    <div className="knob-row">
                                                        <div className="synth-toggle-col">
                                                            <div className="synth-toggle-btn" onPointerDown={(e)=>{ e.stopPropagation(); updateParam(ac.id, 'oscOn', !ac.params.oscOn); }} 
                                                                 style={{background: ac.params.oscOn ? '#00E5FF' : '#333', marginBottom:'6px', boxShadow: ac.params.oscOn ? '0 0 6px #00E5FF' : 'inset 0 2px 4px rgba(0,0,0,0.5)'}} />
                                                            <Knob label="UNISON" val={ac.params.unison} min={1} max={16} step={1} def={5} onChange={(v)=>updateParam(ac.id, 'unison', v)} onAssign={()=>handleKnobAssign(ac.id, 'unison')} isAssigning={assignMode} />
                                                        </div>
                                                        <Knob label="DETUNE" val={ac.params.detune} min={0} max={1} step={0.01} def={0.04} onChange={(v)=>updateParam(ac.id, 'detune', v)} onAssign={()=>handleKnobAssign(ac.id, 'detune')} isAssigning={assignMode} />
                                                        <Knob label="BLEND" val={ac.params.blend} min={0} max={1} step={0.01} def={0.8} onChange={(v)=>updateParam(ac.id, 'blend', v)} onAssign={()=>handleKnobAssign(ac.id, 'blend')} isAssigning={assignMode} />
                                                        <Knob label="PITCH" val={ac.params.pitch} min={-48} max={48} step={1} def={0} onChange={(v)=>updateParam(ac.id, 'pitch', v)} onAssign={()=>handleKnobAssign(ac.id, 'pitch')} isAssigning={assignMode} />
                                                        <Knob label="P.ENV" val={ac.params.pEnv} min={-48} max={48} step={1} def={0} onChange={(v)=>updateParam(ac.id, 'pEnv', v)} onAssign={()=>handleKnobAssign(ac.id, 'pEnv')} isAssigning={assignMode} />
                                                        <Knob label="FM AMT" val={ac.params.fmAmt} min={0} max={1} step={0.01} def={0.15} onChange={(v)=>updateParam(ac.id, 'fmAmt', v)} onAssign={()=>handleKnobAssign(ac.id, 'fmAmt')} isAssigning={assignMode} />
                                                        
                                                        <div className="synth-toggle-col">
                                                            <div className="synth-toggle-row">
                                                                <div className="synth-toggle-btn" title="Toggle Sub" onPointerDown={(e)=>{ e.stopPropagation(); updateParam(ac.id, 'subOn', !ac.params.subOn); }} style={{background: ac.params.subOn ? '#00E5FF' : '#333'}} />
                                                                <div className="synth-filter-route-btn" title="Route Sub to Filter" onPointerDown={(e)=>{ e.stopPropagation(); updateParam(ac.id, 'subFilter', !ac.params.subFilter); }} style={{background: ac.params.subFilter ? '#99CC33' : '#333'}}>F</div>
                                                            </div>
                                                            <Knob label="SUB LVL" val={ac.params.subLvl} min={0} max={1} step={0.01} def={0.2} onChange={(v)=>updateParam(ac.id, 'subLvl', v)} onAssign={()=>handleKnobAssign(ac.id, 'subLvl')} isAssigning={assignMode} />
                                                        </div>

                                                        <div className="synth-toggle-col">
                                                            <div className="synth-toggle-row">
                                                                <div className="synth-toggle-btn" title="Toggle Noise" onPointerDown={(e)=>{ e.stopPropagation(); updateParam(ac.id, 'noiseOn', !ac.params.noiseOn); }} style={{background: ac.params.noiseOn ? '#00E5FF' : '#333'}} />
                                                                <div className="synth-filter-route-btn" title="Route Noise to Filter" onPointerDown={(e)=>{ e.stopPropagation(); updateParam(ac.id, 'noiseFilter', !ac.params.noiseFilter); }} style={{background: ac.params.noiseFilter ? '#99CC33' : '#333'}}>F</div>
                                                            </div>
                                                            <Knob label="NOISE" val={ac.params.noiseLvl} min={0} max={1} step={0.01} def={0.2} onChange={(v)=>updateParam(ac.id, 'noiseLvl', v)} onAssign={()=>handleKnobAssign(ac.id, 'noiseLvl')} isAssigning={assignMode} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ROUTING / JACKS */}
                                        <div className="synth-panel synth-routing-panel">
                                            <div className="synth-routing-col">
                                                <div className="synth-routing-title">INPUTS</div>
                                                <ModuleJack n="AUDIO IN" t={true} type="audio" active={isPatched(ac.id, 'AUDIO', true)} patchedColor={getPatchedColor(ac.id, 'AUDIO', true)} domReg={(d)=>updatePipRegistry(ac.id, 'AUDIO', d)} onDown={(e) => handleJackDown(e, ac.id, 'AUDIO', true)} onUp={() => handleJackUp(ac.id, 'AUDIO', true)} onDoubleClick={() => clearJackCables(ac.id, 'AUDIO', true)} />
                                                <ModuleJack n="TRIG IN" t={true} type="cv" active={isPatched(ac.id, 'TRIG', true)} patchedColor={getPatchedColor(ac.id, 'TRIG', true)} domReg={(d)=>updatePipRegistry(ac.id, 'TRIG', d)} onDown={(e) => handleJackDown(e, ac.id, 'TRIG', true)} onUp={() => handleJackUp(ac.id, 'TRIG', true)} onDoubleClick={() => clearJackCables(ac.id, 'TRIG', true)} />
                                                <ModuleJack n="CUT CV" t={true} type="cv" active={isPatched(ac.id, 'FLT', true)} patchedColor={getPatchedColor(ac.id, 'FLT', true)} domReg={(d)=>updatePipRegistry(ac.id, 'FLT', d)} onDown={(e) => handleJackDown(e, ac.id, 'FLT', true)} onUp={() => handleJackUp(ac.id, 'FLT', true)} onDoubleClick={() => clearJackCables(ac.id, 'FLT', true)} />
                                                <ModuleJack n="PITCH CV" t={true} type="cv" active={isPatched(ac.id, 'PITCH', true)} patchedColor={getPatchedColor(ac.id, 'PITCH', true)} domReg={(d)=>updatePipRegistry(ac.id, 'PITCH', d)} onDown={(e) => handleJackDown(e, ac.id, 'PITCH', true)} onUp={() => handleJackUp(ac.id, 'PITCH', true)} onDoubleClick={() => clearJackCables(ac.id, 'PITCH', true)} />
                                                <ModuleJack n="WT CV" t={true} type="cv" active={isPatched(ac.id, 'WT', true)} patchedColor={getPatchedColor(ac.id, 'WT', true)} domReg={(d)=>updatePipRegistry(ac.id, 'WT', d)} onDown={(e) => handleJackDown(e, ac.id, 'WT', true)} onUp={() => handleJackUp(ac.id, 'WT', true)} onDoubleClick={() => clearJackCables(ac.id, 'WT', true)} />
                                            </div>
                                            
                                            <div className="synth-routing-col">
                                                <div className="synth-routing-title" style={{textAlign:'right'}}>OUTPUTS</div>
                                                <ModuleJack n="AUDIO OUT" type="audio" active={isPatched(ac.id, 'AUDIO', false)} patchedColor={getPatchedColor(ac.id, 'AUDIO', false)} domReg={(d)=>updatePipRegistry(ac.id, 'AUDIO', d)} onDown={(e) => handleJackDown(e, ac.id, 'AUDIO', false)} onUp={() => handleJackUp(ac.id, 'AUDIO', false)} onDoubleClick={() => clearJackCables(ac.id, 'AUDIO', false)} />
                                                <ModuleJack n="ENV CV" type="cv" active={isPatched(ac.id, 'ENV', false)} patchedColor={getPatchedColor(ac.id, 'ENV', false)} domReg={(d)=>updatePipRegistry(ac.id, 'ENV', d)} onDown={(e) => handleJackDown(e, ac.id, 'ENV', false)} onUp={() => handleJackUp(ac.id, 'ENV', false)} onDoubleClick={() => clearJackCables(ac.id, 'ENV', false)} />
                                                <ModuleJack n="LFO CV" type="cv" active={isPatched(ac.id, 'LFO', false)} patchedColor={getPatchedColor(ac.id, 'LFO', false)} domReg={(d)=>updatePipRegistry(ac.id, 'LFO', d)} onDown={(e) => handleJackDown(e, ac.id, 'LFO', false)} onUp={() => handleJackUp(ac.id, 'LFO', false)} onDoubleClick={() => clearJackCables(ac.id, 'LFO', false)} />
                                            </div>
                                        </div>

                                    </div>
                                </DraggableWindow>
                            );
                        })}
                    </div>
                </>
            )}
       </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
    
/* --- APPEND TO BOTTOM OF js/app/main-app.js --- */

document.addEventListener('DOMContentLoaded', () => {
    // Dictionary to map note names to MIDI root values
    const noteToMidi = { 
        'C': 60, 'C#': 61, 'D': 62, 'D#': 63, 'E': 64, 'F': 65, 
        'F#': 66, 'G': 67, 'G#': 68, 'A': 69, 'A#': 70, 'B': 71 
    };

    // Grab the UI elements from the topbar
    const noteSelector = document.querySelector('.topbar-note-selector'); 
    const scaleSelector = document.querySelector('.topbar-scale-selector');

    // Listen for Note changes
    if (noteSelector) {
        noteSelector.addEventListener('change', (e) => {
            const noteName = e.target.value.toUpperCase();
            if (noteToMidi[noteName]) {
                window.OptoRackState.currentRootNote = noteToMidi[noteName];
                console.log("Root note updated to:", noteName, window.OptoRackState.currentRootNote);
            }
        });
    }

    // Listen for Scale changes
    if (scaleSelector) {
        scaleSelector.addEventListener('change', (e) => {
            window.OptoRackState.currentScale = e.target.value.toLowerCase();
            console.log("Scale updated to:", window.OptoRackState.currentScale);
        });
    }
});