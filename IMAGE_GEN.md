# OpenAI Image Generation Integration

## Overview

This document outlines the development approach for integrating OpenAI's image generation API (DALL-E 3 and the new gpt-image-1 model) into the volo-chat application. This feature will allow users to generate images directly within chat conversations using text prompts.

## Current Architecture Analysis

### Existing AI Provider System
- **Base Provider**: `server/src/services/ai/BaseProvider.ts` defines the abstract interface for AI providers
- **OpenRouter Provider**: Currently handles all models through OpenRouter as a proxy
- **Model Management**: Models are fetched from OpenRouter API and transformed into a unified format
- **User API Keys**: BYOK system supports user-provided OpenRouter keys via `UserApiKeyService`

### Current Model Flow
1. Models are fetched from OpenRouter API (`/api/v1/models`)
2. Models are cached and transformed to standard `AIModel` interface
3. Model selection happens in `ModelSelector.tsx` with recommended models list
4. Chat messages are processed through `OpenRouterProvider.streamMessage()`

## Integration Strategy

### 1. Direct OpenAI Provider Implementation

Instead of routing through OpenRouter, we need a direct OpenAI provider for image generation because:
- Better pricing for image generation
- Access to latest models (gpt-image-1)
- More control over image generation parameters
- Reduced latency by eliminating proxy layer

### 2. Dual Provider Architecture

Create a hybrid system that supports both OpenRouter (for text models) and direct OpenAI (for image generation):

```typescript
// New direct OpenAI provider
class OpenAIProvider extends BaseAIProvider {
  name = 'openai';
  
  // Text generation (delegated to OpenRouter for compatibility)
  async streamMessage(model: string, messages: ChatMessage[], userId?: string) {
    // Delegate to OpenRouter for text models
  }
  
  // Image generation (direct OpenAI API)
  async generateImage(prompt: string, options: ImageOptions, userId?: string): Promise<ImageResult> {
    // Direct OpenAI DALL-E API call
  }
}
```

### 3. Model Type System Enhancement

Extend the `AIModel` interface to support image generation:

```typescript
export interface AIModel {
  id: string;
  name: string;
  provider: 'openrouter' | 'deepseek' | 'openai';
  description: string;
  contextWindow: number;
  pricing: {
    input: number;
    output: number;
  };
  capabilities: string[];
  isAvailable: boolean;
  originalProvider?: string;
  // New fields for image generation
  type: 'text' | 'image' | 'multimodal'; // Model type
  imageOptions?: {
    supportedSizes: string[];
    maxImages: number;
    supportedFormats: string[];
  };
}
```

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 OpenAI Provider Implementation
**Files to create:**
- `server/src/services/ai/OpenAIProvider.ts`

**Key methods:**
```typescript
class OpenAIProvider extends BaseAIProvider {
  async generateImage(prompt: string, options: ImageGenerationOptions, userId?: string): Promise<ImageResult>
  async getUserApiKey(userId?: string): Promise<string | null>
  private async getClientForUser(userId?: string): Promise<OpenAI>
  async validateApiKey(apiKey: string): Promise<boolean>
  async getModels(): Promise<AIModel[]> // Return image generation models
}
```

#### 1.2 Environment Configuration
**Update `server/src/lib/env.ts`:**
```typescript
export function getOpenAIApiKey(): string | undefined {
  return getEnv('OPENAI_API_KEY');
}
```

#### 1.3 User API Key Service Enhancement
**Update `server/src/services/UserApiKeyService.ts`:**
- Add support for OpenAI API keys alongside OpenRouter keys
- Methods: `saveOpenAIApiKey`, `getOpenAIApiKey`, `deleteOpenAIApiKey`
- Cache management for OpenAI keys

#### 1.4 AI Provider Manager Update
**Update `server/src/services/ai/AIProviderManager.ts`:**
```typescript
class AIProviderManager {
  private openAIProvider: OpenAIProvider | null = null;
  
  async generateImage(modelId: string, prompt: string, options: ImageOptions, userId?: string): Promise<ImageResult>
  getProviderForModel(modelId: string): BaseAIProvider // Route to appropriate provider
}
```

### Phase 2: Image Generation Models

