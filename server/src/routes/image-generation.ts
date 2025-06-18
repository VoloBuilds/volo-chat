import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { AIProviderManager } from '../services/ai/AIProviderManager';
import { ImageGenerationOptions } from '../services/ai/OpenAIProvider';

const imageGeneration = new Hono();

// Apply auth middleware to all routes
imageGeneration.use('*', authMiddleware);

// POST /generate - Generate an image
imageGeneration.post('/generate', rateLimitMiddleware(10, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const body = await c.req.json();
    const { prompt, modelId, size, partial_images } = body;

    if (!prompt || typeof prompt !== 'string') {
      return c.json({ error: 'Prompt is required and must be a string' }, 400);
    }

    if (!modelId || typeof modelId !== 'string') {
      return c.json({ error: 'Model ID is required' }, 400);
    }

    // Validate size if provided
    const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
    if (size && !validSizes.includes(size)) {
      return c.json({ error: `Invalid size. Must be one of: ${validSizes.join(', ')}` }, 400);
    }

    // Validate partial_images if provided
    if (partial_images && (typeof partial_images !== 'number' || partial_images < 1 || partial_images > 5)) {
      return c.json({ error: 'partial_images must be a number between 1 and 5' }, 400);
    }

    const options: ImageGenerationOptions = {
      size: size || '1024x1024',
      partial_images: partial_images || 2,
    };

    const aiManager = new AIProviderManager();
    
    // Check if the model is an image generation model
    if (!aiManager.isImageGenerationModel(modelId)) {
      return c.json({ error: `Model ${modelId} is not an image generation model` }, 400);
    }

    const result = await aiManager.generateImage(modelId, prompt, options, user.id);

    return c.json({ 
      image: result,
      model: modelId,
      prompt: prompt,
      options: options
    });

  } catch (error) {
    console.error('Image generation error:', error);
    
    if (error instanceof Error) {
      // Check for specific OpenAI errors
      if (error.message.includes('API key')) {
        return c.json({ 
          error: 'OpenAI API key not configured. Please add your OpenAI API key in settings.' 
        }, 401);
      }
      
      if (error.message.includes('quota') || error.message.includes('billing')) {
        return c.json({ 
          error: 'OpenAI API quota exceeded or billing issue. Please check your OpenAI account.' 
        }, 402);
      }
      
      if (error.message.includes('content policy') || error.message.includes('safety')) {
        return c.json({ 
          error: 'Image generation failed due to content policy restrictions. Please modify your prompt.' 
        }, 400);
      }
      
      return c.json({ 
        error: `Image generation failed: ${error.message}` 
      }, 500);
    }
    
    return c.json({ error: 'Internal server error during image generation' }, 500);
  }
});

// GET /models - Get available image generation models
imageGeneration.get('/models', async (c) => {
  try {
    const aiManager = new AIProviderManager();
    const allModels = await aiManager.getAllModels();
    
    // Filter for image generation models only
    const imageModels = allModels.filter(model => 
      model.capabilities.includes('image-generation')
    );
    
    return c.json({ models: imageModels });
  } catch (error) {
    console.error('Failed to fetch image generation models:', error);
    return c.json({ error: 'Failed to fetch image generation models' }, 500);
  }
});

export { imageGeneration }; 