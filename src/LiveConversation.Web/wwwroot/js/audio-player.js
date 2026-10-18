/**
 * AudioPlayer: Manages continuous sentence-level audio queue with Web Audio API.
 * Provides AnalyserNode for visualizer and instant interruption capability.
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
        
        // Callbacks
        this.onPlaybackStateChange = null; // (isPlaying) => {}
        this.onSentenceStart = null;       // (sentenceIndex, text) => {}
        this.onSentenceEnd = null;         // (sentenceIndex) => {}
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

    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
        if (this.currentSource) {
            this.currentSource.playbackRate.setValueAtTime(this.playbackRate, this.audioCtx.currentTime);
        }
    }

    /**
     * Enqueues an audio sentence for playback.
     */
    async enqueueSentence(sentenceIndex, text, base64Audio, isLast = false) {
        this._ensureAudioContext();

        try {
            const binaryString = atob(base64Audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer);
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
            console.error('Failed to decode sentence audio:', err);
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

    /**
     * Immediately stops playback and clears the queue (barge-in / interrupt).
     */
    stop() {
        this.queue = [];
        if (this.currentSource) {
            try {
                this.currentSource.onended = null;
                this.currentSource.stop();
            } catch (e) { /* ignore */ }
            this.currentSource = null;
        }
        this.isPlaying = false;
        this.currentSentence = null;
        if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
    }

    /**
     * Replays a specific audio buffer standalone (e.g., from transcript item).
     */
    async replayAudioBase64(base64Audio, rate = 1.0) {
        this._ensureAudioContext();
        try {
            const binaryString = atob(base64Audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer);
            const source = this.audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.setValueAtTime(rate, this.audioCtx.currentTime);
            source.connect(this.analyser);
            source.start(0);
        } catch (err) {
            console.error('Failed to replay sentence:', err);
        }
    }
}

window.AudioPlayer = AudioPlayer;
