/**
 * SpeechRecognizer: Encapsulates browser Web Speech API and Whisper PCM WAV STT
 * with VAD auto-stop and push-to-talk.
 */
class SpeechRecognizer {
    constructor() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.isWebSpeechSupported = !!SpeechRec;
        this.recognition = this.isWebSpeechSupported ? new SpeechRec() : null;
        this.engine = 'WebSpeech'; // 'WebSpeech' or 'Whisper'

        this.isListening = false;
        this.isBlocked = false;
        this.mode = 'hands-free'; // 'hands-free' or 'push-to-talk'
        this.handsFreePaused = false;
        this.silenceTimer = null;
        this.silenceDelayMs = 900; // Time of silence before auto-submitting in WebSpeech
        this.accumulatedTranscript = '';
        this.interimTranscript = '';
        this._isFinalizing = false;
        this.forcedLanguage = null;

        // Whisper AudioContext & PCM WAV state
        this.mediaStream = null;
        this.audioContext = null;
        this.pcmProcessor = null;
        this.pcmBuffers = [];
        this.analyser = null;
        this.vadInterval = null;
        
        // Callbacks
        this.onInterimResult = null; // (text) => {}
        this.onFinalResult = null;   // (text) => {}
        this.onAudioResult = null;   // ({ audioBase64, mimeType, blob }) => {}
        this.onStateChange = null;   // (isListening) => {}
        this.onError = null;         // (err) => {}

