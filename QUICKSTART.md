# ⚡ Quick Start Guide - 5 Minutes

Get your Slack feedback bot running in minutes!

## Step 1: Collect Your Credentials (2 min)

You'll need:
- ✅ **Slack Bot Token** (from Slack App creation)
- ✅ **Claude API Key** (from Anthropic console)
- ✅ **Notion API Key** (from Notion integrations)
- ✅ **Notion Database ID** (from your database URL)

### If you already have these from the setup process:
- Slack: `xoxb-...`
- Claude: `sk-ant-...`
- Notion API: `secret_...`
- Notion DB ID: `260dc119ad3c80eab232e7c7a1d14e22`

## Step 2: Install & Configure (2 min)

```bash
# 1. Extract the files to your desired location
cd slack-customer-feedback-bot

# 2. Install dependencies
npm install

# 3. Copy the example config
cp .env.example .env

# 4. Edit .env with your credentials
# Open .env in your text editor and fill in:
#   SLACK_BOT_TOKEN=xoxb-...
#   CLAUDE_API_KEY=sk-ant-...
#   NOTION_API_KEY=secret_...
#   NOTION_DATABASE_ID=260dc119ad3c80eab232e7c7a1d14e22

nano .env  # or use your favorite editor
```

## Step 3: Create the #bot-feedback Channel (30 sec)

In your Slack workspace:
1. Create a new channel called `#bot-feedback`
2. Invite the bot user to the channel
3. Done! 🎉

## Step 4: Start the Bot (30 sec)

```bash
npm start
```

You should see:
```
✅ All systems initialized
🚀 Starting scheduler - runs every 10 minutes
✅ Scheduler started
```

## Step 5: Test It! (1 min)

1. Go to any Slack channel in your workspace
2. Post a test message like:
   ```
   "Hey, the login button doesn't work on mobile"
   ```
3. Wait up to 10 minutes (or adjust SCHEDULER_INTERVAL in .env)
4. Check `#bot-feedback` for the bot's approval message
5. Click "Approve as-is"
6. Check your Notion database - new task should appear! ✨

## What Now?

### Keep It Running

**Option A: Keep terminal open**
```bash
npm start
```

**Option B: Run in background (Mac/Linux)**
```bash
nohup npm start > bot.log 2>&1 &
```

**Option C: Use PM2 (production)**
```bash
npm install -g pm2
pm2 start src/scheduler.js --name "feedback-bot"
pm2 save
pm2 startup
```

### Monitor the Logs

Watch what's happening:
```bash
# If using PM2
pm2 logs feedback-bot

# Or check the output file
tail -f bot.log
```

### Customize Settings

Edit `.env` to change:
- `SCHEDULER_INTERVAL=10` - Change to 5, 15, 30 minutes etc
- `LOOKBACK_DAYS=1` - How far back to scan
- `MIN_MESSAGE_LENGTH=20` - Minimum characters to analyze

### Next Steps

- Set up **continuous deployment** on AWS Lambda or Heroku
- Add **custom analysis** by editing the Claude prompt in `src/analyzer.js`
- Integrate with your **team workflow**
- Configure **approval notifications**

## Troubleshooting

### Bot doesn't start?
```bash
# Check Node.js is installed
node --version  # Should be 16+

# Check all dependencies
npm install

# Check .env file has all required keys
cat .env
```

### No messages in #bot-feedback?
- Wait a bit longer (up to SCHEDULER_INTERVAL minutes)
- Post messages in Slack that are more than 20 characters
- Check console output for errors

### Task not appearing in Notion?
- Click "Approve as-is" (not "Review & Edit" - that's for future)
- Check your Notion database is shared with the integration
- Check the database ID is correct in .env

## Full Documentation

For more details, see [README.md](README.md)

---

**That's it! 🚀 Your bot is now monitoring customer feedback!**

Next message from customers will automatically become Notion tasks (pending your approval).
