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
        collapse_accent_scenario_title: "Accents & Scenarios",
        collapse_expand: "Expand",
        collapse_hide: "Collapse",
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
        tts_engine_tip: "💡 When ElevenLabs quota runs out, switch anytime to Web Speech (browser-native, zero keys, 100% stable regional accents) or OpenAI TTS.",
        elevenlabs_key_label: "ElevenLabs API Key",
        elevenlabs_model_label: "ElevenLabs Model ID",
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
        coach_spotlight: "🌟 Key Phrase:",
        partner_badge: "AI Partner",
        current_scenario_prefix: "Scenario:",

        // Hover Descriptions for Personas
        persona_name_US: "Rachel Vance (New York)",
        persona_desc_US: "Standard American English, natural pacing, clear intonation.",
        persona_name_UK: "Arthur Pendelton (London RP)",
        persona_desc_UK: "British English (Received Pronunciation / Oxford), articulate, refined, rich British idioms.",
        persona_name_AU: "Liam O'Connor (Sydney)",
        persona_desc_AU: "Australian English (Aussie), laid-back, energetic cadence, distinctive Aussie colloquialisms.",
        persona_name_IN: "Priya Sharma (Bengaluru)",
        persona_desc_IN: "Indian English, crisp articulation, melodic rhythm, authentic South Asian conversational style.",
        persona_name_CA: "Chloe Tremblay (Vancouver)",
        persona_desc_CA: "Canadian English, warm, polite, distinctive Canadian conversational markers ('eh', 'for sure').",
        persona_name_RO: "Elena Radu (Bucharest)",
        persona_desc_RO: "Eastern European / Romanian English, clear articulation, melodic European cadence.",
        persona_name_UA: "Oksana Kovalenko (Kyiv)",
        persona_desc_UA: "Ukrainian / Slavic English, gentle cadence, warm, lyrical and encouraging.",
        persona_name_CN: "Lin Wei (林薇) (Shanghai)",
        persona_desc_CN: "Bilingual English & Mandarin (中英双语切换), patient, supportive, authentic pronunciation coach.",

        // Hover Descriptions for Scenarios
        scenario_title_daily_chat: "Casual Coffee Chat",
        scenario_desc_daily_chat: "Relaxed, low-pressure small talk about daily life, hobbies, and weekend plans.",
        scenario_title_job_interview: "Job Interview Practice",
        scenario_desc_job_interview: "Professional behavioral interview questions, career background, and problem solving.",
        scenario_title_ielts: "IELTS Speaking Prep",
        scenario_desc_ielts: "Part 2 and 3 simulation: descriptive fluency, opinion justification, and abstract discussion.",
        scenario_title_travel: "Travel & Hotel Check-in",
        scenario_desc_travel: "Airports, immigration, hotel reservations, asking directions, and handling travel hitches.",
        scenario_title_tech: "Tech & Product Standup",
        scenario_desc_tech: "Agile standup, architectural debates, discussing trade-offs and project priorities."
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
        collapse_accent_scenario_title: "口音发音人与实战场景",
        collapse_expand: "展开选择",
        collapse_hide: "向上收起",
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
        tts_engine_tip: "💡 即使 ElevenLabs 额度耗尽，可随时切换为【浏览器原生语音 (Web Speech)】，免任何密钥和配置，即享多国地道母语口音。",
        elevenlabs_key_label: "ElevenLabs API 密钥",
        elevenlabs_model_label: "ElevenLabs 模型代号 (Model ID)",
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
        coach_spotlight: "🌟 亮点习语：",
        partner_badge: "AI 陪练伙伴",
        current_scenario_prefix: "实战场景：",

        // Hover Descriptions for Personas
        persona_name_US: "Rachel Vance (纽约 • 美式口音)",
        persona_desc_US: "标准美式英语，语速自然，语调清晰亲切，科技职场地道口语。",
        persona_name_UK: "Arthur Pendelton (伦敦 • 英式牛津音)",
        persona_desc_UK: "英式标准发音（牛津RP），优雅考究，地道英伦文学与习语表达。",
        persona_name_AU: "Liam O'Connor (悉尼 • 澳洲口音)",
        persona_desc_AU: "澳大利亚口音，轻松开朗，极具澳式俚语特色（G'day mate, no worries）。",
        persona_name_IN: "Priya Sharma (班加罗尔 • 印度口音)",
        persona_desc_IN: "印度英语，咬字清晰，南亚特有语调旋律与国际IT职场口语。",
        persona_name_CA: "Chloe Tremblay (温哥华 • 加拿大音)",
        persona_desc_CA: "加拿大口音，亲和温和，带典型枫叶国口语特色（eh?, for sure）。",
        persona_name_RO: "Elena Radu (布加勒斯特 • 欧式口音)",
        persona_desc_RO: "东欧/罗马尼亚口音，欧式语调清脆明晰，欧洲数字游民与科技表达。",
        persona_name_UA: "Oksana Kovalenko (基辅 • 斯拉夫口音)",
        persona_desc_UA: "乌克兰/斯拉夫口音，温和抒情，声调优雅，耐心鼓励口语初学者。",
        persona_name_CN: "Lin Wei (林薇) (上海 • 中英双语)",
        persona_desc_CN: "中英双语切换，耐心循序渐进，标准地道发音，双语纠错教练。",

        // Hover Descriptions for Scenarios
        scenario_title_daily_chat: "日常闲聊 (Coffee Chat)",
        scenario_desc_daily_chat: "轻松日常闲聊、生活爱好、周末出游与咖啡馆闲话。",
        scenario_title_job_interview: "求职面试 (Job Interview)",
        scenario_desc_job_interview: "专业职场面试、过往背景、行为面试与解决问题模拟。",
        scenario_title_ielts: "雅思口语 (IELTS Prep)",
        scenario_desc_ielts: "雅思口语 Part 2 & 3 模拟，观点阐述与流利度深度拓展。",
        scenario_title_travel: "出行问路 (Travel & Hotel)",
        scenario_desc_travel: "机场出行问路、出入境柜台、酒店入住与突发沟通处理。",
        scenario_title_tech: "技术晨会 (Tech Standup)",
        scenario_desc_tech: "敏捷晨会同步、技术架构讨论、工程权衡与项目排期。"
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
