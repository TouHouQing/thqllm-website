---
name: thq-video-api
description: 接入 THQ Video API（https://new.thqllm.com），实现模型查询、异步视频任务、参考素材输入、状态轮询和结果 URL 预览下载。适用于需要在应用或脚本中集成 THQ 视频生成的开发任务。
---

# THQ Video API

为用户现有项目完成视频 API 接入，沿用项目的语言、配置与任务存储方式。
工作台教程与接口文档位于 https://thqllm.com/docs/thq-video-api/。

## 连接信息

- 服务根地址：`https://new.thqllm.com`。
- 环境变量：`THQ_VIDEO_BASE_URL=https://new.thqllm.com`、`THQ_VIDEO_API_KEY`。根地址不含 `/v1`。
- API 鉴权：`Authorization: Bearer <THQ_VIDEO_API_KEY>`。不能用登录 Cookie 代替。
- Key 从服务端配置读取，不放进公开前端或日志。
- `GET /v1/models` 返回当前 Key 可见的 `data[].id`。使用真实返回的模型 ID，不猜测价格或能力。
- 模型、Key 分组与工作台当前分组分别检查，不把工作台选中分组当作 Key 已有权限。

## 接入流程

1. 读取项目已有配置，通过模型列表验证地址与权限。
2. `POST /v1/videos` 创建一次任务，立即持久化完整 `id`，不要删去 `task_` 前缀。
3. 每 5–10 秒 `GET /v1/videos/{id}`，提供错误展示与恢复查询。
4. 成功后保存响应中的 `url`，直接交给播放器或下载器，不拼接结果域名或路径。

创建成功仅表示受理；生成不是聊天或 SSE 流式接口。
只验证连接时查询模型即可。生成任务测试按用户已有授权执行，不把读取技能当作额外付费授权。

## JSON 创建任务

```json
{
  "model": "MODEL_ID_FROM_V1_MODELS",
  "prompt": "雨后的街道，镜头缓慢前进，写实电影质感",
  "seconds": "5",
  "size": "16:9",
  "resolution": "720p"
}
```

- `model`、非空 `prompt` 必填。示例时长、比例和清晰度需按模型调整。
- `seconds` 是字符串；`duration` 是整数兼容别名，不传入相互冲突的时长。
- `size` 直接传比例，例如 `16:9`、`9:16`、`1:1`、`4:3`、`3:4`、`21:9`。不换算像素，不改用 `ratio`。
- `resolution` 独立传 `480p`、`720p` 或 `1080p` 等模型支持档位，不使用 `resolution_name`。
- 比例不保证固定像素尺寸；固定时长或其他能力限制以当前模型说明为准。
- `metadata` 是附加信息容器，不依赖任意自定义键控制生成。
- `seed`、`fps`、`n`、`generate_audio` 等只在模型明确支持时使用。

参数详情：https://thqllm.com/docs/thq-video-api/parameters。

## 参考素材

- 图片优先使用 JSON `images: ["https://media.example.com/reference.jpg"]`；一张图也使用数组。
- 音视频参考使用 `reference_videos`、`reference_audios` URL 数组，仅在模型支持时添加。
- `image` / `input_reference` 是 JSON 单图 URL 兼容字段，不与 `images` 混用；`reference_image_urls` 是图片数组别名。
- `input_video` / `input_audio` 按模型说明用于已有兼容接入。
- URL 需在排队与生成期间可读取，签名参数原样保留。不要传本地路径、`blob:`、`data:` 或需要登录的网页。
- 多张本地素材先使用项目已有存储服务取得 HTTPS URL，不猜测素材上传端点。
- multipart 仅提交一张本地图片，文件字段为一个 `input_reference`；文本字段也不重复。
- multipart 不手动设置 Content-Type，由客户端生成 boundary；多素材改用 JSON URL 数组。
- 参考音频不代表输出一定有音轨，参考视频不代表模型支持视频延长。

素材详情：https://thqllm.com/docs/thq-video-api/media。

## 状态与结果

- `queued`、`in_progress`、`processing`：继续查询。进度值不代替最终状态。
- `completed`：读取 `url`；尚无有效 URL 时继续查原任务，不重新生成。
- `failed`：展示 `error.message` 或 `fail_reason`，停止正常轮询。
- 兼容 `success` / `succeeded` 成功态，`failure` / `cancelled` / `canceled` 失败态；未知状态不能视为成功。
- 总等待时间与单次 HTTP 超时分开设置，可按业务配置 30–60 分钟或更长。到期保留 ID，允许之后继续查询。
- 结果直接使用响应 `url`，不要调用 `/v1/videos/{id}/content`。
- 媒体下载不携带 API Key，检查最终 HTTP 状态与 Content-Type，避免把 HTML/JSON 保存成视频。
- 不承诺固定生成耗时、结果有效期或退款规则，以当前模型与账户记录为准。

任务与示例：https://thqllm.com/docs/thq-video-api/tasks、https://thqllm.com/docs/thq-video-api/examples。

## 错误与重试

- 创建超时、连接中断或 5xx：先核对控制台是否已受理，不自动重发创建请求。
- 查询超时、429 或临时 5xx：退避后查询同一 ID，有 Retry-After 时遵守等待时间。
- 400：读取参数或任务错误，修正后处理，不重复相同无效请求。
- 401 / 403：检查 Key、分组权限和素材可读取性。
- 404：检查路径、完整任务 ID 与模型可用性。
- 409：结果未准备好时继续查询任务，不重新生成。
- 413 / 415：检查素材大小、格式与 MIME。
- 失败任务再次生成是新请求，应按用户意图与授权决定。

保留任务 ID、请求时间、HTTP 状态与 X-Oneapi-Request-Id，不输出 Key 或私人素材签名。
错误详情：https://thqllm.com/docs/thq-video-api/faq。
