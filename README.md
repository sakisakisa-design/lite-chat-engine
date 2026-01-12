# 🍺 Tavern-Link

**Tavern-Link** 是一个轻量级的 QQ 聊天引擎，兼容 SillyTavern 的角色卡和世界书格式，通过 OneBot (NapCat) 实现 QQ 聊天。

> 🎯 **设计理念**：保留 SillyTavern 的核心功能（角色卡、世界书、正则），去除冗余的前端界面，专注于 QQ 机器人场景。

## ✨ 功能特性

- 🎭 **角色卡支持**：兼容 SillyTavern 格式的 PNG 角色卡（读取 tEXt/iTXt 块中的 Base64 JSON）
- 📚 **世界书支持**：支持关键词触发的世界书条目
- 🔧 **正则处理**：支持对 AI 回复进行正则替换
- 💬 **QQ 集成**：通过 OneBot WebSocket 连接 NapCat
- 🌐 **Web 面板**：简洁的 Web 管理界面，支持登录认证
- 📱 **智能触发**：群聊@触发，私聊自动回复
- ✂️ **消息分段**：长回复自动分段发送，更自然
- 🔊 **TTS 语音合成**：支持豆包（字节跳动）TTS，AI 可以发送语音消息

## 📦 安装

```bash
# 克隆仓库
git clone https://github.com/sakisakisa-design/tavern-link.git
cd tavern-link

# 安装依赖
npm install

# 复制配置文件
cp config.example.json config.json

# 编辑配置文件，填入你的 API Key 等信息
nano config.json
```

## ⚙️ 配置说明

编辑 `config.json`：

```json
{
  "auth": {
    "enabled": true,
    "username": "admin",
    "password": "your-password-here",
    "sessionSecret": "your-random-secret-key"
  },
  "server": {
    "port": 8001,
    "host": "0.0.0.0"
  },
  "onebot": {
    "url": "ws://127.0.0.1:3001",
    "accessToken": ""
  },
  "ai": {
    "baseUrl": "https://api.anthropic.com/v1",
    "apiKey": "your-api-key-here",
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 4096,
    "temperature": 1
  },
  "chat": {
    "triggerPrefix": "",
    "historyLimit": 50,
    "allowedUsers": [],
    "allowedGroups": [],
    "splitMessage": true,
    "defaultCharacter": ""
  },
  "regex": {
    "enabled": true,
    "rules": []
  },
  "tts": {
    "enabled": false,
    "appId": "your-doubao-app-id",
    "accessToken": "your-doubao-access-token",
    "voiceType": "zh_female_wanwanxiaohe_moon_bigtts",
    "speed": 1,
    "volume": 1,
    "pitch": 1
  }
}
```

### 配置项说明

| 配置项 | 说明 |
|--------|------|
| `auth.enabled` | 是否启用登录认证 |
| `auth.username` | 登录用户名 |
| `auth.password` | 登录密码 |
| `server.port` | Web 面板端口 |
| `onebot.url` | NapCat WebSocket 地址 |
| `ai.baseUrl` | AI API 地址（支持 OpenAI 兼容格式） |
| `ai.apiKey` | API Key |
| `ai.model` | 模型名称 |
| `chat.allowedUsers` | 用户白名单（空数组表示不限制） |
| `chat.allowedGroups` | 群组白名单（空数组表示不限制） |
| `chat.splitMessage` | 是否分段发送长消息 |
| `chat.defaultCharacter` | 默认角色名称 |
| `tts.enabled` | 是否启用 TTS 语音合成 |
| `tts.appId` | 豆包 TTS App ID |
| `tts.accessToken` | 豆包 TTS Access Token |
| `tts.voiceType` | 音色类型 |

## 🔊 TTS 语音合成

Tavern-Link 支持豆包（字节跳动）TTS 语音合成功能。启用后，AI 可以在回复中使用 `[voice:要说的话]` 或 `［voice:要说的话］` 格式发送语音消息。

### 获取豆包 TTS 凭证

1. 访问 [火山引擎控制台](https://console.volcengine.com/)
2. 开通语音合成服务
3. 创建应用获取 App ID 和 Access Token

### 支持的音色

在 Web 面板的 TTS 设置中可以选择不同的音色，包括：
- 多种男声/女声
- 不同风格（温柔、活泼、专业等）
- 支持中英文

### 使用方式

在角色卡的系统提示中告诉 AI 可以使用 `[voice:内容]` 格式发送语音，AI 就会在适当的时候发送语音消息。

## 🚀 运行

```bash
# 直接运行
npm start

# 开发模式（自动重载）
npm run dev
```

访问 `http://localhost:8001` 打开 Web 管理面板。

## 📁 数据目录结构

```
data/
├── characters/          # 角色卡 (.png)
├── character_overrides/ # 角色覆盖配置
├── worlds/              # 世界书 (.json)
└── chats/               # 聊天记录
```

## 🎭 角色卡格式

支持 SillyTavern 格式的 PNG 角色卡，角色数据存储在图片的 tEXt 或 iTXt 块中。

将角色卡 PNG 文件放入 `data/characters/` 目录即可使用。

## 📚 世界书格式

支持 SillyTavern 格式的世界书 JSON 文件，包含关键词触发的条目。

世界书文件命名格式：`角色名_worldbook.json`，放入 `data/worlds/` 目录。

## 🔧 正则规则

可以在 Web 面板中配置正则规则，对 AI 回复进行处理。支持：
- 替换敏感词
- 格式化输出
- 移除不需要的内容

## 📝 触发规则

- **群聊**：必须 @机器人 才会回复
- **私聊**：默认自动回复所有消息
- **白名单**：可配置允许的用户/群组

## 🛠️ 技术栈

- **后端**：Node.js + Express
- **WebSocket**：ws 库
- **OneBot**：NapCat 协议
- **前端**：原生 HTML/CSS/JS
- **TTS**：豆包语音合成 V3 WebSocket API

## 🐳 Docker 兼容

如果 NapCat 运行在 Docker 容器中，语音消息会自动使用 base64 编码发送，无需挂载宿主机目录。

## 📄 License

MIT License

## 🙏 致谢

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) - 角色卡和世界书格式参考
- [NapCat](https://github.com/NapNeko/NapCatQQ) - QQ OneBot 实现
- [火山引擎](https://www.volcengine.com/) - 豆包 TTS 语音合成服务
