# My Digest

每天早上自动把我关注的 YouTube、播客、Newsletter 内容聚合成一条飞书卡片推送给自己。

---

## 为什么做这个

想每天早上快速了解关注的创作者有什么新内容，但逐个打开 YouTube、播客 App、邮件太分散。这个工具把所有来源抓取下来，用 Claude 提炼成摘要，一条卡片消息发到飞书——打开手机就能看完。

---

## 每天得到什么

一条飞书互动卡片消息，结构如下：

```
📱 Daily Digest · Jun 25, 2026

PERSONAL GROWTH
  ▶ YouTube
    Mel Robbins — "Do This Every Morning"
    ...

  🎙 Podcast
    Huberman Lab — "Episode Title"
    ...

  📧 Newsletter
    Dan Koe — "Issue Title"
    ...

──────────────────────
ENTERTAINMENT
  ▶ YouTube
    Ha Sisters — "Weekend Vlog"
    ...
```

- 每条内容 1–3 句话摘要 + 原链接
- 自动去重，已发送过的内容不重复出现
- 全英文，简洁

---

## 如何运行

### 自动运行（推荐）

GitHub Actions 每天 **北京时间 9:00 AM** 自动抓取内容，存入 `feeds/all-feeds.json`。

在仓库 Settings → Secrets → Actions 配置：

| Secret | 说明 |
|--------|------|
| `YOUTUBE_API_KEY` | YouTube Data API v3 Key |
| `FEISHU_WEBHOOK_URL` | 飞书自定义机器人 Webhook |

配置完成后，每天早上在飞书里触发 `/my-digest` 即可。

也可以在仓库 Actions 页面手动点 **Run workflow** 触发一次抓取。

### 手动触发摘要

在 Claude Code 里输入：

```
/my-digest
```

Claude 会读取最新 feeds，提炼摘要，推送到飞书。

---

## 文件结构

```
my-digest/
├── SKILL.md                        # Claude Code 操作指令
├── README.md                       # 本文件
├── .env                            # 本地环境变量（不入库）
├── .env.example                    # 环境变量模板
│
├── config/
│   └── sources.json                # 订阅来源配置（YouTube / RSS）
│
├── feeds/
│   ├── all-feeds.json              # GitHub Actions 每日抓取的内容
│   └── last-sent.json              # 已发送记录，用于去重
│
├── prompts/
│   ├── summarize-youtube.md        # YouTube 摘要指令
│   ├── summarize-podcast.md        # 播客摘要指令
│   ├── summarize-newsletter.md     # Newsletter 摘要指令
│   └── summarize-x.md             # X/Twitter 摘要指令
│
├── scripts/
│   ├── fetch-all.js                # 抓取所有来源，写入 all-feeds.json
│   └── deliver.js                  # 构建飞书卡片并推送
│
└── .github/workflows/
    └── daily-digest.yml            # 每日定时抓取的 GitHub Actions 配置
```

---

## 当前订阅来源

### Personal Growth
| 类型 | 名称 |
|------|------|
| YouTube | Mel Robbins |
| YouTube | Zara Zhang |
| YouTube | Dan Koe |
| YouTube | ami |
| Podcast | Huberman Lab |
| Newsletter | Dan Koe Newsletter |

### Entertainment
| 类型 | 名称 |
|------|------|
| YouTube | Good Hang with Amy Poehler |
| YouTube | Ha Sisters |

> 添加新来源：编辑 `config/sources.json`，YouTube 填 handle，RSS 填订阅地址，commit 后推送即可。
