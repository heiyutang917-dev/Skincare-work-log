# 谷雨知肤助手服务端

这是一份支持 DeepSeek 与 OpenAI 的服务端代码，当前配置模板默认使用用户已有的 DeepSeek API，网页和产品库仍可单独使用

当前未配置真实模型密钥、没有部署线上服务，也没有产生模型调用费用

## 网站使用者会看到什么

- 原首页、配色与三个导航保留，记录右边增加独立 AI 圆钮
- AR 护肤与 AI 答疑是独立页面，有返回操作
- AI 未接通时明确显示状态，可以先阅读品牌产品资料
- 接通后围绕所选产品答疑，最近 7 天肤感需要用户主动勾选
- 不自动发送相机画面、照片、睡眠、HRV、运动、生活备注
- 每次问题及最多 3 轮对话会发送给模型，切换产品或肤感分享选项会重置发送的对话上下文
- 对话和体验码不写入本机长期存储，关闭网页后不会恢复

## 配置步骤

使用 Node.js 22 或以上版本，无额外安装依赖

1. 将 `.env.example` 复制为私有的 `.env`
2. 填写 `AI_PROVIDER=deepseek`、`DEEPSEEK_API_KEY`，模型默认 `DEEPSEEK_MODEL=deepseek-flash`
3. 生成一个至少 24 位的随机体验码，填写 `AI_ACCESS_TOKEN`
4. `ALLOWED_ORIGINS` 填网站的完整来源，默认示例是 `https://heiyutang917-dev.github.io`
5. 启动 `node --env-file=.env server.mjs`
6. 把服务发布为 HTTPS 地址，然后在网页 AI 页右上角的连接设置中填写地址和体验码

服务地址填写根地址，例如 `https://ai.example.com`，不加 `/api/ask`

模型密钥仅放服务端的私密配置中，不要写进 `assistant-config.js`，不要上传 `.env`，也不需要在聊天里发送密钥

目前 DeepSeek 使用官方 Chat Completions 接口 `https://api.deepseek.com/chat/completions`，关闭思考模式用于简短护理答疑，用户界面不显示推理内容

网页的服务地址要填你部署的谷雨后台地址，例如 `https://guyu-ai-service.onrender.com`，该地址需要由实际部署生成，不能填 `https://api.deepseek.com`

### 使用准备好的 Render 模板

把本代码包全部文件放在一个单独 GitHub 仓库的最外层，然后在 Render 选择 New → Blueprint，连接这个仓库

模板会请求你填写 `DEEPSEEK_API_KEY`，其它常规配置已经写好；`AI_ACCESS_TOKEN` 会生成随机体验码

部署完成后到该服务的 Environment 查看 `AI_ACCESS_TOKEN`，在网页连接设置中填写服务地址与这个体验码

模板使用 Free 服务作为演示起点，Render 免费服务可能休眠，首次连接时可先等待服务启动，再重试网页连接

手动创建 Web Service 时，Language 选 Node，Build Command 填 `node --check server.mjs`，Start Command 填 `node server.mjs`

云端设置 `HOST=0.0.0.0`，由平台设置 `PORT`，不需要固定为本机示例端口

### 保留的 OpenAI 配置

已有 OpenAI 部署可继续使用 `AI_PROVIDER=openai`、`OPENAI_API_KEY`、`OPENAI_MODEL`

没有显式设置 `AI_PROVIDER` 时，如果有 `DEEPSEEK_API_KEY` 则选择 DeepSeek，否则按原 OpenAI 配置运行，不会把某个平台的密钥发送到另一个平台

`assistant-config.js` 可以提前填写公开的服务地址，体验码仍由使用者在本次会话中输入

## 本机与手机测试

- 本机测试时，前端也应通过本机 HTTP 服务打开，`ALLOWED_ORIGINS` 填它的来源，例如 `http://localhost:8080`
- 手机不能通过 `localhost` 访问电脑上的服务，手机体验需要可访问的 HTTPS 服务地址
- 默认服务只监听本机 `127.0.0.1`，云平台通常需要设置 `HOST=0.0.0.0` 并由平台提供 HTTPS
- 不默认允许 `file://` 的空来源，正式网页应通过 HTTPS 打开

## 接入约定与边界

`GET /api/status` 检查服务是否配置，不代表已向模型验证密钥有效性

`POST /api/ask` 接收 `productId`、`message`、`feelings`、`history` 与可选 `expectedProvider`，品牌资料由服务端固定目录提供，网页会固定用户刚连接的提供方，后台若切换平台会在发送给模型之前要求重新连接

消息最多 800 字，肤感最多 7 天，对话最多 3 轮，请求最多 32KB

资料待复核的两款产品不向模型提供未核实的专属成分与机制

已包含来源白名单、体验码验证、输入限制、超时、取消、单进程限流和并发限制

这是小范围体验版本，体验码用于受邀访问，不是完整的用户账户系统，公开大量使用前需要接入用户登录、共享限流、监控和模型费用限制

服务不写入聊天日志，DeepSeek 请求使用非流式 Chat Completions，OpenAI 请求保留 `store: false`，这些配置不代表模型提供方零数据保留，仍应阅读实际所用平台的数据条款

## 验证情况

接口输入、来源验证、体验码、资料边界、请求限制与限流已通过本地检查

浏览器已检查连接、发送、取消、返回、文字安全显示、主动肤感分享，以及健康和备注不自动发送

这些测试使用受控的模拟模型返回，没有使用真实模型密钥，也没有验证模型的医学回答质量

DeepSeek 适配额外检查了官方请求格式、非思考模式、密钥与平台隔离、余额/密钥/配置错误、不完整回复以及网页真实连接流程，尚未用用户的密钥发起付费调用

## 官方依据

- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
- [DeepSeek 当前模型说明](https://api-docs.deepseek.com/quick_start/pricing/)
- [Render Blueprint 配置](https://render.com/docs/blueprint-spec)
- [Render 免费服务说明](https://render.com/docs/free)

- [OpenAI 文本生成与 Responses API](https://developers.openai.com/api/docs/guides/text)
- [OpenAI 生产环境实践与密钥管理](https://developers.openai.com/api/docs/guides/production-best-practices)
- [Responses 存储配置](https://developers.openai.com/api/docs/guides/migrate-to-responses)

网页入口与数据模型独立于服务端，未来可以替换其他模型提供方的适配实现
