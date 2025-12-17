# lino
A repository to automate posts to LinkedIn from Notion

An automated bridge that fetches scheduled articles from a **Notion Database** and publishes them to **LinkedIn** using **Node.js** and **GitHub Actions**.

## 🛠️ Features
- **Status Management:** Automatically moves Notion entries from `Ready to Post` to `Published`.
- **Error Handling:** Updates Notion to `Post Failed` if the API call fails, preventing duplicate attempts.
- **Automated Runs:** Powered by GitHub Actions every Thursday at 11:00 AM Paris time.

---

## 🚀 Getting Started

### 1. Prerequisites
- [Notion Integration Token](https://www.notion.so/my-integrations)
- [LinkedIn Developer App](https://www.linkedin.com/developers/)
- Node.js (v20+)

### 2. Local Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### 3. Create a .env file in the root directory (for local use)
```bash
NOTION_SECRET=your_notion_secret
NOTION_DATABASE_ID=your_database_id
LINKEDIN_TOKEN=your_linkedin_access_token
LINKEDIN_URN=urn:li:person:your_member_id
```

### 4. Run the script (for local use)
```bash
npm node publisher.js
```

### 5. Set up repository secrets for github workflow
To automate the script, add the following secrets to your GitHub Repository (Settings > Secrets and variables > Actions):
- `NOTION_SECRET`
- `NOTION_DATABASE_ID`
- `LINKEDIN_TOKEN`
- `LINKEDIN_URN`

### 📊 Notion Database Schema

The database must have the following properties (case-sensitive): | Property | Type | Purpose | | :--- | :--- | :--- | | Name | Title | Title of the page | | Status | Select | Ready to Post, Test, Published, Post Failed | | LinkedIn Copy | Text | The body text of the post | | Public URL | URL | The link to the published Notion article | | Publish Date | Date | The date the post should go live |
