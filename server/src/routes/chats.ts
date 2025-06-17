import { Hono } from 'hono';
import { chatManagement } from './chat-management';
import { chatMessaging } from './chat-messaging';

const chats = new Hono();

// Mount chat management routes (CRUD operations)
chats.route('/', chatManagement);

// Mount chat messaging routes (send, stream, generate-title)
chats.route('/', chatMessaging);

export { chats }; 