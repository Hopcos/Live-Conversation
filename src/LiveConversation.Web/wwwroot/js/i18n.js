/**
 * Internationalization (i18n) Dictionary & Manager
 * Supports English (en) and Chinese (zh).
 */
const I18N_DICTIONARY = {
    en: {
        brand_title: "LiveConversation AI",
        status_connecting: "Connecting...",
        status_online: "Online",
        status_disconnected: "Disconnected",
        theme_title: "Theme",
        theme_cosmic: "Cosmic Dark",
        theme_emerald: "Cyber Emerald",
        theme_amethyst: "Midnight Purple",
        theme_light: "Modern Light",
        input_lang_title: "Input Lang",
        input_lang_auto: "Auto (Country)",
        input_lang_en: "English (en-US)",
        input_lang_zh: "中文 (Mandarin)",
        settings_btn: "Settings",
        section_accent: "1. Select Accent & Persona (Spoken Style)",
        section_accent_sub: "Switch anytime",
        section_scenario: "2. Select Practice Scenario",
        scenario_daily_chat: "Coffee Chat",
        scenario_job_interview: "Job Interview",
        scenario_ielts: "IELTS Speaking",
        scenario_travel: "Airport & Travel",
        scenario_tech: "Tech Standup",
        topics_prompt: "✨ Tap a topic to start:",
        hearing_you: "Hearing you say:",
        mode_hands_free: "🎙️ Hands-Free (Auto VAD)",
        mode_push_to_talk: "🔘 Push-to-Talk",
        interrupt_btn: "Interrupt",
        mic_status_hands_free_idle: "Hands-Free (Click to start)",
        mic_status_listening: "Listening... (Speak naturally)",
        mic_status_push_idle: "Hold Space or Click to speak",
        mic_status_recording: "Recording... (Release to send)",
        input_placeholder: "Type in English or Chinese (Press Enter)...",
        send_btn: "Send",
        tab_dialogue: "💬 Live Dialogue",
        tab_coach: "🧠 AI Shadow Coach",
        coach_empty_text: "Start speaking! The Shadow Coach will automatically analyze your grammar, vocabulary, and suggest native expressions here in real time.",
        settings_modal_title: "Engine & Voice Settings",
        tts_engine_label: "TTS Voice Engine (Speech Synthesis)",
        tts_engine_tip: "💡 When ElevenLabs subscription expires, seamlessly switch to OpenAI TTS or Edge-TTS anytime.",
        elevenlabs_key_label: "ElevenLabs API Key",
        llm_endpoint_label: "LLM API Base URL (OpenAI / DeepSeek / Local)",
        llm_key_label: "LLM API Key",
        llm_model_label: "LLM Model Name",
        speaking_rate_label: "Speaking Speed",
        rate_slow: "0.7x (Slow)",
        rate_normal: "1.0x (Normal)",
        rate_fast: "1.3x (Fast)",
        test_voice_btn: "🔊 Test Voice",
        save_changes_btn: "Save Changes",
        you: "You",
        replay_btn: "🔊 Replay (0.8x)",
        coach_correction: "Correction:",
        coach_native: "Native Phrasing:",
        coach_explanation: "💡 Explanation:",
        coach_spotlight: "🌟 Key Phrase:"
    },
    zh: {
        brand_title: "LiveConversation AI 模拟真人对话",
        status_connecting: "连接中...",
        status_online: "在线服务就绪",
        status_disconnected: "已断开连接",
        theme_title: "切换皮肤",
        theme_cosmic: "深邃星空",
        theme_emerald: "赛博翡翠",
        theme_amethyst: "极夜紫晶",
        theme_light: "极简纯白",
        input_lang_title: "拾音语种",
        input_lang_auto: "自动匹配国家",
        input_lang_en: "英文识别 (en-US)",
        input_lang_zh: "中文普通话 (zh-CN)",
        settings_btn: "配置",
        section_accent: "1. 选择口音风格与发音人",
        section_accent_sub: "点击即刻热切换",
        section_scenario: "2. 选择口语实战场景",
        scenario_daily_chat: "日常闲聊",
        scenario_job_interview: "求职面试",
        scenario_ielts: "雅思口语",
        scenario_travel: "出行问路",
        scenario_tech: "技术晨会",
        topics_prompt: "✨ 点击快捷开场话题开始练习：",
        hearing_you: "正在识别您说的话：",
        mode_hands_free: "🎙️ 双手自由对讲 (自动断句)",
        mode_push_to_talk: "🔘 按键对讲 (长按空格)",
        interrupt_btn: "打断",
        mic_status_hands_free_idle: "自由对讲模式 (点击麦克风开启)",
        mic_status_listening: "正在倾听中... (请自然开口说话)",
        mic_status_push_idle: "长按空格键或麦克风说话",
        mic_status_recording: "正在录音... (松开即刻发送)",
        input_placeholder: "输入英文或中文交流 (回车发送)...",
        send_btn: "发送",
        tab_dialogue: "💬 实时对话记录",
        tab_coach: "🧠 AI 影子伴学校对",
        coach_empty_text: "请开口交流！AI 影子教练将在后台实时分析您的每句发音与句式，在此输出时态纠偏、地道替换词及中文深度解析。",
        settings_modal_title: "语音引擎与模型配置",
        tts_engine_label: "TTS 语音合成引擎",
        tts_engine_tip: "💡 后期 ElevenLabs 订阅到期后，可随时一键切换为 OpenAI 官方语音 (复用现有LLM账号) 或 Edge-TTS 免费神经语音。",
        elevenlabs_key_label: "ElevenLabs API 密钥",
        llm_endpoint_label: "LLM API 端点地址 (支持 OpenAI / DeepSeek / 本地网关)",
        llm_key_label: "LLM API Key 密钥",
        llm_model_label: "LLM 模型代号",
        speaking_rate_label: "语速快慢调节",
        rate_slow: "0.7x (慢速听辨)",
        rate_normal: "1.0x (正常语速)",
        rate_fast: "1.3x (快速应变)",
        test_voice_btn: "🔊 试听发音",
        save_changes_btn: "保存设置",
        you: "你",
        replay_btn: "🔊 慢速复读 (0.8x)",
        coach_correction: "语法修正：",
        coach_native: "母语级地道表达：",
        coach_explanation: "💡 深度解析：",
        coach_spotlight: "🌟 亮点习语："
    }
};

class I18nManager {
    constructor() {
        this.currentLang = localStorage.getItem('live_conv_lang') || 'zh'; // Default to Chinese for friendly onboarding
    }

    t(key) {
        const langDict = I18N_DICTIONARY[this.currentLang] || I18N_DICTIONARY.en;
        return langDict[key] || I18N_DICTIONARY.en[key] || key;
    }

    setLanguage(lang) {
        if (lang !== 'en' && lang !== 'zh') return;
        this.currentLang = lang;
        localStorage.setItem('live_conv_lang', lang);
        this.applyTranslations();
    }

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (el.tagName === 'INPUT' && el.type === 'text') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        });

        // Update active language indicator in header
        const langToggleBtn = document.getElementById('lang-toggle-btn');
        if (langToggleBtn) {
            langToggleBtn.textContent = this.currentLang === 'zh' ? '🇨🇳 中文' : '🇺🇸 English';
        }
    }
}

window.I18nManager = I18nManager;
