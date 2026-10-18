/**
 * Main Application Orchestrator: SignalR, Voice Recognition, Audio Queue, and UI.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Internationalization & Theme Setup
    const i18n = new I18nManager();
    i18n.applyTranslations();

    function applyTheme(theme) {
        document.body.className = `${theme} min-h-screen flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white`;
        localStorage.setItem('live_conv_theme', theme);
    }

    const savedTheme = localStorage.getItem('live_conv_theme') || 'theme-cosmic';
    applyTheme(savedTheme);

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
        });
    });

    const langToggleBtn = document.getElementById('lang-toggle-btn');
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            const nextLang = i18n.currentLang === 'zh' ? 'en' : 'zh';
            i18n.setLanguage(nextLang);
            updateMicUi();
            if (state.currentPersona) {
                updatePersonaUi(state.currentPersona);
            }
        });
    }

    // 1. State
    const state = {
        currentCountry: 'US',
        currentScene: 'daily-chat',
        currentPersona: null,
        currentScenario: null,
        activeTtsProvider: 'EdgeTTS',
        mode: 'hands-free', // 'hands-free' or 'push-to-talk'
        isAiSpeaking: false,
        isListening: false,
        activeAssistantTurnElement: null,
        sentencesInTurn: [],
        coachingCards: [],
        settings: loadSettings()
    };

    // 2. Instantiate Audio, Speech, and Visualizer
    const audioPlayer = new AudioPlayer();
    const speechRecognizer = new SpeechRecognizer();
    const visualizerCanvas = document.getElementById('visualizer-canvas');
    const visualizer = new Visualizer(visualizerCanvas, audioPlayer);

    const sttLangSelect = document.getElementById('stt-lang-select');
    if (sttLangSelect) {
        sttLangSelect.addEventListener('change', (e) => {
            speechRecognizer.setRecognitionLanguage(e.target.value);
        });
    }

    audioPlayer.setPlaybackRate(state.settings.speakingRate || 1.0);

    // Audio Player State Hooks
    audioPlayer.onPlaybackStateChange = (isPlaying) => {
        state.isAiSpeaking = isPlaying;
        document.getElementById('interrupt-btn').disabled = !isPlaying;
        updateVisualizerState();

        // In hands-free mode, if AI finishes speaking, resume listening
        if (!isPlaying && state.mode === 'hands-free' && !state.isListening) {
            speechRecognizer.start();
        }
    };

    audioPlayer.onSentenceStart = (sentenceIndex, text) => {
        highlightSentenceInTranscript(sentenceIndex, true);
    };

    audioPlayer.onSentenceEnd = (sentenceIndex) => {
        highlightSentenceInTranscript(sentenceIndex, false);
    };

    // Speech Recognizer Hooks
    speechRecognizer.onStateChange = (isListening) => {
        state.isListening = isListening;
        updateMicUi();
        updateVisualizerState();
    };

    speechRecognizer.onInterimResult = (text) => {
        document.getElementById('speech-interim-text').textContent = text;
        document.getElementById('speech-interim-container').classList.remove('hidden');
    };

    speechRecognizer.onFinalResult = (text) => {
        document.getElementById('speech-interim-container').classList.add('hidden');
        document.getElementById('speech-interim-text').textContent = '';
        if (text.trim()) {
            sendUserSpeech(text);
        }
    };

    speechRecognizer.onError = (err) => {
        console.warn('Speech recognizer error:', err);
        showNotification(`Speech Recognition: ${err}`, 'warning');
    };

    function updateVisualizerState() {
        if (state.isAiSpeaking) {
            visualizer.setState('speaking');
        } else if (state.isListening) {
            visualizer.setState('listening');
        } else {
            visualizer.setState('idle');
        }
    }

    // 3. SignalR Setup
    const connection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/conversation')
        .withAutomaticReconnect()
        .build();

    // SignalR Handlers
    connection.on('SessionInitialized', (data) => {
        state.currentPersona = data.persona;
        state.currentScenario = data.scenario;
        state.activeTtsProvider = data.activeTtsProvider;

        updatePersonaUi(data.persona);
        updateScenarioUi(data.scenario);
        updateTtsBadge(state.settings.ttsProvider || data.activeTtsProvider);

        if (sttLangSelect && sttLangSelect.value !== 'auto') {
            speechRecognizer.setRecognitionLanguage(sttLangSelect.value);
        } else {
            speechRecognizer.setLanguageByCountry(data.persona.countryCode);
        }

        // Reset transcript
        document.getElementById('dialogue-stream').innerHTML = '';
        state.activeAssistantTurnElement = null;
        state.sentencesInTurn = [];
    });

    connection.on('ReceiveTextChunk', (token) => {
        ensureAssistantTurnElement();
        const contentSpan = state.activeAssistantTurnElement.querySelector('.turn-content');
        contentSpan.textContent += token;
        scrollToBottom();
    });

    connection.on('ReceiveSentenceAudio', (payload) => {
        audioPlayer.enqueueSentence(payload.sentenceIndex, payload.text, payload.audioBase64, payload.isLast);
        state.sentencesInTurn.push(payload);
    });

    connection.on('AiTurnCompleted', () => {
        attachReplayButtonsToTurn(state.activeAssistantTurnElement, state.sentencesInTurn);
        state.activeAssistantTurnElement = null;
        state.sentencesInTurn = [];
    });

    connection.on('ReceiveCoachFeedback', (feedback) => {
        renderCoachCard(feedback);
    });

    connection.on('ConversationInterrupted', () => {
        audioPlayer.stop();
        if (state.activeAssistantTurnElement) {
            attachReplayButtonsToTurn(state.activeAssistantTurnElement, state.sentencesInTurn);
            state.activeAssistantTurnElement = null;
            state.sentencesInTurn = [];
        }
        showNotification('Partner interrupted', 'info');
    });

    connection.on('ReceiveError', (errorMsg) => {
        state.activeAssistantTurnElement = null;
        state.sentencesInTurn = [];
        showNotification(errorMsg, 'error');
    });

    // Start SignalR
    try {
        await syncServerConfig();
        await connection.start();
        console.log('SignalR connected successfully.');
        document.getElementById('connection-status-dot').className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
        document.getElementById('connection-status-text').textContent = i18n.t('status_online');

        // Initialize default session
        await initSession();
    } catch (err) {
        console.error('SignalR connection failed:', err);
        document.getElementById('connection-status-dot').className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
        document.getElementById('connection-status-text').textContent = i18n.t('status_disconnected');
        showNotification('Failed to connect to server. Please refresh.', 'error');
    }

    // 4. Session & Messaging Methods
    async function initSession() {
        audioPlayer.stop();
        await connection.invoke('InitSession', state.currentCountry, state.currentScene, getClientSettingsPayload());
    }

    async function sendUserSpeech(text) {
        if (!text.trim()) return;

        // Barge-in: if partner is speaking, stop them
        if (state.isAiSpeaking) {
            audioPlayer.stop();
            await connection.invoke('Interrupt');
        }

        // Render user message bubble
        renderUserBubble(text);

        // Send to backend
        try {
            await connection.invoke('SendUserMessage', text, state.currentCountry, state.currentScene, getClientSettingsPayload());
        } catch (e) {
            showNotification(`Send failed: ${e.message}`, 'error');
        }
    }

    // 5. UI Render Helpers
    function renderUserBubble(text) {
        // Finalize previous assistant turn (e.g. welcome message) so next AI response creates a brand new bubble after this user bubble
        if (state.activeAssistantTurnElement) {
            attachReplayButtonsToTurn(state.activeAssistantTurnElement, state.sentencesInTurn);
            state.activeAssistantTurnElement = null;
            state.sentencesInTurn = [];
        }

        const stream = document.getElementById('dialogue-stream');
        const bubble = document.createElement('div');
        bubble.className = 'flex justify-end mb-4 animate-fade-in';
        bubble.innerHTML = `
            <div class="max-w-[80%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
                <div class="flex items-center space-x-2 mb-1 text-xs text-indigo-200">
                    <span>${i18n.t('you')}</span>
                    <span>•</span>
                    <span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p class="text-sm md:text-base leading-relaxed">${escapeHtml(text)}</p>
            </div>
        `;
        stream.appendChild(bubble);
        scrollToBottom();
    }

    function ensureAssistantTurnElement() {
        if (state.activeAssistantTurnElement) return;

        const stream = document.getElementById('dialogue-stream');
        const bubble = document.createElement('div');
        bubble.className = 'flex justify-start mb-4 animate-fade-in';
        bubble.innerHTML = `
            <div class="max-w-[85%] bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md">
                <div class="flex items-center justify-between mb-1.5 text-xs text-slate-400">
                    <div class="flex items-center space-x-2">
                        <span class="font-semibold text-indigo-400">${escapeHtml(state.currentPersona?.name || 'Partner')}</span>
                        <span>•</span>
                        <span>${state.currentPersona?.flagEmoji || '🗣️'} ${escapeHtml(state.currentPersona?.accentDescription || '')}</span>
                    </div>
                    <div class="sentence-replay-bar flex space-x-1"></div>
                </div>
                <p class="turn-content text-sm md:text-base leading-relaxed text-slate-200"></p>
            </div>
        `;
        stream.appendChild(bubble);
        state.activeAssistantTurnElement = bubble;
        scrollToBottom();
    }

    function highlightSentenceInTranscript(sentenceIndex, isPlaying) {
        // Can optionally highlight specific sentence if needed
    }

    function attachReplayButtonsToTurn(turnElement, sentences) {
        if (!turnElement || !sentences || sentences.length === 0) return;
        const replayBar = turnElement.querySelector('.sentence-replay-bar');
        if (!replayBar) return;

        const replayBtn = document.createElement('button');
        replayBtn.className = 'px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center space-x-1 transition';
        replayBtn.innerHTML = `<span>${i18n.t('replay_btn')}</span>`;
        replayBtn.onclick = async () => {
            for (const s of sentences) {
                await audioPlayer.replayAudioBase64(s.audioBase64, 0.8);
            }
        };
        replayBar.appendChild(replayBtn);
    }

    function renderCoachCard(feedback) {
        const container = document.getElementById('coach-cards-stream');
        const emptyState = document.getElementById('coach-empty-state');
        if (emptyState) emptyState.classList.add('hidden');

        const card = document.createElement('div');
        card.className = 'bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 mb-3 shadow-lg animate-fade-in';

        let badge = feedback.hasIssues 
            ? `<span class="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">Needs Polish</span>`
            : `<span class="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Natural & Clear</span>`;

        card.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-slate-400 font-mono">“${escapeHtml(feedback.originalText)}”</span>
                ${badge}
            </div>
            ${feedback.correctedText ? `
            <div class="mb-2">
                <div class="text-xs text-slate-400 font-medium">${i18n.t('coach_correction')}</div>
                <div class="text-sm text-emerald-400 font-medium">${escapeHtml(feedback.correctedText)}</div>
            </div>` : ''}
            ${feedback.nativeAlternative ? `
            <div class="mb-2">
                <div class="text-xs text-slate-400 font-medium">${i18n.t('coach_native')}</div>
                <div class="text-sm text-indigo-300 font-medium">${escapeHtml(feedback.nativeAlternative)}</div>
            </div>` : ''}
            ${feedback.explanation ? `
            <div class="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 mt-2">
                <span class="text-indigo-400 font-semibold">${i18n.t('coach_explanation')} </span>${escapeHtml(feedback.explanation)}
            </div>` : ''}
            ${feedback.vocabularyHighlight ? `
            <div class="mt-2 text-xs text-slate-400">
                <span class="text-amber-400 font-medium">${i18n.t('coach_spotlight')} </span> <span class="text-slate-200 underline decoration-indigo-500 underline-offset-2">${escapeHtml(feedback.vocabularyHighlight)}</span>
            </div>` : ''}
        `;

        container.prepend(card);

        // Update badge count
        const badgeElem = document.getElementById('coach-tab-badge');
        if (badgeElem) {
            state.coachingCards.push(feedback);
            badgeElem.textContent = state.coachingCards.length;
            badgeElem.classList.remove('hidden');
        }
    }

    function updatePersonaUi(persona) {
        document.getElementById('persona-flag').textContent = persona.flagEmoji;
        document.getElementById('persona-name').textContent = persona.name;
        document.getElementById('persona-title').textContent = persona.title;
        document.getElementById('persona-accent-badge').textContent = `${persona.countryCode} • ${persona.accentDescription}`;

        // Suggested topics
        const topicsContainer = document.getElementById('suggested-topics');
        topicsContainer.innerHTML = '';
        (persona.suggestedTopics || []).forEach(topic => {
            const pill = document.createElement('button');
            pill.className = 'text-xs px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition';
            pill.textContent = topic;
            pill.onclick = () => {
                if (state.currentCountry === 'CN') {
                    sendUserSpeech(`你好！我想和你聊聊关于${topic}的话题。`);
                } else {
                    sendUserSpeech(`Let's talk about ${topic}. What are your thoughts on that?`);
                }
            };
            topicsContainer.appendChild(pill);
        });
    }

    function updateScenarioUi(scenario) {
        document.getElementById('scenario-icon').textContent = scenario.icon;
        document.getElementById('scenario-title').textContent = scenario.title;
        document.getElementById('scenario-desc').textContent = scenario.description;
    }

    function updateTtsBadge(provider) {
        const badge = document.getElementById('active-tts-badge');
        if (!badge) return;
        if (provider === 'ElevenLabs') {
            badge.textContent = 'ElevenLabs (Turbo v2.5)';
            badge.className = 'text-xs px-2.5 py-1 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30';
        } else if (provider === 'OpenAITTS') {
            badge.textContent = 'OpenAI TTS (tts-1)';
            badge.className = 'text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        } else {
            badge.textContent = 'Edge-TTS (Neural)';
            badge.className = 'text-xs px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30';
        }
    }

    function updateMicUi() {
        const micBtn = document.getElementById('mic-main-btn');
        const micIcon = document.getElementById('mic-icon');
        const micStatusText = document.getElementById('mic-status-text');

        if (state.isListening) {
            micBtn.className = 'w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-600/50 transition-all transform scale-105 pulse-ring';
            micStatusText.textContent = state.mode === 'hands-free' 
                ? i18n.t('mic_status_listening') 
                : i18n.t('mic_status_recording');
            micStatusText.className = 'text-xs text-rose-400 font-medium';
        } else {
            micBtn.className = 'w-16 h-16 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/40 transition-all transform hover:scale-105';
            micStatusText.textContent = state.mode === 'hands-free' 
                ? i18n.t('mic_status_hands_free_idle') 
                : i18n.t('mic_status_push_idle');
            micStatusText.className = 'text-xs text-slate-400';
        }
    }

    function scrollToBottom() {
        const stream = document.getElementById('dialogue-stream');
        stream.scrollTop = stream.scrollHeight;
    }

    // 6. User Control Listeners
    // Country buttons
    document.querySelectorAll('.country-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const country = btn.dataset.country;
            if (state.currentCountry === country) return;

            document.querySelectorAll('.country-btn').forEach(b => {
                b.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
                b.classList.add('bg-slate-800', 'text-slate-300');
            });
            btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.remove('bg-slate-800', 'text-slate-300');

            state.currentCountry = country;
            await initSession();
        });
    });

    // Scenario buttons
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const scene = btn.dataset.scene;
            if (state.currentScene === scene) return;

            document.querySelectorAll('.scenario-btn').forEach(b => {
                b.classList.remove('bg-indigo-600/30', 'border-indigo-500', 'text-indigo-200');
                b.classList.add('bg-slate-800/60', 'border-slate-700', 'text-slate-300');
            });
            btn.classList.add('bg-indigo-600/30', 'border-indigo-500', 'text-indigo-200');
            btn.classList.remove('bg-slate-800/60', 'border-slate-700', 'text-slate-300');

            state.currentScene = scene;
            await initSession();
        });
    });

    // Mode Selector (Hands-Free vs Push-To-Talk)
    document.getElementById('mode-hands-free').addEventListener('click', () => {
        state.mode = 'hands-free';
        speechRecognizer.setMode('hands-free');
        document.getElementById('mode-hands-free').classList.add('bg-indigo-600', 'text-white');
        document.getElementById('mode-hands-free').classList.remove('text-slate-400');
        document.getElementById('mode-push-to-talk').classList.remove('bg-indigo-600', 'text-white');
        document.getElementById('mode-push-to-talk').classList.add('text-slate-400');
        updateMicUi();
        speechRecognizer.start();
    });

    document.getElementById('mode-push-to-talk').addEventListener('click', () => {
        state.mode = 'push-to-talk';
        speechRecognizer.setMode('push-to-talk');
        speechRecognizer.stop();
        document.getElementById('mode-push-to-talk').classList.add('bg-indigo-600', 'text-white');
        document.getElementById('mode-push-to-talk').classList.remove('text-slate-400');
        document.getElementById('mode-hands-free').classList.remove('bg-indigo-600', 'text-white');
        document.getElementById('mode-hands-free').classList.add('text-slate-400');
        updateMicUi();
    });

    // Mic Button
    const micBtn = document.getElementById('mic-main-btn');
    micBtn.addEventListener('click', () => {
        if (state.mode === 'hands-free') {
            if (state.isListening) {
                speechRecognizer.stop();
            } else {
                speechRecognizer.start();
            }
        }
    });

    // Push-to-talk mouse/touch events
    micBtn.addEventListener('mousedown', () => {
        if (state.mode === 'push-to-talk') {
            speechRecognizer.start();
        }
    });
    micBtn.addEventListener('mouseup', () => {
        if (state.mode === 'push-to-talk') {
            speechRecognizer.stop();
        }
    });

    // Keyboard Space shortcut
    let spaceKeyDown = false;
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            spaceKeyDown = true;
            if (state.isAiSpeaking) {
                audioPlayer.stop();
                connection.invoke('Interrupt');
            }
            speechRecognizer.start();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && spaceKeyDown && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            spaceKeyDown = false;
            if (state.mode === 'push-to-talk') {
                speechRecognizer.stop();
            }
        }
    });

    // Interrupt button
    document.getElementById('interrupt-btn').addEventListener('click', () => {
        audioPlayer.stop();
        connection.invoke('Interrupt');
    });

    // Text Input Fallback
    const textInput = document.getElementById('text-input-field');
    const sendBtn = document.getElementById('text-send-btn');
    const handleSendText = () => {
        const text = textInput.value.trim();
        if (text) {
            textInput.value = '';
            sendUserSpeech(text);
        }
    };
    sendBtn.addEventListener('click', handleSendText);
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSendText();
    });

    // Tabs (Dialogue vs Coach)
    document.getElementById('tab-dialogue').addEventListener('click', () => {
        document.getElementById('panel-dialogue').classList.remove('hidden');
        document.getElementById('panel-coach').classList.add('hidden');
        document.getElementById('tab-dialogue').classList.add('border-indigo-500', 'text-indigo-400');
        document.getElementById('tab-dialogue').classList.remove('border-transparent', 'text-slate-400');
        document.getElementById('tab-coach').classList.remove('border-indigo-500', 'text-indigo-400');
        document.getElementById('tab-coach').classList.add('border-transparent', 'text-slate-400');
    });

    document.getElementById('tab-coach').addEventListener('click', () => {
        document.getElementById('panel-coach').classList.remove('hidden');
        document.getElementById('panel-dialogue').classList.add('hidden');
        document.getElementById('tab-coach').classList.add('border-indigo-500', 'text-indigo-400');
        document.getElementById('tab-coach').classList.remove('border-transparent', 'text-slate-400');
        document.getElementById('tab-dialogue').classList.remove('border-indigo-500', 'text-indigo-400');
        document.getElementById('tab-dialogue').classList.add('border-transparent', 'text-slate-400');
    });

    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('open-settings-btn').addEventListener('click', () => {
        populateSettingsForm();
        settingsModal.classList.remove('hidden');
    });
    document.getElementById('close-settings-btn').addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });
    document.getElementById('save-settings-btn').addEventListener('click', async () => {
        saveSettingsFromForm();
        settingsModal.classList.add('hidden');
        showNotification('Settings saved successfully!', 'success');
        updateTtsBadge(state.settings.ttsProvider);
        audioPlayer.setPlaybackRate(state.settings.speakingRate || 1.0);
        await initSession();
    });

    // Test TTS button in settings modal
    document.getElementById('test-tts-btn').addEventListener('click', async () => {
        const engine = document.getElementById('settings-tts-provider').value;
        const elevenKey = document.getElementById('settings-elevenlabs-key').value;
        const testText = "Hello! This is a test of your speech synthesis settings.";

        const voiceId = engine === 'ElevenLabs' ? (state.currentPersona?.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM') : (state.currentPersona?.edgeTtsVoiceName || 'en-US-JennyNeural');

        try {
            document.getElementById('test-tts-btn').textContent = 'Testing...';
            const base64 = await connection.invoke('TestTts', testText, engine, voiceId, elevenKey);
            await audioPlayer.replayAudioBase64(base64, 1.0);
            showNotification('TTS test played successfully!', 'success');
        } catch (e) {
            showNotification(`TTS test failed: ${e.message}`, 'error');
        } finally {
            document.getElementById('test-tts-btn').textContent = '🔊 Test Voice';
        }
    });

    // 7. Settings Storage Helpers
    function loadSettings() {
        return {
            ttsProvider: localStorage.getItem('live_conv_tts_provider') || '',
            elevenLabsApiKey: localStorage.getItem('live_conv_elevenlabs_key') || '',
            llmApiKey: localStorage.getItem('live_conv_llm_key') || '',
            llmEndpoint: localStorage.getItem('live_conv_llm_endpoint') || '',
            llmModel: localStorage.getItem('live_conv_llm_model') || '',
            speakingRate: parseFloat(localStorage.getItem('live_conv_rate') || '1.0')
        };
    }

    async function syncServerConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const cfg = await res.json();
                if (!state.settings.ttsProvider && cfg.ttsProvider) {
                    state.settings.ttsProvider = cfg.ttsProvider;
                }
                if (!state.settings.llmEndpoint && cfg.llmEndpoint) {
                    state.settings.llmEndpoint = cfg.llmEndpoint;
                }
                if (!state.settings.llmModel && cfg.llmModel) {
                    state.settings.llmModel = cfg.llmModel;
                }
                updateTtsBadge(state.settings.ttsProvider || cfg.ttsProvider || 'ElevenLabs');
            }
        } catch (e) {
            console.warn('Could not sync server config:', e);
        }
    }

    function populateSettingsForm() {
        document.getElementById('settings-tts-provider').value = state.settings.ttsProvider || 'ElevenLabs';
        document.getElementById('settings-elevenlabs-key').value = state.settings.elevenLabsApiKey;
        document.getElementById('settings-llm-key').value = state.settings.llmApiKey;
        document.getElementById('settings-llm-endpoint').value = state.settings.llmEndpoint;
        document.getElementById('settings-llm-model').value = state.settings.llmModel;
        document.getElementById('settings-rate').value = state.settings.speakingRate;
        document.getElementById('settings-rate-val').textContent = `${state.settings.speakingRate}x`;
    }

    function saveSettingsFromForm() {
        state.settings.ttsProvider = document.getElementById('settings-tts-provider').value;
        state.settings.elevenLabsApiKey = document.getElementById('settings-elevenlabs-key').value.trim();
        state.settings.llmApiKey = document.getElementById('settings-llm-key').value.trim();
        state.settings.llmEndpoint = document.getElementById('settings-llm-endpoint').value.trim();
        state.settings.llmModel = document.getElementById('settings-llm-model').value.trim();
        state.settings.speakingRate = parseFloat(document.getElementById('settings-rate').value);

        localStorage.setItem('live_conv_tts_provider', state.settings.ttsProvider);
        localStorage.setItem('live_conv_elevenlabs_key', state.settings.elevenLabsApiKey);
        localStorage.setItem('live_conv_llm_key', state.settings.llmApiKey);
        localStorage.setItem('live_conv_llm_endpoint', state.settings.llmEndpoint);
        localStorage.setItem('live_conv_llm_model', state.settings.llmModel);
        localStorage.setItem('live_conv_rate', state.settings.speakingRate.toString());
    }

    function getClientSettingsPayload() {
        return {
            ttsProvider: state.settings.ttsProvider || null,
            elevenLabsApiKey: state.settings.elevenLabsApiKey || null,
            llmApiKey: state.settings.llmApiKey || null,
            llmEndpoint: state.settings.llmEndpoint || null,
            llmModel: state.settings.llmModel || null,
            speakingRate: state.settings.speakingRate
        };
    }

    function showNotification(msg, type = 'info') {
        const toast = document.createElement('div');
        const colorClass = type === 'error' ? 'bg-rose-600' : (type === 'warning' ? 'bg-amber-600' : 'bg-indigo-600');
        toast.className = `fixed bottom-6 right-6 ${colorClass} text-white px-4 py-2.5 rounded-lg shadow-xl text-sm z-50 animate-bounce`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Rate slider input handler
    document.getElementById('settings-rate').addEventListener('input', (e) => {
        document.getElementById('settings-rate-val').textContent = `${e.target.value}x`;
    });
});
