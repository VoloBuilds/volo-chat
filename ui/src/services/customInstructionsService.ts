import { fetchWithAuth } from '@/lib/serverComm';

export interface CustomInstructionsResponse {
  customInstructions: string;
}

export interface SaveCustomInstructionsResponse {
  message: string;
  customInstructions: string;
}

export class CustomInstructionsService {
  /**
   * Get user's custom instructions
   */
  static async getCustomInstructions(): Promise<string> {
    try {
      const response = await fetchWithAuth('/api/v1/user/custom-instructions', {
        method: 'GET',
      });
      const data: CustomInstructionsResponse = await response.json();
      return data.customInstructions || '';
    } catch (error) {
      console.error('Failed to fetch custom instructions:', error);
      throw error;
    }
  }

  /**
   * Save user's custom instructions
   */
  static async saveCustomInstructions(customInstructions: string): Promise<SaveCustomInstructionsResponse> {
    try {
      const response = await fetchWithAuth('/api/v1/user/custom-instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customInstructions }),
      });
      const data: SaveCustomInstructionsResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to save custom instructions:', error);
      throw error;
    }
  }
} 