#### 2.1 Add Image Models to System
**Predefined image models:**
```typescript
const IMAGE_MODELS: AIModel[] = [
  {
    id: 'gpt-image-1',
    name: 'GPT Image 1',
    provider: 'openai',
    type: 'image',
    description: 'Latest OpenAI image generation model with enhanced quality',
    capabilities: ['image-generation'],
    pricing: { input: 0.04, output: 0.04 }, // Per image
    imageOptions: {
      supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
      maxImages: 1,
      supportedFormats: ['png']
    }
  },
  {
    id: 'dall-e-3',
    name: 'DALL-E 3',
    provider: 'openai',
    type: 'image',
    description: 'High-quality image generation with natural language prompts',
    capabilities: ['image-generation'],
    pricing: { input: 0.04, output: 0.04 },
    imageOptions: {
      supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
      maxImages: 1,
      supportedFormats: ['png']
    }
  }
];
```

#### 2.2 Update Recommended Models
**Update `ui/src/components/chat/ModelSelector.tsx`:**
```typescript
const RECOMMENDED_MODELS = [
  { pattern: 'gemini.*2\.?5.*flash', name: 'Gemini 2.5 Flash' },
  { pattern: 'gemini.*2\.?5.*pro', name: 'Gemini 2.5 Pro' },
  { pattern: 'gpt.*image|dalle|imagegen', name: 'GPT ImageGen' }, // Already exists
  { pattern: 'gpt-image-1', name: 'GPT Image 1' }, // Add specific model
  { pattern: 'dall-e-3', name: 'DALL-E 3' }, // Add DALL-E 3
  // ... rest of models
];
```

### Phase 3: API Routes for Image Generation

#### 3.1 Image Generation Endpoint
**Create `server/src/routes/image-generation.ts`:**
```typescript
// POST /api/v1/images/generate
imageGeneration.post('/generate', rateLimitMiddleware(10, 60000), async (c) => {
  const user = c.get('user');
  const { prompt, modelId, size, style, quality } = await c.req.json();
  
  const aiManager = new AIProviderManager();
  const result = await aiManager.generateImage(modelId, prompt, {
    size, style, quality
  }, user.id);
  
  return c.json({ image: result });
});
```

#### 3.2 Enhanced Chat Messaging
**Update `server/src/routes/chat-messaging.ts`:**
- Detect when selected model is an image generation model
- Route to image generation instead of text streaming
- Return image results in chat message format

```typescript
// In chat-messaging.ts
if (isImageGenerationModel(modelId)) {
  // Handle image generation
  const imageResult = await aiManager.generateImage(modelId, content, options, user.id);
  
  // Save message with image attachment
  const assistantMessage: NewMessage = {
    chatId: chatId,
    role: 'assistant',
    content: 'I generated an image for you:',
    modelId,
    attachments: [{
      id: imageResult.id,
      filename: `generated-image-${Date.now()}.png`,
      fileType: 'image/png',
      url: imageResult.url,
      status: 'uploaded'
    }]
  };
}
```

### Phase 4: Frontend Integration

#### 4.1 API Key Management UI
**Update `ui/src/components/settings/ApiKeyManager.tsx`:**
- Add OpenAI API key input field
- Separate sections for OpenRouter and OpenAI keys
- Validation for OpenAI key format (`sk-...`)

```tsx
// Additional state for OpenAI keys
const [openaiApiKey, setOpenaiApiKey] = useState('');
const [openaiStatus, setOpenaiStatus] = useState<ApiKeyStatus | null>(null);

// Add OpenAI key management functions
const handleSaveOpenAIKey = async () => {
  await UserApiKeyService.saveOpenAIApiKey(openaiApiKey.trim());
  // Update status and reload
};
```

#### 4.2 Model Selector Enhancement
**Update `ui/src/components/chat/ModelSelector.tsx`:**
- Add visual indicators for image generation models
- Group models by type (Text, Image, Multimodal)
- Add image generation icon for image models

```tsx
const getCapabilityIcon = (capability: string) => {
  switch (capability.toLowerCase()) {
    case 'image-generation':
      return ImageIcon;
    case 'vision':
      return Eye;
    // ... rest of capabilities
  }
};
```

