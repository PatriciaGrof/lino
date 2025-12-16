import os
import requests
from notion_client import Client

# --- 1. CONFIGURATION (Gets variables from GitHub Secrets) ---
NOTION_TOKEN = os.environ.get("NOTION_TOKEN")
NOTION_DATABASE_ID = os.environ.get("NOTION_DB_ID")
LINKEDIN_ACCESS_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN")
LINKEDIN_PERSON_URN = os.environ.get("LINKEDIN_PERSON_URN") 

# Initialize Notion Client
if not NOTION_TOKEN:
    raise ValueError("NOTION_TOKEN environment variable not set.")
notion = Client(auth=NOTION_TOKEN)

# --- 2. NOTION DATA RETRIEVAL ---
def get_ready_to_post_article():
    """
    Queries the Notion database for the first page with Status == 'Ready to Post'.
    Extracts the Title, LinkedIn Copy, and Public URL properties.
    """
    print("--- Checking Notion Database for Ready-to-Post Articles ---")
    try:
        response = notion.data_sources.query(
            data_source_id=NOTION_DATABASE_ID,
            filter={
                "property": "Status",
                "select": {
                    "equals": "Ready to Post"
                }
            },
            sorts=[
                {
                    "property": "Name",
                    "direction": "ascending"
                }
            ]
        )
    except Exception as e:
        print(f"Error querying Notion database: {e}")
        return None

    if not response.get('results'):
        print("SUCCESS: No articles ready to post. Exiting script.")
        return None

    page = response['results'][0]
    properties = page['properties']
    page_id = page['id']
    
    # --- Property Extraction Logic ---
    
    # 1. Extract the Title (Name) property - Type: 'title'
    article_title = properties.get('Name', {}).get('title', [{}])[0].get('text', {}).get('content', '')
    
    # 2. Extract the LinkedIn Copy property - Type: 'rich_text'
    linkedin_copy = properties.get('LinkedIn Copy', {}).get('rich_text', [{}])[0].get('text', {}).get('content', '')
    
    # 3. Extract the Public URL property - Type: 'url'
    public_url = properties.get('Public URL', {}).get('url', '')

    if not all([article_title, linkedin_copy, public_url]):
        print(f"ERROR: Missing required fields on Notion page ID: {page_id}. Title, Copy, or URL is empty.")
        return None
        
    print(f"Found article to post: '{article_title}'")
    
    return {
        'page_id': page_id,
        'title': article_title,
        'copy': linkedin_copy,
        'url': public_url
    }

# --- 3. LINKEDIN POSTING (RICH LINK SHARE UPDATE) ---
def post_rich_link_to_linkedin(article_data):
    """Posts an engaging link share update to LinkedIn."""
    print("--- Attempting to Post to LinkedIn ---")
    
    api_url = "https://api.linkedin.com/v2/ugcPosts"
    headers = {
        "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol": "2.0.0"
    }

    payload = {
        "author": LINKEDIN_PERSON_URN,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": article_data['copy']
                },
                "shareMediaCategory": "ARTICLE",
                "media": [
                    {
                        "status": "READY",
                        "originalUrl": article_data['url'], 
                        "title": {
                            "text": article_data['title'] 
                        }
                    }
                ]
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }

    try:
        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)

        print(f"SUCCESS: Successfully posted to LinkedIn! Status Code: {response.status_code}")
        return True
    
    except requests.exceptions.HTTPError as err:
        print(f"ERROR: LinkedIn post failed with HTTP error: {err}")
        print(f"Response Body: {response.text}")
        return False
    except Exception as e:
        print(f"An unexpected error occurred during posting: {e}")
        return False

# --- 4. UPDATE NOTION STATUS ---
def update_notion_status(page_id, new_status):
    """Updates the Status property of the Notion page."""
    print(f"--- Updating Notion Page Status to '{new_status}' ---")
    
    try:
        notion.pages.update(
            page_id=page_id,
            properties={
                "Status": {
                    "select": {
                        "name": new_status
                    }
                }
            }
        )
        print("SUCCESS: Notion status updated.")
        return True
    except Exception as e:
        print(f"ERROR: Could not update Notion status for page {page_id}: {e}")
        return False


# --- MAIN EXECUTION ---
if __name__ == "__main__":
    article = get_ready_to_post_article()
    
    if article:
        if post_rich_link_to_linkedin(article):
            # If successful, mark as Published
            update_notion_status(article['page_id'], "Published")
        else:
            # If failed, mark as Post Failed
            update_notion_status(article['page_id'], "Post Failed")