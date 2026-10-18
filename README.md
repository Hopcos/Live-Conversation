# LiveConversation AI - 网页真人英语模拟对话系统 (.NET 10)

一套基于 **.NET 10** 与 **现代 Web Audio / SignalR** 架构开发的高拟真、低延迟网页英语对话练习系统。

专为英语口语快速进阶设计，具备**多国口音与角色切换**、**多重防供应商锁定（支持 ElevenLabs、OpenAI 官方语音与 Edge-TTS 灵活切换）**、**极低延迟分句流式流水线**以及**双轨制 AI 伴学指导（实时语法纠正与地道表达推荐）**。

---

## 一、 系统架构特色与关键技术设计

针对传统语音应用中常见的痛点，本项目在设计与实现上完成了以下关键技术突破：

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Web 前端 (浏览器)                        │
                    │  Web Speech API (VAD)  <-> Web Audio 队列平滑播放      │
                    │  (支持 Hands-Free 自由对讲 / Push-to-Talk / 动态水波球) │
                    └───────────────────────────┬────────────────────────────┘
                                                │ SignalR 全双工双向低延迟流
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               .NET 10 核心对话编排服务                  │
                    │  (SentenceSegmenter 分句器 + CancellationToken 打断控制)│
                    └───────────────┬────────────────────────┬───────────────┘
                                    │                        │
                   【主轨：低延迟语音对话】       【副轨：异步伴学分析】
                                    ▼                        ▼
                       ┌─────────────────────────┐   ┌───────────────┐
                       │  OpenAI / DeepSeek LLM  │   │ Shadow Coach  │
                       └────────────┬────────────┘   │ (语法/表达指导)│
                                    │ 分句流式送入   └───────┬───────┘
                                    ▼                        │
                       ┌─────────────────────────┐           │
                       │    ITtsProvider 抽象     │           │
                       └──────┬─────┬─────┬──────┘           │
                              │     │     │                  │
                              ▼     ▼     ▼                  │
                         ElevenLabs │  Edge-TTS              │
                       (当前高质量) │ (免费平替)             │
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
2. **多重防供应商锁定（Anti-Vendor-Lockin）**：
   * 系统通过 `ITtsProvider` 与 `TtsProviderFactory` 实现三引擎热切换：
     * **ElevenLabs**：当前高质量订阅方案（支持 Turbo v2.5 模型）。
     * **OpenAI TTS (`tts-1`)**：**直接复用您现有的 LLM 个人订阅 Key**，官方 API 高保真稳定输出，无需额外采购新账号。
     * **Microsoft Edge-TTS**：纯 C# 原生 WebSocket 实现，支持微软神经网络母语发音。
3. **即时打断机制（Barge-in / Interruption）**：
   * 真实对话中，用户随时可能开口打断。后端为每个连接维护独立的 `CancellationTokenSource`，一旦检测到说话或点击打断，立即熔断后台 LLM 生成和 TTS 合成，同时清理前端播放队列。
4. **双轨制影子教练（Shadow Coach）**：
   * 采用旁路异步分析，在用户说话的同时在副轨发起语法与表达分析，**完全不占用对话主链路的响应时间**。

---

## 二、 多国口音与角色矩阵

| 口音/国家 | 角色名称 | 角色背景 | ElevenLabs 预设 Voice | OpenAI TTS 映射 | Edge-TTS 映射 | 教学意义 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **🇺🇸 美国 (US)** | **Rachel Vance** | 纽约曼哈顿科技白领 | `21m00Tcm4TlvDq8ikWAM` | `alloy` | `en-US-JennyNeural` | 美语连读、弱读与现代职场/生活日常口语 |
| **🇬🇧 英国 (UK)** | **Arthur Pendelton** | 伦敦/牛津文学文化学者 | `JBFqnCBsd6RMkjVDRZzb` | `fable` | `en-GB-RyanNeural` | 纯正英音 RP 发音、雅思口语与严谨表达 |
| **🇦🇺 澳大利亚 (AU)** | **Liam O'Connor** | 悉尼冲浪与旅行博主 | `VR6AewLTigWG4xSOukaG` | `echo` | `en-AU-WilliamNeural` | 澳洲英语升调、特有俚语与英联邦口音适应 |
| **🇮🇳 印度 (IN)** | **Priya Sharma** | 班加罗尔首席软件架构师 | `EXAVITQu4vr4xnSDxMaL` | `shimmer` | `en-IN-NeerjaNeural` | 突破跨国远程工作中全球最普遍但最难辨析的口音 |
| **🇨🇦 加拿大 (CA)** | **Chloe Tremblay** | 温哥华环保学者与户外向导 | `AZnzlk1XvdvUeBnXmlld` | `nova` | `en-CA-ClaraNeural` | 纯净清晰发音，适合初学者过渡练习 |

---

## 三、 快速启动与运行指南

