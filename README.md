# 🤖 Slack Customer Feedback Bot

A Node.js bot that monitors your Slack workspace for customer feedback, analyzes it with Claude AI, and automatically creates tasks in your Notion backlog with user approval.

## Features

✨ **Automated Feedback Detection** - Uses Claude AI to identify customer feedback in Slack messages
📋 **Smart Approval Workflow** - Review and edit feedback before creating tasks
🔗 **Notion Integration** - Automatically creates tasks in your backlog database
🎯 **Scheduled Processing** - Runs on a configurable schedule (default: every 10 minutes)
✏️ **Editable Details** - Adjust title, description, priority, and assignee before creation
🔄 **No Code Required** - Simple configuration with environment variables

## Prerequisites

- Node.js 16+ installed
- Slack workspace access and admin permissions
- Notion workspace and an API key
- Claude API key from Anthropic
- A dedicated Slack channel for approvals (e.g., `#bot-feedback`)

## Quick Start

### 1. Clone/Download the Project

```bash
cd slack-customer-feedback-bot
npm install
```

### 2. Set Up Slack Bot

**Create a Slack App:**

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
   - Name: `Customer Feedback Bot`
   - Select your workspace
3. Go to **OAuth & Permissions** in the left sidebar
4. Add these **Bot Token Scopes:**
   - `chat:write` - Send messages
   - `channels:read` - Read channel info
   - `users:read` - Read user info
   - `reactions:read` - Read reactions (optional)
5. Install the app to your workspace
6. Copy your **Bot User OAuth Token** (starts with `xoxb-`)

### 3. Set Up Notion Integration

**Create a Notion API Integration:**

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "Create new integration" → name it "Customer Feedback Bot"
3. Copy your **Internal Integration Token** (starts with `secret_`)
4. In your Notion workspace:
   - Create or open your backlog database
   - Click the "..." menu → "Add connections"
   - Select your integration
5. Get your **Database ID** from the URL:
   - URL format: `https://www.notion.so/workspace/DATABASE_ID?v=...`
   - Copy just the `DATABASE_ID` part (before the `?`)

**Ensure your database has these properties:**
- **Title** (required, text)
- **Description** (rich text)
- **Priority** (select: High, Medium, Low)
- **Type** (select: Bug, Feature, Enhancement, Other)
- **Status** (select: Backlog, In Progress, Done)
- **Slack Message Link** (url)
- **Assignee** (people) - optional
- **Due Date** (date) - optional

### 4. Get Claude API Key

