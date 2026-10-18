/**
 * Visualizer: Renders modern fluid pulsing orb / audio wave on HTML Canvas.
 */
class Visualizer {
    constructor(canvas, audioPlayer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audioPlayer = audioPlayer;
        this.animationId = null;
        this.state = 'idle'; // 'idle', 'speaking', 'listening'
        this.angle = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());
        this.start();
    }

    _resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.width = this.canvas.width = rect.width * (window.devicePixelRatio || 1);
        this.height = this.canvas.height = rect.height * (window.devicePixelRatio || 1);
    }

    setState(state) {
        this.state = state;
    }

    start() {
        const render = () => {
            this._draw();
            this.animationId = requestAnimationFrame(render);
        };
        render();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    _draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // Get audio frequency if speaking
        let avgFreq = 0;
        let dataArray = null;

        if (this.state === 'speaking' && this.audioPlayer && this.audioPlayer.analyser) {
            const analyser = this.audioPlayer.analyser;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < 40; i++) {
                sum += dataArray[i];
            }
            avgFreq = (sum / 40) / 255; // 0 to 1
        }

        this.angle += 0.03;

        // Base radius
        const baseRadius = Math.min(w, h) * 0.28;
        const dynamicRadius = baseRadius + (avgFreq * 35);

        // Colors based on state
        let primaryColor, secondaryColor, glowColor;
        if (this.state === 'speaking') {
            primaryColor = 'rgba(236, 72, 153, 0.85)'; // Hot pink
            secondaryColor = 'rgba(99, 102, 241, 0.85)'; // Indigo
            glowColor = 'rgba(236, 72, 153, 0.4)';
        } else if (this.state === 'listening') {
            primaryColor = 'rgba(34, 197, 94, 0.85)'; // Green
            secondaryColor = 'rgba(16, 185, 129, 0.85)'; // Emerald
            glowColor = 'rgba(34, 197, 94, 0.4)';
        } else {
            // Idle
            primaryColor = 'rgba(99, 102, 241, 0.7)'; // Indigo
            secondaryColor = 'rgba(139, 92, 246, 0.6)'; // Purple
            glowColor = 'rgba(99, 102, 241, 0.25)';
        }

        // Draw outer glow circle
        const glowGrad = ctx.createRadialGradient(cx, cy, dynamicRadius * 0.5, cx, cy, dynamicRadius * 1.5);
        glowGrad.addColorStop(0, glowColor);
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, dynamicRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw multi-layer wave orb
        const numPoints = 64;
        const layers = [
            { radius: dynamicRadius * 1.05, alpha: 0.35, offset: this.angle * 1.2 },
            { radius: dynamicRadius * 0.95, alpha: 0.6, offset: -this.angle * 0.8 },
            { radius: dynamicRadius * 0.85, alpha: 0.9, offset: this.angle * 1.5 }
        ];

        layers.forEach((layer) => {
            ctx.beginPath();
            for (let i = 0; i <= numPoints; i++) {
                const theta = (i / numPoints) * Math.PI * 2;
                const wave = Math.sin(theta * 5 + layer.offset) * (avgFreq > 0.05 ? avgFreq * 18 : 6);
                const r = layer.radius + wave;
                const x = cx + Math.cos(theta) * r;
                const y = cy + Math.sin(theta) * r;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();

            const grad = ctx.createLinearGradient(cx - dynamicRadius, cy - dynamicRadius, cx + dynamicRadius, cy + dynamicRadius);
            grad.addColorStop(0, primaryColor);
            grad.addColorStop(1, secondaryColor);
            ctx.fillStyle = grad;
            ctx.globalAlpha = layer.alpha;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        });

        // Inner core
        const coreGrad = ctx.createRadialGradient(cx - 15, cy - 15, 5, cx, cy, dynamicRadius * 0.5);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.5, primaryColor);
        coreGrad.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, dynamicRadius * 0.45, 0, Math.PI * 2);
        ctx.fill();
    }
}

window.Visualizer = Visualizer;
