/**
 * SpeechRecognizer: Encapsulates browser Web Speech API with VAD auto-stop and push-to-talk.
 */
class SpeechRecognizer {
    constructor() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.isSupported = !!SpeechRec;
        this.recognition = this.isSupported ? new SpeechRec() : null;
        this.isListening = false;
        this.mode = 'hands-free'; // 'hands-free' or 'push-to-talk'
        this.silenceTimer = null;
        this.silenceDelayMs = 900; // Time of silence before auto-submitting in hands-free mode
        this.accumulatedTranscript = '';
        
        // Callbacks
        this.onInterimResult = null; // (text) => {}
        this.onFinalResult = null;   // (text) => {}
        this.onStateChange = null;   // (isListening) => {}
        this.onError = null;         // (err) => {}

        if (this.isSupported) {
            this._setupRecognition();
        }
    }

    _setupRecognition() {
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            this.accumulatedTranscript = '';
            if (this.onStateChange) this.onStateChange(true);
        };

        this.recognition.onresult = (event) => {
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

            const currentDisplay = (this.accumulatedTranscript + interim).trim();
            if (this.onInterimResult && currentDisplay) {
                this.onInterimResult(currentDisplay);
            }

            // In hands-free mode, reset silence timer whenever user speaks
            if (this.mode === 'hands-free') {
                this._resetSilenceTimer();
            }
        };

        this.recognition.onerror = (event) => {
            console.warn('Speech recognition event error:', event.error);
            if (event.error === 'no-speech') {
                return; // User was just quiet, ignore
            }
            if (this.onError) {
                this.onError(event.error);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onStateChange) this.onStateChange(false);
            this._clearSilenceTimer();

            // Submit what was accumulated if any
            if (this.accumulatedTranscript.trim()) {
                const text = this.accumulatedTranscript.trim();
                this.accumulatedTranscript = '';
                if (this.onFinalResult) {
                    this.onFinalResult(text);
                }
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
            'AU': 'en-AU',
            'IN': 'en-IN',
            'CA': 'en-CA',
            'RO': 'en-US',
            'UA': 'en-US',
            'CN': 'zh-CN'
        };
        this.recognition.lang = langMap[countryCode] || 'en-US';
    }

    setRecognitionLanguage(lang) {
        // lang can be 'auto', 'en-US', 'zh-CN'
        if (lang === 'auto') {
            this.forcedLanguage = null;
        } else {
            this.forcedLanguage = lang;
            if (this.recognition) {
                this.recognition.lang = lang;
            }
        }
    }

    setMode(mode) {
        this.mode = mode; // 'hands-free' or 'push-to-talk'
    }

    start() {
        if (!this.isSupported) {
            if (this.onError) this.onError('Web Speech API is not supported in this browser. Please use Chrome/Edge or use text input.');
            return;
        }
        if (this.isListening) return;

        this.accumulatedTranscript = '';
        try {
            this.recognition.start();
        } catch (e) {
            console.warn('Recognition start exception:', e);
        }
    }

    stop() {
        if (!this.isSupported || !this.isListening) return;
        this._clearSilenceTimer();
        try {
            this.recognition.stop();
        } catch (e) {
            console.warn('Recognition stop exception:', e);
        }
    }

    _resetSilenceTimer() {
        this._clearSilenceTimer();
        this.silenceTimer = setTimeout(() => {
            // User paused speaking for silenceDelayMs -> automatically finalize turn
            if (this.isListening) {
                this.stop();
            }
        }, this.silenceDelayMs);
    }

    _clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }
}

window.SpeechRecognizer = SpeechRecognizer;
