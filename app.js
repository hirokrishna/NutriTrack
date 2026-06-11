// ══ STATE ══
let currentUser = null;
let editingNoteId = null;

// ══ STORAGE ══
function getUsers() { return JSON.parse(localStorage.getItem('nt_users')||'{}'); }
function saveUsers(u) { localStorage.setItem('nt_users', JSON.stringify(u)); }
function getUserData(key) { const d=JSON.parse(localStorage.getItem('nt_data_'+currentUser)||'{}'); return key?(d[key]||[]):d; }
function setUserData(key,val) { const d=getUserData(); d[key]=val; localStorage.setItem('nt_data_'+currentUser,JSON.stringify(d)); }

// ══ AUTH ══
function switchAuth(mode) {
  document.querySelectorAll('.auth-tab').forEach((t,i)=>t.classList.toggle('active',i===(mode==='login'?0:1)));
  document.getElementById('login-form').style.display=mode==='login'?'':'none';
  document.getElementById('register-form').style.display=mode==='register'?'':'none';
  document.getElementById('auth-error').style.display='none';
}
function showAuthError(msg) { const el=document.getElementById('auth-error'); el.textContent=msg; el.style.display='block'; }
async function handleLogin() {
  const u=document.getElementById('login-username').value.trim().toLowerCase();
  const p=document.getElementById('login-password').value;
  if(!u||!p) return showAuthError('Please fill in all fields.');
  
  const btn = document.querySelector('#login-form .btn-primary');
  const originalText = btn.textContent;
  btn.textContent = 'Signing In...';
  btn.disabled = true;
  document.getElementById('auth-error').style.display = 'none';

  try {
    const res = await fetch('/.netlify/functions/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: btoa(p) })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Login failed.');
    } else {
      loginSuccess(data.username, data.name);
    }
  } catch (err) {
    showAuthError('Connection error: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
async function handleRegister() {
  const name=document.getElementById('reg-name').value.trim();
  const u=document.getElementById('reg-username').value.trim().toLowerCase();
  const p=document.getElementById('reg-password').value;
  if(!name||!u||!p) return showAuthError('Please fill in all fields.');
  if(p.length<6) return showAuthError('Password must be at least 6 characters.');
  if(!/^[a-z0-9_]+$/.test(u)) return showAuthError('Username: letters, numbers, underscores only.');
  
  const btn = document.querySelector('#register-form .btn-primary');
  const originalText = btn.textContent;
  btn.textContent = 'Creating Account...';
  btn.disabled = true;
  document.getElementById('auth-error').style.display = 'none';

  try {
    const res = await fetch('/.netlify/functions/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: btoa(p), name })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Registration failed.');
    } else {
      loginSuccess(data.username, data.name);
    }
  } catch (err) {
    showAuthError('Connection error: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
function loginSuccess(username,name) {
  currentUser=username;
  sessionStorage.setItem('nt_session',username);
  document.getElementById('auth-overlay').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('user-badge').textContent=name.charAt(0).toUpperCase();
  document.getElementById('username-display').textContent=name.split(' ')[0];
  renderNotes();
}
function logout() {
  currentUser=null; sessionStorage.removeItem('nt_session');
  document.getElementById('auth-overlay').style.display='flex';
  document.getElementById('app').style.display='none';
}
window.addEventListener('DOMContentLoaded',()=>{
  const s=sessionStorage.getItem('nt_session');
  if(s){const users=getUsers(); if(users[s]) loginSuccess(s,users[s].name);}
  document.getElementById('login-password').addEventListener('keydown',e=>{if(e.key==='Enter')handleLogin();});
  document.getElementById('login-username').addEventListener('keydown',e=>{if(e.key==='Enter')handleLogin();});
  document.getElementById('reg-password').addEventListener('keydown',e=>{if(e.key==='Enter')handleRegister();});
});

// ══ NAV ══
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-tab')[['tracker','bmi','notes'].indexOf(page)].classList.add('active');
  if(page==='notes') renderNotes();
}

// ══ GEMINI CHAT ══
async function sendMessage() {
  const input=document.getElementById('chat-input');
  const text=input.value.trim();
  if(!text) return;
  
  input.value='';
  document.getElementById('send-btn').disabled=true;
  appendMsg('user',text);
  const typingId=appendTyping();
  try {
    const res=await fetch(
      `/.netlify/functions/analyze-food`,
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ text })
      }
    );
    
    removeTyping(typingId);
    
    if(!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errMsg = errorData.error || `HTTP error ${res.status}`;
      appendMsg('ai','⚠️ Error: '+errMsg);
      document.getElementById('send-btn').disabled=false;
      return;
    }
    
    const data=await res.json();
    const raw=data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    try {
      const parsed=JSON.parse(raw.replace(/```json|```/g,'').trim());
      appendNutritionTable(parsed);
    } catch {
      appendMsg('ai', raw||'Sorry, I had trouble analyzing that. Please describe your food more clearly.');
    }
  } catch(err) {
    removeTyping(typingId);
    appendMsg('ai','❌ Network error: '+err.message+'. Check your internet connection.');
  }
  document.getElementById('send-btn').disabled=false;
}

