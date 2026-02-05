const { Client } = require('@notionhq/client');
const config = require('./config');

class NotionClient {
  constructor() {
    this.notion = new Client({
      auth: config.notion.apiKey,
    });
    this.databaseId = config.notion.databaseId;
  }

  /**
   * Create a new task in the Notion database
   */
  async createTask(feedback) {
    try {
      const properties = {
        // Name is the title property in your Notion database
        Name: {
          title: [
            {
              text: {
                content: feedback.title,
              },
            },
          ],
        },
      };

      // Add optional properties if they exist in the feedback
      if (feedback.description) {
        properties.Description = {
          rich_text: [
            {
              text: {
                content: feedback.description,
              },
            },
          ],
        };
      }

      if (feedback.priority) {
        properties.Priority = {
          select: {
            name: feedback.priority,
          },
        };
      }

      if (feedback.type) {
        // Map feedback type to Area property
        properties.Area = {
          select: {
            name: this.capitalizeFirst(feedback.type),
          },
        };
      }

      if (feedback.assignee) {
        // Note: assignee handling may need adjustment based on your Notion schema
        // This assumes assignee is provided as a name or ID
        // You may need to look up the person ID first
        // properties.Person = {
        //   people: [{ id: assigneeId }]
        // };
      }

      if (feedback.dueDate) {
        properties['Due Date'] = {
          date: {
            start: feedback.dueDate,
          },
        };
      }

      if (feedback.messageLink) {
        properties['Slack Message Link'] = {
          url: feedback.messageLink,
        };
      }

      // Add task to "To-do" multi-select by default
      properties['Multi-select'] = {
        multi_select: [
          {
            name: 'To-do',
          },
        ],
      };

      const page = await this.notion.pages.create({
        parent: {
          database_id: this.databaseId,
        },
        properties,
      });

      return page;
    } catch (error) {
      console.error('Error creating Notion task:', error);
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(pageId, updates) {
    try {
      const properties = {};

      if (updates.title) {
        properties.Name = {
          title: [{ text: { content: updates.title } }],
        };
      }

      if (updates.description) {
        properties.Description = {
          rich_text: [{ text: { content: updates.description } }],
        };
      }

      if (updates.priority) {
        properties.Priority = {
          select: { name: updates.priority },
        };
      }

      if (updates.type) {
        properties.Area = {
          select: { name: this.capitalizeFirst(updates.type) },
        };
      }

      if (updates.dueDate) {
        properties['Due Date'] = {
          date: { start: updates.dueDate },
        };
      }

      const page = await this.notion.pages.update({
        page_id: pageId,
        properties,
      });

      return page;
    } catch (error) {
      console.error('Error updating Notion task:', error);
      throw error;
    }
  }

  /**
   * Get database schema to understand available properties
   */
  async getDatabaseSchema() {
    try {
      const database = await this.notion.databases.retrieve({
        database_id: this.databaseId,
      });

      const schema = {};
      for (const [key, prop] of Object.entries(database.properties)) {
        schema[key] = {
          type: prop.type,
          ...(prop.select && { options: prop.select.options.map((o) => o.name) }),
          ...(prop.people && { type: 'people' }),
        };
      }

      return schema;
    } catch (error) {
      console.error('Error retrieving database schema:', error);
      return null;
    }
  }

  /**
   * Assign a task to a specific person
   */
  async assignTaskToPerson(pageId, personName) {
    try {
      console.log(`   Looking up user: ${personName}`);

      // Get all users in the workspace to find John Rice
      const usersResponse = await this.notion.users.list();
      const user = usersResponse.results.find(u => {
        const name = u.name || '';
        return name.toLowerCase().includes(personName.toLowerCase());
      });

      if (!user) {
        console.error(`   User "${personName}" not found in Notion workspace`);
        throw new Error(`User "${personName}" not found`);
      }

      console.log(`   Found user: ${user.name} (${user.id})`);

      // Update the task with the person assignment
      const page = await this.notion.pages.update({
        page_id: pageId,
        properties: {
          Person: {
            people: [{ id: user.id }],
          },
        },
      });

      console.log(`   Task assigned to ${user.name}`);
      return page;
    } catch (error) {
      console.error('Error assigning task to person:', error);
      throw error;
    }
  }

  /**
   * Query tasks by area/type
   */
  async queryTasksByArea(area) {
    try {
      const response = await this.notion.databases.query({
        database_id: this.databaseId,
        filter: {
          property: 'Area',
          select: {
            equals: area,
          },
        },
      });

      return response.results;
    } catch (error) {
      console.error('Error querying tasks:', error);
      return [];
    }
  }

  capitalizeFirst(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}

module.exports = NotionClient;
