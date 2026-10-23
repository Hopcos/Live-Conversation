# LiveConversation AI - 网页真人模拟对话系统 (.NET 10)

[English](README.md) | [中文](README.zh.md)

一套基于 **.NET 10** 与 **现代 Web Audio / SignalR** 架构开发的高拟真、低延迟网页语音对话练习系统。

专为口语实战进阶设计，具备**多国口音与真人角色切换（含纯正中文母语与中英双语）**、**多重防供应商锁定（支持 ElevenLabs、OpenAI 官方语音、Edge-TTS 与 Web Speech API 灵活切换）**、**Whisper 云端/本地智能语音识别 (STT)**、**极低延迟分句流式流水线**以及**双轨制 AI 影子伴学指导（实时语法纠偏、母语级地道表达推荐与深度解析）**，并对移动端与平板进行了深度自适应。

---

## 一、 系统架构特色与关键技术设计

针对传统语音应用中常见的延迟高、打断生硬、供应商锁定等痛点，本项目在设计与实现上完成了以下关键技术突破：

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Web 前端 (浏览器 / 移动端)                │
                    │  Web Speech / Whisper STT <-> Web Audio 队列平滑播放   │
                    │  (支持 Hands-Free 自由对讲 / Push-to-Talk / 动态水波球) │
                    └───────────────────────────┬────────────────────────────┘
                                                │ SignalR 全双工双向低延迟流
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               .NET 10 核心对话编排服务                  │
                    │  (SentenceSegmenter 分句器 + CancellationToken 打断控制)│
                    └───────────────┬────────────────────────┬───────────────┘
                                    │                        │
                   【主轨：低延迟语音对话】       【副轨：异步影子伴学】
                                    ▼                        ▼
                        ┌─────────────────────────┐   ┌────────────────┐
                        │  OpenAI / DeepSeek LLM  │   │  Shadow Coach  │
                        └────────────┬────────────┘   │ (语法/表达指导) │
                                     │ 分句流式送入   └───────┬────────┘
                                     ▼                        │
                        ┌─────────────────────────┐           │
                        │    ITtsProvider 抽象     │           │
                        └──────┬─────┬─────┬──────┘           │
                               │     │     │                  │
                               ▼     ▼     ▼                  │
                          ElevenLabs │  Edge-TTS              │
                        (顶级拟真度) │ (免费神经语音)          │
                                     ▼                        │
                                OpenAI TTS                    │
                              (复用LLM订阅)                   │
                               │     │     │                  │
                               └─────┴──┬──┴──────────────────┘
                                        │ 自包含 MP3 音频切片
                                        ▼
                    ┌────────────────────────────────────────────────────────┐
                    │             推送到前端播放队列与伴学侧边栏              │
                    └────────────────────────────────────────────────────────┘
