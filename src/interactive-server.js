const express = require('express');
const { WebClient } = require('@slack/web-api');
const config = require('./config');

/**
 * Interactive server to handle Slack button clicks and interactions
 */
class InteractiveServer {
  constructor(approvalHandler, slackClient, notionClient, analyzer) {
    this.app = express();
    this.approvalHandler = approvalHandler;
    this.slackClient = slackClient;
    this.notionClient = notionClient;
    this.analyzer = analyzer;
    this.port = process.env.PORT || 3000;
    this.client = new WebClient(config.slack.botToken);
    this.feedbackChannelId = null;

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Slack events endpoint (for message events)
    this.app.post('/slack/events', async (req, res) => {
      console.log(`\n📨 Received Slack event`);

      try {
        const { type, challenge, event } = req.body;

        // Slack verification challenge
        if (type === 'url_verification') {
          console.log(`   ✅ URL verification challenge received`);
          res.status(200).json({ challenge });
          return;
        }

        // Acknowledge the event immediately
        res.status(200).json({});

        // Handle events asynchronously
        if (type === 'event_callback') {
          console.log(`   Event type: ${event.type}`);

          // Process messages that have text OR attachments (handles both regular and forwarded messages)
          if (event.type === 'message' && (event.text || (event.attachments && event.attachments.length > 0))) {
            // Filter: only process messages from the feedback channel and not from bots
            const feedbackChannelId = await this.getFeedbackChannelId();

            if (event.channel === feedbackChannelId && !event.bot_id && !event.thread_ts) {
              const preview = event.text ? event.text.substring(0, 50) : `${event.attachments.length} attachment(s)`;
              console.log(`   📝 New message in #feedback: "${preview}..."`);

              // Trigger analysis immediately
              this.processFeedbackMessage(event).catch(err => {
                console.error(`   ❌ Error processing feedback:`, err);
              });
            }
          }
        }
      } catch (error) {
        console.error(`\n❌ Error processing event:`);
        console.error(`   Message:`, error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // Slack interactions endpoint
    this.app.post('/slack/interactions', async (req, res) => {
      console.log(`\n🔔 Received Slack interaction request`);
      console.log(`   Content-Type: ${req.get('content-type')}`);
      console.log(`   Body keys:`, Object.keys(req.body));

      try {
        // Slack sends interactions as URL-encoded form data with a 'payload' field
        let payload;

        if (req.body.payload) {
          // Payload is a JSON string that needs to be parsed
          payload = typeof req.body.payload === 'string'
            ? JSON.parse(req.body.payload)
            : req.body.payload;
          console.log(`   ✅ Parsed payload from 'payload' field`);
        } else {
          // Direct JSON body (alternative format)
          payload = req.body;
          console.log(`   ✅ Using body as payload directly`);
        }

        const { type, actions, trigger_id, response_url } = payload;

        console.log(`   Type: ${type}`);
        if (actions) console.log(`   Actions count: ${actions.length}`);

        // Acknowledge the interaction immediately with proper response
        res.status(200).json({});
        console.log(`   ✅ Sent 200 OK response`);

        // Process interaction asynchronously (don't wait)
        if (type === 'block_actions') {
          console.log(`   🎯 Processing block actions...`);
          this.handleBlockActions(actions, trigger_id, response_url).catch(err => {
            console.error(`   ❌ Error in handleBlockActions:`, err);
          });
        }
      } catch (error) {
        console.error(`\n❌ Error processing interaction:`);
        console.error(`   Message:`, error.message);
        console.error(`   Stack:`, error.stack);
        console.error(`   Body received:`, JSON.stringify(req.body, null, 2));
        res.status(500).json({ error: error.message });
      }
    });
  }

  async handleBlockActions(actions, triggerId, responseUrl) {
    console.log(`   Processing ${actions.length} action(s)`);

    for (const action of actions) {
      const actionId = action.action_id;
      const messageId = action.value;

      console.log(`   🎯 Action: ${actionId}, MessageId: ${messageId}`);

      try {
        if (actionId.startsWith('approve_')) {
          await this.handleApproval(messageId, triggerId, responseUrl);
        } else if (actionId.startsWith('reject_')) {
          await this.handleRejection(messageId, triggerId, responseUrl);
        } else if (actionId.startsWith('review_')) {
          await this.handleReview(messageId, triggerId);
        } else if (actionId.startsWith('assign_john_')) {
          await this.handleAssignToJohn(messageId, responseUrl);
        }
      } catch (error) {
        console.error(`   ❌ Error handling action ${actionId}:`, error.message);
        console.error(`      Full error:`, error);
      }
    }
  }

  async handleApproval(messageId, triggerId, responseUrl) {
    const approval = this.approvalHandler.getPendingApproval(messageId);
    if (!approval) {
      console.warn(`   ⚠️  No pending approval found for ${messageId}`);
      return;
    }

    console.log(`   Processing approval for: ${approval.title}`);

    // Mark as approved
    const approvedFeedback = this.approvalHandler.approveFeedback(messageId);
    console.log(`   ✅ Marked as approved`);

    // Create Notion task
    try {
      // Format data correctly for Notion (matching scheduler.js format)
      const taskData = {
        title: approvedFeedback.title,
        description: approvedFeedback.description,
        priority: approvedFeedback.priority,
        type: approvedFeedback.type,
        messageLink: approvedFeedback.messageLink || null,
        dueDate: approvedFeedback.dueDate || null,
      };

      console.log(`   📋 Creating Notion task with data:`, JSON.stringify(taskData, null, 2));

      const notionTask = await this.notionClient.createTask(taskData);
      if (notionTask) {
        console.log(`   📝 Notion task created: ${notionTask.id}`);

        // Remove from pending
        this.approvalHandler.removePendingApproval(messageId);

        // Send confirmation via response_url with task details
        if (responseUrl) {
          // Build Notion page URL
          const pageId = notionTask.id.replace(/-/g, '');
          const notionPageUrl = `https://notion.so/${pageId}`;

          await this.sendSlackUpdate(responseUrl, {
            text: `✅ Task created: ${taskData.title}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '✅ *Task Approved and Created in Notion*',
                },
              },
              {
                type: 'divider',
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Title:*\n${taskData.title}`,
                },
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Description:*\n${taskData.description}`,
                },
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Priority:*\n${taskData.priority}`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Type:*\n${taskData.type}`,
                  },
                ],
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: '📖 View in Notion',
                      emoji: true,
                    },
                    url: notionPageUrl,
                  },
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: '👤 Assign to John',
                      emoji: true,
                    },
                    value: notionTask.id,
                    action_id: `assign_john_${notionTask.id}`,
                    style: 'primary',
                  },
                ],
              },
            ],
            replace_original: true,
          });
        }
      }
    } catch (error) {
      console.error(`   ❌ Error creating Notion task:`, error.message);
      console.error(`      Stack:`, error.stack);
      if (responseUrl) {
        await this.sendSlackUpdate(responseUrl, {
          text: '❌ Approved but failed to create Notion task. Check logs.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '❌ *Failed to create Notion task. Check server logs.*',
              },
            },
          ],
          replace_original: true,
        });
      }
    }
  }

  async handleRejection(messageId, triggerId, responseUrl) {
    const approval = this.approvalHandler.getPendingApproval(messageId);
    if (!approval) {
      console.warn(`   ⚠️  No pending approval found for ${messageId}`);
      return;
    }

    // Mark as rejected
    this.approvalHandler.rejectFeedback(messageId);
    console.log(`   ❌ Rejected: ${approval.title}`);

    // Send confirmation
    if (responseUrl) {
      await this.sendSlackUpdate(responseUrl, {
        text: '❌ Feedback rejected - no task created',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '❌ *Feedback rejected - no task created in Notion*',
            },
          },
        ],
        replace_original: true,
      });
    }
  }

  async handleAssignToJohn(pageId, responseUrl) {
    console.log(`   Assigning task to John Rice...`);

    try {
      // Update the task to assign to John Rice
      await this.notionClient.assignTaskToPerson(pageId, 'John Rice');

      console.log(`   ✅ Task assigned to John Rice`);

      // Send confirmation via response_url
      if (responseUrl) {
        await this.sendSlackUpdate(responseUrl, {
          text: '✅ Task assigned to John Rice in Notion!',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '✅ *Task Assigned to John Rice*',
              },
            },
          ],
          replace_original: false,
        });
      }
    } catch (error) {
      console.error(`   ❌ Error assigning task:`, error.message);
      if (responseUrl) {
        await this.sendSlackUpdate(responseUrl, {
          text: '❌ Failed to assign task. Check logs.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '❌ *Failed to assign task to John Rice. Check server logs.*',
              },
            },
          ],
          replace_original: false,
        });
      }
    }
  }

  async handleReview(messageId, triggerId) {
    const approval = this.approvalHandler.getPendingApproval(messageId);
    if (!approval) {
      console.warn(`   ⚠️  No pending approval found for ${messageId}`);
      return;
    }

    // Open a modal for editing
    console.log(`   📝 Opening review modal for: ${approval.title}`);

    try {
      await this.client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: `review_modal_${messageId}`,
          title: {
            type: 'plain_text',
            text: 'Review Feedback',
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Title*',
              },
            },
            {
              type: 'input',
              block_id: 'title_block',
              label: {
                type: 'plain_text',
                text: 'Title',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'title_input',
                initial_value: approval.title,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Description*',
              },
            },
            {
              type: 'input',
              block_id: 'description_block',
              label: {
                type: 'plain_text',
                text: 'Description',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'description_input',
                initial_value: approval.description,
                multiline: true,
              },
            },
          ],
          submit: {
            type: 'plain_text',
            text: 'Approve',
          },
          close: {
            type: 'plain_text',
            text: 'Cancel',
          },
        },
      });
    } catch (error) {
      console.error('Error opening modal:', error);
    }
  }

  async sendSlackUpdate(responseUrl, message) {
    try {
      const response = await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      return response.ok;
    } catch (error) {
      console.error('Error sending Slack update:', error);
      return false;
    }
  }

  start() {
    this.server = this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`\n🌐 Interactive server listening on port ${this.port}`);
      console.log(`   Bound to 0.0.0.0 (all interfaces)`);
      console.log(`   Slack interactions endpoint: http://localhost:${this.port}/slack/interactions`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('🌐 Interactive server stopped');
      });
    }
  }

  /**
   * Get feedback channel ID for filtering events
   */
  async getFeedbackChannelId() {
    if (this.feedbackChannelId) {
      return this.feedbackChannelId;
    }

    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
      });

      const feedbackChannel = result.channels.find(
        ch => ch.name === 'feedback'
      );

      if (feedbackChannel) {
        this.feedbackChannelId = feedbackChannel.id;
        console.log(`   ✅ Cached feedback channel ID: ${this.feedbackChannelId}`);
        return this.feedbackChannelId;
      }
    } catch (error) {
      console.error(`   ❌ Error getting feedback channel:`, error);
    }

    return null;
  }

  /**
   * Process a feedback message: analyze it and send approval request
   */
  async processFeedbackMessage(event) {
    try {
      console.log(`   🔍 Analyzing feedback message...`);
      console.log(`   📋 Event object keys: ${Object.keys(event).join(', ')}`);
      console.log(`   👤 event.user value: ${event.user || 'NOT SET'}`);
      console.log(`   🤖 event.bot_id value: ${event.bot_id || 'NOT SET'}`);
      console.log(`   📨 Full event type: ${event.type}, subtype: ${event.subtype || 'none'}`);

      // Mark as processed first to avoid duplicates
      const messageTs = event.ts;
      if (this.approvalHandler.isProcessed(messageTs)) {
        console.log(`   ⏭️  Message already processed, skipping`);
        return;
      }

      // Extract message text (handle both regular and forwarded messages)
      let messageText = event.text || '';

      // If this is a forwarded message or has attachments, extract text from them
      if (event.attachments && event.attachments.length > 0) {
        for (const attachment of event.attachments) {
          // Get text from attachment in priority order
          if (attachment.text) {
            messageText += '\n' + attachment.text;
          } else if (attachment.title) {
            messageText += '\n' + attachment.title;
          } else if (attachment.fallback) {
            messageText += '\n' + attachment.fallback;
          }
        }
      }

      // Skip if no text content found
      if (!messageText || messageText.trim().length === 0) {
        console.log(`   ⏭️  No text content found in message, skipping`);
        return;
      }

      // Convert Slack event to message format
      const message = {
        text: messageText.trim(),
        userId: event.user,
        channelId: event.channel,
        channelName: 'feedback',
        ts: messageTs,
        permalink: null,
      };

      console.log(`   📄 Message text (${message.text.length} chars): "${message.text.substring(0, 80)}..."`);

      // Analyze with Claude
      const feedbackArray = await this.analyzer.analyzeBatch([message]);

      if (feedbackArray.length > 0) {
        console.log(`   ✨ Found ${feedbackArray.length} actionable feedback`);

        // Get reporter name for task description
        let reporterName = 'Unknown';

        // First, always try to get the current user's info (for direct messages)
        if (event.user) {
          try {
            console.log(`   👤 Fetching user info for: ${event.user}`);
            const userInfo = await this.slackClient.getUserInfo(event.user);

            if (userInfo) {
              console.log(`   📊 User info object keys: ${Object.keys(userInfo).join(', ')}`);

              // Try multiple name fields in order of preference
              if (userInfo.real_name && userInfo.real_name.trim()) {
                reporterName = userInfo.real_name;
                console.log(`   ✅ Got reporter name from real_name: ${reporterName}`);
              } else if (userInfo.profile && userInfo.profile.real_name && userInfo.profile.real_name.trim()) {
                reporterName = userInfo.profile.real_name;
                console.log(`   ✅ Got reporter name from profile.real_name: ${reporterName}`);
              } else if (userInfo.profile && userInfo.profile.display_name && userInfo.profile.display_name.trim()) {
                reporterName = userInfo.profile.display_name;
                console.log(`   ✅ Got reporter name from profile.display_name: ${reporterName}`);
              } else if (userInfo.name && userInfo.name.trim()) {
                reporterName = userInfo.name;
                console.log(`   ✅ Got reporter name from name: ${reporterName}`);
              } else {
                console.log(`   ⚠️  User info found but no name fields available. Full object: ${JSON.stringify(userInfo, null, 2)}`);
              }
            } else {
              console.log(`   ⚠️  getUserInfo returned null or undefined for user ${event.user}`);
            }
          } catch (error) {
            console.log(`   ⚠️  Could not fetch user info: ${error.message}`);
            console.log(`      Error details: ${error.stack}`);
          }
        } else {
          console.log(`   ⚠️  No event.user found in message event`);
        }

        // If direct message didn't work, check if this is a forwarded message
        if (reporterName === 'Unknown' && event.attachments && event.attachments.length > 0) {
          console.log(`   🔄 Checking forwarded message attachments...`);
          for (const attachment of event.attachments) {
            // Try to get the original sender's name from the attachment
            if (attachment.author_name) {
              reporterName = attachment.author_name;
              console.log(`   👤 Forwarded message from: ${reporterName}`);
              break;
            } else if (attachment.from_url) {
              // Extract name from from_url if available
              const match = attachment.from_url.match(/\/archives\/[^/]+\/p\d+\?thread_ts=[\d.]+.*&cid=([^&]+)/);
              if (match) {
                reporterName = match[1];
              }
            }
          }
        }

        for (const item of feedbackArray) {
          const messageId = `msg_${messageTs.replace('.', '_')}`;

          // Prepend reporter name to description
          item.description = `Task requested by ${reporterName}\n\n${item.description}`;

          this.approvalHandler.addPendingApproval(messageId, item);

          // Get message permalink
          const permalink = await this.slackClient.getMessagePermalink(
            message.channelId,
            message.ts
          );

          if (permalink) {
            item.messageLink = permalink;
          }

          // Send approval message to bot-feedback channel
          const result = await this.slackClient.sendApprovalMessage(item, messageId);
          if (result) {
            console.log(`   ✉️ Approval message sent for: "${item.title}" (reported by ${reporterName})`);
          }
        }
      } else {
        console.log(`   ℹ️ No actionable feedback found in message`);
      }

      // Mark message as processed
      this.approvalHandler.markAsProcessed(messageTs);
    } catch (error) {
      console.error(`   ❌ Error processing feedback message:`, error.message);
      throw error;
    }
  }
}

module.exports = InteractiveServer;
