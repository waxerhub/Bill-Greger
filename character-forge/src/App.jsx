import { useState, useEffect } from 'react'
import CharCreator from './SpellEngine.jsx'

function App() {
  const [spellData, setSpellData] = useState([]);

  useEffect(() => {
    fetch('/spellData.json')
      .then(r => r.json())
      .then(setSpellData)
      .catch(() => {});
  }, []);

  return <CharCreator spellData={spellData} />;
}

export default App