```

1. **分句流式消费流水线 (Sentence Chunking Pipeline)**：
   * 彻底避免浏览器 Web Audio API 直接解码截断 MP3 字节流时导致的 `EncodingError`。
   * LLM 一旦生成完整首句，立即切片合成音频，用户在 **600~900ms 内即可听到真人回复**。
2. **双 STT 语音识别引擎 (Web Speech API & Whisper)**：
   * **Web Speech API**：浏览器原生拾音，零延迟、零额外 API 开销。
   * **Whisper STT**：支持接入 Groq Whisper（如 `whisper-large-v3`、`whisper-large-v3-turbo`）或 OpenAI Whisper，支持自定义 Base URL、API Key 与模型，弱网环境下也能高精度转录中英文。
3. **多重防供应商锁定（Anti-Vendor-Lockin）**：
   * 系统通过 `ITtsProvider` 与 `TtsProviderFactory` 实现三引擎热切换：
     * **ElevenLabs**：顶级拟真方案（支持 Turbo v2.5 模型）。
     * **OpenAI TTS (`tts-1`)**：直接复用您的 LLM 订阅 Key，官方 API 高保真稳定输出。
     * **Microsoft Edge-TTS**：纯 C# 原生 WebSocket 实现，支持微软神经网络母语发音，免费零配置。
     * **Web Speech API**：前端浏览器原生 TTS 降级保底。
4. **即时打断与防回音自闭环 (Barge-in & Echo Prevention)**：
   * 后端为每个连接维护独立的 `CancellationTokenSource`，一旦检测到说话或点击打断，立即熔断后台 LLM 生成和 TTS 合成，同时清理前端播放队列。
   * **智能防回音回环**：在 Hands-Free 免提模式下，AI 播放语音期间自动锁闭收音，播报完毕后经防抖冷却再唤醒监听，彻底根除麦克风录入自身扬声器导致“死循环自言自语”的行业通病。
5. **智能语言识别的影子教练 (Shadow Coach)**：
   * 旁路异步副轨运行，完全不占用对话主链路的响应时间。
   * **语种自适应**：当在纯中文 (`CN`) 或中英双语 (`CN-EN`) 模式下说中文时，伴学教练自动采用专属中文纠偏提示词，输出规范中文修正、母语级地道表达建议与深度解析，杜绝误将中文翻译为英文。

---

## 二、 多国口音与角色矩阵

| 口音/代码 | 角色名称 | 角色背景 | ElevenLabs 预设 Voice | OpenAI TTS 映射 | Edge-TTS 映射 | 语言教学与口语特征 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **🇺🇸 美国 (US)** | **Rachel Vance** | 纽约曼哈顿科技白领 | `21m00Tcm4TlvDq8ikWAM` | `alloy` | `en-US-JennyNeural` | 美语连读、弱读与现代职场/生活日常口语 |
| **🇬🇧 英国 (UK)** | **Arthur Pendelton** | 伦敦/牛津文学文化学者 | `JBFqnCBsd6RMkjVDRZzb` | `fable` | `en-GB-RyanNeural` | 纯正英音 RP 发音、雅思口语与严谨表达 |
| **🇮🇳 印度 (IN)** | **Priya Sharma** | 班加罗尔首席软件架构师 | `onwK4e9ZLuTAKqWW03F9` | `shimmer` | `en-IN-NeerjaNeural` | 突破跨国远程工作中全球最普遍但最难辨析的口音 |
| **🇨🇦 加拿大 (CA)** | **Chloe Tremblay** | 温哥华环保学者与户外向导 | `AZnzlk1XvdvUeBnXmlld` | `nova` | `en-CA-ClaraNeural` | 纯净清晰发音，自然枫叶国口语习惯 (`eh?`) |
| **🇷🇴 罗马尼亚 (RO)** | **Elena Radu** | 布加勒斯特数字技术架构师 | `XB0fDUnXU5powFXDhCwa` | `alloy` | `en-IE-EmilyNeural` | 东欧罗曼语族口音（清脆明晰），适合跨国欧企交流 |
| **🇺🇦 乌克兰 (UA)** | **Oksana Kovalenko** | 基辅创意设计师与口语教师 | `XB0fDUnXU5powFXDhCwa` | `fable` | `en-GB-SoniaNeural` | 斯拉夫语族英语发音风格（温和抒情），适应分布式团队 |
| **🇨🇳 中文母语 (CN)** | **Zhang Wei (张伟)** | 北京互联网产品经理 | `21m00Tcm4TlvDq8ikWAM` | `alloy` | `zh-CN-YunxiNeural` | 标准母语级普通话，日常闲聊、职场沟通与纯中文表达 |
| **🇨🇳 中英双语 (CN-EN)**| **Lin Wei (林薇)** | 上海资深口语伴学导师 | `21m00Tcm4TlvDq8ikWAM` | `nova` | `zh-CN-XiaoxiaoNeural` | 中英双语流畅切换、中文解析知识点与语法，零压力过渡练习 |

---

## 三、 五大实战场景

1. ☕ **日常闲聊 (Casual Coffee Chat)**：低压力轻松闲聊、生活爱好、周末出游与咖啡馆闲话。
2. 💼 **求职面试 (Job Interview Practice)**：专业职场面试、过往经历、行为面试 (STAR 法则) 与问题解决模拟。
3. 🎓 **雅思口语 (IELTS Speaking Prep)**：Part 2 & Part 3 模拟，观点阐述、论据支撑与流利度深度拓展。
4. ✈️ **出行问路 (Travel & Hotel Check-in)**：机场柜台、出入境值机、酒店入住与突发行程变更沟通。
5. 💻 **技术晨会 (Tech & Product Standup)**：敏捷晨会同步、系统架构探讨、工程权衡与阻碍排除。

---

## 四、 快速启动与运行指南

### 1. 前置环境
* 已安装 **.NET 10 SDK** (支持 10.0.401 及以上)。
* 推荐浏览器：**Google Chrome**、**Microsoft Edge** 或现代移动端浏览器（Safari / Chrome for Mobile）。

### 2. 运行应用
在项目根目录下执行：

```powershell
dotnet run --project src/LiveConversation.Web
```

启动后在浏览器打开：👉 **`http://localhost:5067`**（或 launchSettings 设定的端口）