function appendMsg(role,text) {
  const msgs=document.getElementById('chat-messages');
  const div=document.createElement('div'); div.className='msg '+(role==='user'?'user':'ai');
  const avatar=document.createElement('div'); avatar.className='msg-avatar';
  avatar.textContent=role==='user'?(currentUser?currentUser.charAt(0).toUpperCase():'U'):'🥗';
  const bubble=document.createElement('div'); bubble.className='msg-bubble';
  bubble.innerHTML=text.replace(/\n/g,'<br>');
  div.appendChild(avatar); div.appendChild(bubble);
  msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight;
}
function appendTyping() {
  const msgs=document.getElementById('chat-messages');
  const id='typing_'+Date.now();
  const div=document.createElement('div'); div.className='msg ai'; div.id=id;
  div.innerHTML='<div class="msg-avatar">🥗</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight; return id;
}
function removeTyping(id){const el=document.getElementById(id);if(el)el.remove();}

function appendNutritionTable(data) {
  const msgs=document.getElementById('chat-messages');
  const div=document.createElement('div'); div.className='msg ai';
  let t='<table class="nutrition-table"><thead><tr><th>Food</th><th>Amount</th><th>Cal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fibre</th></tr></thead><tbody>';
  data.items.forEach(item=>{
    t+='<tr><td><strong>'+escapeHtml(item.food)+'</strong></td><td>'+escapeHtml(item.amount)+'</td><td>'+Math.round(item.calories)+'</td><td>'+Number(item.protein).toFixed(1)+'g</td><td>'+Number(item.carbs).toFixed(1)+'g</td><td>'+Number(item.fat).toFixed(1)+'g</td><td>'+Number(item.fibre).toFixed(1)+'g</td></tr>';
  });
  const tot=data.totals;
  t+='<tr class="total-row"><td colspan="2"><strong>TOTAL</strong></td><td><strong>'+Math.round(tot.calories)+'</strong></td><td><strong>'+Number(tot.protein).toFixed(1)+'g</strong></td><td><strong>'+Number(tot.carbs).toFixed(1)+'g</strong></td><td><strong>'+Number(tot.fat).toFixed(1)+'g</strong></td><td><strong>'+Number(tot.fibre).toFixed(1)+'g</strong></td></tr></tbody></table>';
  const bubble=document.createElement('div'); bubble.className='msg-bubble'; bubble.style.cssText='max-width:100%;padding:16px';
  bubble.innerHTML=t+(data.message?'<p style="margin-top:12px;font-size:13px;color:var(--text-muted)">'+escapeHtml(data.message)+'</p>':'');
  div.innerHTML='<div class="msg-avatar">🥗</div>'; div.appendChild(bubble);
  msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight;
}