### 1. 前置环境
* 已安装 **.NET 10 SDK** (可以通过 `dotnet --version` 验证，支持 10.0.401 及以上)。
* 推荐浏览器：**Google Chrome** 或 **Microsoft Edge**（原生完整支持 Web Speech API 与 Web Audio API）。

### 2. 运行应用
在项目根目录下执行：

```bash
dotnet run --project src/LiveConversation.Web
```

启动后在浏览器打开：👉 **`http://localhost:5000`**

### 3. 配置您的 API Key（两种方式）

#### 方式一：直接在网页 UI 中配置（最推荐，即改即用）
1. 打开网页右上角 **⚙️ Settings**。
2. 填写您的 LLM 配置：
   * **Endpoint**：默认 `https://api.openai.com/v1`（如使用 DeepSeek 可填 `https://api.deepseek.com/v1`）。
   * **API Key**：您的 LLM API Key。
   * **Model**：`gpt-4o-mini` 或 `deepseek-chat` 等。
3. 选择您想使用的 TTS 引擎：
   * **ElevenLabs**：填入您的 ElevenLabs Key，享受顶级拟真发音。
   * **OpenAI TTS**：直接复用您的 LLM Key，官方原生高音质输出。
   * **Edge-TTS**：免费神经语音。
4. 点击 **🔊 Test Voice** 实时测试当前选择的语音效果，点击 **Save Changes** 自动持久化在浏览器本地。

#### 方式二：在服务端 `appsettings.json` 中配置
直接修改 [`src/LiveConversation.Web/appsettings.json`](file:///e:/Personal/LiveConversation/src/LiveConversation.Web/appsettings.json)：
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
    "Tts": {
      "ActiveProvider": "ElevenLabs"
    }
  }
}
```

---

## 四、 现代交互操作方式

* **双手自由对讲 (Hands-Free)**：点击麦克风开启，系统自动监听说话；检测到说话停顿约 900ms 时自动提交，真人语音回复完毕后自动恢复监听。
* **按键对讲模式 (Push-to-Talk)**：长按空格键或按住麦克风说话，松开即刻发送。
* **随时打断 (Barge-in)**：在对方说话时按下空格键或点击 **🛑 Interrupt** 按钮，立即打断并停止对方发音。
* **慢速重播 (0.8x)**：对 AI 回复气泡右上角的 `🔊 Replay (0.8x)` 点击即可慢速复读听清连读细节。
* **伴学侧边栏**：点击右上角 **🧠 AI Shadow Coach** 切换查看每句话的语法纠偏、地道替换词及中文深度解析。

---

## 五、 测试工程与测试闭环 (Unit & Integration Tests)

系统包含专门的测试工程 [`tests/LiveConversation.Tests`](file:///e:/Personal/LiveConversation/tests/LiveConversation.Tests)，覆盖单元测试与集成测试：

```bash
# 运行全部 34 项测试
dotnet test
```

### 测试矩阵说明
1. **单元测试 (Unit Tests)**：
   * `SentenceSegmenterTests`：验证流式输出断句的准确性，包含缩写词（如 `Dr.`、`U.S.`）、小数点、省略号及末尾 Flush 缓冲保护。
   * `PersonaRegistryTests`：验证 5 国口音角色（美、英、澳、印、加）与 5 大情景模式配置的完整性及双引擎 Voice 映射。
   * `TtsProviderFactoryTests`：验证动态工厂对大小写不敏感匹配、引擎热切换及向后兼容平替降级机制。
2. **集成测试 (Integration Tests)**：
   * `ApiEndpointsTests`：基于 `WebApplicationFactory<Program>` 启动真实内存 Web 服务器，验证 `/api/personas`、`/api/scenarios`、`/api/config` 及 `/index.html` 静态页面可访问性。
   * `TtsEngineIntegrationTests`：验证 ASP.NET Core 10 依赖注入容器是否正确装配所有 TTS 实现类（`ElevenLabsTtsProvider`、`EdgeTtsProvider`、`OpenAiTtsProvider`）与工厂类，并对缺失 Key 的安全防御性报错进行了断言验证。

---

## 六、 常见问题与排查 (FAQ)

1. **初次进入麦克风无法拾音？**
   * 请在浏览器弹出的麦克风授权弹窗中选择“允许”。Web Speech API 要求运行在 `localhost` 或安全 HTTPS 协议下。
2. **ElevenLabs 订阅到期后如何无痛平替？**
   * 进入网页右上角 **⚙️ Settings**，将 TTS Voice Engine 切换为 **OpenAI TTS**（直接利用您现存的 LLM 订阅）或 **Edge-TTS** 即可，不需要更换系统，完全零额外开销。
3. **支持修改对话场景与角色吗？**
   * 支持。所有角色的提示词与场景配置均在 [`PersonaRegistry.cs`](file:///e:/Personal/LiveConversation/src/LiveConversation.Web/Services/Personas/PersonaRegistry.cs) 中集中声明，可按需添加雅思专项、外企晋升汇报等任意定制场景。
