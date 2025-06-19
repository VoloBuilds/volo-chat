# Volo Chat

A sleek and feature-rich open source version of T3 Chat built for the T3 Chat Cloneathon competition.

## 💬 **What is Volo Chat?**

Volo Chat is a full-stack AI chat application that provides a unified interface for multiple AI providers and models. Chat with Claude, GPT-4, Gemini, DeepSeek, and generate images with OpenAI's GPT-Image-1 - all while maintaining full control over your data and API keys.

## 🚀 **Key Features**

- **Streaming output** - Real-time responses from AI models
- **Chat branching** - Create alternative conversation paths from any message (great UX)
- **Message retries** - Easily retry failed or unsatisfactory responses  
- **File attachments** - Upload and analyze documents, images, PDFs, and code files
- **Chat sharing** - Share conversations with public links that others can import
- **Bring Your Own Key (BYOK)** - Secure implementation for OpenRouter + OpenAI keys
- **Chat management** - Pin, delete, rename, and organize chats
- **Custom instructions** - Set personalized AI behavior
- **Markdown rendering** - Rich text display with copy buttons for messages/code blocks
- **Responsive design** - Works well on mobile and desktop

## 🛠️ **Tech Stack**

- **Frontend**: React (Vite) + Tailwind CSS + ShadCN components
- **Backend**: Hono API configured for Cloudflare Workers
- **Authentication**: Firebase Auth (enabling smooth Google Sign-in)
- **Database**: PostgreSQL with Drizzle ORM
- **AI Models**: OpenRouter for text models, OpenAI for image generation
- **File Storage**: Cloudflare R2 bucket for uploaded files
- **Package Manager**: pnpm

## 📋 **Quick Start**

### Prerequisites
- Node.js 18+ and pnpm
- Git

### Setup

1. **Clone and Install**
   ```bash
   git clone https://github.com/VoloBuilds/volo-chat
   cd volo-chat
   pnpm install
   ```

2. **Configure Firebase**
   - Update `ui/src/lib/firebase-config.json` with your Firebase project details
   - Or keep the default config to use the demo Firebase project
   - Alternatively, use the Firebase emulator to run locally without a Firebase account

3. **Configure Backend**
   - Copy `server/platforms/cloudflare/wrangler.toml.template` to `server/wrangler.toml`
   - Update the configuration with your values:

   ```toml
   name = "your-worker-name"
   main = "src/index.ts"
   compatibility_date = "2024-09-23"
   compatibility_flags = [ "nodejs_compat" ]

   [vars]
   NODE_ENV = "production"
   FIREBASE_PROJECT_ID = "your-firebase-project-id"
   DATABASE_URL = "postgresql://your-neon-db-url"
   OPENROUTER_API_KEY = "your-openrouter-key"
   OPENAI_API_KEY = "your-openai-key"  # Optional, for image generation
   API_KEY_ENCRYPTION_SECRET = "your-32-char-secret"

   [[r2_buckets]]
   bucket_name = "your-r2-bucket-name"
   binding = "R2_BUCKET"
   ```

4. **Set Up Database Schema**
   ```bash
   cd server
   pnpm db:push
   ```

5. **Start Development**
   ```bash
   pnpm dev
   ```

   This starts both the frontend and backend on available ports (default 5500 and 5501)

6. **Start Chatting**
   - Open the frontend URL
   - Sign in with your Google account (or email/password)
   - Optionally, add your API keys in Settings → API Keys
   - Start a conversation

## 🔧 **Configuration Details**

### Required Services

**Database**: PostgreSQL (Neon recommended)
- Any PostgreSQL database will work
- Get free database at [neon.tech](https://neon.tech)

**Storage**: Cloudflare R2
- Required for file uploads and attachments
- Set up R2 bucket in Cloudflare dashboard
- **Note**: Uses R2 API directly (not S3-compatible storage atm)

**Authentication**: Firebase Auth
- Create project at [firebase.google.com](https://firebase.google.com)
- Enable Google Sign-in provider
- Update `firebase-config.json` with your project details

### API Keys

Add your keys in the app at Settings → API Keys:

- **OpenRouter**: For access to Claude, GPT-4, Gemini, DeepSeek, and 100+ other models
- **OpenAI**: For GPT-Image-1 image generation (optional)

### Security

- API keys are encrypted using `API_KEY_ENCRYPTION_SECRET`
- Use a 32-character random string for the encryption secret
- Different secret = different encrypted values (not transferable)

## 🤖 **Supported Models**

### Text Generation (via OpenRouter)
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus
- **OpenAI**: GPT-4o, GPT-4o-mini, o1 series
- **Google**: Gemini 2.5 Pro, Gemini 2.5 Flash
- **DeepSeek**: R1 series, V3 models
- **100+ Others**: Full OpenRouter catalog

### Image Generation (via OpenAI)
- **GPT-Image-1**: High-quality image generation

## 🎛️ **Usage Guide**

### Chat Branching
1. Hover over any message
2. Click the branch icon
3. Continue the conversation from that point
4. Original chat remains unchanged

### Chat Sharing
1. Open chat actions menu (3 dots)
2. Click "Share Chat"
3. Copy the generated link
4. Others can view and import the conversation

### File Attachments
- Drag & drop files onto chat input
- Supports images, PDFs, documents, code files
- Up to 5 files per message
- Auto-switches to multimodal models when needed

## 📁 **Project Structure**

```
volo-chat/
├── ui/                     # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── chat/      # Chat-specific components
│   │   │   ├── sidebar/   # Navigation and chat list
│   │   │   └── settings/  # API key management
│   │   ├── hooks/         # React hooks
│   │   ├── stores/        # Zustand state management
│   │   ├── types/         # TypeScript definitions
│   │   └── services/      # API communication
│   └── package.json
├── server/                 # Hono API backend
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   │   ├── chat-messaging.ts
│   │   │   ├── chat-sharing.ts
│   │   │   ├── chat-branching.ts
│   │   │   └── image-generation.ts
│   │   ├── services/      # Business logic
│   │   │   ├── ai/       # AI provider integrations
│   │   │   └── ChatCopyService.ts
│   │   ├── schema/        # Database schema
│   │   └── middleware/    # Auth and rate limiting
│   └── package.json
└── scripts/               # Development utilities
```

## 🚨 **Troubleshooting**

**Models not loading:**
- Add OpenRouter API key in Settings
- Check API key validity at [openrouter.ai](https://openrouter.ai)

**File uploads failing:**
- Verify R2 bucket is configured in `wrangler.toml`
- Check file size limits (10MB max)
- Ensure stable internet connection

**Database connection issues:**
- Verify `DATABASE_URL` in `wrangler.toml`
- Ensure database schema is initialized: `cd server && pnpm db:push`

**Authentication problems:**
- Check Firebase configuration in `firebase-config.json`
- Verify `FIREBASE_PROJECT_ID` matches in both files

## 🤝 **Contributing**

This project was built using "document-driven development" with Cursor agents - check out the [development timelapse](https://youtu.be/tEbCd3uRv0o) showing how 5k+ lines of code were written in 2-3 hours!

Areas for contribution:
- Web search
- Ability to modify generated images
- Resumable streams
- Code/markdown canvas (editable)
- MCPs & tool integrations

## 📜 **License**

MIT License - see LICENSE file for details.
