import { eq, and, lt, lte } from 'drizzle-orm';
import { getDatabase } from '../lib/db-cloudflare';
import { chats as chatsTable, messages, files } from '../schema';
import type { NewChat, NewMessage, NewFileRecord } from '../schema';

export interface ChatCopyOptions {
  userId: string;
  sourceChat: any;
  title: string;
  messageLimit?: {
    upToMessageId?: string;
    upToCreatedAt?: Date;
  };
  metadata?: {
    originalChatId?: string;
    isBranched?: boolean;
    isShared?: boolean;
    branchPointMessageId?: string;
    branchedAt?: Date;
  };
}

export class ChatCopyService {
  
  static async copyChat(options: ChatCopyOptions) {
    const { userId, sourceChat, title, messageLimit, metadata } = options;
    const db = await getDatabase();

    // Create new chat copy
    const newChat: NewChat = {
      userId,
      title,
      modelId: sourceChat.modelId,
      messageCount: 0,
      ...metadata,
    };

    const [createdChat] = await db
      .insert(chatsTable)
      .values(newChat)
      .returning();

    // Get messages to copy with optional limit
    let originalMessages;

    if (messageLimit?.upToMessageId) {
      // For branching: get all messages ordered by createdAt, then filter to include up to and including the target message
      const allMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, sourceChat.id))
        .orderBy(messages.createdAt);

      // Find the index of the target message
      const targetIndex = allMessages.findIndex(msg => msg.id === messageLimit.upToMessageId);
      
      if (targetIndex === -1) {
        throw new Error(`Branch point message ${messageLimit.upToMessageId} not found in chat ${sourceChat.id}`);
      }

      // Include all messages up to and including the target message (hence targetIndex + 1)
      originalMessages = allMessages.slice(0, targetIndex + 1);
    } else if (messageLimit?.upToCreatedAt) {
      // For other use cases: use timestamp filtering
      originalMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.chatId, sourceChat.id),
            lte(messages.createdAt, messageLimit.upToCreatedAt)
          )
        )
        .orderBy(messages.createdAt);
    } else {
      // No limit: get all messages
      originalMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, sourceChat.id))
        .orderBy(messages.createdAt);
    }

    // Copy messages with attachments
    let messageCount = 0;
    for (const message of originalMessages) {
      const newAttachments = await this.copyMessageAttachments(
        message.attachments,
        userId
      );

      const newMessage: NewMessage = {
        chatId: createdChat.id,
        role: message.role,
        content: message.content,
        modelId: message.modelId,
        attachments: newAttachments,
      };

      await db.insert(messages).values(newMessage);
      messageCount++;
    }

    await db
      .update(chatsTable)
      .set({ messageCount })
      .where(eq(chatsTable.id, createdChat.id));

    return {
      chat: { ...createdChat, messageCount },
      copiedMessageCount: messageCount,
    };
  }

  private static async copyMessageAttachments(attachments: any[] | null, userId: string) {
    if (!attachments || !Array.isArray(attachments)) {
      return attachments;
    }

    const db = await getDatabase();
    return Promise.all(
      attachments.map(async (attachment: any) => {
        if (attachment.id) {
          const [originalFile] = await db
            .select()
            .from(files)
            .where(eq(files.id, attachment.id));

          if (originalFile) {
            const newFileRecord: NewFileRecord = {
              userId,
              filename: originalFile.filename,
              fileType: originalFile.fileType,
              fileSize: originalFile.fileSize,
              storagePath: originalFile.storagePath,
              r2Url: originalFile.r2Url,
              status: originalFile.status,
              metadata: originalFile.metadata,
            };

            const [createdFile] = await db
              .insert(files)
              .values(newFileRecord)
              .returning();

            return { ...attachment, id: createdFile.id };
          }
        }
        return attachment;
      })
    );
  }

  /**
   * Generate title for copied chat
   */
  static generateCopiedTitle(originalTitle: string, type: 'shared' | 'branched'): string {
    const suffix = type === 'shared' ? '(Shared)' : '(Branch)';
    
    // Remove existing suffixes to avoid duplication
    const cleanTitle = originalTitle
      .replace(/\s*\((Shared|Branch)\)$/, '')
      .trim();
    
    return `${cleanTitle} ${suffix}`;
  }

  /**
   * Check if user already has a copy of this chat
   */
  static async checkExistingCopy(
    sourceChat: any,
    userId: string,
    copyType: 'shared' | 'branched'
  ): Promise<any | null> {
    const db = await getDatabase();
    
    let conditions = [
      eq(chatsTable.originalChatId, sourceChat.id),
      eq(chatsTable.userId, userId)
    ];

    if (copyType === 'shared') {
      conditions.push(eq(chatsTable.isShared, false)); // Imported shared chats
    } else {
      conditions.push(eq(chatsTable.isBranched, true)); // Branched chats
    }

    const [existingCopy] = await db
      .select()
      .from(chatsTable)
      .where(and(...conditions));

    return existingCopy || null;
  }
} 