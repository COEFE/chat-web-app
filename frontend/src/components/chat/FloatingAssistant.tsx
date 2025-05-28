"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bot, X, MessageSquare } from 'lucide-react';
import ChatBotInterface from './ChatBotInterface';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFeatureFlags } from '@/lib/featureFlags';

interface FloatingAssistantProps {
  className?: string;
}

const FloatingAssistant: React.FC<FloatingAssistantProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const features = useFeatureFlags();

  // Don't render if AI Assistant feature is disabled
  if (!features.aiAssistant) {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <div className={`fixed bottom-6 right-6 z-50 ${className}`}>
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </div>

      {/* Chat Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl h-[85vh] max-h-[700px] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-4 pb-0 flex-shrink-0">
            <DialogTitle className="flex items-center space-x-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <span>AI Assistant</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatBotInterface className="h-full border-0 shadow-none" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FloatingAssistant;
