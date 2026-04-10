const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// Insert druid kit abilities + branch info BEFORE cpAbil section on Sheet tab
const S1_OLD = '          {cpAbil.length>0&&<div style={{marginBottom:"12px"}}>';
const S1_NEW =
  '          {/* Druid kit abilities on sheet */}\n' +
  '          {isDruid&&kitData&&kit&&kit!=="None"&&!kitBlocked&&kitData.abilities&&kitData.abilities.length>0&&<div style={{marginBottom:"12px"}}>\n' +
  '            <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>{kit.toUpperCase()} — KIT ABILITIES</div>\n' +
  '            {kitData.abilities.map(function(a,i){return <div key={i} style={{color:"#bbb",fontSize:"12px",marginBottom:"2px"}}>• {a}</div>;})}\n' +
  '          </div>}\n' +
  '          {isDruid&&kitData&&kit&&kit!=="None"&&kitData.limitations&&kitData.limitations.length>0&&<div style={{marginBottom:"12px"}}>\n' +
  '            <div style={{color:"#e08080",fontWeight:"bold",marginBottom:"4px"}}>{kit.toUpperCase()} — KIT LIMITATIONS</div>\n' +
  '            {kitData.limitations.map(function(l,i){return <div key={i} style={{color:"#c08080",fontSize:"12px",marginBottom:"2px"}}>• {l}</div>;})}\n' +
  '          </div>}\n' +
  '          {isDruid&&kitBlocked&&<div style={{marginBottom:"12px",padding:"8px",background:"#2a1010",border:"1px solid #804040",borderRadius:"4px"}}>\n' +
  '            <div style={{color:"#e08080",fontWeight:"bold",marginBottom:"4px"}}>⚠ KIT BLOCKED</div>\n' +
  '            <div style={{color:"#c08080",fontSize:"11px"}}>Stat requirements not met: {kitReqFails.map(function(s){return s+" "+kitData.req[s];}).join(", ")}. Enable DM Override on Stats tab to use this kit.</div>\n' +
  '          </div>}\n' +
  '          {isDruid&&branchData&&<div style={{marginBottom:"12px"}}>\n' +
  '            <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>{druidBranch.toUpperCase()} BRANCH</div>\n' +
  '            <div style={{color:dim,fontSize:"11px",marginBottom:"4px"}}>Branch Forms: {branchData.forms.join(", ")}</div>\n' +
  '            {branchData.passives.map(function(p,i){return <div key={i} style={{color:"#bbb",fontSize:"12px",marginBottom:"2px"}}>• {p}</div>;})}\n' +
  '          </div>}\n' +
  '          {isDruid&&kitData&&kitData.totemRequired&&totemAnimal&&totemForm&&<div style={{marginBottom:"12px"}}>\n' +
  '            <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>TOTEM: {totemAnimal.toUpperCase()}</div>\n' +
  '            <div style={{fontSize:"11px",fontFamily:"monospace",color:txt}}>\n' +
  '              <div>AC {totemForm.ac} | MV {totemForm.mv} | HD {totemForm.hd}</div>\n' +
  '              {totemForm.attacks.map(function(a,i){return <div key={i}>• {a.name}: {a.dmg}</div>;})}\n' +
  '              {totemForm.special&&<div style={{color:"#a080e0",marginTop:"2px"}}>{totemForm.special}</div>}\n' +
  '              <div style={{marginTop:"4px",color:dim}}>Shape uses: {shapeUsesLeft}/{shapeshifterMaxUses}/day</div>\n' +
  '            </div>\n' +
  '          </div>}\n' +
  '          {isDruid&&kitData&&kitData.shapeshifter&&<div style={{marginBottom:"12px"}}>\n' +
  '            <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>SHAPESHIFTER TRACKER</div>\n' +
  '            <div style={{fontSize:"11px",fontFamily:"monospace",color:txt}}>\n' +
  '              <div>Uses: {shapeUsesLeft}/{shapeshifterMaxUses}/day | Failed: {shapeFailed} ({Math.min(shapeFailed*5,100)}% stuck)</div>\n' +
  '              {level>=7&&<div style={{color:"#a0c0e0",marginTop:"2px"}}>✦ Partial forms unlocked at level 7</div>}\n' +
  '              {level>=9&&<div style={{color:"#a0c0e0"}}>✦ Compendium forms unlocked at level 9</div>}\n' +
  '            </div>\n' +
  '          </div>}\n' +
  '          {cpAbil.length>0&&<div style={{marginBottom:"12px"}}>';

if (!src.includes(S1_OLD)) { console.log('ERR step1: cpAbil section not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: druid kit/branch info added to Sheet tab');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