### 3. 配置方式（两种途径）

#### 方式一：网页设置弹窗（推荐，支持实时测试与热保存）
1. 点击右上角 **⚙️ Settings** 按钮（支持拖拽定位与置顶查看）。
2. 在 **LLM Settings** 中配置端点、API Key 与模型（支持 OpenAI、DeepSeek、Groq 等兼容 OpenAI 格式的任意大模型）。
3. 在 **TTS Settings** 中按需选择 ElevenLabs、OpenAI TTS、Edge-TTS 或 Web Speech API，并可点击 **🔊 Test Voice** 试听效果。
4. 在 **STT Settings** 中选择 Web Speech API 或 Whisper（可配置 Groq Whisper 或官方 Whisper 接口）。
5. 点击 **Save Changes**，配置将自动加密持久化保存在当前浏览器本地。

#### 方式二：在服务端 `appsettings.json` 中配置
直接修改 [`src/LiveConversation.Web/appsettings.json`](src/LiveConversation.Web/appsettings.json)：
```json
{
  "AppSettings": {
    "Llm": {
      "Provider": "OpenAI",
      "ApiKey": "sk-your-llm-key",
      "Endpoint": "https://api.openai.com/v1",
      "ModelId": "gpt-4o-mini"
    },
    "ElevenLabs": {
      "ApiKey": "xi-your-elevenlabs-key",
      "ModelId": "eleven_turbo_v2_5"
    },
    "Whisper": {
      "Endpoint": "https://api.groq.com/openai/v1",
      "ApiKey": "gsk_your_groq_whisper_key",
      "ModelId": "whisper-large-v3-turbo"
    },
    "Tts": {
      "ActiveProvider": "EdgeTts"
    }
  }
}
```

---

## 五、 现代交互与定制化特性

* **4 套精选主题换肤**：
  * 🌌 **深邃星空 (Cosmic Dark)**（默认沉浸暗黑）
  * 🌲 **赛博翡翠 (Cyber Emerald)**（极客科技绿）
  * 🌆 **极夜紫晶 (Midnight Purple)**（高雅午夜紫）
  * ☀️ **极简纯白 (Modern Light)**（清新现代日间风格）
* **移动端自适应**：
  * 自动适配手机与平板屏幕，支持触屏手势与流式排版；
  * 对话区与伴学区自适应滚动，配备可拖拽折叠的浮动设置弹窗；
  * 提供平滑“回到顶部”快捷悬浮按钮。
* **全局中英双语切换**：点击顶部 `🇨🇳 中文 / 🇺🇸 English` 按钮实现全界面无缝多语言切换。
* **按键对讲 (Push-to-Talk) 与免提自由对讲 (Hands-Free)**：
  * 免提模式下搭载动态音频可视化波纹球，说话停顿即发；
  * 按键模式下支持长按空格键或麦克风按钮即说即录，松开发送。
* **慢速重播 (0.8x)**：对 AI 回复气泡右上角的 `🔊 Replay (0.8x)` 点击即可慢速复读听清连读细节。

---

## 六、 自动化测试闭环 (Testing)

项目内嵌完整的 xunit 测试工程 [`tests/LiveConversation.Tests`](tests/LiveConversation.Tests)：

```powershell
dotnet test
```

测试覆盖单元测试与端到端集成测试（共计 **47 个测试全部通过**）：
- **分句器流水线测试** (`SentenceSegmenterTests`)：标点切分、常见缩写 (`Dr.`, `U.S.`)、省略号与边界 Flush。
- **角色与场景矩阵测试** (`PersonaRegistryTests`)：8 大角色属性、问候语映射与 TTS 音色绑定。
- **伴学数据契约测试** (`CoachFeedbackSerializationTests`)：英语学习纠偏与中英双语/纯中文纠偏结构验证。
- **API 端点集成测试** (`ApiEndpointsTests`)：真实内存管道校验 `/api/personas`、`/api/scenarios` 与静态资源托管。
- **TTS 引擎装配测试** (`TtsEngineIntegrationTests`)：验证 DI 容器正确注入全部语音引擎实现与平替降级机制。

---

## License

本项目遵循 [Apache License, Version 2.0](LICENSE) 开源协议。

```
Copyright 2026 LiveConversation Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
