const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');

const MARKER = '// ======== DRUID DATA ========';
if (!src.includes(MARKER)) { console.log('ERR: marker not found'); process.exit(1); }

const COMPONENTS = `// ======== DICE ROLLER COMPONENTS ========
var DOT_POS={
  1:[[50,50]],
  2:[[72,25],[28,75]],
  3:[[72,25],[50,50],[28,75]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
  6:[[28,22],[72,22],[28,50],[72,50],[28,78],[72,78]]
};

function DieDots({n,dropped}){
  return <div style={{position:"relative",width:"100%",height:"100%"}}>
    {(DOT_POS[n]||[]).map(function(d,i){
      return <div key={i} style={{position:"absolute",left:d[0]+"%",top:d[1]+"%",
        width:"10px",height:"10px",borderRadius:"50%",
        background:dropped?"#555":(n===1?"#cc3333":"#1a1a2e"),
        transform:"translate(-50%,-50%)",
        boxShadow:dropped?"none":"0 1px 2px rgba(0,0,0,0.4)"}}/>;
    })}
  </div>;
}

function Die3D({value,phase,delay,dropped}){
  // Cube face layout: front=1, back=6, right=4, left=3, top=2, bottom=5
  // To show face N toward viewer, rotate the cube:
  var faceRX={1:0,2:90,3:0,4:0,5:-90,6:0};
  var faceRY={1:0,2:0,3:90,4:-90,5:0,6:180};
  var sz=58, half=sz/2;
  var finalX=720+(faceRX[value]||0);
  var finalY=720+(faceRY[value]||0);
  var rolling=phase!=="idle";
  var dur=(0.85+delay*0.0008).toFixed(2);
  var cubeStyle={
    position:"relative",width:sz+"px",height:sz+"px",
    transformStyle:"preserve-3d",
    transform:rolling?("rotateX("+finalX+"deg) rotateY("+finalY+"deg)"):"rotateX(0deg) rotateY(0deg)",
    transition:rolling?("transform "+dur+"s cubic-bezier(0.12,0.9,0.3,1) "+delay+"ms"):"none",
    opacity:dropped?0.28:1,
  };
  var fc=dropped?"#252530":"#f2ecd8";
  var bc=dropped?"#3a3a4a":"#8b7355";
  var fb={position:"absolute",width:sz+"px",height:sz+"px",background:fc,
    border:"2px solid "+bc,borderRadius:"8px",
    display:"flex",alignItems:"center",justifyContent:"center",
    backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",
    padding:"7px",boxSizing:"border-box"};
  var faces=[
    {t:"translateZ("+half+"px)",n:1},
    {t:"rotateY(180deg) translateZ("+half+"px)",n:6},
    {t:"rotateY(90deg) translateZ("+half+"px)",n:4},
    {t:"rotateY(-90deg) translateZ("+half+"px)",n:3},
    {t:"rotateX(-90deg) translateZ("+half+"px)",n:2},
    {t:"rotateX(90deg) translateZ("+half+"px)",n:5},
  ];
  return <div style={{perspective:"180px",width:sz+"px",height:sz+"px"}}>
    <div style={cubeStyle}>
      {faces.map(function(f,i){
        return <div key={i} style={Object.assign({},fb,{transform:f.t})}>
          <DieDots n={f.n} dropped={dropped}/>
        </div>;
      })}
    </div>
  </div>;
}

function DiceRollerModal({method,allRolls,onApply,onReroll,onClose}){
  var _ph=useState("idle"),phase=_ph[0],setPhase=_ph[1];
  useEffect(function(){
    var t1=setTimeout(function(){setPhase("rolling");},60);
    var t2=setTimeout(function(){setPhase("settled");},1600);
    return function(){clearTimeout(t1);clearTimeout(t2);};
  },[]);
  var g="#c9a84c",surf="#111118",brd="#1e1e2e",dim="#666050",txt="#ccc8b8";
  var sNames=["Str","Dex","Con","Int","Wis","Cha"];
  var mLabel={"3d6":"3d6 Straight","3d6r1":"3d6 Reroll 1s","4d6":"4d6 Drop Lowest"}[method]||method;
  var settled=phase==="settled";
  return <div style={{position:"fixed",inset:0,background:"rgba(3,3,8,0.97)",zIndex:10000,
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    padding:"16px",overflowY:"auto"}}>
    <div style={{width:"100%",maxWidth:"740px",background:surf,border:"1px solid "+brd,
      borderRadius:"12px",padding:"20px",boxShadow:"0 0 40px rgba(0,0,0,0.8)"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
        <div style={{color:g,fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"15px",
          fontVariant:"small-caps",letterSpacing:"2px"}}>
          Rolling Ability Scores — {mLabel}
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:dim,
          fontSize:"20px",cursor:"pointer",padding:"0 4px",lineHeight:"1"}}>✕</button>
      </div>
      {/* Stat rows */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"10px"}}>
        {sNames.map(function(stat,si){
          var rolls=allRolls[si]||[];
          var isDrop=method==="4d6";
          var minV=isDrop?Math.min.apply(null,rolls):null;
          var minI=isDrop?rolls.indexOf(minV):-1;
          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);
          var dBase=si*100;
          return <div key={stat} style={{background:"#0a0a12",border:"1px solid "+brd,
            borderRadius:"8px",padding:"10px"}}>
            <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",
              letterSpacing:"1px",marginBottom:"8px"}}>{stat}</div>
            <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
              {rolls.map(function(v,di){
                var drp=isDrop&&di===minI;
                return <div key={di} style={{display:"flex",flexDirection:"column",
                  alignItems:"center",gap:"4px"}}>
                  <Die3D value={v} phase={phase} delay={dBase+di*80} dropped={drp}/>
                  {settled&&<div style={{fontSize:"11px",fontFamily:"monospace",fontWeight:"bold",
                    color:drp?"#444":g,textDecoration:drp?"line-through":"none"}}>{v}</div>}
                </div>;
              })}
              {settled&&<div style={{marginLeft:"8px",fontSize:"28px",fontWeight:"bold",
                color:g,fontFamily:"Georgia,serif",minWidth:"32px",textAlign:"center"}}>
                {total}
              </div>}
            </div>
          </div>;
        })}
      </div>
      {/* Total summary */}
      {settled&&<div style={{marginTop:"12px",padding:"8px 12px",background:"#0a0a12",
        border:"1px solid "+brd,borderRadius:"6px",
        display:"flex",gap:"16px",flexWrap:"wrap",justifyContent:"center"}}>
        {sNames.map(function(stat,si){
          var rolls=allRolls[si]||[];
          var isDrop=method==="4d6";
          var minI=isDrop?rolls.indexOf(Math.min.apply(null,rolls)):-1;
          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);
          return <div key={stat} style={{textAlign:"center",minWidth:"40px"}}>
            <div style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>{stat}</div>
            <div style={{fontSize:"18px",fontWeight:"bold",color:g,fontFamily:"Georgia,serif"}}>{total}</div>
          </div>;
        })}
      </div>}
      {/* Buttons */}
      <div style={{display:"flex",gap:"10px",marginTop:"16px",justifyContent:"flex-end"}}>
        <button onClick={onReroll}
          style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,
            padding:"8px 16px",borderRadius:"6px",cursor:"pointer",
            fontFamily:"monospace",fontSize:"11px"}}>
          Re-roll
        </button>
        <button onClick={onApply} disabled={!settled}
          style={{background:settled?"#1a2a1a":"#0a0a0a",
            color:settled?"#7a7":dim,
            border:"1px solid "+(settled?"#3a5a3a":brd),
            padding:"8px 20px",borderRadius:"6px",
            cursor:settled?"pointer":"default",
            fontFamily:"monospace",fontSize:"11px",fontWeight:"bold"}}>
          Apply to Stats
        </button>
      </div>
    </div>
  </div>;
}

`;

src = src.replace(MARKER, COMPONENTS + MARKER);
fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('Done: DieDots, Die3D, DiceRollerModal added.');
