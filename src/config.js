require('dotenv').config();

module.exports = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN || null,
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
    model: 'claude-haiku-4-5-20251001',
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_DATABASE_ID,
  },
  slack_approval: {
    channelId: process.env.APPROVAL_CHANNEL_ID || null,
    channelName: process.env.APPROVAL_CHANNEL_NAME || 'bot-feedback',
  },
  slack_feedback: {
    channelName: process.env.FEEDBACK_CHANNEL_NAME || 'feedback',
  },
  scheduler: {
    intervalMinutes: parseFloat(process.env.SCHEDULER_INTERVAL) || 10,
    maxMessagesPerRun: parseInt(process.env.MAX_MESSAGES_PER_RUN) || 50,
    lookbackDays: parseInt(process.env.LOOKBACK_DAYS) || 1,
    minMessageLength: parseInt(process.env.MIN_MESSAGE_LENGTH) || 20,
  },
  env: process.env.NODE_ENV || 'development',
};
