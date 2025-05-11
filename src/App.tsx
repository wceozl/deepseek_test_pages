import React from 'react';
import { ApolloProvider } from '@apollo/client';
import apolloClient from './api/apollo';
import ChatInterface from './components/ChatInterface';
import './App.css';

function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <div className="App">
        <header className="App-header">
          <h1>GlyphScript</h1>
          <p>DeepSeek API 演示</p>
        </header>
        <main className="App-main">
          <ChatInterface />
        </main>
        <footer className="App-footer">
          <p>&copy; {new Date().getFullYear()} glyphscript.site</p>
        </footer>
      </div>
    </ApolloProvider>
  );
}

export default App;