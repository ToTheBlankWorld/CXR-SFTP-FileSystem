<div align="center">
  <img src="./public/banner.png" alt="CXR-Lab Banner" width="600px" />
   
  ### Local LAN-based file sharing and management system for labs and campuses

[![GitHub Release](https://img.shields.io/github/v/release/ToTheBlankWorld/CXR-SFTP-FileSystem?include_prereleases&style=for-the-badge&logo=github&color=3b82f6)](https://github.com/ToTheBlankWorld/CXR-SFTP-FileSystem/releases)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/ToTheBlankWorld/CXR-SFTP-FileSystem?style=for-the-badge&logo=git&color=10b981)](https://github.com/ToTheBlankWorld/CXR-SFTP-FileSystem/commits/main)
[![GitHub Stars](https://img.shields.io/github/stars/ToTheBlankWorld/CXR-SFTP-FileSystem?style=for-the-badge&logo=github&color=f59e0b)](https://github.com/ToTheBlankWorld/CXR-SFTP-FileSystem/stargazers)
[![Discord](https://img.shields.io/discord/1075678398457788416?style=for-the-badge&logo=discord&logoColor=white&color=8b5cf6)](https://discord.gg/mwVAjKwPus)

</div>

---

**CXR-Lab File System** is a local LAN-based file sharing and management platform engineered for lab and campus environments. Built on the modern **Next.js 15 (App Router)** stack, it facilitates lightning-fast uploads, structured directory parsing, custom integration utilities, dynamic rendering capabilities, and database-backed configuration dashboards. 

By utilizing a persistent SFTP socket pool, the system completely bypasses conventional SSH connection handshakes for every transaction, guaranteeing maximum data transfer rates on local networks.

---

## 🌟 Key Features

*   📂 **Folder Tree Preservation** — Upload entire nested directory structures; the exact folder-tree model is replicated on the SFTP backend and stored in the PostgreSQL database.
*   ⚡ **Persistent SFTP Connector** — An optimized SFTP socket pool keeps connections alive, minimizing handshake latency.
*   🚦 **Smart Parallel Upload Queue** — Frontend uploads utilize a custom queue with a maximum concurrency of **5 workers**, avoiding browser choking and prioritizing connection health.
*   👁️ **Universal Viewer Engine** — In-browser previewing supporting:
    *   *Images & Vector Graphics*
    *   *Video & Audio* (with `206 Partial Content` streaming support)
    *   *PDF Documents*
    *   *CSV Spreadsheets* (parsed and presented as interactive grid tables)
    *   *Text & Code* (with full syntax highlighting powered by CodeMirror)
*   🔗 **Short Link Management** — Create, manage, and share short URLs for any public file.
*   ⚙️ **Git-Based Admin Auto-Updater** — Check for updates and deploy them directly from the Admin settings dashboard with a single click.
*   🔐 **Role-Based Access Control (RBAC)** — Define permissions for admins (who can manage users, inspect files, configure branding) and users (who can manage their files, upload data, and copy tokens).
*   🎨 **Dynamic Appearance Customizer** — Tailor branding colors, custom favicons, and footer settings dynamically without editing code files.

---

## 🏛️ System Architecture

CXR-Lab File System stores metadata (users, file records, folder structure, shortened URLs, and configuration settings) in a SQL database while offloading physical binary assets to a dedicated SFTP server.

```mermaid
graph TD
    Client[Next.js Client Components] <-->|REST API / SSE| API[Next.js App Router API]
    API <-->|Prisma ORM| DB[(PostgreSQL Database)]
    API <-->|Persistent Connection Pool| SFTP[(SFTP Storage Server)]
```

---

## 📂 Project Directory Structure

```
├── app/                  # Next.js App Router root
│   ├── (main)/           # Primary frontend routes protected by authentication
│   │   ├── auth/         # Login & registration pages
│   │   ├── dashboard/    # Primary files & folders browser, admin panels
│   │   └── setup/        # Initial administrative setup wizard
│   └── api/              # API endpoints for files, folders, users, updates, and configs
├── components/           # Reusable UI component library (shadcn/ui layout)
│   ├── dashboard/        # Dashboard panels, user tables, search filters
│   ├── file/             # Custom upload form and viewer engines
│   └── ui/               # Lower-level shadcn styling primitives
├── hooks/                # Custom React query hooks (uploads, settings, profile, etc.)
├── lib/                  # Core application logic & backend modules
│   ├── auth/             # API authentication (JWT NextAuth & Bearer Token)
│   ├── config/           # Database-backed JSON configuration model
│   ├── database/         # Prisma client initialization
│   ├── files/            # File access, validation, resolution logic
│   └── sftp/             # Persistent client instance & helpers
└── prisma/               # Database schemas and migration profiles
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `18.0.0` or higher
- **Database**: PostgreSQL database instance
- **Storage**: SFTP Server accessibility

### Installation Steps

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/ToTheBlankWorld/CXR-SFTP-FileSystem.git
    cd CXR-SFTP-FileSystem
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Configuration**:
    Copy the example file to `.env` and fill in your connection details:
    ```bash
    cp .env.example .env
    ```
    Ensure you specify the following variables:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/cxrlab?schema=public"
    SFTP_HOST="your-sftp-host-ip"
    SFTP_PORT=22
    SFTP_USERNAME="sftp-username"
    SFTP_PASSWORD="sftp-password"
    NEXTAUTH_SECRET="your-next-auth-secret-key"
    NEXTAUTH_URL="http://localhost:3000"
    ```

4.  **Database Migration**:
    Apply the database schema schemas using Prisma:
    ```bash
    npx prisma migrate deploy
    ```

5.  **Build and Run**:
    ```bash
    npm run build
    npm run start
    ```
    Access the application at `http://localhost:3000` to start the setup wizard.

---

## 🔒 Permission Model

| Action | Administrator | Regular User |
| :--- | :---: | :---: |
| **Upload Files / Folder Trees** | ✓ | ✓ *(Quota Enforced)* |
| **Delete Own Files / Folders** | ✓ | ✓ |
| **Delete Other's Files / Folders** | ✓ | ✗ |
| **Manage Users & Role Assignment** | ✓ | ✗ |
| **View Audit & User Content Logs** | ✓ | ✗ |
| **Trigger Platform Self-Updates** | ✓ | ✗ |

---

## 🛠️ Third-Party Integration Configuration

Users can utilize the **Upload Token** from their profile page to configure automatic uploads with popular screenshot utilities:

### ShareX (Windows)
1. Download the custom config from the profile settings.
2. Import the `.sxcu` file into ShareX.
3. Your screenshots will automatically upload and return shareable shortened URLs.

### Flameshot (Linux/macOS)
Use the custom shell script downloadable from the profile section to configure custom keyboard binds that upload captured screenshots automatically.

### Spectacle (KDE/Linux)
Deploy the Spectacle integration script to process screenshots directly and save file paths automatically to your database schema folder tree.

---

## 🔄 Self-Updater Control Flow

The platform includes a built-in git-based self-updating workflow accessible via the settings panel:
1.  **Check for Updates**: Compares the local repository HEAD commit hash against the main branch of `ToTheBlankWorld/CXR-SFTP-FileSystem`.
2.  **Review Commit Details**: View the latest commit hash, message header, release date, and view full diff links on GitHub.
3.  **Execute Hot Updates**: Clicking **Update Now** runs:
    ```bash
    git pull && npm install && npm run build
    ```
    Once complete, simply restart the Node.js server process to load the upgraded instance.

---

## 💬 Support & Community

Join our [Discord Server](https://discord.gg/mwVAjKwPus) to chat with developers, report issues, and request new features!

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
