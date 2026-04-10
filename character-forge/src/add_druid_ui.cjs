const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: Replace KIT card with conditional druid dropdown + branch + warning ──
const S1_OLD =
  '            <Card brd={brd} surf={surf}><Lbl dim={dim}>KIT</Lbl><input value={kit} onChange={function(e){setKit(e.target.value);}} placeholder="e.g. Totemic (Owlbear)" style={is(brd,txt)} /></Card>';

const S1_NEW =
  // KIT card — dropdown only for druids
  '            <Card brd={brd} surf={surf}><Lbl dim={dim}>KIT</Lbl>\n' +
  '              {isDruid\n' +
  '                ?<select value={kit} onChange={function(e){setKit(e.target.value);setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);}} style={ss(brd,txt)}>\n' +
  '                  {Object.keys(DRUID_KITS).map(function(k){return <option key={k}>{k}</option>;})}\n' +
  '                </select>\n' +
  '                :<input value={kit} onChange={function(e){setKit(e.target.value);}} placeholder="e.g. Fighter Subclass" style={is(brd,txt)} />}\n' +
  '              {/* stat requirement warning */}\n' +
  '              {isDruid&&kitReqFails.length>0&&<div style={{marginTop:"6px",padding:"6px 8px",background:"#2a1010",border:"1px solid #804040",borderRadius:"4px",fontSize:"10px",color:"#e08080",fontFamily:"monospace"}}>\n' +
  '                ⚠ Stat req not met: {kitReqFails.map(function(s){return s+" "+kitData.req[s];}).join(", ")}\n' +
  '                <label style={{display:"block",marginTop:"4px",color:"#c0a0a0",cursor:"pointer"}}>\n' +
  '                  <input type="checkbox" checked={dmOverride} onChange={function(e){setDmOverride(e.target.checked);}} style={{marginRight:"4px"}} />\n' +
  '                  DM Override\n' +
  '                </label>\n' +
  '              </div>}\n' +
  '              {isDruid&&kitData&&kitData.desc&&<div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>{kitData.desc}</div>}\n' +
  '            </Card>\n' +
  '            {/* Branch selection — Druids only */}\n' +
  '            {isDruid&&<Card brd={brd} surf={surf}><Lbl dim={dim}>DRUIDIC BRANCH</Lbl>\n' +
  '              <select value={druidBranch} onChange={function(e){setDruidBranch(e.target.value);}} style={ss(brd,txt)}>\n' +
  '                {Object.keys(DRUID_BRANCHES).map(function(b){return <option key={b}>{b}</option>;})}\n' +
  '              </select>\n' +
  '              {branchData&&<div style={{fontSize:"9px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>Forms: {branchData.forms.slice(0,3).join(", ")}…</div>}\n' +
  '            </Card>}\n' +
  '            {/* Totemic Druid — totem selector + stat block */}\n' +
  '            {isDruid&&kitData&&kitData.totemRequired&&<Card brd={brd} surf={surf}><Lbl dim={dim}>TOTEM ANIMAL</Lbl>\n' +
  '              <select value={totemAnimal} onChange={function(e){setTotemAnimal(e.target.value);setShapeUsesLeft(0);}} style={ss(brd,txt)}>\n' +
  '                <option value="">— select —</option>\n' +
  '                {Object.keys(BEAST_FORMS).map(function(k){return <option key={k}>{k}</option>;})}\n' +
  '              </select>\n' +
  '              {totemForm&&<div style={{marginTop:"8px",padding:"8px",background:"#0a1020",border:"1px solid #2a4060",borderRadius:"4px",fontSize:"10px",fontFamily:"monospace",color:txt}}>\n' +
  '                <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>{totemAnimal} STAT BLOCK</div>\n' +
  '                <div>Size: {totemForm.size} | MV: {totemForm.mv} | AC: {totemForm.ac} | HD: {totemForm.hd}</div>\n' +
  '                <div style={{marginTop:"4px",color:dim}}>Attacks:</div>\n' +
  '                {totemForm.attacks.map(function(a,i){return <div key={i} style={{paddingLeft:"8px"}}>• {a.name}: {a.dmg}</div>;})}\n' +
  '                {totemForm.special&&<div style={{marginTop:"4px",color:"#a080e0"}}>Special: {totemForm.special}</div>}\n' +
  '                <div style={{marginTop:"6px",borderTop:"1px solid #2a4060",paddingTop:"4px"}}>\n' +
  '                  <span style={{color:dim}}>Shape Uses: </span>\n' +
  '                  <span style={{color:shapeUsesLeft>0?"#7a7":"#a77"}}>{shapeUsesLeft}/{shapeshifterMaxUses}</span>\n' +
  '                  <button onClick={function(){setShapeUsesLeft(function(p){return Math.min(p+1,shapeshifterMaxUses);});}} style={{marginLeft:"8px",background:"#1a2a1a",color:"#7a7",border:"1px solid #3a5a3a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>+Use</button>\n' +
  '                  <button onClick={function(){setShapeUsesLeft(0);}} style={{marginLeft:"4px",background:"#1a1a2a",color:dim,border:"1px solid #3a3a5a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>Reset</button>\n' +
  '                </div>\n' +
  '              </div>}\n' +
  '            </Card>}\n' +
  '            {/* Shapeshifter kit tracker */}\n' +
  '            {isDruid&&kitData&&kitData.shapeshifter&&<Card brd={brd} surf={surf}><Lbl dim={dim}>SHAPECHANGE TRACKER</Lbl>\n' +
  '              <div style={{fontSize:"11px",fontFamily:"monospace",color:txt}}>\n' +
  '                <div style={{marginBottom:"4px"}}>\n' +
  '                  <span style={{color:dim}}>Uses today: </span>\n' +
  '                  <span style={{color:shapeUsesLeft<shapeshifterMaxUses?"#7a7":"#a77"}}>{shapeUsesLeft}/{shapeshifterMaxUses}</span>\n' +
  '                  <button onClick={function(){setShapeUsesLeft(function(p){return Math.min(p+1,shapeshifterMaxUses);});}} style={{marginLeft:"8px",background:"#1a2a1a",color:"#7a7",border:"1px solid #3a5a3a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>+1</button>\n' +
  '                  <button onClick={function(){setShapeUsesLeft(0);setShapeFailed(0);}} style={{marginLeft:"4px",background:"#1a1a2a",color:dim,border:"1px solid #3a3a5a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>Reset</button>\n' +
  '                </div>\n' +
  '                {level>=7&&<div style={{marginBottom:"4px",color:"#a0c0e0",fontSize:"10px"}}>✦ Partial forms available at this level</div>}\n' +
  '                <div>\n' +
  '                  <span style={{color:dim}}>Failed attempts: </span>\n' +
  '                  <span style={{color:shapeFailed>0?"#e08040":dim}}>{shapeFailed}</span>\n' +
  '                  <span style={{color:"#a77",marginLeft:"6px",fontSize:"10px"}}>{shapeFailed>0?"("+Math.min(shapeFailed*5,100)+"% stuck chance)":""}</span>\n' +
  '                  <button onClick={function(){setShapeFailed(function(p){return p+1;});}} style={{marginLeft:"8px",background:"#2a1a1a",color:"#e08040",border:"1px solid #5a3a2a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>+Fail</button>\n' +
  '                </div>\n' +
  '                <div style={{marginTop:"8px",borderTop:"1px solid #333",paddingTop:"6px",fontSize:"9px",color:dim}}>\n' +
  '                  Available branch forms: {branchData?branchData.forms.join(", "):"—"}\n' +
  '                </div>\n' +
  '              </div>\n' +
  '            </Card>}';

if (!src.includes(S1_OLD)) { console.log('ERR step1: KIT card not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: replaced KIT card with druid UI');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
