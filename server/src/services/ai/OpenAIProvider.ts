import OpenAI from 'openai';
import { BaseAIProvider } from './BaseProvider';
import { AIModel, ChatMessage } from '../../types/ai';
import { UserApiKeyService } from '../UserApiKeyService';

export interface ImageGenerationOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  partial_images?: number; // Number of partial images for streaming
}

export interface ImageResult {
  id: string;
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
  attachment?: {
    id: string;
    filename: string;
    fileType: string;
    fileSize: number;
    status: string;
  };
}

export interface StreamImageChunk {
  type: 'partial_image' | 'final_image';
  partial_image_index?: number;
  partial_image_b64?: string;
  final_image_b64?: string;
}

export class OpenAIProvider extends BaseAIProvider {
  name = 'openai';
  models: AIModel[] = [
    {
      id: 'gpt-image-1',
      name: 'GPT Image 1',
      provider: 'openai',
      type: 'image',
      description: 'Latest OpenAI image generation model with enhanced quality and streaming support',
      contextWindow: 0, // Not applicable for image models
      pricing: { input: 0.04, output: 0.04 }, // Per image
      capabilities: ['image-generation', 'streaming'],
      isAvailable: true,
      imageOptions: {
        supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
        maxImages: 1,
        supportedFormats: ['png', 'jpeg', 'webp']
      }
    }
  ];

  private clientCache = new Map<string, OpenAI>();

  async getUserApiKey(userId?: string): Promise<string | null> {
    if (!userId) {
      return this.getApiKey();
    }
    return await UserApiKeyService.getOpenAIApiKey(userId);
  }

