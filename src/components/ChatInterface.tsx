import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github.css'; // 引入代码高亮样式
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

  // 辅助函数：更新助手消息
  const updateAssistantMessage = (content: string) => {
    setMessages(prev => {
      const newMessages = [...prev];
      // 更新最后一条消息，如果是助手消息
      if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
        newMessages[newMessages.length - 1].content = content;
      } else {
        console.log('未找到助手消息进行更新, 消息数组:', newMessages);
      }
      return newMessages;
    });
  };
  
  // 处理用户输入提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    setInput('');
    setIsLoading(true);
    setError(null);
    
    // 更新消息数组，添加用户消息
    setMessages(prev => [...prev, userMessage]);
    
    try {
      // 准备发送给 API 的消息
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
      
      if (!response.body) {
        throw new Error('响应没有提供数据流');
      }
      
      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      // 添加一个空的助手消息
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      
      let accumulatedContent = '';
      let buffer = '';
      
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // 确保最后一次更新消息内容
          updateAssistantMessage(accumulatedContent);
          break;
        }
        
        // 解码数据块
        const chunk = decoder.decode(value, { stream: true });
        
        // 将新数据添加到缓冲区
        buffer += chunk;
        
        // 处理缓冲区中的完整行
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个可能不完整的行
        
        let contentUpdated = false;
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const data = line.slice(5).trim();
            
            // 检查是否为流式响应结束标记
            if (data === '[DONE]') {
              continue;
            }
            
            try {
              const parsedData = JSON.parse(data);
              
              if (parsedData.error) {
                console.error('API返回错误:', parsedData.error);
                setError(`错误: ${parsedData.error}`);
                continue;
              }
              
              // 检查是否含有 delta 内容
              if (parsedData.choices && 
                  parsedData.choices[0] && 
                  parsedData.choices[0].delta && 
                  parsedData.choices[0].delta.content) {
                // 添加新的内容片段
                accumulatedContent += parsedData.choices[0].delta.content;
                contentUpdated = true;
                console.log('内容已更新, 当前长度:', accumulatedContent.length);
              }
            } catch (e) {
              console.error('解析JSON数据出错:', e, data);
            }
          }
        }
        
        // 只有当内容更新时才更新UI，防止不必要的重渲染
        if (contentUpdated) {
          const content = accumulatedContent; // 捕获当前内容，避免闭包问题
          updateAssistantMessage(content);
        }
      }
    } catch (err) {
      console.error('聊天错误:', err);
      setError(err instanceof Error ? err.message : '发送消息时出错');
      
      // 如果已经添加了助手消息，但发生了错误，删除空消息
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
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
                {msg.content ? (
                  msg.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeHighlight]}
                      className="markdown-content"
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )
                ) : (
                  msg.role === 'assistant' && isLoading && index === messages.length - 1 ? (
                    <span className="typing-indicator">正在思考...</span>
                  ) : ''
                )}
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