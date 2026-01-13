# 🍺 Tavern-Link

**Tavern-Link** 是一个轻量级的 QQ 聊天引擎，兼容 SillyTavern 的角色卡和世界书格式，通过 OneBot (NapCat) 实现 QQ 聊天。

> 🎯 **设计理念**：保留 SillyTavern 的核心功能（角色卡、世界书、正则），去除冗余的前端界面，专注于 QQ 机器人场景。

> 🤖 **特别说明**：本项目含人量为 0%，全部代码由 Claude 编写。有 bug 欢迎提 Issue，我会叫 Claude 来修。

## ✨ 功能特性

- 🎭 **角色卡支持**：兼容 SillyTavern 格式的 PNG 角色卡（读取 tEXt/iTXt 块中的 Base64 JSON）
- 📚 **世界书支持**：支持关键词触发的世界书条目
- 🔧 **正则处理**：支持对 AI 回复进行正则替换
- 💬 **QQ 集成**：通过 OneBot WebSocket 连接 NapCat
- 🌐 **Web 面板**：简洁的 Web 管理界面
- 📱 **智能触发**：群聊@触发，私聊自动回复
- ✂️ **消息分段**：长回复自动分段发送，更自然

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
  }
}
```

### 配置项说明

| 配置项 | 说明 |
|--------|------|
| `server.port` | Web 面板端口 |
| `onebot.url` | NapCat WebSocket 地址 |
| `ai.baseUrl` | AI API 地址（支持 OpenAI 兼容格式） |
| `ai.apiKey` | API Key |
| `ai.model` | 模型名称 |
| `chat.allowedUsers` | 用户白名单（空数组表示不限制） |
| `chat.allowedGroups` | 群组白名单（空数组表示不限制） |
| `chat.splitMessage` | 是否分段发送长消息 |
| `chat.defaultCharacter` | 默认角色名称 |

## 🚀 运行

```bash
# 直接运行
npm start

# 开发模式（自动重载）
npm run dev
```

## 📁 数据目录结构

```
data/
├── characters/     # 角色卡 (.png)
└── worldbooks/     # 世界书 (.json)
```

## 🎭 角色卡格式

支持 SillyTavern 格式的 PNG 角色卡，角色数据存储在图片的 tEXt 或 iTXt 块中。

## 📚 世界书格式

支持 SillyTavern 格式的世界书 JSON 文件，包含关键词触发的条目。

## 🔧 正则规则

可以在 Web 面板中配置正则规则，对 AI 回复进行处理。

## 📝 触发规则

- **群聊**：必须 @机器人 才会回复
- **私聊**：默认自动回复所有消息

## 🛠️ 技术栈

- **后端**：Node.js + Express
- **WebSocket**：ws 库
- **OneBot**：NapCat 协议
- **前端**：原生 HTML/CSS/JS

## 📄 License

MIT License

## 🙏 致谢

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) - 角色卡和世界书格式参考
- [NapCat](https://github.com/NapNeko/NapCatQQ) - QQ OneBot 实现
