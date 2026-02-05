const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

class MessageAnalyzer {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.claude.apiKey,
    });
  }

  /**
   * Analyze a message for customer feedback
   */
  async analyzeFeedback(message, sourceName) {
    const prompt = `You are a customer feedback analyzer for a SaaS product. Analyze the following customer message and extract actionable feedback.

Message from ${sourceName}:
"${message}"

Respond in JSON format with these exact fields:
{
  "isFeedback": boolean (true if this is genuine customer feedback/issue),
  "type": string (one of: "bug", "feature_request", "enhancement", "complaint", "praise", "other"),
  "title": string (concise 5-10 word task title),
  "description": string (structured description with sections below),
  "priority": string (one of: "High Priority", "Medium Priority", "Low Priority"),
  "confidence": number (0-100, how confident you are this needs a task)
}

DESCRIPTION STRUCTURE (use exactly this format with section headers):
Brief Description: [2-3 sentences describing the issue/problem clearly]

Impact: [1-2 sentences explaining how this affects users or the product]

Why It Matters: [1-2 sentences explaining why solving this problem is important]

Important:
- Only extract clear, actionable feedback
- If unclear or not feedback, set isFeedback to false
- Use the exact section headers above (Brief Description, Impact, Why It Matters)
- Priority should reflect urgency/impact
- Respond ONLY with valid JSON, no additional text`;

    try {
      const message_obj = await this.client.messages.create({
        model: config.claude.model,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseText =
        message_obj.content[0].type === 'text' ? message_obj.content[0].text : '';

      // Parse JSON response (handle markdown code blocks)
      let jsonString = responseText.trim();

      // Try to extract JSON from markdown code blocks
      const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
      } else {
        // If no code block, try to find JSON object directly
        const objectMatch = jsonString.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonString = objectMatch[0];
        }
      }

      jsonString = jsonString.trim();

      // Remove any trailing commas that might break JSON parsing
      jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

      const feedback = JSON.parse(jsonString);

      if (feedback.isFeedback && feedback.confidence >= 60) {
        return {
          ...feedback,
          sourceName,
        };
      }

      return null;
    } catch (error) {
      console.error('Error analyzing feedback:', error);
      return null;
    }
  }

  /**
   * Batch analyze multiple messages
   */
  async analyzeBatch(messages) {
    const feedback = [];

    for (const msg of messages) {
      const result = await this.analyzeFeedback(msg.text, `#${msg.channelName}`);

      if (result) {
        feedback.push({
          ...result,
          originalMessage: msg,
          messageSnippet: msg.text.substring(0, 100) + (msg.text.length > 100 ? '...' : ''),
        });
      }

      // Rate limiting - add small delay between API calls
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return feedback;
  }
}

module.exports = MessageAnalyzer;
