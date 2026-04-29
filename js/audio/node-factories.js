/**
 * OPTORACK - AUDIO NODE FACTORIES
 * Architectural Role: Low-Level DSP Graph Construction
 * - Handles Web Audio node initialization for all module types.
 * - Encapsulates complex signal routing logic (e.g., Unison, Reverb Tanks).
 * - Returns modular objects containing both Nodes and default Parameters.
 */

window.OptoRackAudio = {
    // ── HELPERS ───────────────────────────────────────────────────────────────

    getSynthDefaultParams: (template = 'DEFAULT', overrideParams = null) => {
        let archetypeParams = {};
        if (template === 'PHOTON_OSCILLATOR') archetypeParams = { cut: 12000, res: 1.0, unison: 12, detune: 0.18, rel: 0.2, drive: 20 };
        else if (template === 'MODERN_EDM_LEAD') archetypeParams = { cut: 10000, res: 1.5, unison: 16, detune: 0.22, drive: 45, pEnv: 30, dec: 0.4 };
        else if (template === 'SUB_BASS') archetypeParams = { cut: 120, res: 1.0, subLvl: 1.0, unison: 1, rel: 0.1, subFilter: true, drive: 12, voicingMode: 'MONO' };
        else if (template === 'WAVETABLE_PRO') archetypeParams = { cut: 5000, res: 2.5, unison: 9, detune: 0.08, rel: 2.5, blend: 0.7 };

        return {
            atk: 0.005, hold: 0.0, dec: 0.6, sus: 0.1, rel: 1.5,
            cut: 6000, res: 1.5, drive: 5, filterType: 'lowpass',
            pitch: 0, lfoWave: 0, lfoRate: 0.2, lfoDepth: 35,
            wtPos: 0.0, scanRate: 0.3, wtScan: true, topoInt: 1.0,
            unison: 7, detune: 0.05, blend: 0.9, warp: 0.1, bend: 0.0, sym: 0.0,
            sync: 1.0, formant: 1.0, crush: 0.0, harm: 1.0, fmAmt: 0.15,
            meshRes: 64, sensitivity: 1.0, isLive: true,
            trigRate: 1, visualTemplate: 'PARTICLES', visualSettings: { size: 5.0, speed: 0.5 },
            subOn: true, subFilter: true, noiseOn: false, noiseFilter: true,
            subLvl: 0.3, subOct: -1, subSemi: 0, subPan: 0,
            noiseLvl: 0.1, noiseColor: 8000, noiseStereo: 0.5,
            unisonSpread: 0.8, inLvl: 1.0, pEnv: 0.0,
            timeScl: 1.0, freqScl: 1.0, ampScl: 1.0, activeTab: 'ENGINE',
            ...archetypeParams,
            ...(overrideParams || {})
        };
    },

    // ── FX FACTORIES ──────────────────────────────────────────────────────────

    createFX: (type, actx, overrideParams = null) => {
        let mod = { inNodes: {}, outNodes: {}, nodes: {}, params: {}, baseParams: {}, state: {} };
        const dsp = window.OptoRackDSP;

        if (type === 'FX_EQ') {
            const eqIn = actx.createGain(); const eqOut = actx.createGain();
            const analyser = actx.createAnalyser(); analyser.fftSize = 2048;
            const freqs = [20, 31.5, 63, 125, 250, 400, 600, 800, 1200, 2400, 3500, 5000, 8000, 10000, 16000, 20000];
            const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
            const defaultGains = [-6, -2, 4, -3, 0, 1, -1, 0, 1, 2, 3, 1, -1, 2, 4, -3];
            const bands = freqs.map((f, i) => { 
                const filter = actx.createBiquadFilter(); 
                filter.type = types[i]; filter.frequency.value = f; filter.Q.value = 1.0; filter.gain.value = 0;
                return filter; 
            });
            eqIn.connect(bands[0]); 
            for (let i = 0; i < bands.length - 1; i++) bands[i].connect(bands[i + 1]); 
            bands[bands.length - 1].connect(eqOut); eqOut.connect(analyser);
            mod.inNodes = { IN: eqIn }; mod.outNodes = { OUT: eqOut }; mod.nodes = { bands, analyser };
            freqs.forEach((f, i) => {
                const b = i + 1;
                mod.params[`b${b}f`] = overrideParams ? (overrideParams[`b${b}f`] ?? f) : f;
                mod.params[`b${b}g`] = overrideParams ? (overrideParams[`b${b}g`] ?? 0) : defaultGains[i];
                mod.params[`b${b}q`] = overrideParams ? (overrideParams[`b${b}q`] ?? 1.0) : 1.0;
            });
        }
        else if (type === 'FX_DELAY') {
            const dIn = actx.createGain(); const dOut = actx.createGain();
            const delay = actx.createDelay(5.0); const feedback = actx.createGain();
            const filter = actx.createBiquadFilter(); filter.type = 'lowpass';
            const wet = actx.createGain(); const dry = actx.createGain();
            dIn.connect(dry); dry.connect(dOut); dIn.connect(delay); delay.connect(filter);
            filter.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(dOut);
            mod.inNodes = { IN: dIn }; mod.outNodes = { OUT: dOut }; mod.nodes = { delay, feedback, filter, wet, dry };
            mod.params = overrideParams || { time: 0.3, feedback: 0.4, mix: 0.5, cutoff: 3000 };
        }
        else if (type === 'FX_PRO_REV') {
            const revIn = actx.createGain(); const revOut = actx.createGain(); const revWet = actx.createGain(); const revDry = actx.createGain();
            const preDelay = actx.createDelay(1.0); const loCut = actx.createBiquadFilter(); loCut.type = 'highpass';
            const hiCut = actx.createBiquadFilter(); hiCut.type = 'lowpass'; const lowShelf = actx.createBiquadFilter(); lowShelf.type = 'lowshelf';
            const highShelf = actx.createBiquadFilter(); highShelf.type = 'highshelf';
            const baseDelays = [0.0113, 0.0167, 0.0223, 0.0293, 0.0347, 0.0419];
            const revDelays = baseDelays.map(t => { const d = actx.createDelay(1.0); d.delayTime.value = t; return d; });
            const revFbs = revDelays.map(() => { const g = actx.createGain(); g.gain.value = 0.85; return g; });
            const spinLfo = actx.createOscillator(); const spinGain = actx.createGain(); spinGain.gain.value = 0.002;
            spinLfo.connect(spinGain); spinLfo.start();
            revIn.connect(revDry); revDry.connect(revOut); revIn.connect(preDelay);
            preDelay.connect(loCut); loCut.connect(hiCut); hiCut.connect(lowShelf); lowShelf.connect(highShelf);
            revDelays.forEach((d, i) => { highShelf.connect(d); d.connect(revFbs[i]); revFbs[i].connect(revDelays[(i + 1) % 6]); d.connect(revWet); spinGain.connect(d.delayTime); });
            revWet.connect(revOut);
            mod.inNodes = { IN: revIn }; mod.outNodes = { OUT: revOut };
            mod.params = overrideParams || { mix: 0.45, distance: 0.0, decay: 0.88, size: 2.5, width: 1.0, loCut: 400, hiCut: 9000, loGain: 0.0, hiGain: -1.5, spinRate: 0.4, spin: 0.32 };
            mod.nodes = { wet: revWet, dry: revDry, pre: preDelay, lo: loCut, hi: hiCut, lowEQ: lowShelf, hiEQ: highShelf, fbs: revFbs, delays: revDelays, baseDelays, spin: spinGain, spinLfo };
        }
        else if (type === 'FX_AUTOFILTER') {
            const afIn = actx.createGain(); const afOut = actx.createGain();
            const f1 = actx.createBiquadFilter(); const f2 = actx.createBiquadFilter();
            const drive = actx.createWaveShaper(); drive.curve = dsp.makeDriveCurve(10);
            const lfo = actx.createOscillator(); const lfoGain = actx.createGain();
            lfo.connect(lfoGain); lfoGain.connect(f1.frequency); lfoGain.connect(f2.frequency); lfo.start();
            afIn.connect(f1); f1.connect(f2); f2.connect(drive); drive.connect(afOut);
            mod.inNodes = { IN: afIn }; mod.outNodes = { OUT: afOut }; mod.nodes = { filter1: f1, filter2: f2, drive, lfo, lfoGain };
            mod.params = overrideParams || { cut: 1000, res: 5, drive: 10, lfoRate: 1.0, lfoAmt: 500, filterType: 'lowpass' };
        }
        else if (type === 'FX_SIDECHAIN') {
            const scIn = actx.createGain(); const scOut = actx.createGain(); const scVca = actx.createGain();
            const ana = actx.createAnalyser(); ana.fftSize = 256;
            scIn.connect(scVca); scVca.connect(scOut); scVca.connect(ana);
            mod.inNodes = { IN: scIn }; mod.outNodes = { OUT: scOut }; mod.nodes = { vca: scVca, analyser: ana };
            mod.params = overrideParams || { depth: 1.0, curveId: 0, rate: 1.0 };
            mod.state = { nextScheduleTime: 0, progress: 0 };
        }
        else if (type === 'FX_OTT') {
            const ottIn = actx.createGain(); const ottOut = actx.createGain();
            const dry = actx.createGain(); const wet = actx.createGain();
            const splitL = actx.createBiquadFilter(); splitL.type = 'lowpass';
            const splitM = actx.createBiquadFilter(); splitM.type = 'bandpass';
            const splitH = actx.createBiquadFilter(); splitH.type = 'highpass';
            const compL = actx.createDynamicsCompressor(); const compM = actx.createDynamicsCompressor(); const compH = actx.createDynamicsCompressor();
            const gainL = actx.createGain(); const gainM = actx.createGain(); const gainH = actx.createGain();
            ottIn.connect(dry); dry.connect(ottOut);
            ottIn.connect(splitL); splitL.connect(compL); compL.connect(gainL); gainL.connect(wet);
            ottIn.connect(splitM); splitM.connect(compM); compM.connect(gainM); gainM.connect(wet);
            ottIn.connect(splitH); splitH.connect(compH); compH.connect(gainH); gainH.connect(wet);
            wet.connect(ottOut);
            mod.inNodes = { IN: ottIn }; mod.outNodes = { OUT: ottOut };
            mod.params = overrideParams || { depth: 1.0, low: 4.0, mid: 3.0, high: 5.0 };
            mod.nodes = { dry, wet, splitL, splitM, splitH, cL: compL, cM: compM, cH: compH, gL: gainL, gM: gainM, gH: gainH };
        }
        else if (type === 'UTILITY_IO') {
            const uIn = actx.createGain();
            const uVol = actx.createGain();
            const uSplit = actx.createChannelSplitter(2);
            const vcaL = actx.createGain();
            const vcaR = actx.createGain();
            const uMerge = actx.createChannelMerger(2);
            const uOut = actx.createGain();

            uIn.connect(uVol);
            uVol.connect(uSplit);
            uSplit.connect(vcaL, 0); // Left to VCA L
            uSplit.connect(vcaR, 1); // Right to VCA R (if stereo input)
            // If input is mono, connect Channel 0 to both
            uSplit.connect(vcaR, 0); 

            vcaL.connect(uMerge, 0, 0);
            vcaR.connect(uMerge, 0, 1);
            uMerge.connect(uOut);

            mod.inNodes = { IN: uIn };
            mod.outNodes = { OUT: uOut };
            mod.nodes = { vol: uVol, vcaL, vcaR, splitter: uSplit, merger: uMerge };
            mod.params = overrideParams || { vol: 0.0, pan: 0.5, isMono: false };
        }

        mod.baseParams = JSON.parse(JSON.stringify(mod.params));
        return mod;
    },

    // ── SYNTH FACTORY ──────────────────────────────────────────────────────────

    createSynth: (actx, overrideParams = null, template = 'PHOTON_OSCILLATOR', rootNote = 60) => {
        const dsp = window.OptoRackDSP;
        const MAX_UNISON = 16;
        const unisonOscs = []; const unisonGains = []; const unisonPanners = [];
        const unisonMaster = actx.createGain(); unisonMaster.gain.value = 1.0;

        const preFilterMix = actx.createGain(); const postFilterMix = actx.createGain();
        const oscGain = actx.createGain(); const audioIn = actx.createGain();
        audioIn.connect(unisonMaster); unisonMaster.connect(oscGain); oscGain.connect(preFilterMix);

        const baseFreq = dsp.getBaseFrequency(window.NOTES[rootNote % 12] || 'C'); 
        const subOsc = actx.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.value = baseFreq / 2; subOsc.start();
        const subGain = actx.createGain(); const subPanner = actx.createStereoPanner();
        const subToFilter = actx.createGain(); const subToOut = actx.createGain(); const fmGain = actx.createGain();
        subOsc.connect(subGain); subGain.connect(subPanner); subPanner.connect(subToFilter); subPanner.connect(subToOut);
        subToFilter.connect(preFilterMix); subToOut.connect(postFilterMix); subOsc.connect(fmGain);

        const noiseBuffer = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0); for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
        const noiseSrc = actx.createBufferSource(); noiseSrc.buffer = noiseBuffer; noiseSrc.loop = true; noiseSrc.start();
        const noiseGain = actx.createGain(); const noiseFilterNode = actx.createBiquadFilter(); noiseFilterNode.type = 'lowpass';
        const noiseToFilter = actx.createGain(); const noiseToOut = actx.createGain();
        noiseSrc.connect(noiseGain); noiseGain.connect(noiseFilterNode); noiseFilterNode.connect(noiseToFilter); noiseFilterNode.connect(noiseToOut);
        noiseToFilter.connect(preFilterMix); noiseToOut.connect(postFilterMix);

        const moLPF1 = actx.createBiquadFilter(); moLPF1.type = 'lowpass';
        const moLPF2 = actx.createBiquadFilter(); moLPF2.type = 'lowpass';
        const synthDrive = actx.createGain(); const softClipper = actx.createWaveShaper(); softClipper.curve = dsp.makeSoftClipCurve();
        const bitCrusher = actx.createWaveShaper(); bitCrusher.curve = dsp.makeClampCurve(1.0);
        preFilterMix.connect(synthDrive); synthDrive.connect(bitCrusher); bitCrusher.connect(softClipper); softClipper.connect(moLPF1);

        for (let i = 0; i < MAX_UNISON; i++) {
            const osc = actx.createOscillator(); const gain = actx.createGain(); const panner = actx.createStereoPanner();
            osc.connect(gain); gain.connect(panner); panner.connect(unisonMaster); fmGain.connect(osc.frequency);
            osc.start(); unisonOscs.push(osc); unisonGains.push(gain); unisonPanners.push(panner);
        }

        const lfo = actx.createOscillator(); const lfoSmooth = actx.createBiquadFilter(); lfoSmooth.type = 'lowpass'; lfoSmooth.frequency.value = 20;
        const lfoDepth = actx.createGain(); const lfoOut = actx.createGain();
        lfo.connect(lfoSmooth); lfoSmooth.connect(lfoDepth); lfoDepth.connect(lfoOut); lfo.start();

        const evVCA = actx.createGain(); const panner = actx.createStereoPanner(); const audioOut = actx.createGain();
        const analyser = actx.createAnalyser(); analyser.fftSize = 512;
        moLPF1.connect(moLPF2); moLPF2.connect(postFilterMix); postFilterMix.connect(evVCA); evVCA.connect(panner); panner.connect(audioOut); audioOut.connect(analyser);

        const envCVOut = actx.createGain(); const topoCVOut = actx.createGain();
        const inFlt = actx.createGain(); inFlt.gain.value = 5000; inFlt.connect(moLPF1.frequency); inFlt.connect(moLPF2.frequency);
        const inPitch = actx.createGain(); unisonOscs.forEach(osc => inPitch.connect(osc.detune)); inPitch.connect(subOsc.detune);
        const inTrig = actx.createGain(); const inWt = actx.createGain();
        const pitchEnvGain = actx.createGain(); envCVOut.connect(pitchEnvGain); pitchEnvGain.connect(inPitch);

        const params = window.OptoRackAudio.getSynthDefaultParams(template, overrideParams);
        return {
            type: 'SYNTH', analyser, unisonOscs, unisonGains, unisonPanners, unisonMaster, subOsc, subGain, subPanner, noiseSrc, noiseGain, noiseFilterNode, fmGain,
            oscGain, subToFilter, subToOut, noiseToFilter, noiseToOut, lfo, lfoDepth, lfoSmooth, fB1: moLPF1, fB2: moLPF2, env: evVCA, panner, pitchEnvGain, audioIn,
            nodes: { synthDrive, bitCrusher, softClipper },
            outNodes: { AUDIO: audioOut, ENV: envCVOut, TOPO: topoCVOut, LFO: lfoOut },
            inNodes: { AUDIO: audioIn, FLT: inFlt, PITCH: inPitch, TRIG: inTrig, WT: inWt },
            curTrigT: 0, wavePhase: Math.random() * 100, triggerFlag: false, scanPhase: 0,
            state: { lastTrig: 0, gate: 0, smoothWtPos: 0 },
            params, baseParams: JSON.parse(JSON.stringify(params))
        };
    }
};