1. Go to [https://console.anthropic.com/account/keys](https://console.anthropic.com/account/keys)
2. Create a new API key
3. Copy the key (starts with `sk-ant-`)

### 5. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```
SLACK_BOT_TOKEN=xoxb-your-token-here
CLAUDE_API_KEY=sk-ant-your-key-here
NOTION_API_KEY=secret_your-key-here
NOTION_DATABASE_ID=260dc119ad3c80eab232e7c7a1d14e22
APPROVAL_CHANNEL_NAME=bot-feedback
SCHEDULER_INTERVAL=10
NODE_ENV=development
```

### 6. Run the Bot

```bash
npm start
```

You should see:
```
✅ All systems initialized
🚀 Starting scheduler - runs every 10 minutes
✅ Scheduler started
```

## How It Works

### Process Flow

1. **Message Scanning** (Every 10 minutes)
   - Bot fetches recent messages from all channels
   - Filters out bot messages and short messages

2. **AI Analysis**
   - Claude analyzes each message for customer feedback
   - Extracts: title, description, priority, type
   - Only processes messages with high confidence

3. **Approval Request**
   - Sends a formatted message to `#bot-feedback` channel
   - Includes:
     - Detected issue/feedback
     - Suggested title and description
     - Estimated priority
     - Original message snippet

4. **Review & Approval**
   - You review the suggestion
   - Click "Review & Edit" to modify details (coming in next update)
   - Click "Approve as-is" to create immediately
   - Click "Reject" to skip

5. **Task Creation**
   - Approved feedback is created as a task in Notion
   - Links back to original Slack message
   - Added to your backlog

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SLACK_BOT_TOKEN` | Your Slack bot token | Required |
| `CLAUDE_API_KEY` | Your Claude API key | Required |
| `NOTION_API_KEY` | Your Notion API key | Required |
| `NOTION_DATABASE_ID` | Your Notion database ID | Required |
| `APPROVAL_CHANNEL_NAME` | Channel for approvals | `bot-feedback` |
| `SCHEDULER_INTERVAL` | Minutes between runs | `10` |
| `MAX_MESSAGES_PER_RUN` | Max messages to analyze | `50` |
| `LOOKBACK_DAYS` | How far back to scan | `1` |
| `MIN_MESSAGE_LENGTH` | Minimum message length to analyze | `20` |
| `NODE_ENV` | Environment | `development` |

## Deployment

### Local Development

```bash
# Run once
npm start

# Auto-restart on changes
npm run dev
```

### AWS Lambda

1. **Install Serverless Framework:**
   ```bash
   npm install -g serverless
   ```

2. **Create serverless configuration** (optional, for scheduled execution)

3. **Deploy:**
   ```bash
   serverless deploy
   ```

### Heroku / Other Platforms

1. **Create Procfile:**
   ```
   worker: node src/scheduler.js
   ```

2. **Set environment variables** in platform settings

3. **Deploy your code**

## Troubleshooting

### "Slack bot token not found"
- Make sure you've created your `.env` file
- Verify `SLACK_BOT_TOKEN` is set correctly
- Bot tokens start with `xoxb-`

### "Notion database not found"
- Check that `NOTION_DATABASE_ID` is correct
- Verify the integration is connected to your database
- The database must be shared with the integration

### "No messages found"
- Bot only analyzes the last 24 hours by default
- Change `LOOKBACK_DAYS` in `.env` to increase
- Messages must be longer than `MIN_MESSAGE_LENGTH` (default: 20 chars)

### "Claude analysis failed"
- Check your Claude API key is valid
- Verify you have API credits remaining
- Check rate limits haven't been exceeded

### "No approval channel found"
- Make sure the `#bot-feedback` channel exists
- Or set `APPROVAL_CHANNEL_ID` manually in `.env`
- Bot must have permission to post in that channel

## Advanced Usage

### Manual Approval Testing

While the bot runs automatically, you can test approvals:

```javascript
const bot = require('./src/scheduler');
const FeedbackBot = bot;

const testBot = new FeedbackBot();
await testBot.initialize();

// Simulate receiving feedback
testBot.handleApprovalAction('msg_123_456', 'approve', {
  title: 'Fix login bug',
  description: 'Users cannot log in with Google',
  priority: 'High'
});
```

### Customizing Analysis

Edit `src/analyzer.js` to modify the Claude prompt:

```javascript
const prompt = `
  Your custom analysis prompt here...
  Make sure to return valid JSON
`;
```

### Database Persistence

Current implementation uses a JSON file (`data/approvals.json`). For production, consider:
- PostgreSQL
- MongoDB
- DynamoDB
- Redis

Update `src/approval-handler.js` to use your database of choice.

## File Structure

```
slack-customer-feedback-bot/
├── src/
│   ├── scheduler.js          # Main bot orchestration
│   ├── slack-client.js       # Slack API integration
│   ├── analyzer.js           # Claude AI analysis
│   ├── notion-client.js      # Notion API integration
│   ├── approval-handler.js   # Approval workflow logic
│   └── config.js             # Configuration management
├── data/                     # Stores approval state
├── .env.example              # Configuration template
├── package.json              # Dependencies
└── README.md                 # This file
```

## Example Workflow

```
1. Customer writes in #support:
   "When I try to upload a PDF, the app crashes"

2. Bot detects this 10 minutes later
   - Analyzes: Bug report, High priority
   - Creates title: "PDF upload causes app crash"
   - Sends to #bot-feedback for approval

3. You review in Slack:
   ✉️ New Customer Feedback Detected
   Source: #support
   Type: bug
   Priority: High

   Suggested Title: PDF upload causes app crash
   Summary: When user attempts to upload a PDF file, application crashes...

   [✏️ Review & Edit] [✅ Approve] [❌ Reject]

4. You click [✅ Approve]

5. Task automatically created in Notion:
   Title: PDF upload causes app crash
   Description: When user attempts to upload a PDF file, application crashes...
   Priority: High
   Type: Bug
   Status: Backlog
   Slack Message Link: [link to #support message]
```

## Future Enhancements

- [ ] Modal editor for detailed approval with full field editing
- [ ] Slack slash commands (`/approve`, `/feedback-stats`)
- [ ] Scheduled reports of feedback trends
- [ ] Integration with other tools (Linear, Jira, Asana)
- [ ] Custom prompt templates per team
- [ ] Analytics dashboard
- [ ] Webhook support for real-time processing
- [ ] Multi-workspace support

## Contributing

Feel free to extend this bot! Some ideas:
- Add more analysis features (sentiment, impact scoring)
- Support for other Slack events (reactions, threads)
- Custom notification preferences
- Team feedback routing based on topic

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the console logs for error messages
3. Verify all API credentials are correct
4. Check the official documentation for each API:
   - [Slack API Docs](https://api.slack.com/docs)
   - [Notion API Docs](https://developers.notion.com/)
   - [Claude API Docs](https://docs.anthropic.com)

## License

MIT - Feel free to use and modify

---

Built with ❤️ for better customer feedback management
