require('dotenv').config();
const { Client } = require('@notionhq/client');
const axios = require('axios');

// Configuration from Environment Variables
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DB_ID;
const linkedinAccessToken = process.env.LINKEDIN_ACCESS_TOKEN;
const linkedinUrn = process.env.LINKEDIN_PERSON_URN;

async function processLinkedinPosts() {
  try {
    // 1. Query Notion for pages with Status "Ready to Post"
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Status",
        select: {
          equals: "Ready to Post",
        },
      },
    });

    for (const page of response.results) {
      const pageId = page.id;
      const title = page.properties['Name']?.title[0]?.plain_text || "Untitled";
      const linkedinCopy = page.properties['LinkedIn Copy']?.rich_text.map(part => part.plain_text).join('');
      const publicUrl = page.properties['Public URL']?.url;

      try {
        if (!linkedinCopy || !publicUrl) {
          throw new Error("Missing LinkedIn Copy or Public URL");
        }

        console.log(`Attempting to post: ${title}...`);
        const isSuccess = await postToLinkedin(linkedinCopy, publicUrl);

        if (isSuccess) {
          // SUCCESS: Move to Published
          await notion.pages.update({
            page_id: pageId,
            properties: {
              'Status': { select: { name: 'Published' } }
            },
          });
          console.log(`✅ Successfully published: ${title}`);
        } else {
          throw new Error("LinkedIn API rejected the post");
        }
      } catch (error) {
        console.error(`❌ Failed to post "${title}":`, error.message);

        // FAILURE: Move to Post Failed
        await notion.pages.update({
          page_id: pageId,
          properties: {
            'Status': { select: { name: 'Post Failed' } }
          },
        });
      }
    }
  } catch (error) {
    console.error("Error querying Notion database:", error.body || error.message);
  }
}

async function postToLinkedin(text, url) {
  try {
    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: linkedinUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: text },
            shareMediaCategory: 'ARTICLE',
            media: [{
              status: 'READY',
              originalUrl: url,
            }],
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      },
      {
        headers: {
          'Authorization': `Bearer ${linkedinAccessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json'
        },
      }
    );
    console.log("LinkedIn Response Status:", response.status);
    return response.status === 201;
  } catch (err) {
    // THIS PART IS KEY: It prints the specific error from LinkedIn's server
    if (err.response) {
      console.error("❌ LinkedIn API Error (Data):", JSON.stringify(err.response.data, null, 2));
      console.error("❌ LinkedIn API Error (Status):", err.response.status);
    } else if (err.request) {
      console.error("❌ LinkedIn API Error (No Response): No response received from LinkedIn. Check your internet or URN format.");
    } else {
      console.error("❌ Error Message:", err.message);
    }
    return false;
  }
}

processLinkedinPosts();