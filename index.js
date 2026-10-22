// Skickar push när det blir en spelares tur i en match mellan två riktiga spelare.
const {onDocumentWritten}=require("firebase-functions/v2/firestore");
const {onRequest}=require("firebase-functions/v2/https");
const admin=require("firebase-admin");
admin.initializeApp();

// Ska vara samma region som din Firestore-databas (kolla i Firebase-konsolen under Firestore).
const REGION="europe-west1";

const isAI=id=>String(id||"").startsWith("AI_");

function winnerOf(K){
  const g=[0,0],n=[0,0];
  K.forEach(k=>{if(k.save!==undefined){n[k.s]++;if(k.shot!==k.save)g[k.s]++}});
  const done=n[0]+n[1];
  if(done<10){const r0=5-n[0],r1=5-n[1];if(g[0]>g[1]+r1)return 0;if(g[1]>g[0]+r0)return 1;return -1}
  if(done%2===0&&g[0]!==g[1])return g[0]>g[1]?0:1;
  return -1;
}
function turnOf(m){
  if(!m||!m.p||!m.p[1])return null;
  const K=m.kicks||[];
  if(winnerOf(K)>=0)return null;
  const l=K[K.length-1];
  return(!l||l.save!==undefined)?{w:l?1-l.s:0,need:"shoot"}:{w:1-l.s,need:"save"};
}

exports.notifyTurn=onDocumentWritten({document:"matches/{id}",region:REGION},async ev=>{
  const after=ev.data&&ev.data.after;
  if(!after||!after.exists)return;
  const a=after.data(),b=ev.data.before&&ev.data.before.exists?ev.data.before.data():null;
  if(!a.p||!a.p[1]||a.tr||isAI(a.p[0])||isAI(a.p[1]))return;
  const ta=turnOf(a);if(!ta)return;
  const tb=b?turnOf(b):null;
  if(tb&&tb.w===ta.w&&tb.need===ta.need&&(b.kicks||[]).length===(a.kicks||[]).length)return;
  const target=a.p[ta.w],opp=String((a.n||[])[1-ta.w]||"MOTSTÅNDAREN").toUpperCase();
  const body=ta.need==="save"?opp+" HAR SLAGIT. DIN TUR ATT RÄDDA!":(a.kicks||[]).length?opp+" HAR RÄDDAT. DIN TUR ATT SLÅ!":opp+" HAR GÅTT MED. DIN TUR ATT SLÅ!";
  const ref=admin.firestore().doc("push/"+target),snap=await ref.get();
  if(!snap.exists)return;
  const tokens=snap.data().t||[];
  const dead=[];
  await Promise.all(tokens.map(async token=>{
    try{
      await admin.messaging().send({
        token,
        data:{title:"STRAFFSPARK",body,hash:ev.params.id,tag:ev.params.id},
        webpush:{headers:{Urgency:"high",TTL:"86400"}}
      });
    }catch(e){
      if(e.code==="messaging/registration-token-not-registered"||e.code==="messaging/invalid-registration-token")dead.push(token);
      else console.error("push misslyckades",e.code||e.message);
    }
  }));
  if(dead.length)await ref.update({t:admin.firestore.FieldValue.arrayRemove(...dead)});
});

// ENGÅNGSFUNKTION: skapar en profil i "players" för alla konton som saknar en,
// så att listan över registrerade spelare blir komplett. Kör den en gång och ta sedan bort den.
const BACKFILL_KEY="5QLfSZ5Afeq2KChi";
exports.backfillPlayers=onRequest({region:REGION,timeoutSeconds:300},async(req,res)=>{
  if(req.query.key!==BACKFILL_KEY){res.status(403).send("NEJ");return}
  let created=0,skipped=0,next;
  do{
    const page=await admin.auth().listUsers(1000,next);
    for(const u of page.users){
      if(!u.providerData||!u.providerData.length){skipped++;continue}
      const name=u.displayName||(u.email||"").split("@")[0]||"SPELARE";
      const ref=admin.firestore().doc("players/"+u.uid);
      if((await ref.get()).exists){skipped++;continue}
      await ref.set({name,nk:String(name).toLowerCase(),t:Date.now(),lineup:{}});
      created++;
    }
    next=page.pageToken;
  }while(next);
  res.send("KLART. SKAPADE "+created+", HOPPADE OVER "+skipped);
});