#### 4.3 Chat Input Enhancement
**Update `ui/src/components/chat/ChatInput.tsx`:**
- Detect when image generation model is selected
- Change input placeholder to "Describe the image you want to generate..."
- Add image generation specific options (size, style, quality)

#### 4.4 Message Display Enhancement
**Update `ui/src/components/chat/MessageBubble.tsx`:**
- Enhanced image display for generated images
- Add generation metadata display (model, prompt, settings)
- Support for image regeneration with modified prompts

```tsx
// Add to MessageImageAttachment component
if (attachment.isGenerated) {
  return (
    <div className="relative">
      <img src={imageSrc} alt={attachment.filename} />
      <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
        Generated with {attachment.modelId}
      </div>
    </div>
  );
}
```

### Phase 5: User Experience Enhancements

#### 5.1 Image Generation History
- Store image generation prompts and settings
- Allow users to regenerate with variations
- Provide prompt suggestions and templates

#### 5.2 Cost Tracking
- Track image generation costs per user
- Display cost estimates before generation
- Usage limits and billing integration

#### 5.3 Prompt Enhancement
- Automatic prompt enhancement for better results
- Style presets (photorealistic, artistic, cartoon, etc.)
- Template prompts for common use cases

## Technical Considerations

### 1. Image Storage
- Generated images should be stored in R2 bucket
- Use signed URLs for secure access
- Implement cleanup for old generated images

### 2. Rate Limiting
- Implement aggressive rate limiting for image generation
- Different limits for free vs. paid users
- Queue system for high-demand periods

### 3. Cost Management
- Image generation is expensive ($0.04-$0.08 per image)
- Implement usage tracking and billing
- Warn users about costs

### 4. Error Handling
- Handle OpenAI API errors gracefully
- Provide meaningful error messages
- Implement retry logic for transient failures

### 5. Content Moderation
- OpenAI has built-in content filtering
- Additional checks for inappropriate prompts
- User reporting system for generated content

## Security Considerations

### 1. API Key Security
- Store OpenAI keys encrypted in database
- Use secure environment variables for system keys
- Implement key rotation capabilities

### 2. Input Validation
- Sanitize image generation prompts
- Validate all parameters (size, quality, etc.)
- Prevent prompt injection attacks

### 3. Output Filtering
- Additional content checks on generated images
- User reporting and moderation tools
- Compliance with content policies

## Testing Strategy

### 1. Unit Tests
- Test OpenAI provider methods
- Mock OpenAI API responses
- Test image generation parameter validation

### 2. Integration Tests
- End-to-end image generation flow
- User API key management
- Error handling scenarios

### 3. Load Testing
- Concurrent image generation requests
- Rate limiting effectiveness
- Cost monitoring accuracy

## Deployment Plan

### 1. Environment Variables
Add to deployment configuration:
```env
OPENAI_API_KEY=sk-...
ENABLE_IMAGE_GENERATION=true
IMAGE_GENERATION_RATE_LIMIT=10
MAX_IMAGES_PER_USER_DAILY=50
```

### 2. Database Migration
- Add OpenAI API key fields to users table
- Add image generation tracking tables
- Create indexes for performance

### 3. Feature Flags
- Enable image generation gradually
- A/B test different UI approaches
- Monitor usage and costs

## Success Metrics

### 1. Usage Metrics
- Number of images generated daily
- User adoption rate
- Average images per user session

### 2. Quality Metrics
- User satisfaction with generated images
- Regeneration rate (indicates satisfaction)
- Support tickets related to image generation

### 3. Business Metrics
- Revenue from image generation feature
- Cost per image generation
- User retention impact

## Future Enhancements

### 1. Advanced Features
- Image editing and variations
- Style transfer capabilities
- Batch image generation

### 2. Integration Opportunities
- Integration with design tools
- Social media sharing
- Print-on-demand services

### 3. Model Upgrades
- Support for new OpenAI models
- Multi-provider image generation
- Custom model fine-tuning

---

This comprehensive plan provides a roadmap for integrating OpenAI's image generation capabilities into the volo-chat application while maintaining the existing architecture and providing a seamless user experience. 