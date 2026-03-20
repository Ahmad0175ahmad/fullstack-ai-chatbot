import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Plus, Trash2, Settings, Send, X, Menu, PanelLeftClose } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; 

const USER_ID = "Ahmad_01"; 

// Upgraded themes to dynamically handle borders and hover effects so Light Mode looks perfect
const THEMES = {
  light: { name: 'Light Mode', bg: 'bg-gray-50', sidebar: 'bg-gray-200', text: 'text-gray-900', primary: 'bg-blue-600', aiBubble: 'bg-white border border-gray-200 shadow-sm', userBubble: 'bg-blue-600 text-white', border: 'border-gray-300', hover: 'hover:bg-gray-200', active: 'bg-gray-200', muted: 'text-gray-500' },
  dark: { name: 'Dark Mode', bg: 'bg-gray-900', sidebar: 'bg-gray-950', text: 'text-gray-100', primary: 'bg-blue-600', aiBubble: 'bg-gray-800', userBubble: 'bg-blue-600', border: 'border-gray-700/50', hover: 'hover:bg-gray-800/50', active: 'bg-gray-800/80', muted: 'text-gray-400' },
  midnight: { name: 'Midnight Blue', bg: 'bg-slate-900', sidebar: 'bg-slate-950', text: 'text-slate-100', primary: 'bg-indigo-600', aiBubble: 'bg-slate-800', userBubble: 'bg-indigo-600', border: 'border-slate-700/50', hover: 'hover:bg-slate-800/50', active: 'bg-slate-800/80', muted: 'text-slate-400' },
  purple: { name: 'Deep Purple', bg: 'bg-purple-950', sidebar: 'bg-black', text: 'text-purple-100', primary: 'bg-purple-600', aiBubble: 'bg-purple-900', userBubble: 'bg-purple-600', border: 'border-purple-800/50', hover: 'hover:bg-purple-900/50', active: 'bg-purple-900/80', muted: 'text-purple-400' },
  forest: { name: 'Dark Forest', bg: 'bg-zinc-900', sidebar: 'bg-green-950', text: 'text-zinc-100', primary: 'bg-emerald-600', aiBubble: 'bg-zinc-800', userBubble: 'bg-emerald-600', border: 'border-green-800/50', hover: 'hover:bg-green-900/50', active: 'bg-green-900/80', muted: 'text-zinc-400' },
};

