# My Digest

个性化每日信息聚合。GitHub Actions 每天早上自动抓取内容存到仓库；
用户输入 `/my-digest` 时，由 Claude 读取最新内容、提炼双语摘要、推送到飞书。

---

## 首次使用 — 仓库初始化向导

检查 `~/.claude/skills/my-digest/.git` 是否存在。
如果不存在，运行以下向导：

### Step 1：创建 GitHub 仓库

告知用户：
"需要先把这个 skill 推送到你的 GitHub 私有仓库，这样 GitHub Actions 才能每天自动抓内容。"

```bash
cd ~/.claude/skills/my-digest
git init
git add .
git commit -m "init my-digest skill"
```

引导用户：
1. 打开 https://github.com/new
2. 仓库名填 `my-digest`，选 **Private**，不要勾选任何初始化选项
3. 点 Create repository
4. 按 GitHub 页面显示的命令 push：
   ```bash
   git remote add origin https://github.com/<你的用户名>/my-digest.git
   git branch -M main
   git push -u origin main
   ```

### Step 2：配置 GitHub Secrets

在仓库页面 → Settings → Secrets and variables → Actions → New repository secret，添加：

| Secret 名称 | 值 |
|-------------|-----|
| `YOUTUBE_API_KEY` | 你的 YouTube API Key |
| `FEISHU_WEBHOOK_URL` | 你的飞书 Webhook URL |

（X_BEARER_TOKEN 暂时跳过）

### Step 3：手动触发一次抓取

仓库页面 → Actions → Fetch Content → Run workflow → Run workflow

等待约 30 秒，Actions 完成后会把 `feeds/all-feeds.json` 提交到仓库。
初始化完成，告知用户：以后每天 9:00 AM 北京时间自动更新内容。

---

## Digest 生成流程（每次用户输入 `/my-digest`）

### Step 1：拉取最新内容

```bash
cd ~/.claude/skills/my-digest && git pull 2>/dev/null
```

### Step 2：读取 feeds

```bash
cat ~/.claude/skills/my-digest/feeds/all-feeds.json
```

读取 JSON 文件，获取内容。检查 `fetchedAt` 字段，告知用户内容的更新时间。

如果 YouTube、X、RSS 均无内容，告知用户："今日暂无新内容，请检查 GitHub Actions 是否正常运行。"

### Step 2.5：读取 last-sent 记录

```bash
cat ~/.claude/skills/my-digest/feeds/last-sent.json 2>/dev/null || echo "{}"
```

读取上次已发送的内容记录。文件结构如下：

```json
{
  "sentAt": "2026-06-16T...",
  "youtube": ["videoId1", "videoId2"],
  "rss": ["url-or-title1", "url-or-title2"]
}
```

如果文件不存在，视为首次运行，所有内容都是"新的"。

**过滤规则：**
- YouTube：跳过 `id` 已在 `last-sent.youtube` 中的视频
- RSS/Podcast/Newsletter：跳过 `url`（无 url 则用 `title`）已在 `last-sent.rss` 中的条目
- 过滤后某个分类完全没有新内容，则该分类不出现在 digest 中
- 所有分类都没有新内容，告知用户："今日暂无新内容，所有内容已在上次 digest 中发送过。"

### Step 3：读取 prompts

依次读取：
- `~/.claude/skills/my-digest/prompts/summarize-youtube.md`
- `~/.claude/skills/my-digest/prompts/summarize-x.md`
- `~/.claude/skills/my-digest/prompts/summarize-podcast.md`
- `~/.claude/skills/my-digest/prompts/summarize-newsletter.md`

### Step 4：提炼摘要

**严格规则：**
- 只使用 JSON 里的内容，不自行编造任何信息
- 每条内容必须带 URL，没有 URL 的不输出
- 按 prompt 指示生成英中双语交叉格式

按分类处理：

**YouTube**（每个频道取最新一条视频）：
按 `summarize-youtube.md` 的格式，提炼视频标题 + 内容简介

**X**（如有）：
按 `summarize-x.md` 的格式，提炼有价值的原创观点，跳过无实质内容

**RSS — Podcast**：
按 `summarize-podcast.md` 的格式，提炼核心洞察 + bullet points

**RSS — Newsletter**：
按 `summarize-newsletter.md` 的格式，提炼核心论点

### Step 5：组装 digest

格式：

```
📱 每日精选 · [今日日期，北京时间，中文]

━━━━ 个人成长 ━━━━

[各条摘要，英中交叉]

━━━━ 娱乐 ━━━━

[各条摘要，英中交叉]
```

### Step 6：推送到飞书

将完整 digest 写入临时文件并推送：

```bash
cat > /tmp/my-digest.txt << 'DIGESTEOF'
[digest 内容]
DIGESTEOF
cd ~/.claude/skills/my-digest/scripts && node deliver.js --file /tmp/my-digest.txt
```

推送成功后，执行 Step 7。

### Step 7：更新 last-sent 记录

将本次 digest 中实际发送的所有内容 ID 写入 `last-sent.json`：

- YouTube：收集本次发送的所有视频 `id`
- RSS：收集本次发送的所有条目的 `url`（无 url 的用 `title` 代替）
- `sentAt` 写入当前 UTC 时间（用 feeds 的 `fetchedAt` 值即可）

**写入方式（用 node 内联脚本）：**

```bash
node -e "
const fs = require('fs');
const sent = {
  sentAt: '<fetchedAt值>',
  youtube: ['<id1>', '<id2>', ...],
  rss: ['<url-or-title1>', '<url-or-title2>', ...]
};
fs.writeFileSync('/Users/insta360/.claude/skills/my-digest/feeds/last-sent.json', JSON.stringify(sent, null, 2));
console.log('last-sent.json updated');
"
```

写入成功后，询问用户：
"已推送到飞书，last-sent 已更新！摘要长度和风格是否合适？如需调整，告诉我。"

---

## 添加新信息源

当用户说想添加新的 YouTube 频道、播客或 Newsletter 时：

1. 读取 `~/.claude/skills/my-digest/config/sources.json`
2. 按已有格式添加新条目（YouTube 填 handle，RSS 填 URL）
3. 写入文件
4. 提交并推送：
   ```bash
   cd ~/.claude/skills/my-digest
   git add config/sources.json
   git commit -m "add source: <名称>"
   git push
   ```

## 查看当前信息源

```bash
cat ~/.claude/skills/my-digest/config/sources.json
```

---

## 当前信息源

### 个人成长
- YouTube: Mel Robbins, Zara Zhang, Dan Koe, ami
- X: Zara Zhang, Dan Koe（暂未配置 X API）
- Podcast: Huberman Lab
- Newsletter: Dan Koe Newsletter

### 娱乐
- YouTube: Good Hang with Amy Poehler, Ha Sisters
