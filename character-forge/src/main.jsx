import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error: String(error) }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#08080d', color: '#e08080',
          fontFamily: 'monospace', padding: '40px 20px', whiteSpace: 'pre-wrap'
        }}>
          <div style={{ color: '#c9a84c', fontSize: '18px', marginBottom: '16px' }}>
            Character Forge — Error
          </div>
          {this.state.error}
        </div>
      )
    }
    return this.props.children
  }
}

window.__cfMounted = true;
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
