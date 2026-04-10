import { useState, useEffect } from 'react'
import CharCreator from './SpellEngine.jsx'

function App() {
  const [spellData, setSpellData] = useState(null);

  useEffect(() => {
    fetch('/spellData.json')
      .then(r => r.json())
      .then(setSpellData)
      .catch(() => setSpellData([]));
  }, []);

  if (!spellData) {
    return (
      <div style={{
        minHeight: '100vh', background: '#08080d', color: '#c9a84c',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Georgia,serif', fontSize: '18px', letterSpacing: '2px'
      }}>
        Loading Character Forge…
      </div>
    );
  }

  return <CharCreator spellData={spellData} />;
}

export default App
