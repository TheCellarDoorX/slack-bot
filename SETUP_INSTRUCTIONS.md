# Detailed Setup Instructions

## Overview

This guide walks you through setting up the Slack Customer Feedback Bot step-by-step.

## Prerequisites Checklist

Before starting, make sure you have:
- [ ] A Slack workspace where you have admin or app creation permissions
- [ ] A Notion workspace with a database for your backlog
- [ ] An Anthropic Claude API account with active credits
- [ ] Node.js 16 or higher installed on your computer
- [ ] A terminal/command line application
- [ ] A text editor

## Phase 1: Slack Setup (15 minutes)

### Step 1.1: Create a Slack App

1. Navigate to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click the green **"Create New App"** button
3. Select **"From scratch"**
4. Fill in the form:
   - **App name**: `Customer Feedback Bot`
   - **Pick a workspace**: Select your workspace
5. Click **"Create App"**

### Step 1.2: Configure OAuth & Permissions

1. In the left sidebar, click **"OAuth & Permissions"**
2. Scroll down to **"Scopes"** section
3. Click **"Add an OAuth Scope"** under **Bot Token Scopes**
4. Add these scopes (one at a time):
   - `chat:write` - For sending messages
   - `channels:read` - For reading channel info
   - `users:read` - For reading user info
   - `reactions:read` - For reading reactions

5. Scroll up to **"OAuth Tokens for Your Workspace"**
6. Click **"Install to Workspace"** (if not already done)
7. Review permissions and click **"Allow"**
8. **Copy the "Bot User OAuth Token"** (starts with `xoxb-`)
   - Save this somewhere safe - you'll need it later
   - Do NOT commit this token to GitHub!

### Step 1.3: Create the Approval Channel

1. Go to your Slack workspace
2. Click the **"+"** next to "Channels" to create a new channel
3. Name it: `bot-feedback`
4. Make it **Private** or **Public** (your choice)
5. Click **"Create"**
6. Invite the bot to the channel:
   - Type `/invite @Customer Feedback Bot` in the channel
   - The bot should appear in the channel

## Phase 2: Notion Setup (10 minutes)

### Step 2.1: Create Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"Create new integration"**
3. Give it a name: `Customer Feedback Bot`
4. For **"Select an associated workspace"**: Choose your workspace
5. Click **"Submit"**
6. Copy your **"Internal Integration Token"** (looks like: `secret_1234567890XXXXXXXXXXXX`)
   - Save this somewhere safe

### Step 2.2: Create or Open Your Database

1. In your Notion workspace, create a new **Database** or use an existing one
2. Name it something like: `Product Backlog` or `Feedback`
3. Make sure it has these properties:
   - **Title** (required, text/title type)
   - **Description** (rich_text)
   - **Priority** (select with options: High, Medium, Low)
   - **Type** (select with options: Bug, Feature, Enhancement, Other)
   - **Status** (select with options: Backlog, In Progress, Done)
   - **Slack Message Link** (url)
   - **Assignee** (people) - optional
   - **Due Date** (date) - optional

### Step 2.3: Share Database with Integration

1. Open your database in Notion
2. Click the **three-dot menu** (...) in the top-right
3. Click **"Add connections"**
4. Search for and select **"Customer Feedback Bot"** (the integration you just created)

### Step 2.4: Get Your Database ID

1. Open your database in Notion
2. Look at the URL in your browser:
   - Example: `https://www.notion.so/myworkspace/34f2d5a1b2c3d4e5f6g7h8i9j0k1l2m3?v=1234567890`
3. Find the long string of characters between the workspace name and the `?`
   - In the example above: `34f2d5a1b2c3d4e5f6g7h8i9j0k1l2m3`
4. This is your **Database ID** - save it somewhere safe

## Phase 3: Claude API Setup (5 minutes)

