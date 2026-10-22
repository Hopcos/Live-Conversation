/**
 * Main Application Orchestrator: SignalR, Voice Recognition, Audio Queue, and UI.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Internationalization & Theme Setup
    const i18n = new I18nManager();
    i18n.applyTranslations();

    function applyTheme(theme) {
        document.body.className = `${theme} min-h-screen lg:h-screen lg:overflow-hidden flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white`;
        localStorage.setItem('live_conv_theme', theme);
        if (theme === 'theme-light') {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
        document.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.dataset.theme === theme) {
                btn.classList.add('bg-slate-700', 'ring-1', 'ring-indigo-400');
            } else {
                btn.classList.remove('bg-slate-700', 'ring-1', 'ring-indigo-400');
            }
        });
    }

    function updateDynamicDialogueLang() {
        document.querySelectorAll('.replay-btn-text').forEach(el => {
            el.textContent = i18n.t('replay_btn');
        });
        document.querySelectorAll('.coach-hint-lbl').forEach(el => {
            el.textContent = i18n.t('coach_hint_label');
        });
        document.querySelectorAll('.coach-hint-switch').forEach(el => {
            el.textContent = i18n.t('coach_hint_switch');
        });
        document.querySelectorAll('.coach-hint-praise').forEach(el => {
            el.textContent = i18n.t('coach_hint_praise');
        });
        document.querySelectorAll('.coach-badge').forEach(el => {
            const hasIssues = el.getAttribute('data-has-issues') === 'true';
            el.textContent = hasIssues ? i18n.t('coach_badge_needs_polish') : i18n.t('coach_badge_natural');
        });
    }

    const savedTheme = localStorage.getItem('live_conv_theme') || 'theme-cosmic';
    applyTheme(savedTheme);

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
        });
    });

    // Persona & Scenario Collapsible Panel Toggle State (默认为向上折叠)
    const collapseBtn = document.getElementById('toggle-persona-scenario-btn');
    const collapseContent = document.getElementById('persona-scenario-content');
    const collapseChevron = document.getElementById('collapse-chevron');
    const collapseToggleText = document.getElementById('collapse-toggle-text');
    let isPersonaScenarioCollapsed = true;

    function updateCollapseUi() {
        if (!collapseContent || !collapseChevron || !collapseToggleText) return;
        if (isPersonaScenarioCollapsed) {
            collapseContent.classList.add('hidden');
            collapseChevron.textContent = '▼';
            collapseToggleText.setAttribute('data-i18n', 'collapse_expand');
            collapseToggleText.textContent = i18n.t('collapse_expand');
        } else {
            collapseContent.classList.remove('hidden');
            collapseChevron.textContent = '▲';
            collapseToggleText.setAttribute('data-i18n', 'collapse_hide');
            collapseToggleText.textContent = i18n.t('collapse_hide');
        }
    }

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            isPersonaScenarioCollapsed = !isPersonaScenarioCollapsed;
            updateCollapseUi();
        });
    }

    const langToggleBtn = document.getElementById('lang-toggle-btn');
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            const nextLang = i18n.currentLang === 'zh' ? 'en' : 'zh';
            i18n.setLanguage(nextLang);
            updateMicUi();
            updateCollapseUi();
            updateSttUi();
            if (state.currentPersona) {
                updatePersonaUi(state.currentPersona);
            }
            if (state.currentScenario) {
                updateScenarioUi(state.currentScenario);
            }
            if (typeof updateTooltipsLang === 'function') {
                updateTooltipsLang();
            }
            updateDynamicDialogueLang();
        });
    }

    // 1. State
    const state = {
        currentCountry: 'US',
        currentScene: 'daily-chat',
        currentPersona: null,
        currentScenario: null,
        allPersonas: [],
        allScenarios: [],
        activeTtsProvider: 'EdgeTTS',
        mode: 'hands-free', // 'hands-free' or 'push-to-talk'
        isAiSpeaking: false,
        isAiThinking: false,
        isListening: false,
        handsFreePaused: false,
        cooldownTimer: null,
        activeAssistantTurnElement: null,
        sentencesInTurn: [],
        coachingCards: [],
        settings: loadSettings()
    };

    // 2. Instantiate Audio, Speech, and Visualizer
    const audioPlayer = new AudioPlayer();
    const speechRecognizer = new SpeechRecognizer();
    speechRecognizer.setEngine(state.settings.sttProvider || 'WebSpeech');

    const visualizerCanvas = document.getElementById('visualizer-canvas');
    const visualizer = new Visualizer(visualizerCanvas, audioPlayer);

    const sttLangSelect = document.getElementById('stt-lang-select');
    if (sttLangSelect) {
        if (state.settings.sttLanguage) {
            sttLangSelect.value = state.settings.sttLanguage;
        }
        sttLangSelect.addEventListener('change', (e) => {
            state.settings.sttLanguage = e.target.value;
            localStorage.setItem('live_conv_stt_lang', e.target.value);
            speechRecognizer.setRecognitionLanguage(e.target.value);
        });
    }

    audioPlayer.setPlaybackRate(state.settings.speakingRate || 1.0);

    // Audio Player State Hooks
    audioPlayer.onPlaybackStateChange = (isPlaying) => {
        state.isAiSpeaking = isPlaying;
        if (isPlaying) {
            state.isAiThinking = false;
            // Block speech recognizer while AI voice is coming out of speakers
            speechRecognizer.setBlocked(true);
        }
        document.getElementById('interrupt-btn').disabled = !isPlaying && !state.isAiThinking;
        updateVisualizerState();
        updateMicUi();
    };

    // Triggered ONLY after ALL sentences in the AI turn are completely played and silent
    audioPlayer.onTurnPlaybackComplete = () => {
        state.isAiSpeaking = false;
        state.isAiThinking = false;
        updateVisualizerState();
        updateMicUi();

        // Echo-prevention grace period: wait 400ms for room reverb/speaker tail to die down
        clearTimeout(state.cooldownTimer);
        state.cooldownTimer = setTimeout(() => {
            speechRecognizer.setBlocked(false);
            if (state.mode === 'hands-free' && !state.handsFreePaused) {
                speechRecognizer.start();
            }
            updateMicUi();
        }, 400);
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

    speechRecognizer.onAudioResult = ({ audioBase64, mimeType }) => {
        document.getElementById('speech-interim-container').classList.add('hidden');
        document.getElementById('speech-interim-text').textContent = '';
        if (audioBase64) {
            sendUserAudio(audioBase64, mimeType);
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
        if (data.allPersonas) state.allPersonas = data.allPersonas;
        if (data.allScenarios) state.allScenarios = data.allScenarios;

        updatePersonaUi(data.persona);
        updateScenarioUi(data.scenario);
        updateTtsBadge(state.settings.ttsProvider || data.activeTtsProvider);
        updateSttUi();
        updateTooltipsLang();

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
        state.isAiThinking = true;
        speechRecognizer.setBlocked(true);
        ensureAssistantTurnElement();
        const contentSpan = state.activeAssistantTurnElement.querySelector('.turn-content');
        contentSpan.textContent += token;
        updateMicUi();
        scrollToBottom();
    });

    connection.on('ReceiveSentenceAudio', (payload) => {
        const country = state.currentPersona?.countryCode || 'US';
        audioPlayer.enqueueSentence(payload.sentenceIndex, payload.text, payload.audioBase64, payload.isLast, country);
        ensureAssistantTurnElement();
        if (state.activeAssistantTurnElement) {
            if (!state.activeAssistantTurnElement._turnSentences) {
                state.activeAssistantTurnElement._turnSentences = [];
            }
            state.activeAssistantTurnElement._turnSentences.push(payload);
        }
    });

    connection.on('AiTurnCompleted', () => {
        if (state.activeAssistantTurnElement) {
            attachReplayButtonsToTurn(state.activeAssistantTurnElement);
            state.activeAssistantTurnElement = null;
        }
        audioPlayer.markAiTurnStreamingFinished();
    });

    connection.on('ReceiveCoachFeedback', (feedback) => {
        renderCoachCard(feedback);
    });

    connection.on('ReceiveUserTranscript', (userText) => {
        if (userText && userText.trim()) {
            renderUserBubble(userText.trim());
        } else {
            showNotification('No speech recognized by Whisper. Please try speaking again.', 'warning');
        }
    });

    connection.on('ConversationInterrupted', () => {
        clearTimeout(state.cooldownTimer);
        audioPlayer.stop();
        state.isAiThinking = false;
        state.isAiSpeaking = false;
        speechRecognizer.setBlocked(false);
        if (state.activeAssistantTurnElement) {
            attachReplayButtonsToTurn(state.activeAssistantTurnElement);
            state.activeAssistantTurnElement = null;
        }
        if (state.mode === 'hands-free' && !state.handsFreePaused) {
            speechRecognizer.start();
        }
        updateMicUi();
        updateVisualizerState();
        showNotification('Partner interrupted', 'info');
    });

    connection.on('ReceiveError', (errorMsg) => {
        clearTimeout(state.cooldownTimer);
        audioPlayer.stop();
        state.isAiThinking = false;
        state.isAiSpeaking = false;
        speechRecognizer.setBlocked(false);
        state.activeAssistantTurnElement = null;
        if (state.mode === 'hands-free' && !state.handsFreePaused) {
            speechRecognizer.start();
        }
        updateMicUi();
        updateVisualizerState();
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
        clearTimeout(state.cooldownTimer);
        audioPlayer.stop();
        audioPlayer.resetCancelState();
        audioPlayer.resetTurn();
        state.isAiSpeaking = false;
        state.isAiThinking = true;
        speechRecognizer.setBlocked(true);
        updateMicUi();
        await connection.invoke('InitSession', state.currentCountry, state.currentScene, getClientSettingsPayload());
    }

    async function sendUserSpeech(text) {
        if (!text.trim()) return;

        // Barge-in: if partner is speaking, stop them
        if (state.isAiSpeaking) {
            audioPlayer.stop();
            await connection.invoke('Interrupt');
        }

        state.isAiThinking = true;
        state.isAiSpeaking = false;
        speechRecognizer.setBlocked(true);
        audioPlayer.resetTurn();
        updateMicUi();
        updateVisualizerState();

        // Render user message bubble
        renderUserBubble(text);

        // Send to backend
        try {
            await connection.invoke('SendUserMessage', text, state.currentCountry, state.currentScene, getClientSettingsPayload());
        } catch (e) {
            state.isAiThinking = false;
            speechRecognizer.setBlocked(false);
            if (state.mode === 'hands-free' && !state.handsFreePaused) {
                speechRecognizer.start();
            }
            updateMicUi();
            showNotification(`Send failed: ${e.message}`, 'error');
        }
    }

    async function sendUserAudio(audioBase64, mimeType) {
        if (!audioBase64) return;

        // Barge-in: if partner is speaking, stop them
        if (state.isAiSpeaking) {
            audioPlayer.stop();
            await connection.invoke('Interrupt');
        }

        state.isAiThinking = true;
        state.isAiSpeaking = false;
        speechRecognizer.setBlocked(true);
        audioPlayer.resetTurn();
        updateMicUi();
        updateVisualizerState();

        showNotification(i18n.t('whisper_transcribing'), 'info');

        // Send to backend Whisper STT
        try {
            await connection.invoke('SendUserAudio', audioBase64, mimeType, state.currentCountry, state.currentScene, getClientSettingsPayload());
        } catch (e) {
            state.isAiThinking = false;
            speechRecognizer.setBlocked(false);
            if (state.mode === 'hands-free' && !state.handsFreePaused) {
                speechRecognizer.start();
            }
            updateMicUi();
            showNotification(`Audio STT failed: ${e.message}`, 'error');
        }
    }

    // 5. UI Render Helpers
    function renderUserBubble(text) {
        // Finalize previous assistant turn (e.g. welcome message) so next AI response creates a brand new bubble after this user bubble
        if (state.activeAssistantTurnElement) {
            attachReplayButtonsToTurn(state.activeAssistantTurnElement);
            state.activeAssistantTurnElement = null;
        }

        const stream = document.getElementById('dialogue-stream');
        const bubble = document.createElement('div');
        bubble.className = 'flex justify-end mb-4 animate-fade-in';
        bubble._userText = text;
        bubble._hasCoachAttached = false;
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
        bubble._turnSentences = [];
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

    function attachReplayButtonsToTurn(turnElement) {
        if (!turnElement) return;
        const replayBar = turnElement.querySelector('.sentence-replay-bar');
        if (!replayBar || replayBar.querySelector('button')) return;

        const turnSentences = turnElement._turnSentences && turnElement._turnSentences.length > 0
            ? [...turnElement._turnSentences]
            : [];

        if (turnSentences.length === 0) return;

        const replayBtn = document.createElement('button');
        replayBtn.className = 'px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center space-x-1 transition';
        replayBtn.innerHTML = `<span class="replay-btn-text" data-i18n="replay_btn">${i18n.t('replay_btn')}</span>`;
        replayBtn.onclick = async () => {
            replayBtn.disabled = true;
            replayBtn.classList.add('opacity-75');
            replayBtn.innerHTML = `<span>${i18n.t('replay_loading')}</span>`;

            try {
                const country = state.currentPersona?.countryCode || 'US';
                await audioPlayer.replaySentenceList(turnSentences, 0.8, country);
            } finally {
                replayBtn.disabled = false;
                replayBtn.classList.remove('opacity-75');
                replayBtn.innerHTML = `<span class="replay-btn-text" data-i18n="replay_btn">${i18n.t('replay_btn')}</span>`;
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

        const badgeText = feedback.hasIssues ? i18n.t('coach_badge_needs_polish') : i18n.t('coach_badge_natural');
        const badgeClass = feedback.hasIssues 
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        const badge = `<span class="coach-badge px-2 py-0.5 rounded text-xs border ${badgeClass}" data-has-issues="${feedback.hasIssues}">${badgeText}</span>`;

        card.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-slate-400 font-mono">“${escapeHtml(feedback.originalText)}”</span>
                ${badge}
            </div>
            ${feedback.correctedText ? `
            <div class="mb-2">
                <div class="text-xs text-slate-400 font-medium" data-i18n="coach_correction">${i18n.t('coach_correction')}</div>
                <div class="text-sm text-emerald-400 font-medium">${escapeHtml(feedback.correctedText)}</div>
            </div>` : ''}
            ${feedback.nativeAlternative ? `
            <div class="mb-2">
                <div class="text-xs text-slate-400 font-medium" data-i18n="coach_native">${i18n.t('coach_native')}</div>
                <div class="text-sm text-indigo-300 font-medium">${escapeHtml(feedback.nativeAlternative)}</div>
            </div>` : ''}
            ${feedback.explanation ? `
            <div class="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 mt-2">
                <span class="text-indigo-400 font-semibold" data-i18n="coach_explanation">${i18n.t('coach_explanation')} </span>${escapeHtml(feedback.explanation)}
            </div>` : ''}
            ${feedback.vocabularyHighlight ? `
            <div class="mt-2 text-xs text-slate-400">
                <span class="text-amber-400 font-medium" data-i18n="coach_spotlight">${i18n.t('coach_spotlight')} </span> <span class="text-slate-200 underline decoration-indigo-500 underline-offset-2">${escapeHtml(feedback.vocabularyHighlight)}</span>
            </div>` : ''}
        `;

        container.appendChild(card);
        scrollCoachToBottom(true);

        // Update badge count and highlight tab
        const badgeElem = document.getElementById('coach-tab-badge');
        if (badgeElem) {
            state.coachingCards.push(feedback);
            badgeElem.textContent = state.coachingCards.length;
            badgeElem.classList.remove('hidden');
            if (feedback.hasIssues) {
                badgeElem.className = 'px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-mono animate-bounce';
            }
        }

        // Attach inline hint to the user's bubble in the live dialogue stream
        const userBubbles = document.querySelectorAll('#dialogue-stream > div.justify-end');
        for (let i = userBubbles.length - 1; i >= 0; i--) {
            const b = userBubbles[i];
            if (b._userText === feedback.originalText || !b._hasCoachAttached) {
                b._hasCoachAttached = true;
                const innerBox = b.querySelector('.bg-indigo-600');
                if (innerBox && !innerBox.querySelector('.coach-hint-box')) {
                    const hintDiv = document.createElement('div');
                    hintDiv.className = 'coach-hint-box mt-2 pt-2 border-t border-indigo-400/40 flex flex-col space-y-1 text-xs cursor-pointer hover:bg-indigo-700/60 p-1.5 rounded-lg transition';
                    if (feedback.hasIssues) {
                        hintDiv.innerHTML = `
                            <div class="flex items-center space-x-1.5 text-amber-200 font-medium">
                                <span class="coach-hint-lbl" data-i18n="coach_hint_label">${i18n.t('coach_hint_label')}</span>
                                <span class="underline decoration-amber-400">${escapeHtml(feedback.correctedText || '')}</span>
                            </div>
                            <div class="text-[11px] text-indigo-200 coach-hint-switch" data-i18n="coach_hint_switch">${i18n.t('coach_hint_switch')}</div>
                        `;
                    } else {
                        hintDiv.innerHTML = `
                            <div class="flex items-center space-x-1.5 text-emerald-200 text-[11px]">
                                <span>✨</span>
                                <span class="coach-hint-praise" data-i18n="coach_hint_praise">${i18n.t('coach_hint_praise')}</span>
                                <span class="font-medium">${escapeHtml(feedback.nativeAlternative || '')}</span>
                            </div>
                        `;
                    }
                    hintDiv.onclick = () => {
                        document.getElementById('tab-coach').click();
                        setTimeout(() => {
                            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }, 50);
                    };
                    innerBox.appendChild(hintDiv);
                }
                break;
            }
        }

        if (feedback.hasIssues) {
            showNotification(i18n.t('coach_notification_detected'), 'warning');
        }
    }

    function renderSuggestedTopics(persona, scenario) {
        const topicsContainer = document.getElementById('suggested-topics');
        if (!topicsContainer) return;
        topicsContainer.innerHTML = '';

        const isCn = (persona?.countryCode === 'CN') || i18n.currentLang === 'zh';
        const sceneId = scenario?.id || state.currentScene || 'daily-chat';

        const scenarioTopicsMap = {
            'daily-chat': isCn
                ? ["☕ 周末出行与咖啡馆闲聊", "🎬 喜欢的电影与剧集", "🏡 远程办公与日常习惯", "✈️ 旅行见闻与户外爱好"]
                : ["☕ Weekend plans and cafes", "🎬 Favorite movies & shows", "🏡 Remote work routines", "✈️ Travel and outdoor hobbies"],
            'job-interview': isCn
                ? ["💼 自我介绍与过往经历", "💪 我最大的优势与短板", "🤝 处理团队分歧与项目挑战", "🎯 未来五年的职业规划"]
                : ["💼 Tell me about yourself", "💪 Greatest strength & weakness", "🤝 Handling a team conflict", "🎯 Where I see myself in 5 years"],
            'ielts-speaking': isCn
                ? ["🏙️ 家乡的变化与风土人情", "🌟 我最钦佩的一位榜样", "💻 远程办公的利与弊", "📚 传统教育与在线学习"]
                : ["🏙️ Describe hometown & changes", "🌟 An inspiring person I admire", "💻 Pros & cons of remote work", "📚 Traditional vs online learning"],
            'travel-airport': isCn
                ? ["🎫 航班值机与行李托运", "🚪 询问登机口与安检指引", "⏰ 航班延误改签咨询", "🏨 酒店办理入住与早餐时间"]
                : ["🎫 Flight check-in & baggage", "🚪 Asking directions to gate", "⏰ Flight delay rebooking", "🏨 Hotel check-in & breakfast"],
            'tech-discussion': isCn
                ? ["🚀 昨日接口与核心功能进展", "🔍 排查系统延迟与性能瓶颈", "⚙️ 微服务与单体架构权衡", "📝 代码审查与阻碍沟通"]
                : ["🚀 Yesterday's API fixes", "🔍 Investigating latency bottleneck", "⚙️ Microservices vs monolith", "📝 Code review & blocker sync"]
        };

        const topics = scenarioTopicsMap[sceneId] || scenario?.suggestedTopics || persona?.suggestedTopics || [];
        topics.forEach(topic => {
            const pill = document.createElement('button');
            pill.className = 'text-xs px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition cursor-pointer hover:scale-[1.02] shadow-sm';
            pill.textContent = topic;
            pill.onclick = () => {
                if (state.currentCountry === 'CN') {
                    sendUserSpeech(`你好！我想和你围绕“${topic}”展开交流。`);
                } else {
                    sendUserSpeech(`Let's discuss "${topic}". What are your thoughts on this?`);
                }
            };
            topicsContainer.appendChild(pill);
        });
    }

    function updatePersonaUi(persona) {
        const flagEl = document.getElementById('persona-flag');
        if (flagEl) flagEl.textContent = persona.flagEmoji;
        document.getElementById('persona-name').textContent = persona.name;
        document.getElementById('persona-title').textContent = persona.title;

        // Keep collapsed summary header synced
        const summaryFlag = document.getElementById('collapse-summary-flag');
        const summaryPersona = document.getElementById('collapse-summary-persona');
        if (summaryFlag) summaryFlag.textContent = persona.flagEmoji;
        if (summaryPersona) summaryPersona.textContent = `${persona.name} (${persona.countryCode})`;

        // Render suggested topics matching current persona & scenario
        renderSuggestedTopics(persona, state.currentScenario);
    }

    function updateScenarioUi(scenario) {
        const scenarioIcon = document.getElementById('scenario-icon');
        if (scenarioIcon) scenarioIcon.textContent = scenario.icon;
        const scenarioTitle = document.getElementById('scenario-title');
        if (scenarioTitle) scenarioTitle.textContent = scenario.title;

        // Keep collapsed summary header synced
        const summaryScene = document.getElementById('collapse-summary-scene');
        if (summaryScene) summaryScene.textContent = scenario.title;

        // Render suggested topics matching current persona & scenario
        renderSuggestedTopics(state.currentPersona, scenario);
    }

    function updateTtsBadge(provider) {
        const badge = document.getElementById('active-tts-badge');
        if (!badge) return;
        if (provider === 'ElevenLabs') {
            badge.textContent = 'ElevenLabs (Multilingual)';
            badge.className = 'text-xs px-2.5 py-1 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30';
        } else if (provider === 'WebSpeech') {
            badge.textContent = 'WebSpeech (原生口音)';
            badge.className = 'text-xs px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30';
        } else if (provider === 'OpenAITTS') {
            badge.textContent = 'OpenAI TTS (tts-1)';
            badge.className = 'text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        } else {
            badge.textContent = 'Edge-TTS (Neural)';
            badge.className = 'text-xs px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30';
        }
    }

    function updateSttUi() {
        const isWhisper = state.settings.sttProvider === 'Whisper';
        const sttBadge = document.getElementById('active-stt-badge');
        const sttLangSelect = document.getElementById('stt-lang-select');

        if (sttBadge) {
            sttBadge.classList.toggle('hidden', !isWhisper);
        }

        if (sttLangSelect) {
            const autoOpt = sttLangSelect.querySelector('option[value="auto"]');
            if (autoOpt) {
                autoOpt.textContent = isWhisper 
                    ? (window.i18n ? window.i18n.t('stt_lang_auto_whisper') : '🎙️ Whisper: Auto Adaptive')
                    : (window.i18n ? window.i18n.t('stt_lang_auto_webspeech') : '🌐 STT: Auto');
            }
        }
    }

    function updateMicUi() {
        const micBtn = document.getElementById('mic-main-btn');
        const micIcon = document.getElementById('mic-icon');
        const micStatusText = document.getElementById('mic-status-text');

        if (state.isListening) {
            micBtn.className = 'w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-600/50 transition-all transform scale-105 pulse-ring cursor-pointer';
            micStatusText.textContent = state.mode === 'hands-free' 
                ? i18n.t('mic_status_listening') 
                : i18n.t('mic_status_recording');
            micStatusText.className = 'text-xs text-rose-400 font-medium';
        } else if (state.isAiSpeaking) {
            micBtn.className = 'w-16 h-16 rounded-full bg-pink-600/90 hover:bg-pink-500 flex items-center justify-center shadow-lg shadow-pink-600/40 transition-all transform hover:scale-105 cursor-pointer';
            micStatusText.textContent = i18n.t('mic_status_ai_speaking');
            micStatusText.className = 'text-xs text-pink-400 font-medium';
        } else if (state.isAiThinking) {
            micBtn.className = 'w-16 h-16 rounded-full bg-amber-600/80 hover:bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-600/30 transition-all transform hover:scale-105 animate-pulse cursor-pointer';
            micStatusText.textContent = i18n.t('mic_status_ai_thinking');
            micStatusText.className = 'text-xs text-amber-400 font-medium';
        } else {
            micBtn.className = 'w-16 h-16 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/40 transition-all transform hover:scale-105 cursor-pointer';
            micStatusText.textContent = state.mode === 'hands-free' 
                ? (state.handsFreePaused ? i18n.t('mic_status_hands_free_idle') : i18n.t('mic_status_listening'))
                : i18n.t('mic_status_push_idle');
            micStatusText.className = 'text-xs text-slate-400';
        }
    }

    function scrollToBottom(smooth = false) {
        const stream = document.getElementById('dialogue-stream');
        if (!stream) return;
        if (smooth) {
            stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
        } else {
            stream.scrollTop = stream.scrollHeight;
        }
    }

    function scrollCoachToBottom(smooth = false) {
        const panelCoach = document.getElementById('panel-coach');
        if (!panelCoach) return;
        if (smooth) {
            panelCoach.scrollTo({ top: panelCoach.scrollHeight, behavior: 'smooth' });
        } else {
            panelCoach.scrollTop = panelCoach.scrollHeight;
        }
    }

    // 6. User Control Listeners & Floating Hover Tooltips
    const tooltipEl = document.getElementById('hover-tooltip');
    const tooltipIcon = document.getElementById('tooltip-icon');
    const tooltipTitle = document.getElementById('tooltip-title');
    const tooltipDesc = document.getElementById('tooltip-desc');

    function showTooltip(target, icon, title, desc) {
        if (!tooltipEl || !title || !desc) return;
        tooltipIcon.textContent = icon || '';
        tooltipTitle.textContent = title;
        tooltipDesc.textContent = desc;

        tooltipEl.classList.remove('hidden');

        const rect = target.getBoundingClientRect();
        const tw = Math.min(300, window.innerWidth - 24);
        const th = 60;

        let left = rect.left + rect.width / 2 - tw / 2;
        if (left < 12) left = 12;
        if (left + tw > window.innerWidth - 12) {
            left = window.innerWidth - tw - 12;
        }

        let top = rect.bottom + 8;
        if (top + th > window.innerHeight - 12) {
            top = Math.max(12, rect.top - th - 8);
        }

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.width = `${tw}px`;

        requestAnimationFrame(() => {
            tooltipEl.classList.remove('opacity-0');
            tooltipEl.classList.add('opacity-100');
        });
    }

    function hideTooltip() {
        if (!tooltipEl) return;
        tooltipEl.classList.remove('opacity-100');
        tooltipEl.classList.add('opacity-0');
        setTimeout(() => {
            if (tooltipEl.classList.contains('opacity-0')) {
                tooltipEl.classList.add('hidden');
            }
        }, 150);
    }

    function getPersonaTooltipInfo(countryCode) {
        const flagMap = { 'US': '🇺🇸', 'UK': '🇬🇧', 'AU': '🇦🇺', 'IN': '🇮🇳', 'CA': '🇨🇦', 'RO': '🇷🇴', 'UA': '🇺🇦', 'CN': '🇨🇳' };
        const nameKey = `persona_name_${countryCode}`;
        const descKey = `persona_desc_${countryCode}`;

        let title = i18n.t(nameKey);
        let desc = i18n.t(descKey);

        if (title === nameKey || desc === descKey) {
            const persona = (state.allPersonas || []).find(p => p.countryCode === countryCode) || (state.currentPersona?.countryCode === countryCode ? state.currentPersona : null);
            if (persona) {
                title = `${persona.name} (${persona.countryCode})`;
                desc = persona.accentDescription;
            }
        }
        return {
            icon: flagMap[countryCode] || '🌐',
            title: title || countryCode,
            desc: desc || ''
        };
    }

    function getScenarioTooltipInfo(sceneId) {
        const iconMap = { 'daily-chat': '☕', 'job-interview': '💼', 'ielts-speaking': '🎓', 'travel-airport': '✈️', 'tech-discussion': '💻' };
        const keyMap = {
            'daily-chat': 'daily_chat',
            'job-interview': 'job_interview',
            'ielts-speaking': 'ielts',
            'travel-airport': 'travel',
            'tech-discussion': 'tech'
        };
        const mappedKey = keyMap[sceneId] || sceneId;
        const titleKey = `scenario_title_${mappedKey}`;
        const descKey = `scenario_desc_${mappedKey}`;

        let title = i18n.t(titleKey);
        let desc = i18n.t(descKey);

        if (title === titleKey || desc === descKey) {
            const scenario = (state.allScenarios || []).find(s => s.id === sceneId) || (state.currentScenario?.id === sceneId ? state.currentScenario : null);
            if (scenario) {
                title = scenario.title;
                desc = scenario.description;
            }
        }
        return {
            icon: iconMap[sceneId] || '💬',
            title: title || sceneId,
            desc: desc || ''
        };
    }

    function updateTooltipsLang() {
        document.querySelectorAll('.country-btn').forEach(btn => {
            const info = getPersonaTooltipInfo(btn.dataset.country);
            btn.setAttribute('title', `${info.title}: ${info.desc}`);
        });
        document.querySelectorAll('.scenario-btn').forEach(btn => {
            const info = getScenarioTooltipInfo(btn.dataset.scene);
            btn.setAttribute('title', `${info.title}: ${info.desc}`);
        });
    }

    // Initialize tooltips
    updateTooltipsLang();

    // Country buttons
    document.querySelectorAll('.country-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            const info = getPersonaTooltipInfo(btn.dataset.country);
            showTooltip(btn, info.icon, info.title, info.desc);
        });
        btn.addEventListener('mouseleave', hideTooltip);

        btn.addEventListener('click', async () => {
            hideTooltip();
            const country = btn.dataset.country;
            if (state.currentCountry === country) return;

            // Unlock audio context and speech synthesis immediately in user gesture
            audioPlayer._ensureAudioContext();
            if ('speechSynthesis' in window) {
                try { window.speechSynthesis.resume(); } catch (e) { }
            }

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
        btn.addEventListener('mouseenter', () => {
            const info = getScenarioTooltipInfo(btn.dataset.scene);
            showTooltip(btn, info.icon, info.title, info.desc);
        });
        btn.addEventListener('mouseleave', hideTooltip);

        btn.addEventListener('click', async () => {
            hideTooltip();
            const scene = btn.dataset.scene;
            if (state.currentScene === scene) return;

            // Unlock audio context and speech synthesis immediately in user gesture
            audioPlayer._ensureAudioContext();
            if ('speechSynthesis' in window) {
                try { window.speechSynthesis.resume(); } catch (e) { }
            }

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

    // Collapsed Summary Tooltip Listeners
    const summaryPersona = document.getElementById('collapse-summary-persona');
    if (summaryPersona) {
        summaryPersona.classList.add('cursor-help');
        summaryPersona.addEventListener('mouseenter', () => {
            const country = state.currentCountry || state.currentPersona?.countryCode || 'US';
            const info = getPersonaTooltipInfo(country);
            showTooltip(summaryPersona, info.icon, info.title, info.desc);
        });
        summaryPersona.addEventListener('mouseleave', hideTooltip);
    }

    const summaryScene = document.getElementById('collapse-summary-scene');
    if (summaryScene) {
        summaryScene.classList.add('cursor-help');
        summaryScene.addEventListener('mouseenter', () => {
            const sceneId = state.currentScene || state.currentScenario?.id || 'daily-chat';
            const info = getScenarioTooltipInfo(sceneId);
            showTooltip(summaryScene, info.icon, info.title, info.desc);
        });
        summaryScene.addEventListener('mouseleave', hideTooltip);
    }

    // Mode Selector (Hands-Free vs Push-To-Talk)
    document.getElementById('mode-hands-free').addEventListener('click', () => {
        state.mode = 'hands-free';
        state.handsFreePaused = false;
        speechRecognizer.setMode('hands-free');
        document.getElementById('mode-hands-free').classList.add('bg-indigo-600', 'text-white');
        document.getElementById('mode-hands-free').classList.remove('text-slate-400');
        document.getElementById('mode-push-to-talk').classList.remove('bg-indigo-600', 'text-white');
        document.getElementById('mode-push-to-talk').classList.add('text-slate-400');
        
        // Only start listening if AI is NOT thinking or speaking
        if (!state.isAiSpeaking && !state.isAiThinking) {
            speechRecognizer.setBlocked(false);
            speechRecognizer.start();
        }
        updateMicUi();
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
                // User explicitly clicked to pause hands-free listening
                state.handsFreePaused = true;
                speechRecognizer.stop();
            } else {
                // User explicitly clicked to unpause/start hands-free listening
                state.handsFreePaused = false;
                if (state.isAiSpeaking || state.isAiThinking) {
                    clearTimeout(state.cooldownTimer);
                    audioPlayer.stop();
                    connection.invoke('Interrupt');
                    state.isAiSpeaking = false;
                    state.isAiThinking = false;
                }
                speechRecognizer.setBlocked(false);
                speechRecognizer.start();
            }
            updateMicUi();
        }
    });

    // Push-to-talk mouse/touch events
    micBtn.addEventListener('mousedown', () => {
        if (state.mode === 'push-to-talk') {
            if (state.isAiSpeaking || state.isAiThinking) {
                clearTimeout(state.cooldownTimer);
                audioPlayer.stop();
                connection.invoke('Interrupt');
                state.isAiSpeaking = false;
                state.isAiThinking = false;
            }
            speechRecognizer.setBlocked(false);
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
            if (state.isAiSpeaking || state.isAiThinking) {
                clearTimeout(state.cooldownTimer);
                audioPlayer.stop();
                connection.invoke('Interrupt');
                state.isAiSpeaking = false;
                state.isAiThinking = false;
            }
            speechRecognizer.setBlocked(false);
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
        clearTimeout(state.cooldownTimer);
        audioPlayer.stop();
        connection.invoke('Interrupt');
        state.isAiSpeaking = false;
        state.isAiThinking = false;
        speechRecognizer.setBlocked(false);
        if (state.mode === 'hands-free') {
            state.handsFreePaused = false;
            speechRecognizer.start();
        }
        updateMicUi();
        updateVisualizerState();
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
        scrollToBottom(false);
    });

    document.getElementById('tab-coach').addEventListener('click', () => {
        document.getElementById('panel-coach').classList.remove('hidden');
        document.getElementById('panel-dialogue').classList.add('hidden');
        document.getElementById('tab-coach').classList.add('border-indigo-500', 'text-indigo-400');
        document.getElementById('tab-coach').classList.remove('border-transparent', 'text-slate-400');
        document.getElementById('tab-dialogue').classList.remove('border-indigo-500', 'text-indigo-400');
        document.getElementById('tab-dialogue').classList.add('border-transparent', 'text-slate-400');
        scrollCoachToBottom(false);
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
    document.getElementById('cancel-settings-btn')?.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    // Settings Segmented Tab Switching
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab-btn').forEach(b => {
                b.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
                b.classList.add('text-slate-400');
            });
            btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
            btn.classList.remove('text-slate-400');

            const targetTab = btn.dataset.tab;
            document.querySelectorAll('.settings-tab-pane').forEach(pane => {
                pane.classList.toggle('hidden', pane.id !== targetTab);
            });
        });
    });

    // Quick presets / chips click handler
    document.querySelectorAll('.quick-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const targetId = chip.dataset.target;
            const val = chip.dataset.val;
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                targetInput.value = val;
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });

    document.getElementById('save-settings-btn').addEventListener('click', async () => {
        saveSettingsFromForm();
        settingsModal.classList.add('hidden');
        showNotification(i18n.currentLang === 'zh' ? '设置保存成功！' : 'Settings saved successfully!', 'success');
        updateTtsBadge(state.settings.ttsProvider);
        updateSttUi();
        audioPlayer.setPlaybackRate(state.settings.speakingRate || 1.0);
        await initSession();
    });

    // Test TTS button in settings modal
    document.getElementById('test-tts-btn').addEventListener('click', async () => {
        const engine = document.getElementById('settings-tts-provider').value;
        const elevenKey = document.getElementById('settings-elevenlabs-key').value.trim();
        const elevenModel = document.getElementById('settings-elevenlabs-model').value.trim();
        const llmKey = document.getElementById('settings-llm-key').value.trim();
        const country = state.currentPersona?.countryCode || 'US';
        const rate = parseFloat(document.getElementById('settings-rate').value) || 1.0;
        const testText = "Hello! This is a test of your speech synthesis and accent settings.";

        if (engine === 'WebSpeech') {
            audioPlayer.speakWebSpeech(testText, country, rate);
            showNotification(`🔊 正在试听【${state.currentPersona?.name || 'Partner'}】浏览器原生口音发音 (${country})...`, 'success');
            return;
        }

        const voiceId = engine === 'ElevenLabs' 
            ? (state.currentPersona?.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM') 
            : (state.currentPersona?.edgeTtsVoiceName || 'en-US-JennyNeural');
        const apiKey = engine === 'OpenAITTS' ? llmKey : (engine === 'ElevenLabs' ? elevenKey : null);

        try {
            document.getElementById('test-tts-btn').textContent = 'Testing...';
            const base64 = await connection.invoke('TestTts', testText, engine, voiceId, apiKey, elevenModel);
            if (base64) {
                await audioPlayer.replayAudioBase64(base64, rate);
                showNotification(i18n.currentLang === 'zh' ? '试听播放成功！' : 'TTS test played successfully!', 'success');
            } else {
                audioPlayer.speakWebSpeech(testText, country, rate);
                showNotification(i18n.currentLang === 'zh' ? '浏览器语音试听播放成功！' : 'WebSpeech test played successfully!', 'success');
            }
        } catch (e) {
            showNotification(`TTS test failed: ${e.message}`, 'error');
        } finally {
            document.getElementById('test-tts-btn').textContent = i18n.t('test_voice_btn');
        }
    });

    // 7. Settings Storage Helpers
    function loadSettings() {
        return {
            ttsProvider: localStorage.getItem('live_conv_tts_provider') || '',
            elevenLabsApiKey: localStorage.getItem('live_conv_elevenlabs_key') || '',
            elevenLabsModelId: localStorage.getItem('live_conv_elevenlabs_model') || '',
            llmApiKey: localStorage.getItem('live_conv_llm_key') || '',
            llmEndpoint: localStorage.getItem('live_conv_llm_endpoint') || '',
            llmModel: localStorage.getItem('live_conv_llm_model') || '',
            speakingRate: parseFloat(localStorage.getItem('live_conv_rate') || '1.0'),
            sttProvider: localStorage.getItem('live_conv_stt_provider') || 'WebSpeech',
            whisperEndpoint: localStorage.getItem('live_conv_whisper_endpoint') || '',
            whisperApiKey: localStorage.getItem('live_conv_whisper_key') || '',
            whisperModel: localStorage.getItem('live_conv_whisper_model') || 'whisper-1',
            sttLanguage: localStorage.getItem('live_conv_stt_lang') || 'auto'
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
                if (!state.settings.sttProvider && cfg.sttProvider) {
                    state.settings.sttProvider = cfg.sttProvider;
                }
                if (!state.settings.whisperModel && cfg.whisperModel) {
                    state.settings.whisperModel = cfg.whisperModel;
                }
                if (!state.settings.whisperEndpoint && cfg.whisperEndpoint) {
                    state.settings.whisperEndpoint = cfg.whisperEndpoint;
                }
                if (!state.settings.elevenLabsModelId && cfg.elevenLabsModel) {
                    state.settings.elevenLabsModelId = cfg.elevenLabsModel === 'eleven_v4_turbo' ? 'eleven_multilingual_v2' : cfg.elevenLabsModel;
                } else if (state.settings.elevenLabsModelId === 'eleven_v4_turbo') {
                    state.settings.elevenLabsModelId = 'eleven_multilingual_v2';
                }
                if (!state.settings.llmEndpoint && cfg.llmEndpoint) {
                    state.settings.llmEndpoint = cfg.llmEndpoint;
                }
                if (!state.settings.llmModel && cfg.llmModel) {
                    state.settings.llmModel = cfg.llmModel;
                }
                updateTtsBadge(state.settings.ttsProvider || cfg.ttsProvider || 'ElevenLabs');
                updateSttUi();
            }
        } catch (e) {
            console.warn('Could not sync server config:', e);
        }
    }

    function populateSettingsForm() {
        // Reset to first tab
        document.querySelectorAll('.settings-tab-btn').forEach((btn, idx) => {
            if (idx === 0) {
                btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
                btn.classList.remove('text-slate-400');
            } else {
                btn.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
                btn.classList.add('text-slate-400');
            }
        });
        document.querySelectorAll('.settings-tab-pane').forEach((pane, idx) => {
            pane.classList.toggle('hidden', idx !== 0);
        });

        document.getElementById('settings-tts-provider').value = state.settings.ttsProvider || 'ElevenLabs';
        document.getElementById('settings-elevenlabs-key').value = state.settings.elevenLabsApiKey;
        document.getElementById('settings-elevenlabs-model').value = state.settings.elevenLabsModelId || '';
        document.getElementById('settings-llm-key').value = state.settings.llmApiKey;
        document.getElementById('settings-llm-endpoint').value = state.settings.llmEndpoint;
        document.getElementById('settings-llm-model').value = state.settings.llmModel;
        document.getElementById('settings-rate').value = state.settings.speakingRate;
        document.getElementById('settings-rate-val').textContent = `${state.settings.speakingRate}x`;

        const elevenlabsConfig = document.getElementById('elevenlabs-config-container');
        if (elevenlabsConfig) {
            elevenlabsConfig.classList.toggle('hidden', (state.settings.ttsProvider || 'ElevenLabs') !== 'ElevenLabs');
        }

        const sttSelect = document.getElementById('settings-stt-provider');
        if (sttSelect) sttSelect.value = state.settings.sttProvider || 'WebSpeech';
        const whisperEndpointInput = document.getElementById('settings-whisper-endpoint');
        if (whisperEndpointInput) whisperEndpointInput.value = state.settings.whisperEndpoint || '';
        const whisperKeyInput = document.getElementById('settings-whisper-key');
        if (whisperKeyInput) whisperKeyInput.value = state.settings.whisperApiKey || '';
        const whisperModelInput = document.getElementById('settings-whisper-model');
        if (whisperModelInput) whisperModelInput.value = state.settings.whisperModel || 'whisper-1';

        const whisperConfigContainer = document.getElementById('whisper-config-container');
        if (whisperConfigContainer) {
            whisperConfigContainer.classList.toggle('hidden', (state.settings.sttProvider || 'WebSpeech') !== 'Whisper');
        }
    }

    document.getElementById('settings-tts-provider')?.addEventListener('change', (e) => {
        const elevenlabsConfig = document.getElementById('elevenlabs-config-container');
        if (elevenlabsConfig) {
            elevenlabsConfig.classList.toggle('hidden', e.target.value !== 'ElevenLabs');
        }
    });

    document.getElementById('settings-stt-provider')?.addEventListener('change', (e) => {
        const whisperConfigContainer = document.getElementById('whisper-config-container');
        if (whisperConfigContainer) {
            whisperConfigContainer.classList.toggle('hidden', e.target.value !== 'Whisper');
        }
    });

    function saveSettingsFromForm() {
        state.settings.ttsProvider = document.getElementById('settings-tts-provider').value;
        state.settings.elevenLabsApiKey = document.getElementById('settings-elevenlabs-key').value.trim();
        state.settings.elevenLabsModelId = document.getElementById('settings-elevenlabs-model').value.trim();
        state.settings.llmApiKey = document.getElementById('settings-llm-key').value.trim();
        state.settings.llmEndpoint = document.getElementById('settings-llm-endpoint').value.trim();
        state.settings.llmModel = document.getElementById('settings-llm-model').value.trim();
        state.settings.speakingRate = parseFloat(document.getElementById('settings-rate').value);

        state.settings.sttProvider = document.getElementById('settings-stt-provider')?.value || 'WebSpeech';
        state.settings.whisperEndpoint = document.getElementById('settings-whisper-endpoint')?.value.trim() || '';
        state.settings.whisperApiKey = document.getElementById('settings-whisper-key')?.value.trim() || '';
        state.settings.whisperModel = document.getElementById('settings-whisper-model')?.value.trim() || 'whisper-1';

        localStorage.setItem('live_conv_tts_provider', state.settings.ttsProvider);
        localStorage.setItem('live_conv_elevenlabs_key', state.settings.elevenLabsApiKey);
        localStorage.setItem('live_conv_elevenlabs_model', state.settings.elevenLabsModelId);
        localStorage.setItem('live_conv_llm_key', state.settings.llmApiKey);
        localStorage.setItem('live_conv_llm_endpoint', state.settings.llmEndpoint);
        localStorage.setItem('live_conv_llm_model', state.settings.llmModel);
        localStorage.setItem('live_conv_rate', state.settings.speakingRate.toString());

        localStorage.setItem('live_conv_stt_provider', state.settings.sttProvider);
        localStorage.setItem('live_conv_whisper_endpoint', state.settings.whisperEndpoint);
        localStorage.setItem('live_conv_whisper_key', state.settings.whisperApiKey);
        localStorage.setItem('live_conv_whisper_model', state.settings.whisperModel);

        speechRecognizer.setEngine(state.settings.sttProvider);
        updateSttUi();
    }

    function getClientSettingsPayload() {
        return {
            ttsProvider: state.settings.ttsProvider || null,
            elevenLabsApiKey: state.settings.elevenLabsApiKey || null,
            elevenLabsModelId: state.settings.elevenLabsModelId || null,
            llmApiKey: state.settings.llmApiKey || null,
            llmEndpoint: state.settings.llmEndpoint || null,
            llmModel: state.settings.llmModel || null,
            speakingRate: state.settings.speakingRate,
            sttProvider: state.settings.sttProvider || 'WebSpeech',
            whisperEndpoint: state.settings.whisperEndpoint || null,
            whisperApiKey: state.settings.whisperApiKey || null,
            whisperModel: state.settings.whisperModel || null,
            sttLanguage: state.settings.sttLanguage || 'auto'
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
