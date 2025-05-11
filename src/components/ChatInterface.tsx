import React, { useState, useRef, useEffect } from 'react';
import './ChatInterface.css';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // 自动调整输入框高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [input]);

  // 处理用户输入提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    
    try {
      // 准备发送给 API 的消息，过滤掉系统消息
      const apiMessages = messages
        .filter(msg => msg.role !== 'system' || messages.indexOf(msg) === 0)
        .concat(userMessage);
      
      // 使用流式 API
      const response = await fetch('https://api.glyphscript.site/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: apiMessages })
      });
      
      if (!response.ok) {
        throw new Error(`API 错误: ${response.status}`);
      }
      
      // 处理流式响应
      const reader = response.body!.getReader();
      const decoder = new TextDecoder('utf-8');
      
      // 添加一个空的助手消息
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      
      let accumulatedContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // 解码数据块
        const chunk = decoder.decode(value, { stream: true });
        
        // 处理 SSE 格式的数据
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5);
            
            // 检查是否为流式响应结束标记
            if (data === '[DONE]') continue;
            
            try {
              const parsedData = JSON.parse(data);
              
              if (parsedData.error) {
                setError(`错误: ${parsedData.error}`);
                continue;
              }
              
              if (parsedData.choices && parsedData.choices[0]) {
                const { delta } = parsedData.choices[0];
                
                if (delta.content) {
                  accumulatedContent += delta.content;
                  
                  // 更新助手消息
                  setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = accumulatedContent;
                    return newMessages;
                  });
                }
              }
            } catch (e) {
              console.error('解析数据时出错:', e, data);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息时出错');
      console.error('聊天错误:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };
  
  // 处理回车键提交
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // 清空聊天记录
  const handleClearChat = () => {
    setMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
    setError(null);
  };
  
  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>DeepSeek 聊天</h2>
        <button className="clear-button" onClick={handleClearChat}>
          清空对话
        </button>
      </div>
      
      <div className="chat-messages">
        {messages.map((msg, index) => (
          msg.role !== 'system' && (
            <div key={index} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                {msg.content || (msg.role === 'assistant' && isLoading && index === messages.length - 1 ? (
                  <span className="typing-indicator">正在思考...</span>
                ) : '')}
              </div>
            </div>
          )
        ))}
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={isLoading}
          rows={1}
        />
        <button 
          type="submit" 
          className="send-button" 
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '发送中...' : '发送'}
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;