  private async getClientForUser(userId?: string): Promise<OpenAI> {
    const userCacheKey = userId || 'system';
    
    // Check if we have a cached client
    if (this.clientCache.has(userCacheKey)) {
      return this.clientCache.get(userCacheKey)!;
    }

    // Get API key
    const apiKey = await this.getUserApiKey(userId);
    if (!apiKey) {
      throw new Error(userId ? 'Please add an OpenAI API key to your account in the user settings.' : 'System OpenAI API key not configured');
    }

    // Create new client
    const client = new OpenAI({
      apiKey: apiKey,
    });

    // Cache the client
    this.clientCache.set(userCacheKey, client);
    
    return client;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey });
      // Test the API key by making a simple request
      await client.models.list();
      return true;
    } catch (error) {
      console.error('OpenAI API key validation failed:', error);
      return false;
    }
  }

  async sendMessage(model: string, messages: ChatMessage[], userId?: string): Promise<string> {
    // For image generation models, delegate to generateImage
    if (this.isImageModel(model)) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        const result = await this.generateImage(lastMessage.content, {}, userId, model);
        return `I generated an image for you: ${result.url || 'data:image/png;base64,' + result.b64_json}`;
      }
      throw new Error('No valid prompt found for image generation');
    }

    // For text models, OpenAI provider doesn't handle text generation
    // This should be delegated to OpenRouter
    throw new Error('OpenAI provider only handles image generation. Text generation should use OpenRouter.');
  }

  async *streamMessage(model: string, messages: ChatMessage[], userId?: string, fileService?: any, env?: any): AsyncIterableIterator<string> {
    // For image generation models, use streaming image generation
    if (this.isImageModel(model)) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        yield* this.streamImageGeneration(lastMessage.content, {}, userId, model, fileService, env);
        return;
      }
      throw new Error('No valid prompt found for image generation');
    }
    
    throw new Error('OpenAI provider only handles image generation. Text generation should use OpenRouter.');
  }

  async *streamImageGeneration(prompt: string, options: ImageGenerationOptions = {}, userId?: string, modelId?: string, fileService?: any, env?: any): AsyncIterableIterator<string> {
    const client = await this.getClientForUser(userId);

    console.log(`[OPENAI-IMAGE] Starting image generation:`, {
      hasFileService: !!fileService,
      hasEnv: !!env,
      hasUserId: !!userId,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')
    });

    try {
      // Start generation process
      yield '🎨 Starting image generation...';

      // Use the responses API with streaming for partial images
      const stream = await client.responses.create({
        model: "gpt-4.1",
        input: prompt,
        stream: true,
        tools: [{ 
          type: "image_generation", 
          partial_images: options.partial_images || 2 
        }],
      });

      let latestImageBase64 = "";
      let partialCount = 0;
      const expectedPartials = options.partial_images || 2;

      for await (const event of stream) {
        if (event.type === "response.image_generation_call.partial_image") {
          const imageBase64 = event.partial_image_b64;
          
          partialCount++;
          latestImageBase64 = imageBase64; // Store the latest partial image
          
          // Use REPLACE: prefix to indicate content should be replaced, not appended
          yield `REPLACE:🎨 Generating image... (${partialCount}/${expectedPartials})`;
        }
      }

      console.log(`[OPENAI-IMAGE] Image generation completed, base64 length: ${latestImageBase64?.length || 0}`);

      // Save final image as a file attachment
      if (latestImageBase64 && fileService && env && userId) {
        console.log(`[OPENAI-IMAGE] Attempting to save image as file attachment`);
        try {
          // Convert base64 to buffer
          const imageBuffer = Buffer.from(latestImageBase64, 'base64');
          
          // Generate filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `generated-image-${timestamp}.png`;
          
          console.log(`[OPENAI-IMAGE] Saving file: ${filename}, size: ${imageBuffer.length} bytes`);
          
          // Save as pending file
          const fileRecord = await fileService.uploadFilePending(
            imageBuffer,
            filename,
            userId,
            'image/png'
          );
          
          console.log(`[OPENAI-IMAGE] File saved with ID: ${fileRecord.id}`);
          
          // Commit to R2 immediately
          await fileService.commitFilesToR2([fileRecord.id], env);
          
          console.log(`[OPENAI-IMAGE] File committed to R2 successfully`);
          
          // Return completion with attachment info
          yield `REPLACE:✨ Image generation complete! [ATTACHMENT:${fileRecord.id}]`;
          
          return; // Exit successfully
        } catch (error) {
          console.error('[OPENAI-IMAGE] Failed to save generated image:', error);
          // Fall back to returning the base64 data
          yield `REPLACE:[IMAGE_DATA:data:image/png;base64,${latestImageBase64}]✨ Image generation complete!`;
          return;
        }
      }

      // Fallback if no file service provided or user not specified
      console.log(`[OPENAI-IMAGE] Using fallback - fileService: ${!!fileService}, env: ${!!env}, userId: ${!!userId}`);
      if (latestImageBase64) {
        yield `REPLACE:[IMAGE_DATA:data:image/png;base64,${latestImageBase64}]✨ Image generation complete!`;
      } else {
        throw new Error('No image generated');
      }

    } catch (error) {
      console.error('OpenAI streaming image generation failed:', error);
      if (error instanceof Error) {
        yield `REPLACE:❌ Image generation failed: ${error.message}`;
      } else {
        yield 'REPLACE:❌ Image generation failed with unknown error';
      }
    }
  }

  async generateImage(prompt: string, options: ImageGenerationOptions = {}, userId?: string, modelId?: string): Promise<ImageResult> {
    const client = await this.getClientForUser(userId);

    try {
      // Use the responses API with streaming for image generation
      const stream = await client.responses.create({
        model: "gpt-4.1",
        input: prompt,
        stream: true,
        tools: [{ 
          type: "image_generation", 
          partial_images: options.partial_images || 2 
        }],
      });

      let finalImageBase64 = "";

      for await (const event of stream) {
        if (event.type === "response.image_generation_call.partial_image") {
          // Store the latest partial image as it comes in
          finalImageBase64 = event.partial_image_b64;
        }
      }

      if (!finalImageBase64) {
        throw new Error('No image generated');
      }

      return {
        id: `img_${Date.now()}`,
        b64_json: finalImageBase64,
        revised_prompt: prompt, // The input prompt, since we don't get a revised one from this API
      };
    } catch (error) {
      console.error('OpenAI image generation failed:', error);
      if (error instanceof Error) {
        throw new Error(`Image generation failed: ${error.message}`);
      }
      throw new Error('Image generation failed with unknown error');
    }
  }

  isImageModel(modelId: string): boolean {
    return this.models.some(model => 
      model.id === modelId && 
      model.capabilities.includes('image-generation')
    );
  }

  async getModels(): Promise<AIModel[]> {
    // Return static image models - these don't need to be fetched from API
    return this.models.filter(model => model.isAvailable);
  }

  clearUserCache(userId: string): void {
    this.clientCache.delete(userId);
  }

  clearAllCache(): void {
    this.clientCache.clear();
  }

  getProviderStatus(): any {
    return {
      name: this.name,
      hasSystemKey: this.hasApiKey(),
      cachedClients: this.clientCache.size,
      models: this.models.length,
    };
  }
} 