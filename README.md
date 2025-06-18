# Volo Chat

A powerful AI chat application that brings together multiple AI providers and models in one unified interface. Chat with Claude, GPT-4, Gemini, DeepSeek, and generate images with GPT-Image-1 - all while maintaining full control over your data and API keys.

## 🎯 **What is Volo Chat?**

Volo Chat is a full-stack AI chat application that provides:

- **Multi-Provider AI Support**: Chat with models from OpenAI, Anthropic, Google, DeepSeek, and more through OpenRouter
- **Image Generation**: Create images with OpenAI's GPT Image model
- **File Attachments**: Upload and analyze documents, images, PDFs, and code files
- **Chat Sharing**: Share conversations with public links that others can import
- **Chat Branching**: Create alternative conversation paths from any message
- **BYOK (Bring Your Own Key)**: Use your own API keys for cost control and privacy


## 🚀 **Key Features**

### 🤖 **Multiple AI Providers**
- **OpenRouter Integration**: Access 100+ models from various providers
- **Direct OpenAI Integration**: Optimized image generation with DALL-E
- **Smart Model Selection**: Automatic recommendations for your use case
- **Real-time Streaming**: Fast, responsive conversations

### 📎 **Advanced File Support**
- **Image Analysis**: Upload images for AI analysis and discussion
- **Document Processing**: PDF, Word, text, and code file analysis
- **Multiple Formats**: Support for JSON, CSV, Markdown, and more
- **Drag & Drop**: Easy file attachment with progress tracking

### 🔗 **Chat Management**
- **Share Conversations**: Generate public links to share interesting chats
- **Import Shared Chats**: Discover and import conversations from others
- **Branch Conversations**: Create alternative paths from any message point
- **Organized Sidebar**: Chronological chat grouping with search

### 🔐 **Privacy & Control**
- **Your API Keys**: Use your own keys for complete control
- **Local Development**: Full offline development environment
- **Anonymous Users**: No account required to start
- **Firebase Auth**: Secure authentication when ready

## 🛠️ **Tech Stack**

**Frontend:**
- ⚛️ React + TypeScript + Vite
- 🎨 Tailwind CSS + ShadCN/UI
- 🔐 Firebase Authentication
- 🗂️ Zustand State Management

**Backend:**
- 🔥 Hono API (Node.js/Cloudflare Workers)
- 🗄️ PostgreSQL + Drizzle ORM
- 🪣 Cloudflare R2 File Storage
- 🔑 Multi-provider AI integration

## 📋 **Quick Start**

### Prerequisites
- Node.js 18+ and pnpm
- Git

### Installation

1. **Clone and Install**
   ```bash
   git clone <your-repo-url>
   cd volo-chat
   pnpm install
   ```

2. **Start Development Environment**
   ```bash
   pnpm dev
   ```

   This starts:
   - **Frontend**: http://localhost:5173
   - **Backend API**: http://localhost:8787
   - **PostgreSQL**: Embedded database
   - **Firebase Auth**: Local emulator

3. **Start Chatting**
   - Open the frontend URL
   - Sign in with any email/password (local mode)
   - Start a conversation with the default models

## 🔧 **Configuration**

### Environment Variables

Create `server/.env` with your API keys:

```bash
# Optional: OpenRouter API key for text models
OPENROUTER_API_KEY=your_openrouter_key

# Optional: OpenAI API key for image generation
OPENAI_API_KEY=your_openai_key

# Database (automatically configured for local development)
DATABASE_URL=postgresql://...

# Firebase (automatically configured for local development)
FIREBASE_PROJECT_ID=your_project_id
```

### Adding Your Own API Keys

1. **In the App**: Go to Settings → API Keys
2. **Add Keys**: Enter your OpenRouter and/or OpenAI keys
3. **Start Chatting**: Your keys enable access to all models

### Production Deployment

For production deployment to Cloudflare:

