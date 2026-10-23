# LiveConversation AI - Real-time Voice Simulation System (.NET 10)

[English](README.md) | [中文](README.zh.md)

A high-fidelity, ultra-low-latency real-time voice conversation practice system built on **.NET 10**, **SignalR**, and **modern Web Audio**.

Engineered for accelerating spoken language mastery, featuring **multi-accent persona switching (including Standard Mandarin and Bilingual English-Mandarin)**, **anti-vendor-lockin multi-engine voice synthesis (ElevenLabs, OpenAI TTS, Edge-TTS, and Web Speech API)**, **flexible STT (Web Speech API & Whisper)**, an **ultra-low-latency streaming sentence-chunking pipeline**, a **dual-track AI Shadow Coach (real-time grammar correction, native phrasing alternatives, and deep explanations)**, and **full mobile & tablet responsive adaptation**.

---

## 1. System Architecture & Key Engineering Highlights

```
                    ┌────────────────────────────────────────────────────────┐
                    │            Web Frontend (Desktop / Mobile / Tablet)    │
                    │  Web Speech / Whisper STT <-> Web Audio Smooth Queue   │
                    │  (Hands-Free Auto-VAD / Push-to-Talk / Orb Visualizer) │
                    └───────────────────────────┬────────────────────────────┘
                                                │ Full-duplex low-latency SignalR stream
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               .NET 10 Conversation Orchestrator        │
                    │ (SentenceSegmenter + CancellationToken Barge-in Ctrl)  │
                    └───────────────┬────────────────────────┬───────────────┘
                                    │                        │
                      [Main Track: Low-latency Audio]  [Side Track: Async Shadow Coach]
                                    ▼                        ▼
                        ┌─────────────────────────┐   ┌────────────────┐
                        │  OpenAI / DeepSeek LLM  │   │  Shadow Coach  │
                        └────────────┬────────────┘   │ (Grammar/Idiom)│
                                     │ Sentence chunks└───────┬────────┘
                                     ▼                        │
                        ┌─────────────────────────┐           │
                        │   ITtsProvider Abstr.   │           │
                        └──────┬─────┬─────┬──────┘           │
                               │     │     │                  │
                               ▼     ▼     ▼                  │
                          ElevenLabs │  Edge-TTS              │
                        (Top Realism)│ (Free Neural)          │
                                     ▼                        │
                                OpenAI TTS                    │
                             (Reuse LLM Key)                  │
                               │     │     │                  │
                               └─────┴──┬──┴──────────────────┘
                                        │ Self-contained MP3 chunks
                                        ▼
                    ┌────────────────────────────────────────────────────────┐
                    │       Pushed to Client Audio Queue & Coach Sidebar      │
                    └────────────────────────────────────────────────────────┘
```

1. **Streaming Sentence-Chunking Pipeline**:
   * Eliminates browser `EncodingError` exceptions caused by attempting to decode sliced MP3 byte streams directly.
   * As soon as the LLM finishes the first complete sentence, audio synthesis kicks off immediately, allowing users to hear spoken responses within **600–900ms**.
2. **Dual-Engine Speech-to-Text (Web Speech API & Whisper)**:
   * **Web Speech API**: In-browser native recognition, zero latency, and zero token costs.
   * **Whisper STT**: Seamless integration with Groq Whisper (`whisper-large-v3`, `whisper-large-v3-turbo`) or OpenAI Whisper, featuring configurable endpoint, API key, and model overrides for rock-solid transcription across accents and background noise.
3. **Anti-Vendor-Lockin TTS Matrix**:
   * Switch dynamically between four voice synthesis backends:
     * **ElevenLabs**: High-fidelity realism (supporting Turbo v2.5).
     * **OpenAI TTS (`tts-1`)**: Directly reuse your existing LLM API key with zero new account signups.
     * **Microsoft Edge-TTS**: Pure C# native WebSocket implementation with lifelike Microsoft neural voices—completely free.
     * **Web Speech API**: In-browser client-side fallback.