        if (this.isWebSpeechSupported) {
            this._setupWebSpeech();
        }
    }

    setEngine(engine) {
        if (this.isListening) {
            this.stop();
        }
        this.engine = engine === 'Whisper' ? 'Whisper' : 'WebSpeech';
    }

    setHandsFreePaused(paused) {
        this.handsFreePaused = !!paused;
    }

    _setupWebSpeech() {
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            this._isFinalizing = false;
            this.accumulatedTranscript = '';
            this.interimTranscript = '';
            if (this.onStateChange) this.onStateChange(true);
        };

        this.recognition.onresult = (event) => {
            if (this.isBlocked) {
                this.accumulatedTranscript = '';
                this.interimTranscript = '';
                this._clearSilenceTimer();
                return;
            }

            let interim = '';
            let finalThisTurn = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const item = event.results[i];
                if (item.isFinal) {
                    finalThisTurn += item[0].transcript + ' ';
                } else {
                    interim += item[0].transcript;
                }
            }

            if (finalThisTurn) {
                this.accumulatedTranscript += finalThisTurn;
            }
            this.interimTranscript = interim;

            const currentDisplay = (this.accumulatedTranscript + (this.interimTranscript ? ' ' + this.interimTranscript : '')).trim();
            if (this.onInterimResult && currentDisplay) {
                this.onInterimResult(currentDisplay);
            }

            // In hands-free mode, reset silence timer whenever user speaks non-empty text
            if (this.mode === 'hands-free' && currentDisplay) {
                this._resetSilenceTimer();
            }
        };

        this.recognition.onerror = (event) => {
            if (event.error === 'no-speech' || event.error === 'aborted') {
                return; // User was quiet or session aborted, ignore
            }
            console.warn('WebSpeech event error:', event.error);
            if (this.onError) {
                this.onError(event.error);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this._clearSilenceTimer();

            // Discard any speech recognized if blocked (e.g. AI turn or interrupt)
            if (this.isBlocked) {
                this.accumulatedTranscript = '';
                this.interimTranscript = '';
                this._isFinalizing = false;
                if (this.onStateChange) this.onStateChange(false);
                return;
            }

            // If not already finalized, submit whatever was accumulated
            if (!this._isFinalizing) {
                const textToSubmit = (this.accumulatedTranscript + (this.interimTranscript ? ' ' + this.interimTranscript : '')).trim();
                this.accumulatedTranscript = '';
                this.interimTranscript = '';

                if (textToSubmit) {
                    this._isFinalizing = true;
                    if (this.onStateChange) this.onStateChange(false);
                    if (this.onFinalResult && !this.isBlocked) {
                        this.onFinalResult(textToSubmit);
                    }
                    return;
                }
            }

            this.accumulatedTranscript = '';
            this.interimTranscript = '';
            this._isFinalizing = false;
            if (this.onStateChange) this.onStateChange(false);

            // Auto-restart hands-free listening if browser ended session on silence/timeout
            if (this.mode === 'hands-free' && !this.isBlocked && !this.handsFreePaused) {
                setTimeout(() => {
                    if (this.mode === 'hands-free' && !this.isBlocked && !this.handsFreePaused && !this.isListening) {
                        this.start();
                    }
                }, 100);
            }
        };
    }

    setLanguageByCountry(countryCode) {
        if (!this.recognition) return;
        if (this.forcedLanguage) {
            this.recognition.lang = this.forcedLanguage;
            return;
        }

        const langMap = {
            'US': 'en-US',
            'UK': 'en-GB',
            'IN': 'en-IN',
            'CA': 'en-CA',
            'RO': 'en-US',
            'UA': 'en-US',
            'CN': 'zh-CN',
            'CN-EN': 'zh-CN'
        };
        this.recognition.lang = langMap[countryCode] || 'en-US';
    }

    setRecognitionLanguage(lang) {
        if (lang === 'auto') {
            this.forcedLanguage = null;
        } else {
            this.forcedLanguage = lang;
            if (this.recognition) {
                this.recognition.lang = lang;
            }
        }
    }

    setBlocked(blocked) {
        this.isBlocked = !!blocked;
        if (this.isBlocked) {
            this.accumulatedTranscript = '';
            this.interimTranscript = '';
            this._isFinalizing = false;
            this.pcmBuffers = [];
            this._clearSilenceTimer();
            this._stopVad();
            if (this.isListening) {
                this.stop(true);
            }
        }
    }

    setMode(mode) {
        this.mode = mode; // 'hands-free' or 'push-to-talk'
    }

    async start() {
        if (this.isListening || this.isBlocked) return;

        if (this.engine === 'Whisper') {
            await this._startWhisperRecording();
        } else {
            this._startWebSpeech();
        }
    }

    stop(abort = false) {
        if (!this.isListening) return;

        if (this.engine === 'Whisper') {
            this._stopWhisperRecording(abort);
        } else {
            this._stopWebSpeech(abort);
        }
    }

    // --- Web Speech Methods ---
    _startWebSpeech() {
        if (!this.isWebSpeechSupported || this.isBlocked) {
            return;
        }

        this.accumulatedTranscript = '';
        this.interimTranscript = '';
        this._isFinalizing = false;

        try {
            this.recognition.start();
        } catch (e) {
            if (e.name === 'InvalidStateError') {
                try {
                    this.recognition.abort();
                } catch (abortErr) {}
                setTimeout(() => {
                    if (!this.isBlocked && !this.isListening) {
                        try { this.recognition.start(); } catch (err) {}
                    }
                }, 100);
            } else {
                console.warn('Recognition start exception:', e);
            }
        }
    }

    _stopWebSpeech(abort = false) {
        if (!this.isWebSpeechSupported || !this.isListening) return;
        this._clearSilenceTimer();
        if (abort) {
            this.accumulatedTranscript = '';
            this.interimTranscript = '';
            this._isFinalizing = false;
        }
        try {
            if (abort && typeof this.recognition.abort === 'function') {
                this.recognition.abort();
            } else {
                this.recognition.stop();
            }
        } catch (e) {
            console.warn('Recognition stop exception:', e);
        }
    }

    _resetSilenceTimer() {
        this._clearSilenceTimer();
        this.silenceTimer = setTimeout(() => {
            if (this.isListening && !this.isBlocked) {
                this._finalizeSpeech();
            }
        }, this.silenceDelayMs);
    }

    _finalizeSpeech() {
        this._clearSilenceTimer();
        if (this._isFinalizing) return;
        this._isFinalizing = true;

        const textToSubmit = (this.accumulatedTranscript + (this.interimTranscript ? ' ' + this.interimTranscript : '')).trim();
        this.accumulatedTranscript = '';
        this.interimTranscript = '';

        if (textToSubmit && !this.isBlocked) {
            this.stop(false);
            if (this.onFinalResult && !this.isBlocked) {
                this.onFinalResult(textToSubmit);
            }
        } else {
            this._isFinalizing = false;
        }
    }

    _clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    // --- Whisper PCM WAV Methods ---
    async _startWhisperRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (this.onError) this.onError('Microphone access is not supported in this browser.');
            return;
        }

        try {
            if (!this.mediaStream || !this.mediaStream.active) {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
            }

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioCtx();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Analyser for real-time volume detection & VAD
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            // Capture raw PCM buffers
            const bufferSize = 4096;
            this.pcmProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            this.pcmBuffers = [];

            this.pcmProcessor.onaudioprocess = (e) => {
                if (!this.isListening || this.isBlocked) return;
                const channelData = e.inputBuffer.getChannelData(0);
                this.pcmBuffers.push(new Float32Array(channelData));
            };

            // Mute gain node prevents mic audio from playing back into local speakers (acoustic loop prevention)
            const muteGain = this.audioContext.createGain();
            muteGain.gain.value = 0.0;
            source.connect(this.pcmProcessor);
            this.pcmProcessor.connect(muteGain);
            muteGain.connect(this.audioContext.destination);

            this.isListening = true;
            if (this.onStateChange) this.onStateChange(true);
            if (this.onInterimResult) {
                const tipText = window.i18n ? window.i18n.t('mic_status_recording') : '🎙️ Recording speech for Whisper...';
                this.onInterimResult(tipText);
            }

            if (this.mode === 'hands-free') {
                this._startVad();
            }
        } catch (err) {
            console.error('Whisper recording failed to start:', err);
            if (this.onError) {
                this.onError(`Microphone error: ${err.message}`);
            }
        }
    }

    _stopWhisperRecording(abort = false) {
        if (!this.isListening) return;
        this.isListening = false;
        if (this.onStateChange) this.onStateChange(false);
        this._stopVad();

        if (this.pcmProcessor) {
            try { this.pcmProcessor.disconnect(); } catch (e) {}
            this.pcmProcessor = null;
        }

        if (abort || this.isBlocked) {
            this.pcmBuffers = [];
            if (this.audioContext && this.audioContext.state !== 'closed') {
                try { this.audioContext.close(); } catch (e) {}
                this.audioContext = null;
            }
            return;
        }

        const inputSampleRate = this.audioContext ? this.audioContext.sampleRate : 44100;
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch (e) {}
            this.audioContext = null;
        }

        // Merge collected buffers
        let totalLength = 0;
        for (let i = 0; i < this.pcmBuffers.length; i++) {
            totalLength += this.pcmBuffers[i].length;
        }

        if (totalLength < 3200) {
            // Less than ~0.15s: ignore accidental micro-clicks
            this.pcmBuffers = [];
            if (this.mode === 'hands-free' && !this.isBlocked && !this.handsFreePaused) {
                setTimeout(() => {
                    if (this.mode === 'hands-free' && !this.isBlocked && !this.handsFreePaused && !this.isListening) {
                        this.start();
                    }
                }, 100);
            }
            return;
        }

        const mergedSamples = new Float32Array(totalLength);
        let offset = 0;
        for (let i = 0; i < this.pcmBuffers.length; i++) {
            mergedSamples.set(this.pcmBuffers[i], offset);
            offset += this.pcmBuffers[i].length;
        }
        this.pcmBuffers = [];

        // Downsample to 16000Hz (Whisper native rate)
        const targetSampleRate = 16000;
        const downsampled = this._downsampleBuffer(mergedSamples, inputSampleRate, targetSampleRate);
        const wavBlob = this._encodeWav(downsampled, targetSampleRate);

        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            const base64 = typeof dataUrl === 'string' && dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
            if (base64 && this.onAudioResult) {
                this.onAudioResult({ audioBase64: base64, mimeType: 'audio/wav', blob: wavBlob });
            }
        };
        reader.readAsDataURL(wavBlob);
    }

    _downsampleBuffer(buffer, sampleRate, outSampleRate) {
        if (outSampleRate === sampleRate || outSampleRate > sampleRate) {
            return buffer;
        }
        const sampleRateRatio = sampleRate / outSampleRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Float32Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;
        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            let accum = 0;
            let count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = count > 0 ? accum / count : 0;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    _encodeWav(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        function writeString(offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, 1, true); // Mono channel
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, samples.length * 2, true);

        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    _startVad() {
        this._stopVad();
        if (!this.analyser) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        let hasSpoken = false;
        let silenceStartTime = null;

        this.vadInterval = setInterval(() => {
            if (!this.isListening) {
                this._stopVad();
                return;
            }

            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const avgVolume = sum / dataArray.length;

            if (avgVolume > 12) {
                hasSpoken = true;
                silenceStartTime = null;
            } else if (hasSpoken) {
                if (!silenceStartTime) {
                    silenceStartTime = Date.now();
                } else if (Date.now() - silenceStartTime > 1200) {
                    // 1.2s silence after speech -> auto-finalize turn
                    this.stop();
                }
            }
        }, 100);
    }

    _stopVad() {
        if (this.vadInterval) {
            clearInterval(this.vadInterval);
            this.vadInterval = null;
        }
    }
}

window.SpeechRecognizer = SpeechRecognizer;
