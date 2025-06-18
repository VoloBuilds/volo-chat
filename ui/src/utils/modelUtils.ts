import { AIModel } from '../types/chat';

// Models that are particularly good at analysis tasks
const ANALYSIS_CAPABLE_MODELS = [
  // Claude models (excellent at analysis)
  'claude-3-5-sonnet',
  'claude-3-5-haiku', 
  'claude-3-sonnet',
  'claude-3-opus',
  
  // GPT models with analysis capabilities
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4',
  'o1-preview',
  'o1-mini',
  
  // Gemini models (prioritize the user's requested model)
  'google/gemini-2.5-flash-lite-preview-06-17',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash-preview',
  'gemini-2.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  
  // Other analysis-capable models
  'deepseek-chat',
  'deepseek-coder',
];

// File types that typically require analysis
const ANALYSIS_FILE_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Check if a model is capable of file analysis
 */
export function isAnalysisCapableModel(model: AIModel): boolean {
  // Check if model has explicit analysis capability
  if (model.capabilities.includes('analysis')) {
    return true;
  }
  
  // Check against known analysis-capable model patterns
  return ANALYSIS_CAPABLE_MODELS.some(pattern => 
    model.id.toLowerCase().includes(pattern.toLowerCase()) ||
    model.name.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Check if any of the provided files require analysis capabilities
 */
export function requiresAnalysisModel(files: File[]): boolean {
  return files.some(file => 
    ANALYSIS_FILE_TYPES.includes(file.type) || 
    (!file.type.startsWith('image/') && file.size > 0)
  );
}

/**
 * Find the best analysis-capable model from available models
 */
export function findBestAnalysisModel(availableModels: AIModel[], currentModelId?: string): AIModel | null {
  // If current model is already analysis-capable and available, keep it
  if (currentModelId) {
    const currentModel = availableModels.find(m => m.id === currentModelId);
    if (currentModel && currentModel.isAvailable && isAnalysisCapableModel(currentModel)) {
      return currentModel;
    }
  }
  
  // Find the best analysis model by priority order
  const analysisModels = availableModels.filter(model => 
    model.isAvailable && isAnalysisCapableModel(model)
  );
  
  // Sort by preference (Gemini 2.5 Flash Preview > Claude > GPT-4 > Others)
  analysisModels.sort((a, b) => {
    const getModelPriority = (model: AIModel) => {
      const name = model.name.toLowerCase();
      const id = model.id.toLowerCase();
      
      // Prioritize the specific Gemini model the user requested
      if (name.includes('gemini 2.5 flash lite preview 06-17') || id.includes('google/gemini-2.5-flash-lite-preview-06-17')) return 16;
      if (name.includes('gemini 2.5 flash preview 05-20') || id.includes('gemini-2.5-flash-preview-05-20')) return 15;
      if (name.includes('gemini 2.5 flash preview') || id.includes('gemini-2.5-flash-preview')) return 14;
      if (name.includes('gemini 2.5 flash') || id.includes('gemini-2.5-flash')) return 13;
      if (name.includes('claude-3-5-sonnet') || id.includes('claude-3-5-sonnet')) return 10;
      if (name.includes('gpt-4o') || id.includes('gpt-4o')) return 9;
      if (name.includes('claude-3-opus') || id.includes('claude-3-opus')) return 8;
      if (name.includes('o1-preview') || id.includes('o1-preview')) return 7;
      if (name.includes('gemini-1.5-pro') || id.includes('gemini-1.5-pro')) return 6;
      if (name.includes('claude') || id.includes('claude')) return 5;
      if (name.includes('gpt-4') || id.includes('gpt-4')) return 4;
      if (name.includes('gemini') || id.includes('gemini')) return 3;
      if (name.includes('o1') || id.includes('o1')) return 2;
      return 1;
    };
    
    return getModelPriority(b) - getModelPriority(a);
  });
  
  return analysisModels[0] || null;
}

/**
 * Get a user-friendly explanation of why the model was switched
 */
export function getModelSwitchReason(files: File[]): string {
  const fileTypes = files.map(file => {
    if (file.type === 'application/pdf') return 'PDF';
    if (file.type === 'text/plain') return 'text';
    if (file.type === 'application/json') return 'JSON';
    if (file.type.includes('spreadsheet') || file.name.endsWith('.csv')) return 'spreadsheet';
    if (file.type.includes('document')) return 'document';
    return 'file';
  });
  
  const uniqueTypes = [...new Set(fileTypes)];
  
  if (uniqueTypes.length === 1) {
    return `Switched to analysis-capable model for ${uniqueTypes[0]} analysis`;
  } else {
    return `Switched to analysis-capable model for file analysis`;
  }
} 