4. **Instant Barge-in & Acoustic Echo Loop Prevention**:
   * Dedicated `CancellationTokenSource` per connection enables immediate cancellation of backend LLM generation and TTS rendering whenever user speech or manual interruption is detected.
   * **Echo Prevention**: In Hands-Free mode, mic listening is automatically locked while AI audio is playing, followed by a debounce cooldown before reactivating, eliminating speaker-to-mic feedback loops.
5. **Language-Adaptive Shadow Coach**:
   * Runs asynchronously on a decoupled side track without delaying spoken conversational replies.
   * **Language Adaptive**: When practicing with Chinese (`CN`) or Bilingual (`CN-EN`) personas in Mandarin, the coach automatically uses dedicated Mandarin prompts to deliver natural Chinese corrections and phrasing suggestions rather than mistakenly translating the speech into English.

---

## 2. Multi-Accent & Persona Matrix

| Accent / Code | Persona Name | Background | ElevenLabs Voice | OpenAI TTS | Edge-TTS | Pedagogical & Spoken Style |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **🇺🇸 United States (US)** | **Rachel Vance** | Manhattan Tech Professional | `21m00Tcm4TlvDq8ikWAM` | `alloy` | `en-US-JennyNeural` | American connected speech, reductions, contractions, and modern workplace dialogue |
| **🇬🇧 United Kingdom (UK)**| **Arthur Pendelton** | Oxford Literature & Culture Tutor | `JBFqnCBsd6RMkjVDRZzb` | `fable` | `en-GB-RyanNeural` | British Received Pronunciation (RP), IELTS speaking fluency, and refined idioms |
| **🇮🇳 India (IN)** | **Priya Sharma** | Bengaluru Principal Architect | `onwK4e9ZLuTAKqWW03F9` | `shimmer` | `en-IN-NeerjaNeural` | South Asian English articulation, cadence, and multinational tech communication |
| **🇨🇦 Canada (CA)** | **Chloe Tremblay** | Vancouver Environmental Scientist | `AZnzlk1XvdvUeBnXmlld` | `nova` | `en-CA-ClaraNeural` | Clean, polite Canadian accent and conversational markers (`eh?`, `for sure`) |
| **🇷🇴 Romania (RO)** | **Elena Radu** | Bucharest Tech Blogger & Engineer | `XB0fDUnXU5powFXDhCwa` | `alloy` | `en-IE-EmilyNeural` | Clear Eastern European / Romance-influenced cadence, ideal for Euro-tech workplaces |
| **🇺🇦 Ukraine (UA)** | **Oksana Kovalenko** | Kyiv Creative Designer & Tutor | `XB0fDUnXU5powFXDhCwa` | `fable` | `en-GB-SoniaNeural` | Warm, melodic Slavic English cadence, supportive and patient for language learners |
| **🇨🇳 Mandarin Chinese (CN)**| **Zhang Wei (张伟)** | Beijing Product Manager | `21m00Tcm4TlvDq8ikWAM` | `alloy` | `zh-CN-YunxiNeural` | Standard Mandarin Chinese, authentic oral expressions, daily life & career discussions |
| **🇨🇳 Bilingual (CN-EN)** | **Lin Wei (林薇)** | Shanghai Bilingual Oral Coach | `21m00Tcm4TlvDq8ikWAM` | `nova` | `zh-CN-XiaoxiaoNeural` | Fluent bilingual English & Mandarin switching, pronunciation coaching, grammar breakdown |

---

## 3. Practice Scenarios

1. ☕ **Casual Coffee Chat (`daily-chat`)**: Low-pressure small talk about daily routines, hobbies, movies, and weekend trips.
2. 💼 **Job Interview Practice (`job-interview`)**: Professional behavioral questions, STAR method responses, and problem-solving simulations.
3. 🎓 **IELTS Speaking Prep (`ielts-speaking`)**: Part 2 & Part 3 practice, expanding arguments, cohesive devices, and abstract discussion.
4. ✈️ **Travel & Hotel Check-in (`travel-airport`)**: Airport check-in, immigration counters, hotel reservations, and handling flight delays.
5. 💻 **Tech & Product Standup (`tech-discussion`)**: Agile sprint standups, architectural trade-offs, API discussions, and blocker resolution.