// ══ BMI ══
function calculateBMI() {
  const age=+document.getElementById('bmi-age').value, gender=document.getElementById('bmi-gender').value;
  const weight=+document.getElementById('bmi-weight').value, height=+document.getElementById('bmi-height').value;
  const activity=+document.getElementById('bmi-activity').value, goal=document.getElementById('bmi-goal').value;
  if(!age||!weight||!height||age<10||weight<30||height<100){alert('Please enter valid values.');return;}
  const bmi=weight/((height/100)**2);
  let category,color,markerPct,msg;
  if(bmi<16){category='Severely Underweight';color='#5B9BD5';markerPct=5;msg='Significant caloric surplus needed.';}
  else if(bmi<18.5){category='Underweight';color='#7AB8E8';markerPct=15;msg='Increase caloric intake gradually.';}
  else if(bmi<25){category='Normal Weight ✓';color='#3A8A3A';markerPct=38;msg='Great! Maintain your healthy lifestyle.';}
  else if(bmi<30){category='Overweight';color='#C8A020';markerPct=65;msg='Moderate deficit and exercise will help.';}
  else if(bmi<35){category='Obese Class I';color='#C85030';markerPct=80;msg='Consult a dietitian for a structured plan.';}
  else{category='Obese Class II+';color='#A02020';markerPct=95;msg='Please consult a healthcare professional.';}
  let bmr=gender==='male'?10*weight+6.25*height-5*age+5:10*weight+6.25*height-5*age-161;
  const tdee=Math.round(bmr*activity);
  let target=tdee;
  if(goal==='lose')target=tdee-500; else if(goal==='gain')target=tdee+300;
  let ibw=gender==='male'?50+2.3*((height-152.4)/2.54):45.5+2.3*((height-152.4)/2.54);
  ibw=Math.max(Math.round(ibw),40);
  document.getElementById('bmi-result').classList.add('visible');
  document.getElementById('bmi-value').textContent=bmi.toFixed(1);
  document.getElementById('bmi-cat').textContent=category; document.getElementById('bmi-cat').style.color=color;
  document.getElementById('bmi-msg').textContent=msg;
  document.getElementById('bmi-marker').style.left=markerPct+'%';
  document.getElementById('res-bmr').textContent=Math.round(bmr);
  document.getElementById('res-tdee').textContent=tdee;
  document.getElementById('res-target').textContent=target;
  document.getElementById('res-ibw').textContent=ibw;
  const protein=Math.round(target*0.25/4), carbs=Math.round(target*0.50/4), fat=Math.round(target*0.25/9);
  document.getElementById('macro-bars').innerHTML=
    '<div class="macro-bar"><span class="macro-bar-label">Protein</span><div class="macro-bar-track"><div class="macro-bar-fill" style="width:25%;background:#A8C8A8"></div></div><span class="macro-bar-val">'+protein+'g/day</span></div>'+
    '<div class="macro-bar"><span class="macro-bar-label">Carbs</span><div class="macro-bar-track"><div class="macro-bar-fill" style="width:50%;background:#F5C842"></div></div><span class="macro-bar-val">'+carbs+'g/day</span></div>'+
    '<div class="macro-bar"><span class="macro-bar-label">Fat</span><div class="macro-bar-track"><div class="macro-bar-fill" style="width:25%;background:#E8A080"></div></div><span class="macro-bar-val">'+fat+'g/day</span></div>';
}

// ══ NOTES ══
function renderNotes(search='') {
  const notes=getUserData('notes'), grid=document.getElementById('notes-grid');
  const filtered=notes.filter(n=>(n.title||'').toLowerCase().includes(search.toLowerCase())||(n.content||'').toLowerCase().includes(search.toLowerCase()));
  if(filtered.length===0){
    grid.innerHTML='<div class="empty-notes" style="grid-column:1/-1"><div class="empty-icon">📋</div><h3>'+(search?'No notes match':'No notes yet')+'</h3><p>'+(search?'Try different keywords.':'Start jotting down your nutrition goals and meal plans.')+'</p></div>';
    return;
  }
  grid.innerHTML=filtered.map(n=>'<div class="note-card" onclick="openNoteModal(\''+n.id+'\')"><h4>'+escapeHtml(n.title||'Untitled')+'</h4><p>'+escapeHtml(n.content)+'</p><div class="note-date">'+new Date(n.created).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+'</div><button class="note-delete" onclick="deleteNote(event,\''+n.id+'\')">×</button></div>').join('');
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function openNoteModal(id=null) {
  editingNoteId=id;
  if(id){const note=getUserData('notes').find(n=>n.id===id);if(!note)return;document.getElementById('modal-title').textContent='Edit Note';document.getElementById('note-title').value=note.title;document.getElementById('note-content').value=note.content;}
  else{document.getElementById('modal-title').textContent='New Note';document.getElementById('note-title').value='';document.getElementById('note-content').value='';}
  document.getElementById('note-modal').classList.add('open');
  setTimeout(()=>document.getElementById('note-title').focus(),100);
}
function closeNoteModal(){document.getElementById('note-modal').classList.remove('open');editingNoteId=null;}
function saveNote(){
  const title=document.getElementById('note-title').value.trim(), content=document.getElementById('note-content').value.trim();
  if(!title&&!content){alert('Please write something before saving.');return;}
  let notes=getUserData('notes');
  if(editingNoteId){notes=notes.map(n=>n.id===editingNoteId?{...n,title:title||'Untitled',content,updated:Date.now()}:n);}
  else{notes.unshift({id:'note_'+Date.now(),title:title||'Untitled',content,created:Date.now()});}
  setUserData('notes',notes); closeNoteModal(); renderNotes();
}
function deleteNote(e,id){
  e.stopPropagation(); if(!confirm('Delete this note?'))return;
  setUserData('notes',getUserData('notes').filter(n=>n.id!==id)); renderNotes();
}
document.getElementById('note-modal').addEventListener('click',function(e){if(e.target===this)closeNoteModal();});
