const { WebClient } = require('@slack/web-api');
const config = require('./config');

class SlackClient {
  constructor() {
    this.client = new WebClient(config.slack.botToken);
    this.approvalChannelId = null;
  }

  /**
   * Initialize and resolve approval channel ID
   */
  async initialize() {
    if (config.slack_approval.channelId) {
      this.approvalChannelId = config.slack_approval.channelId;
    } else {
      // Look up channel by name
      try {
        const result = await this.client.conversations.list({
          types: 'public_channel,private_channel',
          exclude_archived: true,
        });

        console.log(`🔍 Searching for approval channel "${config.slack_approval.channelName}"`);
        console.log(`   Found ${result.channels.length} total channels`);

        const channel = result.channels.find(
          (ch) => ch.name === config.slack_approval.channelName
        );
        if (channel) {
          this.approvalChannelId = channel.id;
          console.log(
            `✅ Found approval channel: ${config.slack_approval.channelName} (${channel.id})`
          );
        } else {
          console.warn(
            `❌ Approval channel "${config.slack_approval.channelName}" not found in ${result.channels.length} channels`
          );
          // Log first few channel names for debugging
          if (result.channels.length > 0) {
            console.log('   Available channels:', result.channels.slice(0, 5).map(ch => `#${ch.name}`).join(', '));
          }
        }
      } catch (error) {
        console.error('Error finding approval channel:', error);
      }
    }
  }

  /**
   * Get recent messages from the feedback channel only
   */
  async getRecentMessages(lookbackDays = 1) {
    const messages = [];
    const lookbackTime = Math.floor(Date.now() / 1000) - lookbackDays * 24 * 60 * 60;

    try {
      // Get the feedback channel to scan for messages
      const feedbackChannelName = config.slack_feedback.channelName;
      const channelsList = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
      });

      const feedbackChannel = channelsList.channels.find(ch => ch.name === feedbackChannelName);

      if (!feedbackChannel) {
        console.warn(`Feedback channel "${feedbackChannelName}" not found`);
        return messages;
      }

      const channels = [feedbackChannel];

      for (const channel of channels) {
        try {
          const result = await this.client.conversations.history({
            channel: channel.id,
            oldest: lookbackTime.toString(),
            limit: config.scheduler.maxMessagesPerRun,
          });

          for (const msg of result.messages) {
            // Skip bot messages, threads, and short messages
            if (
              !msg.bot_id &&
              !msg.thread_ts &&
              msg.text &&
              msg.text.length >= config.scheduler.minMessageLength
            ) {
              messages.push({
                text: msg.text,
                userId: msg.user,
                channelId: channel.id,
                channelName: channel.name,
                ts: msg.ts,
                permalink: null, // Will be fetched separately if needed
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching messages from channel ${channel.name}:`, error);
        }
      }

      return messages;
    } catch (error) {
      console.error('Error fetching recent messages:', error);
      return [];
    }
  }

  /**
   * Get user info for context
   */
  async getUserInfo(userId) {
    try {
      const result = await this.client.users.info({ user: userId });
      return result.user;
    } catch (error) {
      console.error(`Error fetching user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Send approval message to the bot-feedback channel
   */
  async sendApprovalMessage(feedback, messageId) {
    if (!this.approvalChannelId) {
      console.warn('Approval channel not set, skipping approval message');
      return null;
    }

    try {
      const message = {
        channel: this.approvalChannelId,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📋 New Customer Feedback Detected',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Source:*\n${feedback.sourceName}`,
              },
              {
                type: 'mrkdwn',
                text: `*Type:*\n${feedback.type}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Suggested Title:*\n${feedback.title}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Summary:*\n${feedback.description}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Priority:* ${feedback.priority}\n*Original Message:* ${feedback.messageSnippet}`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✏️ Review & Edit',
                  emoji: true,
                },
                value: messageId,
                action_id: `review_${messageId}`,
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ Approve as-is',
                  emoji: true,
                },
                value: messageId,
                action_id: `approve_${messageId}`,
                style: 'primary',
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '❌ Reject',
                  emoji: true,
                },
                value: messageId,
                action_id: `reject_${messageId}`,
                style: 'danger',
              },
            ],
          },
        ],
      };

      const result = await this.client.chat.postMessage(message);
      return result;
    } catch (error) {
      console.error('Error sending approval message:', error);
      return null;
    }
  }

  /**
   * Get message permalink
   */
  async getMessagePermalink(channel, ts) {
    try {
      const result = await this.client.chat.getPermalink({
        channel,
        message_ts: ts,
      });
      return result.permalink;
    } catch (error) {
      console.error('Error getting message permalink:', error);
      return null;
    }
  }

  /**
   * Send a simple message (for testing/status)
   */
  async sendMessage(channel, text) {
    try {
      const result = await this.client.chat.postMessage({
        channel,
        text,
      });
      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      return null;
    }
  }

  /**
   * React to a message
   */
  async addReaction(channel, ts, emoji) {
    try {
      await this.client.reactions.add({
        channel,
        timestamp: ts,
        name: emoji,
      });
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }
}

module.exports = SlackClient;