---

## 4. Quick Start Guide

### Prerequisites
* **.NET 10 SDK** (v10.0.401 or later).
* Recommended browsers: **Google Chrome**, **Microsoft Edge**, or modern mobile browsers (Safari / Chrome for Mobile).

### Running the Application

```powershell
dotnet run --project src/LiveConversation.Web
```

Open your browser at: 👉 **`http://localhost:5067`** (or the port defined in launchSettings)

### Configuration Options

#### Option A: Interactive In-Browser Settings (Recommended)
1. Click the **⚙️ Settings** button at the top right (draggable and top-aligned for quick access).
2. Under **LLM Settings**, enter your endpoint, API key, and model (compatible with OpenAI, DeepSeek, Groq, and any OpenAI-compatible provider).
3. Under **TTS Settings**, choose between ElevenLabs, OpenAI TTS, Edge-TTS, or Web Speech API. Click **🔊 Test Voice** to preview audio.
4. Under **STT Settings**, select Web Speech API or Whisper (configure Groq Whisper or OpenAI Whisper endpoints).
5. Click **Save Changes**—settings are automatically persisted to LocalStorage.

#### Option B: Server-Side `appsettings.json`
Configure default keys directly in [`src/LiveConversation.Web/appsettings.json`](src/LiveConversation.Web/appsettings.json):

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

## 5. Modern Interaction & Customization Features

* **4 Curated Color Themes**:
  * 🌌 **Cosmic Dark** (Default immersive dark mode)
  * 🌲 **Cyber Emerald** (Tech-focused emerald green)
  * 🌆 **Midnight Purple** (Sophisticated nocturnal purple)
  * ☀️ **Modern Light** (Clean, contemporary daylight styling)
* **Mobile & Tablet Adaptation**:
  * Responsive layouts for phone and tablet screens with touch gesture support;
  * Independent scrolling containers for dialogue and coaching streams with draggable settings modal;
  * Floating "Back to Top" button for quick navigation.
* **Instant Bilingual Interface**: Click `🇨🇳 中文 / 🇺🇸 English` in the header for real-time localized labels.
* **Dual Interaction Modes**:
  * **Hands-Free**: Speak naturally with auto-VAD silence detection and dynamic audio orb visualizer.
  * **Push-to-Talk**: Hold Spacebar or press the microphone button to record, release to send.
* **Slow Replay (0.8x)**: Click `🔊 Replay (0.8x)` on any assistant bubble to hear connected speech and phonetics slowly.

---

## 6. Testing

The solution includes a full automated test suite in [`tests/LiveConversation.Tests`](tests/LiveConversation.Tests):

```powershell
dotnet test
```

47 passing tests cover both unit and integration pipelines:
- **Sentence Segmenter Pipeline** (`SentenceSegmenterTests`): Validates streaming punctuation boundaries, abbreviations (`Dr.`, `U.S.`), ellipses, and tail flushing.
- **Persona & Scenario Matrix** (`PersonaRegistryTests`): Ensures validity of all 8 personas, scenario greetings, and TTS voice bindings.
- **Coach Feedback Data Contracts** (`CoachFeedbackSerializationTests`): Asserts JSON schema parsing for both English and Chinese coaching outputs.
- **API Endpoint Tests** (`ApiEndpointsTests`): Boots in-memory `WebApplicationFactory` to verify `/api/personas`, `/api/scenarios`, and static asset serving.
- **TTS Engine Assembly** (`TtsEngineIntegrationTests`): Confirms DI container resolution for ElevenLabs, Edge-TTS, and OpenAI TTS providers.

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE) (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