1. **Database**: Set up Neon, Supabase, or custom PostgreSQL
2. **Storage**: Configure Cloudflare R2 bucket
3. **Auth**: Set up production Firebase project
4. **Deploy**: Use Cloudflare Pages + Workers

See deployment docs in `server/README.md` for detailed instructions.

## 🤖 **Supported Models**

### Text Generation
- **Anthropic**: Claude 4, Claude 3.5 Sonnet
- **OpenAI**: GPT-4o, GPT-4o-mini, o1 series
- **Google**: Gemini 2.5 Pro, Gemini 2.5 Flash
- **DeepSeek**: R1 series, V3 models
- **100+ Others**: Via OpenRouter integration

### Image Generation
- **OpenAI DALL-E 3**: High-quality image generation
- **GPT Image 1**: Latest OpenAI image model with streaming

### File Analysis
- **Images**: JPEG, PNG, GIF, WebP analysis
- **Documents**: PDF, Word, text file processing
- **Code**: JSON, CSV, code file analysis
- **Multimodal**: Combined text and image understanding

## 🎛️ **Usage Guide**

### Basic Chat
1. Select a model from the dropdown
2. Type your message
3. Attach files if needed
4. Send and watch the streaming response

### File Attachments
- **Drag & Drop**: Files onto the chat input
- **Click to Upload**: Use the attachment button
- **Multiple Files**: Upload up to 5 files per message
- **Smart Model Selection**: Auto-switch to multimodal models when needed

### Chat Sharing
1. Open chat actions menu (3 dots)
2. Click "Share Chat"
3. Copy the generated link
4. Others can view and import the conversation

### Chat Branching
1. Hover over any message
2. Click the branch icon
3. Continue the conversation from that point
4. Original chat remains unchanged

### Image Generation
1. Select an image generation model (DALL-E 3, GPT Image 1)
2. Describe what you want to create
3. Watch real-time generation progress
4. Download or share the result

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

## 🔌 **API Integration**

### Adding New AI Providers

1. **Create Provider**: Extend `BaseAIProvider` class
2. **Update Manager**: Add to `AIProviderManager`
3. **Add Models**: Define model configurations
4. **Test Integration**: Verify streaming and responses

### Custom Features

The modular architecture makes it easy to add:
- New file type support
- Additional AI providers
- Custom chat features
- Enhanced UI components

## 🛡️ **Security & Privacy**

- **API Key Security**: Your keys are encrypted and stored securely
- **Anonymous Mode**: No data collection without account
- **Local Development**: Everything runs locally by default
- **CORS Protection**: Proper API security measures
- **Rate Limiting**: Prevents abuse and overuse

## 🚨 **Troubleshooting**

### Common Issues

**Models not loading:**
- Add OpenRouter API key in Settings
- Check network connectivity
- Verify API key validity

**File uploads failing:**
- Check file size (10MB limit)
- Verify supported file types
- Ensure stable internet connection

**Chat sharing not working:**
- Confirm authentication
- Check if chat has messages
- Verify network connectivity

**Image generation failing:**
- Add OpenAI API key in Settings
- Check API quota and billing
- Try different prompts if content policy issues

### Development Issues

```bash
# Clear cache and reinstall
rm -rf node_modules
pnpm install

# Reset database
cd server && pnpm db:push

# Check logs
pnpm dev --verbose
```

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

Areas we'd love help with:
- New AI provider integrations
- Enhanced file type support
- UI/UX improvements
- Performance optimizations
- Documentation updates

## 📜 **License**

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 **Acknowledgments**

- **OpenRouter**: For providing access to multiple AI models
- **OpenAI**: For powerful language and image models
- **Anthropic**: For Claude's exceptional reasoning
- **ShadCN/UI**: For beautiful, accessible components
- **Cloudflare**: For edge computing and storage

---

**Start building with AI today!** 🚀

Whether you're a developer exploring AI integration, a researcher analyzing data, or someone who just wants to chat with the best AI models available - Volo Chat provides the tools and flexibility you need. 