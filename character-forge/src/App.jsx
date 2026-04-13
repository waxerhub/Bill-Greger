import { useState, useEffect } from 'react'
import CharCreator from './SpellEngine.jsx'

function App() {
  const [spellData, setSpellData] = useState([]);
  const [itemData, setItemData] = useState([]);

  useEffect(() => {
    fetch('/spellData.json')
      .then(r => r.json())
      .then(setSpellData)
      .catch(() => {});
    fetch('/tomMagicItems.json')
      .then(r => r.json())
      .then(setItemData)
      .catch(() => {});
  }, []);

  return <CharCreator spellData={spellData} itemData={itemData} />;
}

export default App
