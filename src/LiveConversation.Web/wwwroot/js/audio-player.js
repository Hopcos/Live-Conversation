/**
 * AudioPlayer: Manages continuous sentence-level audio queue with Web Audio API.
 * Provides AnalyserNode for visualizer, zero-lock-in WebSpeech synthesis, and instant interruption.
 */
class AudioPlayer {
    constructor() {
        this.audioCtx = null;
        this.analyser = null;
        this.queue = [];
        this.isPlaying = false;
        this.currentSource = null;
        this.currentSentence = null;
        this.playbackRate = 1.0;
        this._currentReplayResolve = null;
        this._replayCancelled = false;
        this._currentWebUtterance = null;
        
        // Callbacks
        this.onPlaybackStateChange = null; // (isPlaying) => {}
        this.onSentenceStart = null;       // (sentenceIndex, text) => {}
        this.onSentenceEnd = null;         // (sentenceIndex) => {}

        // Preload WebSpeech voices
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.getVoices();
            };
        }
    }

    _ensureAudioContext() {
        if (!this.audioCtx) {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioCtxClass();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.analyser.connect(this.audioCtx.destination);
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    resetCancelState() {
        this._replayCancelled = false;
    }

    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
        if (this.currentSource && this.audioCtx) {
            try {
                this.currentSource.playbackRate.setValueAtTime(this.playbackRate, this.audioCtx.currentTime);
            } catch (e) { /* ignore */ }
        }
    }

    /**
     * Enqueues an audio sentence for playback.
     * If base64Audio is absent or decoding fails, smoothly falls back to browser native WebSpeech!
     */
    async enqueueSentence(sentenceIndex, text, base64Audio, isLast = false, countryCode = 'US') {
        this._replayCancelled = false; // Always clear cancellation on fresh incoming sentence!

        if (!base64Audio) {
            this.queue.push({
                sentenceIndex,
                text,
                useWebSpeech: true,
                countryCode,
                isLast
            });
            if (!this.isPlaying) {
                this._playNext();
            }
            return;
        }

        this._ensureAudioContext();

        try {
            const binaryString = atob(base64Audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
            this.queue.push({
                sentenceIndex,
                text,
                buffer: audioBuffer,
                isLast
            });

            if (!this.isPlaying) {
                this._playNext();
            }
        } catch (err) {
            console.warn('Failed to decode sentence audio, queuing for WebSpeech fallback:', err);
            this.queue.push({
                sentenceIndex,
                text,
                useWebSpeech: true,
                countryCode,
                isLast
            });
            if (!this.isPlaying) {
                this._playNext();
            }
        }
    }

    _playNext() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            this.currentSentence = null;
            if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
            return;
        }

        this.isPlaying = true;
        if (this.onPlaybackStateChange) this.onPlaybackStateChange(true);

        const item = this.queue.shift();
        this.currentSentence = item;

        if (this.onSentenceStart) {
            this.onSentenceStart(item.sentenceIndex, item.text);
        }

        if (item.useWebSpeech) {
            this._playWebSpeechDirect(item.text, item.countryCode, this.playbackRate, false).then(() => {
                if (this.onSentenceEnd) {
                    this.onSentenceEnd(item.sentenceIndex);
                }
                this._playNext();
            });
            return;
        }

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const source = this.audioCtx.createBufferSource();
        source.buffer = item.buffer;
        source.playbackRate.setValueAtTime(this.playbackRate, this.audioCtx.currentTime);
        source.connect(this.analyser);

        this.currentSource = source;

        source.onended = () => {
            if (this.onSentenceEnd) {
                this.onSentenceEnd(item.sentenceIndex);
            }
            this.currentSource = null;
            this._playNext();
        };

        source.start(0);
    }

    isReplayCancelled() {
        return !!this._replayCancelled;
    }

    /**
     * Immediately stops playback and clears the queue (barge-in / interrupt / replay-switch).
     */
    stop() {
        this.queue = [];
        this._replayCancelled = true;

        if ('speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch (e) { /* ignore */ }
        }

        if (this._currentReplayResolve) {
            const resolve = this._currentReplayResolve;
            this._currentReplayResolve = null;
            resolve();
        }

        if (this.currentSource) {
            try {
                const src = this.currentSource;
                this.currentSource = null;
                src.onended = null;
                src.stop();
            } catch (e) { /* ignore */ }
        }
        this.isPlaying = false;
        this.currentSentence = null;
        if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
    }

    /**
     * Matches system-installed voices to the persona's regional accent.
     */
    findWebSpeechVoice(countryCode) {
        if (!('speechSynthesis' in window)) return null;
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;

        const code = (countryCode || 'US').toUpperCase();
        const langMap = {
            'UK': ['en-GB', 'en-IE'],
            'GB': ['en-GB', 'en-IE'],
            'AU': ['en-AU', 'en-NZ'],
            'IN': ['en-IN', 'hi-IN'],
            'CA': ['en-CA', 'en-US'],
            'US': ['en-US'],
            'CN': ['zh-CN', 'zh'],
            'RO': ['ro-RO', 'ro'],
            'UA': ['uk-UA', 'uk']
        };
        const targetLangs = langMap[code] || ['en-US'];

        // 1. Exact BCP-47 language match
        for (const l of targetLangs) {
            const match = voices.find(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(l.toLowerCase()));
            if (match) return match;
        }

        // 2. Keyword in voice name
        const namePatterns = {
            'UK': ['united kingdom', 'great britain', 'uk', 'george', 'susan', 'oliver'],
            'AU': ['australia', 'australian', 'catherine', 'james'],
            'IN': ['india', 'indian', 'ravi', 'heera', 'neerja'],
            'CA': ['canada', 'canadian', 'clara'],
            'US': ['united states', 'david', 'zira', 'jenny', 'mark'],
            'CN': ['chinese', 'china', 'mandarin', 'xiaoxiao', 'huihui'],
            'RO': ['romania', 'romanian'],
            'UA': ['ukraine', 'ukrainian']
        };
        const patterns = namePatterns[code] || [];
        for (const p of patterns) {
            const match = voices.find(v => v.name && v.name.toLowerCase().includes(p));
            if (match) return match;
        }

        // 3. Fallback to any English voice or first voice
        return voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
    }

    /**
     * Speaks text using browser native speech synthesis (Web Speech API).
     */
    speakWebSpeech(text, countryCode = 'US', rate = 1.0) {
        this.stop();
        this._replayCancelled = false;
        return this._playWebSpeechDirect(text, countryCode, rate, false);
    }

    _playWebSpeechDirect(text, countryCode = 'US', rate = 1.0, isReplay = false) {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window) || !text) {
                resolve();
                return;
            }

            if (isReplay && this._replayCancelled) {
                resolve();
                return;
            }

            // Unpause speechSynthesis if Chrome suspended it
            try {
                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                }
            } catch (e) { /* ignore */ }

            const utterance = new SpeechSynthesisUtterance(text);
            const code = (countryCode || 'US').toUpperCase();
            const defaultLang = {
                'UK': 'en-GB', 'GB': 'en-GB', 'AU': 'en-AU', 'IN': 'en-IN',
                'CA': 'en-CA', 'CN': 'zh-CN', 'RO': 'ro-RO', 'UA': 'uk-UA', 'US': 'en-US'
            }[code] || 'en-US';

            const voice = this.findWebSpeechVoice(countryCode);
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang || defaultLang;
            } else {
                utterance.lang = defaultLang;
            }
            utterance.rate = Math.max(0.6, Math.min(1.5, rate));

            let finished = false;
            const cleanup = () => {
                if (finished) return;
                finished = true;
                this._currentWebUtterance = null;
                this._currentReplayResolve = null;
                this.isPlaying = false;
                if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
                resolve();
            };

            utterance.onstart = () => {
                this.isPlaying = true;
                if (this.onPlaybackStateChange) this.onPlaybackStateChange(true);
            };

            utterance.onend = cleanup;
            utterance.onerror = (e) => {
                console.warn('WebSpeech playback event:', e);
                cleanup();
            };

            // Keep reference to prevent Chromium garbage collection bug
            this._currentWebUtterance = utterance;
            this._currentReplayResolve = cleanup;

            try {
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                console.error('Failed to speak via WebSpeech:', err);
                cleanup();
            }
        });
    }

    /**
     * Replays a sequence of audio sentences sequentially at a custom rate (default 0.8x slow).
     * Stops any previous audio, handles cancellation cleanly, and prevents audio overlapping.
     */
    async replaySentenceList(sentenceList, rate = 0.8, countryCode = 'US') {
        if (!sentenceList || sentenceList.length === 0) return;

        this.stop();
        this._replayCancelled = false;

        for (const item of sentenceList) {
            if (this._replayCancelled) break;
            const b64 = (typeof item === 'string') ? item : item.audioBase64;
            const txt = (typeof item === 'string') ? '' : item.text;
            if (b64) {
                await this._playBufferDirect(b64, rate, true);
            } else if (txt) {
                await this._playWebSpeechDirect(txt, countryCode, rate, true);
            }
        }
    }

    /**
     * Replays a specific audio buffer standalone (e.g. Test Voice), returning a Promise that resolves
     * only when playback of this buffer finishes.
     */
    async replayAudioBase64(base64Audio, rate = 0.8) {
        this.stop();
        this._replayCancelled = false;
        return this._playBufferDirect(base64Audio, rate, false);
    }

    /**
     * Internal method to decode and play a single audio buffer, awaiting completion.
     */
    _playBufferDirect(base64Audio, rate = 0.8, isReplay = false) {
        this._ensureAudioContext();

        return new Promise(async (resolve) => {
            if (isReplay && this._replayCancelled) {
                resolve();
                return;
            }

            try {
                const binaryString = atob(base64Audio);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));

                if (isReplay && this._replayCancelled) {
                    resolve();
                    return;
                }

                if (this.audioCtx && this.audioCtx.state === 'suspended') {
                    await this.audioCtx.resume();
                }

                if (this.currentSource) {
                    try {
                        const prev = this.currentSource;
                        this.currentSource = null;
                        prev.onended = null;
                        prev.stop();
                    } catch (e) { /* ignore */ }
                }

                const source = this.audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.playbackRate.setValueAtTime(rate, this.audioCtx.currentTime);
                source.connect(this.analyser);

                this.currentSource = source;
                this.isPlaying = true;
                if (this.onPlaybackStateChange) this.onPlaybackStateChange(true);

                const onFinished = () => {
                    if (this.currentSource === source) {
                        this.currentSource = null;
                    }
                    this._currentReplayResolve = null;
                    this.isPlaying = false;
                    if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
                    resolve();
                };

                source.onended = onFinished;
                this._currentReplayResolve = onFinished;
                source.start(0);
            } catch (err) {
                console.error('Failed to replay sentence buffer:', err);
                resolve();
            }
        });
    }
}

window.AudioPlayer = AudioPlayer;