1. Go to [https://console.anthropic.com/account/keys](https://console.anthropic.com/account/keys)
2. Click **"Create new key"**
3. Give it a name (e.g., "Slack Bot") - optional
4. Copy the **API Key** (looks like: `sk-ant-XXXXXXXXXXXXXXXXXXXXXXXXXXXXX`)
   - Save this somewhere safe
5. Make sure your account has API credits

## Phase 4: Installation (5 minutes)

### Step 4.1: Download and Install

1. **Download the bot files** (you should have received them)
2. Extract them to a folder on your computer
3. Open a terminal/command line
4. Navigate to the folder:
   ```bash
   cd /path/to/slack-customer-feedback-bot
   ```

### Step 4.2: Install Dependencies

```bash
npm install
```

This will download and install all required packages. It may take 1-2 minutes.

### Step 4.3: Create Configuration File

1. Copy the example configuration:
   ```bash
   cp .env.example .env
   ```

2. Open the `.env` file in your text editor

3. Fill in your credentials:
   ```
   SLACK_BOT_TOKEN=xoxb-paste-your-token-here
   CLAUDE_API_KEY=sk-ant-paste-your-key-here
   NOTION_API_KEY=secret_paste-your-key-here
   NOTION_DATABASE_ID=paste-your-database-id-here
   APPROVAL_CHANNEL_NAME=bot-feedback
   SCHEDULER_INTERVAL=10
   NODE_ENV=development
   ```

4. Save the file

## Phase 5: Running the Bot (2 minutes)

### First Run

```bash
npm start
```

You should see output like:
```
🤖 Initializing Customer Feedback Bot...
✅ Slack client initialized
✅ Notion database connected
📋 Available properties: Title, Description, Priority, Type, Status, Slack Message Link

📅 [2024-01-15T10:30:00.000Z] Starting feedback analysis cycle...
📥 Fetching recent messages...
   Found 0 messages to analyze
   No new messages found

✅ Cycle complete (234ms)

🚀 Starting scheduler - runs every 10 minutes
✅ Scheduler started
```

Great! The bot is running. 🎉

### Testing the Bot

1. Go to any channel in your Slack workspace (except `#bot-feedback`)
2. Post a test message:
   ```
   The search feature doesn't work properly on mobile devices. When I type a search term, the results don't load.
   ```
3. Wait up to 10 minutes (or change SCHEDULER_INTERVAL in .env to a smaller number)
4. Check `#bot-feedback` - you should see a formatted approval message
5. Click **"✅ Approve as-is"**
6. Go to your Notion database - a new task should appear! ✨

### Keeping the Bot Running

**Option 1: Keep Terminal Open**
- Leave the terminal window open
- Bot will run as long as the terminal is open

**Option 2: Run in Background (Linux/Mac)**
```bash
nohup npm start > bot.log 2>&1 &
```
Then check logs with:
```bash
tail -f bot.log
```

**Option 3: Use PM2 (Recommended for Production)**
```bash
npm install -g pm2
pm2 start src/scheduler.js --name "feedback-bot"
pm2 startup    # Auto-start on reboot
pm2 save       # Save current config
```

Monitor with:
```bash
pm2 logs feedback-bot
```

## Customization

### Change How Often Bot Runs

Edit `.env`:
```
SCHEDULER_INTERVAL=5    # Run every 5 minutes
SCHEDULER_INTERVAL=30   # Run every 30 minutes
```

### Change Lookback Period

Edit `.env`:
```
LOOKBACK_DAYS=1    # Scan last 24 hours
LOOKBACK_DAYS=7    # Scan last week
```

### Change Minimum Message Length

Edit `.env`:
```
MIN_MESSAGE_LENGTH=10   # Analyze shorter messages
MIN_MESSAGE_LENGTH=50   # Only analyze longer messages
```

## Troubleshooting

### Error: "SLACK_BOT_TOKEN not provided"
- Make sure you created the `.env` file
- Make sure you copied your Slack bot token correctly
- Tokens start with `xoxb-`

### Error: "Notion API key is invalid"
- Check you're using an **Internal Integration Token** (starts with `secret_`)
- Not an API key from somewhere else

### Error: "Database not found"
- Double-check your Database ID is correct
- Make sure the integration is shared with the database
- Try getting the ID again from the URL

### Error: "Cannot find module '@slack/web-api'"
- Run `npm install` again
- Make sure you're in the correct folder

### No approval messages in #bot-feedback
- Bot may still be on its first run cycle
- Post longer messages (at least 20 characters)
- Wait for the next scheduler interval
- Check console output for errors

### Task not created in Notion
- Make sure you clicked "Approve as-is" (the button with checkmark)
- Check your Notion database for new items
- Review console logs for errors

## Next Steps

1. **Deploy to production** (AWS Lambda, Heroku, etc.)
2. **Customize the Claude prompt** in `src/analyzer.js` for your specific needs
3. **Add team members** to `#bot-feedback` for collaborative reviews
4. **Monitor logs** regularly to see what feedback is being captured
5. **Iterate** on the analysis prompt based on results

## Getting Help

- Check [README.md](README.md) for full documentation
- Review console output for error messages
- Check official docs:
  - [Slack API](https://api.slack.com/)
  - [Notion API](https://developers.notion.com/)
  - [Claude API](https://docs.anthropic.com/)

---

**Congratulations! Your feedback bot is now ready to help you capture customer insights! 🚀**
