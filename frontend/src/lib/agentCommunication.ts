/**
 * Agent Communication System
 * 
 * This module provides a centralized way for agents to communicate with each other
 * using a message-passing pattern. It allows agents to:
 * 1. Request actions from other agents
 * 2. Send responses back to the requesting agent
 * 3. Track the status of requests
 */

import { logAuditEvent } from "./auditLogger";

// Define message types for type safety
export enum AgentMessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification'
}

// Define message priorities
export enum MessagePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Define message statuses
export enum MessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REJECTED = 'rejected'
}

// Define the message interface
export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  sender: string;
  recipient: string;
  action: string;
  payload: any;
  priority: MessagePriority;
  status: MessageStatus;
  timestamp: string;
  userId: string;
  conversationId?: string;
  responseMessage?: string;
}

// In-memory message store
// In a production environment, this would be replaced with a database
const messageStore: Record<string, AgentMessage> = {};

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Send a message from one agent to another
 * @param sender The ID of the sending agent
 * @param recipient The ID of the receiving agent
 * @param action The action being requested
 * @param payload The data associated with the request
 * @param userId The user ID for data isolation
 * @param priority The priority of the message
 * @param conversationId Optional conversation ID for context
 * @returns The created message object
 */
export async function sendAgentMessage(
  sender: string,
  recipient: string,
  action: string,
  payload: any,
  userId: string,
  priority: MessagePriority = MessagePriority.MEDIUM,
  conversationId?: string
): Promise<AgentMessage> {
  const messageId = generateMessageId();
  const timestamp = new Date().toISOString();
  
  const message: AgentMessage = {
    id: messageId,
    type: AgentMessageType.REQUEST,
    sender,
    recipient,
    action,
    payload,
    priority,
    status: MessageStatus.PENDING,
    timestamp,
    userId,
    conversationId
  };
  
  // Store the message
  messageStore[messageId] = message;
  
  // Log the message for audit purposes
  await logAuditEvent({
    user_id: userId,
    action_type: "AGENT_MESSAGE_SENT",
    entity_type: "AGENT_MESSAGE",
    entity_id: messageId,
    context: {
      sender,
      recipient,
      action,
      messageType: AgentMessageType.REQUEST
    },
    status: "SUCCESS",
    timestamp
  });
  
  console.log(`[AgentCommunication] Message sent from ${sender} to ${recipient}: ${action}`);
  
  return message;
}

/**
 * Respond to an agent message
 * @param messageId The ID of the original message
 * @param status The status of the response
 * @param responsePayload The response data
 * @param responseMessage Optional human-readable response message
 * @returns The updated message object
 */
export async function respondToAgentMessage(
  messageId: string,
  status: MessageStatus,
  responsePayload: any,
  responseMessage?: string
): Promise<AgentMessage | null> {
  // Check if the message exists
  const originalMessage = messageStore[messageId];
  if (!originalMessage) {
    console.error(`[AgentCommunication] Cannot respond to message ${messageId}: Message not found`);
    return null;
  }
  
  // Update the message
  const updatedMessage: AgentMessage = {
    ...originalMessage,
    status,
    payload: {
      ...originalMessage.payload,
      response: responsePayload
    },
    responseMessage,
    timestamp: new Date().toISOString()
  };
  
  // Store the updated message
  messageStore[messageId] = updatedMessage;
  
  // Log the response for audit purposes
  await logAuditEvent({
    user_id: originalMessage.userId,
    action_type: "AGENT_MESSAGE_RESPONSE",
    entity_type: "AGENT_MESSAGE",
    entity_id: messageId,
    context: {
      sender: originalMessage.recipient, // The original recipient is now the sender
      recipient: originalMessage.sender, // The original sender is now the recipient
      action: originalMessage.action,
      status,
      messageType: AgentMessageType.RESPONSE
    },
    status: "SUCCESS",
    timestamp: updatedMessage.timestamp
  });
  
  console.log(`[AgentCommunication] Response sent for message ${messageId}: ${status}`);
  
  return updatedMessage;
}

/**
 * Get all pending messages for a specific agent
 * @param agentId The ID of the agent
 * @returns Array of pending messages
 */
export function getPendingMessagesForAgent(agentId: string): AgentMessage[] {
  return Object.values(messageStore).filter(
    message => 
      message.recipient === agentId && 
      message.status === MessageStatus.PENDING
  );
}

/**
 * Get a specific message by ID
 * @param messageId The ID of the message
 * @returns The message object or null if not found
 */
export function getMessageById(messageId: string): AgentMessage | null {
  return messageStore[messageId] || null;
}

/**
 * Update the status of a message
 * @param messageId The ID of the message
 * @param status The new status
 * @returns The updated message or null if not found
 */
export async function updateMessageStatus(
  messageId: string,
  status: MessageStatus
): Promise<AgentMessage | null> {
  // Check if the message exists
  const message = messageStore[messageId];
  if (!message) {
    console.error(`[AgentCommunication] Cannot update message ${messageId}: Message not found`);
    return null;
  }
  
  // Update the message status
  const updatedMessage: AgentMessage = {
    ...message,
    status,
    timestamp: new Date().toISOString()
  };
  
  // Store the updated message
  messageStore[messageId] = updatedMessage;
  
  // Log the status update for audit purposes
  await logAuditEvent({
    user_id: message.userId,
    action_type: "AGENT_MESSAGE_STATUS_UPDATE",
    entity_type: "AGENT_MESSAGE",
    entity_id: messageId,
    context: {
      sender: message.sender,
      recipient: message.recipient,
      action: message.action,
      oldStatus: message.status,
      newStatus: status
    },
    status: "SUCCESS",
    timestamp: updatedMessage.timestamp
  });
  
  console.log(`[AgentCommunication] Message ${messageId} status updated to ${status}`);
  
  return updatedMessage;
}

/**
 * Clear completed or failed messages older than a certain time
 * @param maxAgeMs Maximum age in milliseconds
 */
export function clearOldMessages(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  
  Object.entries(messageStore).forEach(([id, message]) => {
    const messageTime = new Date(message.timestamp).getTime();
    const age = now - messageTime;
    
    if (age > maxAgeMs && 
        (message.status === MessageStatus.COMPLETED || 
         message.status === MessageStatus.FAILED ||
         message.status === MessageStatus.REJECTED)) {
      delete messageStore[id];
      console.log(`[AgentCommunication] Cleared old message ${id}`);
    }
  });
}

// Set up a periodic cleanup of old messages
// In a production environment, this would be handled by a cron job or similar
if (typeof window === 'undefined') { // Only run on server
  setInterval(() => {
    clearOldMessages();
  }, 6 * 60 * 60 * 1000); // Run every 6 hours
}
