const cron = require('node-cron');
const SlackClient = require('./slack-client');
const MessageAnalyzer = require('./analyzer');
const NotionClient = require('./notion-client');
const ApprovalHandler = require('./approval-handler');
const InteractiveServer = require('./interactive-server');
const config = require('./config');

class FeedbackBot {
  constructor() {
    this.slackClient = new SlackClient();
    this.analyzer = new MessageAnalyzer();
    this.notionClient = new NotionClient();
    this.approvalHandler = new ApprovalHandler();
    this.interactiveServer = new InteractiveServer(
      this.approvalHandler,
      this.slackClient,
      this.notionClient,
      this.analyzer
    );
    this.isRunning = false;
  }

  /**
   * Initialize all clients
   */
  async initialize() {
    console.log('🤖 Initializing Customer Feedback Bot...');

    try {
      await this.slackClient.initialize();
      console.log('✅ Slack client initialized');

      // Test Notion connection
      const schema = await this.notionClient.getDatabaseSchema();
      console.log('✅ Notion database connected');
      console.log('📋 Available properties:', Object.keys(schema).join(', '));

      console.log('✅ All systems initialized');
      return true;
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      return false;
    }
  }

  /**
   * Main job: scan messages and process feedback
   */
  async processNewMessages() {
    if (this.isRunning) {
      console.log('⏳ Job already running, skipping this cycle');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log(`\n📅 [${new Date().toISOString()}] Starting feedback analysis cycle...`);

    try {
      // Step 1: Get recent messages
      console.log('📥 Fetching recent messages...');
      const messages = await this.slackClient.getRecentMessages(
        config.scheduler.lookbackDays
      );
      console.log(`   Found ${messages.length} messages to analyze`);

      if (messages.length === 0) {
        console.log('   No new messages found');
        this.isRunning = false;
        return;
      }

      // Step 2: Filter out already processed messages
      const newMessages = messages.filter(
        (msg) => !this.approvalHandler.isProcessed(msg.ts)
      );
      console.log(`   ${newMessages.length} new messages to process`);

      if (newMessages.length === 0) {
        console.log('   All messages already processed');
        this.isRunning = false;
        return;
      }

      // Step 3: Analyze messages with Claude
      console.log('🧠 Analyzing messages for feedback...');
      const feedback = await this.analyzer.analyzeBatch(newMessages);
      console.log(`   Found ${feedback.length} pieces of actionable feedback`);

      // Step 4: Send approval requests for each feedback
      let approvalsSent = 0;
      for (const item of feedback) {
        const messageId = `msg_${item.originalMessage.ts.replace('.', '_')}`;
        this.approvalHandler.addPendingApproval(messageId, item);

        // Get message permalink for better context
        const permalink = await this.slackClient.getMessagePermalink(
          item.originalMessage.channelId,
          item.originalMessage.ts
        );

        if (permalink) {
          item.messageLink = permalink;
        }

        // Send approval message to bot-feedback channel
        const result = await this.slackClient.sendApprovalMessage(item, messageId);
        if (result) {
          approvalsSent++;
          console.log(`   ✉️ Approval message sent for: "${item.title}"`);
        }
      }

      // Step 5: Check for approved feedbacks and create tasks
      console.log('✨ Processing approved feedback...');
      const approvedFeedbacks = this.approvalHandler.getApprovedFeedbacks();
      let tasksCreated = 0;

      for (const item of approvedFeedbacks) {
        try {
          const taskData = {
            title: item.title,
            description: item.description,
            priority: item.priority,
            type: item.type,
            messageLink: item.messageLink,
            dueDate: item.dueDate || null,
          };

          const notionPage = await this.notionClient.createTask(taskData);
          console.log(
            `   ✅ Task created in Notion: "${item.title}" (${notionPage.id})`
          );

          // Find and remove from pending approvals
          for (const [key, approval] of this.approvalHandler.pendingApprovals.entries()) {
            if (approval.title === item.title) {
              this.approvalHandler.removePendingApproval(key);
              break;
            }
          }

          tasksCreated++;
        } catch (error) {
          console.error(`   ❌ Failed to create task for "${item.title}":`, error.message);
        }
      }

      // Step 6: Mark analyzed messages as processed
      for (const msg of newMessages) {
        this.approvalHandler.markAsProcessed(msg.ts);
      }

      // Summary
      const duration = Date.now() - startTime;
      const stats = this.approvalHandler.getStats();
      console.log(`\n✅ Cycle complete (${duration}ms)`);
      console.log(`   Messages analyzed: ${newMessages.length}`);
      console.log(`   Feedback found: ${feedback.length}`);
      console.log(`   Approval messages sent: ${approvalsSent}`);
      console.log(`   Tasks created: ${tasksCreated}`);
      console.log(`   Stats: Pending: ${stats.pending}, Approved: ${stats.approved}, Rejected: ${stats.rejected}`);
    } catch (error) {
      console.error('❌ Error in processing cycle:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Handle manual approval from Slack (for future webhook implementation)
   */
  async handleApprovalAction(messageId, action, updates = null) {
    console.log(`\n🎯 Processing action: ${action} for message ${messageId}`);

    if (action === 'approve') {
      const approved = this.approvalHandler.approveFeedback(messageId, updates);
      if (approved) {
        console.log(`   ✅ Feedback approved: "${approved.title}"`);
        // On next cycle, this will be created in Notion
      }
    } else if (action === 'reject') {
      const rejected = this.approvalHandler.rejectFeedback(messageId);
      if (rejected) {
        console.log(`   ❌ Feedback rejected: "${rejected.title}"`);
      }
    }
  }

  /**
   * Start the scheduled job
   */
  start() {
    console.log(
      `\n🚀 Starting bot with event-driven message processing`
    );

    // Start the interactive server for handling Slack button clicks and message events
    this.interactiveServer.start();

    console.log('✅ Bot started - listening for events via Slack Event Subscriptions');
    console.log('   Messages in #feedback are processed instantly');
    console.log('   No polling - efficient token usage!');

    // Cleanup old approvals every day (maintenance task)
    cron.schedule('0 0 * * *', () => {
      console.log('🧹 Running daily cleanup...');
      this.approvalHandler.clearOldApprovals(7); // Clear approvals older than 7 days
    });
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.scheduledJob) {
      // Handle both cron and setInterval
      if (typeof this.scheduledJob.stop === 'function') {
        this.scheduledJob.stop(); // cron job
      } else {
        clearInterval(this.scheduledJob); // setInterval job
      }
      console.log('⛔ Scheduler stopped');
    }

    // Stop the interactive server
    this.interactiveServer.stop();
  }

  /**
   * Display stats and status
   */
  printStatus() {
    const stats = this.approvalHandler.getStats();
    console.log('\n📊 Bot Status:');
    console.log(`   Pending Approvals: ${stats.pending}`);
    console.log(`   Approved (awaiting creation): ${stats.approved}`);
    console.log(`   Rejected: ${stats.rejected}`);
    console.log(`   Messages Processed: ${stats.processed}`);
  }
}

// ============================================
// Main execution
// ============================================

async function main() {
  const bot = new FeedbackBot();

  // Initialize
  const initialized = await bot.initialize();
  if (!initialized) {
    console.error('Failed to initialize bot. Check your configuration.');
    process.exit(1);
  }

  // Start the scheduler
  bot.start();

  // Print status every 5 minutes
  setInterval(() => {
    bot.printStatus();
  }, 5 * 60 * 1000);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n👋 Shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });
}

// Run if this is the main module
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = FeedbackBot;
