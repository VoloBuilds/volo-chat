import { Hono } from 'hono';
import { AIProviderManager } from '../services/ai/AIProviderManager';
import { setEnvContext } from '../lib/env';

const models = new Hono();

// Check once if we're in Node.js environment
const isNodeEnv = typeof process !== 'undefined' && process.env?.NODE_ENV !== undefined;

// Set environment context once based on the runtime
if (isNodeEnv) {
  // In Node.js environment, use process.env
  setEnvContext(process.env);
}

// Environment context middleware for models route
models.use('*', async (c, next) => {
  // In Cloudflare Workers, set context from c.env (only if not already set for Node.js)
  if (!isNodeEnv) {
    setEnvContext(c.env);
  }
  
  await next();
});

// Create AI manager after environment context is available
function getAIManager(): AIProviderManager {
  return new AIProviderManager();
}

// GET /api/models - List available AI models
models.get('/', async (c) => {
  try {
    console.log('Models endpoint called');
    const aiManager = getAIManager();
    const availableModels = await aiManager.getAllModels();
    const availableProviders = aiManager.getAvailableProviders();
    const configuredProviders = aiManager.getConfiguredProviders();
    
    console.log(`Found ${availableModels.length} models from ${availableProviders.length} providers`);
    console.log(`Configured providers: ${configuredProviders.join(', ')}`);
    
    return c.json({
      models: availableModels,
      providers: availableProviders,
      configuredProviders,
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    return c.json({
      error: 'Failed to fetch models',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});

// GET /api/models/:id - Get specific model details
models.get('/:id', async (c) => {
  try {
    const modelId = c.req.param('id');
    const aiManager = getAIManager();
    const availableModels = await aiManager.getAllModels();
    const model = availableModels.find(m => m.id === modelId);
    
    if (!model) {
      return c.json({ error: 'Model not found' }, 404);
    }
    
    return c.json({ model });
  } catch (error) {
    console.error('Error fetching model:', error);
    return c.json({
      error: 'Failed to fetch model',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export { models }; 