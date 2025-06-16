import { WebSocket } from 'ws';

interface ConnectionInfo {
  ws: WebSocket;
  userId: string;
  chatId?: string;
}

export class WebSocketManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();

  addConnection(connectionId: string, ws: WebSocket, userId: string): void {
    // Store connection info
    this.connections.set(connectionId, { ws, userId });
    
    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    // Handle connection cleanup
    ws.on('close', () => {
      this.removeConnection(connectionId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.removeConnection(connectionId);
    });
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      const { userId } = connection;
      
      // Remove from connections
      this.connections.delete(connectionId);
      
      // Remove from user tracking
      const userConnections = this.userConnections.get(userId);
      if (userConnections) {
        userConnections.delete(connectionId);
        if (userConnections.size === 0) {
          this.userConnections.delete(userId);
        }
      }
    }
  }

  setChatId(connectionId: string, chatId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.chatId = chatId;
    }
  }

  sendToConnection(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending message to connection:', error);
        this.removeConnection(connectionId);
        return false;
      }
    }
    return false;
  }

  sendToUser(userId: string, message: any): number {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections) {
      return 0;
    }

    let sentCount = 0;
    userConnections.forEach(connectionId => {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    });

    return sentCount;
  }

  broadcastToChat(chatId: string, message: any, excludeUserId?: string): number {
    let sentCount = 0;
    
    this.connections.forEach((connection, connectionId) => {
      if (
        connection.chatId === chatId &&
        connection.userId !== excludeUserId &&
        connection.ws.readyState === WebSocket.OPEN
      ) {
        if (this.sendToConnection(connectionId, message)) {
          sentCount++;
        }
      }
    });

    return sentCount;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }
} 