export default function App() {
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentId, setCurrentId] = useState(() => {
    const saved = localStorage.getItem('chat_history');
    const parsed = saved ? JSON.parse(saved) : [];
    return parsed.length > 0 ? parsed[0].id : null;
  });

  const [themeKey, setThemeKey] = useState(() => {
    return localStorage.getItem('chat_theme') || 'dark';
  });

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const messagesEndRef = useRef(null);

  const theme = THEMES[themeKey];

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, currentId]);

  const currentChat = conversations.find(c => c.id === currentId) || { messages: [] };

  const createNewChat = () => {
    setCurrentId(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteChat = async (e, id) => {
    e.stopPropagation(); 
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    if (currentId === id) setCurrentId(updated.length > 0 ? updated[0].id : null);
    
    try {
      //await fetch(`http://127.0.0.1:8000/conversations/${id}`, { method: 'DELETE' });
      await fetch('https://my-chatbot-api-3o68.onrender.com/conversations/${id}', { method: 'DELETE' });
    } catch (err) {
      console.error("Backend delete failed", err);
    }
  };

  const changeTheme = (key) => {
    setThemeKey(key);
    localStorage.setItem('chat_theme', key);
    setIsSettingsOpen(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    let activeId = currentId;
    let newConversations = [...conversations];
    
    let chatIndex = newConversations.findIndex(c => c.id === activeId);
    
    if (!activeId || chatIndex === -1) {
      activeId = "temp-" + Date.now();
      newConversations.unshift({ id: activeId, title: userMessage.slice(0, 30) + '...', messages: [] });
      chatIndex = 0; 
    }

    newConversations[chatIndex] = {
      ...newConversations[chatIndex],
      messages: [...newConversations[chatIndex].messages, { role: 'user', content: userMessage }]
    };
    
    setConversations(newConversations);
    setCurrentId(activeId);

    try {
      //const response = await fetch("http://127.0.0.1:8000/chat", {
      const response = await fetch("https://my-chatbot-api-3o68.onrender.com/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          conversation_id: activeId.startsWith('temp-') ? null : activeId,
          message: userMessage
        })
      });

      const data = await response.json();
      const realConvId = data.conversation_id;

      setConversations(prev => prev.map(conv => {
        if (conv.id === activeId) {
          return {
            ...conv,
            id: realConvId,
            messages: [...conv.messages, { role: 'ai', content: data.response }]
          };
        }
        return conv;
      }));
      
      setCurrentId(realConvId);

    } catch (error) {
      console.error("Error connecting to backend:", error);
      alert("Failed to connect to backend. Is FastAPI running?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-300 ${theme.bg} ${theme.text}`}>
      
      {/* Sidebar */}
      <div 
        /* FIX: Added overflow-hidden here so the text gets chopped off as it slides shut! */
        className={`shrink-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${theme.sidebar} 
        ${isSidebarOpen ? `w-64 md:w-72 border-r ${theme.border}` : 'w-0 border-r-0'}`}
      >
        <div className="w-64 md:w-72 flex flex-col h-full overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <button 
              onClick={createNewChat}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-transparent border ${theme.border} ${theme.hover} transition-colors font-medium`}
            >
              <Plus size={18} /> New Chat
            </button>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className={`md:hidden ml-2 p-2 rounded-lg ${theme.hover} ${theme.muted}`}
            >
              <PanelLeftClose size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 space-y-1">
            {conversations.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => {
                  setCurrentId(chat.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false); 
                }}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${currentId === chat.id ? theme.active : theme.hover}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* FIX: Changed min-w-[16px] to min-w-4 */}
                  <MessageSquare size={16} className={`${theme.muted} min-w-4`} />
                  <span className="truncate text-sm">{chat.title}</span>
                </div>
                <button onClick={(e) => deleteChat(e, chat.id)} className={`opacity-0 group-hover:opacity-100 ${theme.muted} hover:text-red-500 transition-opacity`}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className={`p-4 border-t ${theme.border}`}>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg ${theme.hover} transition-colors text-sm`}
            >
              <Settings size={18} /> Settings & Themes
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        
        <header className={`p-4 shadow-sm z-10 flex items-center gap-4 ${theme.bg}`}>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 -ml-2 rounded-lg ${theme.hover} transition-colors ${theme.muted} hover:opacity-80`}
            title="Toggle Sidebar"
          >
            {isSidebarOpen ? <PanelLeftClose size={22} /> : <Menu size={22} />}
          </button>
          <h1 className="text-xl font-semibold opacity-90">AI Assistant</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {currentChat.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
              <MessageSquare size={48} className="mb-4" />
              <h2 className="text-2xl font-semibold">How can I help you today?</h2>
            </div>
          ) : (
            currentChat.messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] md:max-w-[70%] p-4 rounded-2xl ${msg.role === 'user' ? `${theme.userBubble} rounded-br-none` : `${theme.aiBubble} rounded-bl-none`}`}>
                  
                  <div className="leading-relaxed whitespace-pre-wrap">
                    <ReactMarkdown 
                      components={{
                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc ml-5 mb-2" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal ml-5 mb-2" {...props} />,
                        li: ({node, ...props}) => <li className="mb-1" {...props} />,
                        // Removed hardcoded white text here so light mode bold text remains visible!
                        strong: ({node, ...props}) => <strong className="font-bold" {...props} />
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>

                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className={`p-4 rounded-2xl ${theme.aiBubble} rounded-bl-none animate-pulse flex space-x-2`}>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className={`p-4 border-t ${theme.border} max-w-4xl mx-auto w-full ${theme.bg}`}>
          <form onSubmit={sendMessage} className={`relative flex items-center ${theme.sidebar} rounded-xl border ${theme.border} focus-within:border-blue-500 overflow-hidden shadow-sm`}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message..."
              className={`flex-1 bg-transparent p-4 outline-none w-full ${theme.text}`}
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className={`p-2 mr-2 rounded-lg ${theme.primary} disabled:opacity-50 hover:opacity-80 transition-opacity`}
            >
              <Send size={18} className="text-white" />
            </button>
          </form>
          <p className={`text-center text-xs mt-3 ${theme.muted}`}>AI can make mistakes. Verify important info.</p>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`${theme.sidebar} p-6 rounded-2xl w-96 max-w-[90%] border ${theme.border} shadow-2xl`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Settings</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="hover:text-red-400"><X size={20} /></button>
            </div>
            
            <h3 className={`text-sm font-semibold mb-3 uppercase tracking-wider ${theme.muted}`}>Themes</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(THEMES).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => changeTheme(key)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all ${themeKey === key ? 'border-blue-500 bg-blue-500/10' : `${theme.border} ${theme.hover}`}`}
                >
                  <div className={`w-full h-8 rounded mb-2 ${t.bg} border ${t.border}`}></div>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}