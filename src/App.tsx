import React from 'react';
import { ApolloProvider } from '@apollo/client';
import apolloClient from './api/apollo';
import GraphQLDemo from './components/graphQLDemo';
import './App.css';

function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <div className="App">
        <header className="App-header">
          <h1>GlyphScript</h1>
          <p>API集成演示 - GraphQL</p>
        </header>
        <main className="App-main">
          <GraphQLDemo />
        </main>
        <footer className="App-footer">
          <p>&copy; {new Date().getFullYear()} glyphscript.site</p>
        </footer>
      </div>
    </ApolloProvider>
  );
}

export default App;