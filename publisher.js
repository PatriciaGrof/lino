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
      
      const imagesProperty = page.properties['Images']?.files || [];
      const imageFile = imagesProperty.length > 0 ? imagesProperty[0] : null;
      const imageUrl = imageFile ? (imageFile.file?.url || imageFile.external?.url) : null;

      try {
        if (!linkedinCopy) {
          throw new Error("Missing LinkedIn Copy");
        }

        console.log(`Attempting to post: ${title}...`);
        const isSuccess = await postToLinkedin(linkedinCopy, publicUrl, imageUrl);

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

async function uploadImageToLinkedin(imageUrl) {
  try {
    // 1. Register the upload
    const registerResponse = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: linkedinUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            },
          ],
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${linkedinAccessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const assetId = registerResponse.data.value.asset;

    // 2. Download the image from Notion
    const imageBuffer = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    // 3. Upload the binary data to LinkedIn
    await axios.put(uploadUrl, imageBuffer.data, {
      headers: {
        'Authorization': `Bearer ${linkedinAccessToken}`,
        'Content-Type': 'image/jpeg',
      },
    });

    return assetId;
  } catch (error) {
    console.error("❌ Image Upload Error:", error.response?.data || error.message);
    return null;
  }
}

async function postToLinkedin(text, url, imageUrl) {
  try {
    let shareMediaCategory = 'NONE';
    let media = [];
    let finalText = text;

    if (imageUrl) {
      const assetId = await uploadImageToLinkedin(imageUrl);
      if (assetId) {
        shareMediaCategory = 'IMAGE';
        media = [{
          status: 'READY',
          media: assetId,
        }];
        // If there's also a link, append it to the text as LinkedIn's ugcPosts 
        // doesn't support both Image and Article media in one share.
        if (url) {
          finalText += `\n\n${url}`;
        }
      }
    }

    if (shareMediaCategory === 'NONE' && url) {
      shareMediaCategory = 'ARTICLE';
      media = [{
        status: 'READY',
        originalUrl: url,
      }];
    }

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: linkedinUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: finalText },
            shareMediaCategory: shareMediaCategory,
            media: media,
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