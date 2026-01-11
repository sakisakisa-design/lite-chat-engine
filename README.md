# Lite Chat Engine

一个轻量级的 QQ 聊天引擎，兼容 SillyTavern 的角色卡和世界书格式，通过 OneBot (NapCat) 实现 QQ 聊天。

## 功能特性

- 🎭 **角色卡支持**：兼容 SillyTavern 格式的 PNG 角色卡（读取 tEXt/iTXt 块中的 Base64 JSON）
- 📚 **世界书支持**：支持关键词触发的世界书条目
- 🔧 **正则处理**：支持对 AI 回复进行正则替换
- 💬 **QQ 集成**：通过 OneBot WebSocket 连接 NapCat
- 🌐 **Web 面板**：简洁的 Web 管理界面

## 安装

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/lite-chat-engine.git
cd lite-chat-engine

# 安装依赖
npm install

# 复制配置文件
cp config.example.json config.json

# 编辑配置文件，填入你的 API Key 等信息
nano config.json
```

## 配置说明

编辑 `config.json`：

```json
{
  "server": {
    "port": 8001,          // Web 面板端口
    "host": "0.0.0.0"      // 监听地址
  },
  "onebot": {
    "url": "ws://127.0.0.1:3001",  // NapCat WebSocket 地址
    "accessToken": ""               // 访问令牌（如果有）
  },
  "ai": {
    "baseUrl": "https://api.anthropic.com",  // AI API 地址
    "apiKey": "your-api-key-here",           // API Key
    "model": "claude-sonnet-4-20250514",              // 模型名称
    "maxTokens": 1000,                       // 最大 token 数
    "temperature": 1                         // 温度参数
  },
  "chat": {
    "triggerPrefix": "",    // 触发前缀（留空则所有消息都触发）
    "historyLimit": 20,     // 历史消息数量限制
    "allowedGroups": []     // 允许的群号列表（留空则允许所有）
  },
  "regex": {
    "enabled": true,        // 是否启用正则处理
    "rules": []             // 正则规则列表
  }
}
```

## 运行

```bash
node src/index.js
```

然后访问 `http://localhost:8001` 打开 Web 管理面板。

## 使用方法

1. **上传角色卡**：在 Web 面板中上传 SillyTavern 格式的 PNG 角色卡
2. **配置世界书**：上传或创建世界书条目
3. **连接 QQ**：确保 NapCat 正在运行并配置正确的 WebSocket 地址
4. **开始聊天**：在 QQ 中发送消息即可与 AI 角色对话

## 项目结构

```
lite-chat-engine/
├── src/
│   ├── index.js           # 主入口
│   ├── server.js          # Express 服务器
│   ├── onebot.js          # OneBot WebSocket 连接
│   ├── ai.js              # AI API 调用
│   ├── prompt.js          # Prompt 组装逻辑
│   ├── characterParser.js # 角色卡解析
│   ├── worldbook.js       # 世界书处理
│   └── regex.js           # 正则处理
├── public/
│   └── index.html         # Web 面板
├── data/
│   ├── characters/        # 角色卡存储
│   ├── worldbooks/        # 世界书存储
│   └── chats/             # 聊天记录
├── config.json            # 配置文件（不上传）
├── config.example.json    # 配置示例
└── package.json
```

## 依赖

- Node.js >= 18
- express
- ws
- pngjs

## License

MIT
