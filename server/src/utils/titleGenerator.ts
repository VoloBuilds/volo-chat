import { AIProviderManager } from '../services/ai/AIProviderManager';
import { ChatMessage } from '../types/ai';

export interface TitleGenerationOptions {
  content: string;
  modelId?: string;
  maxLength?: number;
  fallbackWords?: number;
}

export interface TitleGenerationResult {
  title: string;
  source: 'ai' | 'fallback';
  error?: string;
}

export class TitleGenerator {
  private aiManager: AIProviderManager;
  private readonly DEFAULT_MODEL = 'gemini-2.5-flash-preview-05-20';
  private readonly MAX_TITLE_LENGTH = 60;
  private readonly FALLBACK_WORDS = 4;

  constructor() {
    this.aiManager = new AIProviderManager();
  }

  /**
   * Generate a chat title based on the first message content
   */
  async generateTitle(options: TitleGenerationOptions): Promise<TitleGenerationResult> {
    const {
      content,
      modelId = this.DEFAULT_MODEL,
      maxLength = this.MAX_TITLE_LENGTH,
      fallbackWords = this.FALLBACK_WORDS
    } = options;

    // Input validation
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return {
        title: 'New Chat',
        source: 'fallback',
        error: 'Invalid or empty content provided'
      };
    }

    // Check if the model is available
    try {
      const availableModels = await this.aiManager.getAllModels();
      const requestedModel = availableModels.find(m => m.id === modelId);
      
      if (!requestedModel) {
        console.warn(`Title generation - model ${modelId} not found. Available models:`, availableModels.map(m => m.id));
        return this.generateFallbackTitle(content, fallbackWords, maxLength);
      }
      
      if (!requestedModel.isAvailable) {
        console.warn(`Title generation - model ${modelId} is not available (likely API key missing)`);
        return this.generateFallbackTitle(content, fallbackWords, maxLength);
      }
    } catch (modelCheckError) {
      console.error('Title generation - error checking model availability:', modelCheckError);
      return this.generateFallbackTitle(content, fallbackWords, maxLength);
    }

    // Try AI generation first
    try {
      console.log('Title generation - starting with model:', modelId);
      console.log('Title generation - content length:', content.length);
      
      const aiTitle = await this.generateWithAI(content, modelId);
      
      console.log('Title generation - raw AI response:', aiTitle);
      
      // Validate AI response
      if (this.isValidTitle(aiTitle, content)) {
        const cleanedTitle = this.cleanTitle(aiTitle, maxLength);
        console.log('Title generation - cleaned valid title:', cleanedTitle);
        return {
          title: cleanedTitle,
          source: 'ai'
        };
      } else {
        console.warn('AI generated invalid title:', aiTitle, 'Original content:', content.substring(0, 50));
        return this.generateFallbackTitle(content, fallbackWords, maxLength);
      }
    } catch (aiError) {
      console.error('AI title generation failed with error:', aiError);
      console.error('Error details:', {
        name: aiError instanceof Error ? aiError.name : 'Unknown',
        message: aiError instanceof Error ? aiError.message : String(aiError),
        stack: aiError instanceof Error ? aiError.stack : undefined
      });
      return this.generateFallbackTitle(content, fallbackWords, maxLength);
    }
  }

  /**
   * Generate title using AI model
   */
  private async generateWithAI(content: string, modelId: string): Promise<string> {
    // Truncate content if too long to avoid token limits
    const truncatedContent = content.length > 200 ? content.substring(0, 200) + '...' : content;
    
    // Improved prompt with better instructions
    const titlePrompt = `You are a title generator. Create a short, descriptive title (3-6 words maximum) for a chat based on this message:

"${truncatedContent}"

Requirements:
- Maximum 6 words
- No quotes, punctuation, or special formatting
- Capture the main topic or intent
- Be specific and descriptive
- Do NOT repeat the exact message content

Example formats:
- "Help with JavaScript Arrays"
- "Recipe for Chocolate Cake"
- "Travel Planning for Europe"

Generate only the title:`;

    const aiMessages: ChatMessage[] = [
      {
        role: 'user',
        content: titlePrompt,
      }
    ];

    console.log('Title generation - calling AI with model:', modelId);
    console.log('Title generation - prompt length:', titlePrompt.length);
    
    try {
      const response = await this.aiManager.sendMessage(modelId, aiMessages);
      console.log('Title generation - AI response:', response);
      return response.trim();
    } catch (aiError) {
      console.error('Title generation - AI call failed:', aiError);
      throw aiError;
    }
  }

  /**
   * Validate that the AI-generated title is appropriate
   */
  private isValidTitle(title: string, originalContent: string): boolean {
    // Check if title is empty or too short
    if (!title || title.length < 2) {
      return false;
    }

    // Check if title is too similar to original content
    const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, '');
    const normalizedContent = originalContent.toLowerCase().replace(/[^\w\s]/g, '');
    
    // If title is exactly the same as content (or very similar), it's invalid
    if (normalizedTitle === normalizedContent) {
      return false;
    }

    // Check if title is just repeating the prompt or contains prompt text
    const promptIndicators = [
      'generate a title',
      'create a title',
              'chat that starts',
      'return only',
      'maximum',
      'requirements'
    ];
    
    for (const indicator of promptIndicators) {
      if (normalizedTitle.includes(indicator)) {
        return false;
      }
    }

    // Check word count (should be reasonable for a title)
    const wordCount = title.trim().split(/\s+/).length;
    if (wordCount > 10) {
      return false;
    }

    return true;
  }

  /**
   * Clean and format the title
   */
  private cleanTitle(title: string, maxLength: number): string {
    return title
      .trim()
      .replace(/^["']|["']$/g, '') // Remove quotes from start/end
      .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, maxLength)
      .trim();
  }

  /**
   * Generate fallback title from content
   */
  private generateFallbackTitle(
    content: string, 
    fallbackWords: number, 
    maxLength: number
  ): TitleGenerationResult {
    const words = content.trim().split(/\s+/).slice(0, fallbackWords);
    let fallbackTitle = words.join(' ');
    
    // Add ellipsis if content was truncated
    if (content.split(/\s+/).length > fallbackWords) {
      fallbackTitle += '...';
    }

    // Ensure it doesn't exceed max length
    if (fallbackTitle.length > maxLength) {
      fallbackTitle = fallbackTitle.substring(0, maxLength - 3) + '...';
    }

    return {
      title: fallbackTitle || 'New Chat',
      source: 'fallback',
      error: 'AI generation failed, using fallback'
    };
  }
}

// Export a singleton instance
export const titleGenerator = new TitleGenerator(); 