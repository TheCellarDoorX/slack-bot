const fs = require('fs');
const path = require('path');

/**
 * In-memory storage for pending approvals and processed messages
 * In production, you'd want to use a database
 */
class ApprovalHandler {
  constructor() {
    this.pendingApprovals = new Map(); // messageId -> feedback object
    this.processedMessages = new Set(); // Set of already processed message timestamps
    this.dataFile = path.join(__dirname, '../data/approvals.json');
    this.loadData();
  }

  /**
   * Store a pending approval
   */
  addPendingApproval(messageId, feedback) {
    this.pendingApprovals.set(messageId, {
      ...feedback,
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
    this.saveData();
  }

  /**
   * Get a pending approval
   */
  getPendingApproval(messageId) {
    return this.pendingApprovals.get(messageId);
  }

  /**
   * Mark a message as processed to avoid duplicate analysis
   */
  markAsProcessed(messageTs) {
    this.processedMessages.add(messageTs);
    this.saveData();
  }

  /**
   * Check if message was already processed
   */
  isProcessed(messageTs) {
    return this.processedMessages.has(messageTs);
  }

  /**
   * Approve a feedback (and optionally update it)
   */
  approveFeedback(messageId, updates = null) {
    const approval = this.pendingApprovals.get(messageId);
    if (!approval) {
      return null;
    }

    const approvedFeedback = {
      ...approval,
      ...updates,
      status: 'approved',
      approvedAt: new Date().toISOString(),
    };

    this.pendingApprovals.set(messageId, approvedFeedback);
    this.saveData();
    return approvedFeedback;
  }

  /**
   * Reject a feedback
   */
  rejectFeedback(messageId) {
    const approval = this.pendingApprovals.get(messageId);
    if (!approval) {
      return null;
    }

    const rejectedFeedback = {
      ...approval,
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
    };

    this.pendingApprovals.set(messageId, rejectedFeedback);
    this.saveData();
    return rejectedFeedback;
  }

  /**
   * Get approved feedbacks ready for task creation
   */
  getApprovedFeedbacks() {
    return Array.from(this.pendingApprovals.values()).filter(
      (approval) => approval.status === 'approved'
    );
  }

  /**
   * Remove approval from pending (after creating task)
   */
  removePendingApproval(messageId) {
    this.pendingApprovals.delete(messageId);
    this.saveData();
  }

  /**
   * Save data to file for persistence
   */
  saveData() {
    try {
      const dataDir = path.dirname(this.dataFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data = {
        pendingApprovals: Array.from(this.pendingApprovals.entries()),
        processedMessages: Array.from(this.processedMessages),
        lastSaved: new Date().toISOString(),
      };

      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving approval data:', error);
    }
  }

  /**
   * Load data from file
   */
  loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        this.pendingApprovals = new Map(data.pendingApprovals || []);
        this.processedMessages = new Set(data.processedMessages || []);
      }
    } catch (error) {
      console.error('Error loading approval data:', error);
    }
  }

  /**
   * Get summary stats
   */
  getStats() {
    return {
      pending: Array.from(this.pendingApprovals.values()).filter(
        (a) => a.status === 'pending'
      ).length,
      approved: Array.from(this.pendingApprovals.values()).filter(
        (a) => a.status === 'approved'
      ).length,
      rejected: Array.from(this.pendingApprovals.values()).filter(
        (a) => a.status === 'rejected'
      ).length,
      processed: this.processedMessages.size,
    };
  }

  /**
   * Clear old approvals (older than days)
   */
  clearOldApprovals(days = 7) {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const beforeSize = this.pendingApprovals.size;

    for (const [key, value] of this.pendingApprovals.entries()) {
      const createdTime = new Date(value.createdAt).getTime();
      if (createdTime < cutoffTime) {
        this.pendingApprovals.delete(key);
      }
    }

    const afterSize = this.pendingApprovals.size;
    if (beforeSize !== afterSize) {
      console.log(`Cleared ${beforeSize - afterSize} old approvals`);
      this.saveData();
    }
  }
}

module.exports = ApprovalHandler;
