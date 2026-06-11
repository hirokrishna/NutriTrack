// ══ STATE ══
let currentUser = null;
let editingNoteId = null;
let notesCache = [];

async function syncNotesFromDB() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/.netlify/functions/notes?username=${currentUser}`);
    if (res.ok) {
      const data = await res.json();
      notesCache = data.notes || [];
      localStorage.setItem('nt_data_notes_' + currentUser, JSON.stringify(notesCache));
      renderNotes();
    }
  } catch (err) {
    console.error("Failed to sync notes from database:", err);
  }
}

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
  sessionStorage.setItem('nt_session_name',name);
  document.getElementById('auth-overlay').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('user-badge').textContent=name.charAt(0).toUpperCase();
  document.getElementById('username-display').textContent=name.split(' ')[0];
  
  notesCache = [];
  renderNotes();
  syncNotesFromDB();
  
  // Programmatically switch to Dashboard by default on login
  switchPage('dashboard');
}
function logout() {
  currentUser=null;
  sessionStorage.removeItem('nt_session');
  sessionStorage.removeItem('nt_session_name');
  document.getElementById('auth-overlay').style.display='flex';
  document.getElementById('app').style.display='none';
}
window.addEventListener('DOMContentLoaded',()=>{
  const s=sessionStorage.getItem('nt_session');
  const name=sessionStorage.getItem('nt_session_name');
  if(s && name){
    loginSuccess(s, name);
  }
  document.getElementById('login-password').addEventListener('keydown',e=>{if(e.key==='Enter')handleLogin();});
  document.getElementById('login-username').addEventListener('keydown',e=>{if(e.key==='Enter')handleLogin();});
  document.getElementById('reg-password').addEventListener('keydown',e=>{if(e.key==='Enter')handleRegister();});
});

// ══ NAV ══
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  
  const tabs = ['tracker', 'bmi', 'dashboard', 'notes', 'settings'];
  const idx = tabs.indexOf(page);
  if (idx !== -1) {
    document.querySelectorAll('.nav-tab')[idx].classList.add('active');
  }
  
  if(page==='notes') renderNotes();
  if(page==='dashboard') renderDashboard();
  if(page==='settings') renderSettings();
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
      logDailyMeal(parsed);
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
  if (notesCache.length === 0 && currentUser) {
    notesCache = JSON.parse(localStorage.getItem('nt_data_notes_' + currentUser) || '[]');
  }
  const grid=document.getElementById('notes-grid');
  const filtered=notesCache.filter(n=>(n.title||'').toLowerCase().includes(search.toLowerCase())||(n.content||'').toLowerCase().includes(search.toLowerCase()));
  if(filtered.length===0){
    grid.innerHTML='<div class="empty-notes" style="grid-column:1/-1"><div class="empty-icon">📋</div><h3>'+(search?'No notes match':'No notes yet')+'</h3><p>'+(search?'Try different keywords.':'Start jotting down your nutrition goals and meal plans.')+'</p></div>';
    return;
  }
  grid.innerHTML=filtered.map(n=>'<div class="note-card" onclick="openNoteModal(\''+n.id+'\')"><h4>'+escapeHtml(n.title||'Untitled')+'</h4><p>'+escapeHtml(n.content)+'</p><div class="note-date">'+new Date(n.created).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+'</div><button class="note-delete" onclick="deleteNote(event,\''+n.id+'\')">×</button></div>').join('');
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function openNoteModal(id=null) {
  editingNoteId=id;
  if(id){const note=notesCache.find(n=>n.id===id);if(!note)return;document.getElementById('modal-title').textContent='Edit Note';document.getElementById('note-title').value=note.title;document.getElementById('note-content').value=note.content;}
  else{document.getElementById('modal-title').textContent='New Note';document.getElementById('note-title').value='';document.getElementById('note-content').value='';}
  document.getElementById('note-modal').classList.add('open');
  setTimeout(()=>document.getElementById('note-title').focus(),100);
}
function closeNoteModal(){document.getElementById('note-modal').classList.remove('open');editingNoteId=null;}
async function saveNote(){
  const title=document.getElementById('note-title').value.trim(), content=document.getElementById('note-content').value.trim();
  if(!title&&!content){alert('Please write something before saving.');return;}
  
  const id = editingNoteId || 'note_' + Date.now();
  const createdTime = editingNoteId ? (notesCache.find(n => n.id === editingNoteId)?.created || Date.now()) : Date.now();
  const newNote = {
    id,
    title: title || 'Untitled',
    content,
    created: createdTime
  };
  
  if(editingNoteId){
    notesCache = notesCache.map(n=>n.id===editingNoteId ? newNote : n);
  } else {
    notesCache.unshift(newNote);
  }
  localStorage.setItem('nt_data_notes_' + currentUser, JSON.stringify(notesCache));
  closeNoteModal();
  renderNotes();

  try {
    await fetch('/.netlify/functions/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        username: currentUser,
        noteId: id,
        title: title || 'Untitled',
        content,
        created: new Date(createdTime).toISOString()
      })
    });
  } catch (err) {
    console.error("Failed to save note to database:", err);
  }
}
async function deleteNote(e,id){
  e.stopPropagation();
  if(!confirm('Delete this note?')) return;
  
  notesCache = notesCache.filter(n=>n.id!==id);
  localStorage.setItem('nt_data_notes_' + currentUser, JSON.stringify(notesCache));
  renderNotes();

  try {
    await fetch('/.netlify/functions/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        username: currentUser,
        noteId: id
      })
    });
  } catch (err) {
    console.error("Failed to delete note from database:", err);
  }
}
document.getElementById('note-modal').addEventListener('click',function(e){if(e.target===this)closeNoteModal();});

// ══ ONBOARDING, LOGGING, SETTINGS & DASHBOARD ══

function calculateAge(dobString) {
  const today = new Date();
  const birthDate = new Date(dobString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function toggleTargetTime(prefix) {
  const goal = document.getElementById(`${prefix}-goal`).value;
  const timeGroup = document.getElementById(`${prefix}-target-time-group`);
  const timeInput = document.getElementById(`${prefix}-target-time`);
  if (!timeGroup || !timeInput) return;
  if (goal === 'maintain') {
    timeGroup.style.display = 'none';
    timeInput.required = false;
  } else {
    timeGroup.style.display = 'block';
    timeInput.required = true;
  }
}

function submitOnboarding() {
  const gender = document.getElementById('onboard-gender').value;
  const dob = document.getElementById('onboard-dob').value;
  const height = +document.getElementById('onboard-height').value;
  const weight = +document.getElementById('onboard-weight').value;
  const targetWeight = +document.getElementById('onboard-target-weight').value;
  const activity = +document.getElementById('onboard-activity').value;
  const goal = document.getElementById('onboard-goal').value;
  const targetTimeWeeks = +document.getElementById('onboard-target-time').value;

  if (!dob || !height || !weight || !targetWeight) {
    const err = document.getElementById('onboarding-error');
    err.textContent = 'Please fill in all fields.';
    err.style.display = 'block';
    return;
  }
  if (goal !== 'maintain' && (!targetTimeWeeks || targetTimeWeeks <= 0)) {
    const err = document.getElementById('onboarding-error');
    err.textContent = 'Please enter a valid target time in weeks.';
    err.style.display = 'block';
    return;
  }

  const age = calculateAge(dob);
  let bmr = gender === 'male' 
    ? (10 * weight + 6.25 * height - 5 * age + 5)
    : (10 * weight + 6.25 * height - 5 * age - 161);
  
  const tdee = Math.round(bmr * activity);
  
  const weightDiff = Math.abs(weight - targetWeight);
  let dailyCalorieChange = 0;
  if (goal !== 'maintain' && targetTimeWeeks > 0) {
    dailyCalorieChange = (weightDiff * 7700) / (targetTimeWeeks * 7);
  }
  
  let targetCalories = tdee;
  if (goal === 'lose') {
    targetCalories = tdee - dailyCalorieChange;
  } else if (goal === 'gain') {
    targetCalories = tdee + dailyCalorieChange;
  }
  
  // Safe boundaries
  targetCalories = Math.max(1200, Math.min(Math.round(targetCalories), 5000));

  const protein = Math.round((targetCalories * 0.25) / 4);
  const carbs = Math.round((targetCalories * 0.50) / 4);
  const fat = Math.round((targetCalories * 0.25) / 9);
  const fiber = gender === 'male' ? 38 : 25;

  const profile = {
    gender,
    dob,
    height,
    startingWeight: weight,
    currentWeight: weight,
    targetWeight,
    activity,
    goal,
    targetTimeWeeks: goal === 'maintain' ? 0 : targetTimeWeeks,
    targetCalories,
    targetProtein: protein,
    targetCarbs: carbs,
    targetFat: fat,
    targetFiber: fiber,
    setupComplete: true
  };

  localStorage.setItem('nt_profile_' + currentUser, JSON.stringify(profile));
  
  const weightHistory = [{ date: new Date().toLocaleDateString('en-CA'), weight }];
  localStorage.setItem('nt_weight_history_' + currentUser, JSON.stringify(weightHistory));

  document.getElementById('onboarding-overlay').style.display = 'none';
  switchPage('dashboard');
}

let activeSelectedDate = null;
let visibleGraphLines = { calories: true, protein: true, carbs: true, fat: true, fiber: true };

function renderDashboard() {
  if (!currentUser) return;
  
  const profileJson = localStorage.getItem('nt_profile_' + currentUser);
  if (!profileJson) {
    document.getElementById('onboarding-overlay').style.display = 'flex';
    document.getElementById('onboarding-error').style.display = 'none';
    toggleTargetTime('onboard');
    return;
  }
  
  const profile = JSON.parse(profileJson);
  document.getElementById('dash-user-name').textContent = sessionStorage.getItem('nt_session_name') || currentUser;
  
  const logs = JSON.parse(localStorage.getItem('nt_logs_' + currentUser) || '{}');
  
  // Render Weight Progress Card
  renderWeightProgress(profile);
  
  // Render Monthly Calendar/Infographic
  renderInfographic(logs, profile.targetCalories);
  
  // Render Weekly Line Chart
  renderProgressGraph();
}

function logDailyMeal(parsed) {
  if (!currentUser) return;
  const todayStr = new Date().toLocaleDateString('en-CA');
  const logs = JSON.parse(localStorage.getItem('nt_logs_' + currentUser) || '{}');
  
  if (!logs[todayStr]) {
    logs[todayStr] = {
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
      entries: []
    };
  }
  
  const dayLog = logs[todayStr];
  
  parsed.items.forEach(item => {
    dayLog.entries.push({
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      food: item.food,
      amount: item.amount,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fibre: item.fibre
    });
  });
  
  dayLog.totals.calories += parsed.totals.calories || 0;
  dayLog.totals.protein += parsed.totals.protein || 0;
  dayLog.totals.carbs += parsed.totals.carbs || 0;
  dayLog.totals.fat += parsed.totals.fat || 0;
  dayLog.totals.fibre += parsed.totals.fibre || 0;
  
  localStorage.setItem('nt_logs_' + currentUser, JSON.stringify(logs));
  
  if (document.getElementById('page-dashboard').classList.contains('active')) {
    renderDashboard();
  }
}

function renderWeightProgress(profile) {
  const startingWeight = profile.startingWeight || 70;
  const currentWeight = profile.currentWeight || 70;
  const targetWeight = profile.targetWeight || 65;
  
  document.getElementById('dash-weight-start').textContent = startingWeight.toFixed(1) + ' kg';
  document.getElementById('dash-weight-current').textContent = currentWeight.toFixed(1) + ' kg';
  document.getElementById('dash-weight-target').textContent = targetWeight.toFixed(1) + ' kg';
  
  let pct = 0;
  const totalDiff = startingWeight - targetWeight;
  if (totalDiff === 0) {
    pct = 100;
  } else {
    const currentDiff = startingWeight - currentWeight;
    pct = Math.min(Math.max((currentDiff / totalDiff) * 100, 0), 100);
  }
  
  document.getElementById('dash-weight-fill').style.width = pct + '%';
  
  let msg = '';
  if (currentWeight === targetWeight) {
    msg = '🎉 Goal reached! Excellent work maintaining your target weight.';
  } else if (totalDiff > 0) {
    const left = currentWeight - targetWeight;
    if (left > 0) {
      msg = `You are ${pct.toFixed(0)}% of the way there! ${left.toFixed(1)} kg left to lose.`;
    } else {
      msg = `You exceeded your weight loss target by ${Math.abs(left).toFixed(1)} kg!`;
    }
  } else {
    const left = targetWeight - currentWeight;
    if (left > 0) {
      msg = `You are ${pct.toFixed(0)}% of the way there! ${left.toFixed(1)} kg left to gain.`;
    } else {
      msg = `You exceeded your weight gain target by ${Math.abs(left).toFixed(1)} kg!`;
    }
  }
  document.getElementById('dash-weight-msg').textContent = msg;
  
  const history = JSON.parse(localStorage.getItem('nt_weight_history_' + currentUser) || '[]');
  const historyContainer = document.getElementById('dash-weight-history');
  if (history.length === 0) {
    historyContainer.innerHTML = '<div class="empty-timeline">No history recorded yet</div>';
  } else {
    historyContainer.innerHTML = history.slice().reverse().map(h => `
      <div class="weight-timeline-item">
        <span class="date">${new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <span class="weight">${h.weight.toFixed(1)} kg</span>
      </div>
    `).join('');
  }
}

function openWeightModal() {
  document.getElementById('weight-modal').classList.add('open');
  const profile = JSON.parse(localStorage.getItem('nt_profile_' + currentUser) || '{}');
  document.getElementById('log-weight-input').value = profile.currentWeight || '';
  setTimeout(() => document.getElementById('log-weight-input').focus(), 100);
}

function closeWeightModal() {
  document.getElementById('weight-modal').classList.remove('open');
}

function saveWeeklyWeight() {
  const weightInput = document.getElementById('log-weight-input').value;
  const weight = parseFloat(weightInput);
  if (isNaN(weight) || weight <= 0) {
    alert("Please enter a valid weight.");
    return;
  }
  
  const profile = JSON.parse(localStorage.getItem('nt_profile_' + currentUser) || '{}');
  profile.currentWeight = weight;
  localStorage.setItem('nt_profile_' + currentUser, JSON.stringify(profile));
  
  const history = JSON.parse(localStorage.getItem('nt_weight_history_' + currentUser) || '[]');
  history.push({
    date: new Date().toLocaleDateString('en-CA'),
    weight
  });
  localStorage.setItem('nt_weight_history_' + currentUser, JSON.stringify(history));
  
  closeWeightModal();
  renderDashboard();
}

function renderInfographic(logs, targetCal) {
  const container = document.getElementById('infographic-grid');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  document.getElementById('infographic-month-year').textContent = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  let html = dayNames.map(name => `<div class="calendar-day-header">${name}</div>`).join('');
  
  // Padding for the first day of the month
  const firstDayIndex = new Date(year, month, 1).getDay();
  for (let p = 0; p < firstDayIndex; p++) {
    html += `<div class="info-day pad-day"></div>`;
  }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const log = logs[dateStr];
    const completedCal = log ? (log.totals?.calories || 0) : 0;
    
    const todayStr = new Date().toLocaleDateString('en-CA');
    const isFuture = dateStr > todayStr;
    
    let level = 'empty';
    if (completedCal > 0) {
      level = 'done';
    } else if (isFuture) {
      level = 'future';
    }
    
    html += `
      <div class="info-day ${level}" data-date="${dateStr}" onclick="selectDate('${dateStr}')" onmouseenter="previewDate('${dateStr}')">
        ${d}
      </div>
    `;
  }
  container.innerHTML = html;
  
  // Handle mouseleave of grid to revert to active selected date
  container.onmouseleave = () => {
    if (activeSelectedDate) {
      showDayPreview(activeSelectedDate);
    }
  };

  // Set default view to today
  const todayStr = new Date().toLocaleDateString('en-CA');
  selectDate(todayStr);
}

function selectDate(dateStr) {
  activeSelectedDate = dateStr;
  
  // Highlight active cell in the calendar
  document.querySelectorAll('.info-day').forEach(el => {
    el.classList.toggle('active-selected', el.getAttribute('data-date') === dateStr);
  });
  
  showDayPreview(dateStr);
  renderProgressTable(dateStr);
}

function previewDate(dateStr) {
  showDayPreview(dateStr);
}

function showDayPreview(dateStr) {
  const previewCard = document.getElementById('day-preview-card');
  const emptyState = document.getElementById('preview-empty');
  const contentState = document.getElementById('preview-content');
  if (!previewCard || !emptyState || !contentState) return;
  
  const profile = JSON.parse(localStorage.getItem('nt_profile_' + currentUser) || '{}');
  const logs = JSON.parse(localStorage.getItem('nt_logs_' + currentUser) || '{}');
  
  const todayStr = new Date().toLocaleDateString('en-CA');
  const isFuture = dateStr > todayStr;
  
  // Title Date Formatting
  const formattedDate = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('preview-date-title').textContent = formattedDate;
  
  if (isFuture) {
    emptyState.style.display = 'block';
    contentState.style.display = 'none';
    emptyState.querySelector('h4').textContent = "Date Not Arrived";
    emptyState.querySelector('p').textContent = "This date is in the future. Log meals when the day arrives.";
    return;
  }
  
  const dayLog = logs[dateStr];
  if (!dayLog || dayLog.entries.length === 0) {
    emptyState.style.display = 'block';
    contentState.style.display = 'none';
    emptyState.querySelector('h4').textContent = "No Entries Logged";
    emptyState.querySelector('p').textContent = "You did not log any food for this day.";
    return;
  }
  
  emptyState.style.display = 'none';
  contentState.style.display = 'block';
  
  const totals = dayLog.totals;
  const targetCal = Math.round(profile.targetCalories || 2000);
  const targetProt = profile.targetProtein || 120;
  const targetCarbs = profile.targetCarbs || 250;
  const targetFat = profile.targetFat || 65;
  const targetFiber = profile.targetFiber || 30;
  
  document.getElementById('preview-cal-val').textContent = `${Math.round(totals.calories)} / ${targetCal} kcal`;
  document.getElementById('preview-prot-val').textContent = `${Number(totals.protein).toFixed(1)}g / ${targetProt}g`;
  document.getElementById('preview-carbs-val').textContent = `${Number(totals.carbs).toFixed(1)}g / ${targetCarbs}g`;
  document.getElementById('preview-fat-val').textContent = `${Number(totals.fat).toFixed(1)}g / ${targetFat}g`;
  document.getElementById('preview-fiber-val').textContent = `${Number(totals.fibre).toFixed(1)}g / ${targetFiber}g`;
  
  // Status level color code badge
  const pct = totals.calories / targetCal;
  const badge = document.getElementById('preview-status');
  badge.textContent = `${Math.round(pct * 100)}% Cal`;
  if (pct < 0.5) badge.className = 'status-badge level-low';
  else if (pct <= 0.85) badge.className = 'status-badge level-mid';
  else if (pct <= 1.10) badge.className = 'status-badge level-goal';
  else badge.className = 'status-badge level-surplus';
  
  // Render meals list
  const listContainer = document.getElementById('preview-meals-list');
  listContainer.innerHTML = dayLog.entries.map(entry => `
    <div class="preview-meal-item">
      <div class="meal-meta">
        <span class="meal-time">${entry.time.substring(0, 5)}</span>
        <span class="meal-food">${escapeHtml(entry.food)}</span>
        <span class="meal-amt">${escapeHtml(entry.amount)}</span>
      </div>
      <span class="meal-cal">${Math.round(entry.calories)} kcal</span>
    </div>
  `).join('');
}

function renderProgressTable(dateStr) {
  const profile = JSON.parse(localStorage.getItem('nt_profile_' + currentUser) || '{}');
  const logs = JSON.parse(localStorage.getItem('nt_logs_' + currentUser) || '{}');
  
  const dayLog = logs[dateStr] || { totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } };
  const totals = dayLog.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  
  const targetCal = Math.round(profile.targetCalories || 2000);
  const targetProt = profile.targetProtein || 120;
  const targetCarbs = profile.targetCarbs || 250;
  const targetFat = profile.targetFat || 65;
  const targetFiber = profile.targetFiber || 30;
  
  const metrics = [
    { name: 'Calories', unit: 'kcal', target: targetCal, consumed: Math.round(totals.calories || 0) },
    { name: 'Protein', unit: 'g', target: targetProt, consumed: totals.protein || 0 },
    { name: 'Carbs', unit: 'g', target: targetCarbs, consumed: totals.carbs || 0 },
    { name: 'Fat', unit: 'g', target: targetFat, consumed: totals.fat || 0 },
    { name: 'Fiber', unit: 'g', target: targetFiber, consumed: totals.fibre || 0 }
  ];
  
  const tbody = document.getElementById('progress-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = metrics.map(m => {
    const consumedVal = typeof m.consumed === 'number' ? m.consumed : 0;
    const targetVal = m.target || 1;
    const pct = Math.min((consumedVal / targetVal) * 100, 100);
    const remaining = m.target - consumedVal;
    
    let remText = '';
    let remClass = '';
    if (remaining >= 0) {
      remText = `${Number(remaining).toFixed(m.name === 'Calories' ? 0 : 1)} ${m.unit} left`;
      remClass = 'remaining-left';
    } else {
      remText = `${Number(Math.abs(remaining)).toFixed(m.name === 'Calories' ? 0 : 1)} ${m.unit} over`;
      remClass = 'remaining-over';
    }
    
    return `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td>${m.target} ${m.unit}</td>
        <td>${Number(m.consumed).toFixed(m.name === 'Calories' ? 0 : 1)} ${m.unit}</td>
        <td class="${remClass}">${remText}</td>
        <td>
          <div class="table-progress-container">
            <div class="table-progress-track">
              <div class="table-progress-fill fill-${m.name.toLowerCase()}" style="width: ${pct}%"></div>
            </div>
            <span class="table-pct-label">${Math.round(pct)}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderProgressGraph() {
  const container = document.getElementById('progress-graph-container');
  if (!container) return;

  const profile = JSON.parse(localStorage.getItem('nt_profile_' + currentUser) || '{}');
  const logs = JSON.parse(localStorage.getItem('nt_logs_' + currentUser) || '{}');

  const targetCal = Math.round(profile.targetCalories || 2000);
  const targetProt = profile.targetProtein || 120;
  const targetCarbs = profile.targetCarbs || 250;
  const targetFat = profile.targetFat || 65;
  const targetFiber = profile.targetFiber || 30;

  // Gather past 7 dates
  const dates = [];
  const dateLabels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('en-CA'));
    dateLabels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
  }

  // Gather metrics data for past 7 days
  const data = {
    calories: [],
    protein: [],
    carbs: [],
    fat: [],
    fiber: []
  };

  dates.forEach(dateStr => {
    const log = logs[dateStr] || { totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } };
    const totals = log.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
    
    data.calories.push({ pct: (totals.calories || 0) / targetCal * 100, abs: totals.calories });
    data.protein.push({ pct: (totals.protein || 0) / targetProt * 100, abs: totals.protein });
    data.carbs.push({ pct: (totals.carbs || 0) / targetCarbs * 100, abs: totals.carbs });
    data.fat.push({ pct: (totals.fat || 0) / targetFat * 100, abs: totals.fat });
    data.fiber.push({ pct: (totals.fibre || 0) / targetFiber * 100, abs: totals.fibre });
  });

  const chartWidth = 700;
  const chartHeight = 200;
  const paddingLeft = 60;
  const paddingRight = 40;
  const paddingTop = 20;
  const paddingBottom = 40;

  const svgWidth = chartWidth + paddingLeft + paddingRight;
  const svgHeight = chartHeight + paddingTop + paddingBottom;

  const getX = (index) => paddingLeft + index * (chartWidth / 6);
  const getY = (pct) => {
    const clamped = Math.min(Math.max(pct, 0), 150);
    return paddingTop + chartHeight - (clamped / 150) * chartHeight;
  };

  const metricsInfo = {
    calories: { name: 'Calories', color: '#7DAA7D', data: data.calories, unit: 'kcal' },
    protein: { name: 'Protein', color: '#A8C8A8', data: data.protein, unit: 'g' },
    carbs: { name: 'Carbs', color: '#F5C842', data: data.carbs, unit: 'g' },
    fat: { name: 'Fat', color: '#E8724A', data: data.fat, unit: 'g' },
    fiber: { name: 'Fiber', color: '#9C27B0', data: data.fiber, unit: 'g' }
  };

  // Generate background grid lines
  let gridLinesHtml = '';
  // Horizontal grid lines (0%, 50%, 100%, 150%)
  [0, 50, 100, 150].forEach(val => {
    const y = getY(val);
    gridLinesHtml += `
      <line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartWidth}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4" />
      <text x="${paddingLeft - 10}" y="${y + 4}" font-size="11" fill="var(--text-muted)" font-weight="600" text-anchor="end">${val}%</text>
    `;
  });

  // Vertical grid lines and date labels
  dates.forEach((dateStr, i) => {
    const x = getX(i);
    gridLinesHtml += `
      <line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${paddingTop + chartHeight}" stroke="var(--border)" stroke-width="1" opacity="0.5" />
      <text x="${x}" y="${paddingTop + chartHeight + 20}" font-size="11" fill="var(--text-muted)" font-weight="600" text-anchor="middle">${dateLabels[i]}</text>
    `;
  });

  let linesHtml = '';
  let gradientsHtml = '';
  let markersHtml = '';

  Object.keys(metricsInfo).forEach(key => {
    if (!visibleGraphLines[key]) return;

    const info = metricsInfo[key];
    let pathD = '';
    let areaD = '';

    info.data.forEach((item, idx) => {
      const x = getX(idx);
      const y = getY(item.pct);
      if (idx === 0) {
        pathD += `M ${x} ${y}`;
        areaD = `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
        areaD += ` L ${x} ${y}`;
      }

      const absValRounded = Math.round(item.abs);
      const labelText = `${info.name}: ${absValRounded}${info.unit} (${Math.round(item.pct)}%)`;

      // Draw dot markers
      markersHtml += `
        <circle cx="${x}" cy="${y}" r="5" fill="#ffffff" stroke="${info.color}" stroke-width="3" class="graph-marker">
          <title>${labelText}</title>
        </circle>
      `;
    });

    areaD += ` L ${getX(6)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;

    // Add path with premium glow effects
    linesHtml += `
      <path d="${pathD}" fill="none" stroke="${info.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" />
    `;
    gradientsHtml += `
      <path d="${areaD}" fill="url(#grad-${key})" opacity="0.15" />
    `;
  });

  // Build the legend HTML
  let legendHtml = `
    <div class="graph-legend">
  `;
  Object.keys(metricsInfo).forEach(key => {
    const info = metricsInfo[key];
    const isVisible = visibleGraphLines[key];
    legendHtml += `
      <div class="legend-item-toggle ${isVisible ? 'active' : 'inactive'}" onclick="toggleGraphLine('${key}')">
        <span class="legend-color-dot" style="background-color: ${info.color}"></span>
        <span class="legend-name">${info.name}</span>
      </div>
    `;
  });
  legendHtml += `</div>`;

  // Standard SVG template with definitions
  const svgHtml = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradients for area under curves -->
        <linearGradient id="grad-calories" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7DAA7D" stop-opacity="1"/>
          <stop offset="100%" stop-color="#7DAA7D" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="grad-protein" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#A8C8A8" stop-opacity="1"/>
          <stop offset="100%" stop-color="#A8C8A8" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="grad-carbs" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F5C842" stop-opacity="1"/>
          <stop offset="100%" stop-color="#F5C842" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="grad-fat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#E8724A" stop-opacity="1"/>
          <stop offset="100%" stop-color="#E8724A" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="grad-fiber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#9C27B0" stop-opacity="1"/>
          <stop offset="100%" stop-color="#9C27B0" stop-opacity="0"/>
        </linearGradient>

        <!-- Drop shadow filter for 3D glow effect -->
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#1A2E1A" flood-opacity="0.15"/>
        </filter>
      </defs>

      <!-- Draw Grid -->
      ${gridLinesHtml}

      <!-- Draw Area Gradients -->
      ${gradientsHtml}

      <!-- Draw Lines -->
      ${linesHtml}

      <!-- Draw Markers -->
      ${markersHtml}
    </svg>
  `;

  container.innerHTML = legendHtml + svgHtml;
}

function toggleGraphLine(key) {
  visibleGraphLines[key] = !visibleGraphLines[key];
  renderProgressGraph();
}

function renderSettings() {
  if (!currentUser) return;
  
  const profileJson = localStorage.getItem('nt_profile_' + currentUser);
  if (!profileJson) return;
  
  const profile = JSON.parse(profileJson);
  
  document.getElementById('set-gender').value = profile.gender || 'male';
  document.getElementById('set-dob').value = profile.dob || '';
  document.getElementById('set-height').value = profile.height || '';
  document.getElementById('set-weight').value = profile.currentWeight || '';
  document.getElementById('set-target-weight').value = profile.targetWeight || '';
  document.getElementById('set-activity').value = profile.activity || '1.55';
  document.getElementById('set-goal').value = profile.goal || 'maintain';
  
  document.getElementById('set-target-time').value = profile.targetTimeWeeks || '';
  toggleTargetTime('set');
}

function saveProfileSettings() {
  const gender = document.getElementById('set-gender').value;
  const dob = document.getElementById('set-dob').value;
  const height = +document.getElementById('set-height').value;
  const weight = +document.getElementById('set-weight').value;
  const targetWeight = +document.getElementById('set-target-weight').value;
  const activity = +document.getElementById('set-activity').value;
  const goal = document.getElementById('set-goal').value;
  const targetTimeWeeks = +document.getElementById('set-target-time').value;

  if (!dob || !height || !weight || !targetWeight) {
    alert('Please fill in all profile parameters.');
    return;
  }
  if (goal !== 'maintain' && (!targetTimeWeeks || targetTimeWeeks <= 0)) {
    alert('Please enter a valid target time in weeks.');
    return;
  }

  const age = calculateAge(dob);
  let bmr = gender === 'male' 
    ? (10 * weight + 6.25 * height - 5 * age + 5)
    : (10 * weight + 6.25 * height - 5 * age - 161);
  
  const tdee = Math.round(bmr * activity);
  
  const weightDiff = Math.abs(weight - targetWeight);
  let dailyCalorieChange = 0;
  if (goal !== 'maintain' && targetTimeWeeks > 0) {
    dailyCalorieChange = (weightDiff * 7700) / (targetTimeWeeks * 7);
  }
  
  let targetCalories = tdee;
  if (goal === 'lose') {
    targetCalories = tdee - dailyCalorieChange;
  } else if (goal === 'gain') {
    targetCalories = tdee + dailyCalorieChange;
  }
  
  // Safe boundaries
  targetCalories = Math.max(1200, Math.min(Math.round(targetCalories), 5000));

  const protein = Math.round((targetCalories * 0.25) / 4);
  const carbs = Math.round((targetCalories * 0.50) / 4);
  const fat = Math.round((targetCalories * 0.25) / 9);
  const fiber = gender === 'male' ? 38 : 25;

  const oldProfile = JSON.parse(localStorage.getItem('nt_profile_' + currentUser) || '{}');
  const newProfile = {
    ...oldProfile,
    gender,
    dob,
    height,
    currentWeight: weight,
    targetWeight,
    activity,
    goal,
    targetTimeWeeks: goal === 'maintain' ? 0 : targetTimeWeeks,
    targetCalories,
    targetProtein: protein,
    targetCarbs: carbs,
    targetFat: fat,
    targetFiber: fiber
  };

  localStorage.setItem('nt_profile_' + currentUser, JSON.stringify(newProfile));
  
  if (oldProfile.currentWeight !== weight) {
    const history = JSON.parse(localStorage.getItem('nt_weight_history_' + currentUser) || '[]');
    history.push({ date: new Date().toLocaleDateString('en-CA'), weight });
    localStorage.setItem('nt_weight_history_' + currentUser, JSON.stringify(history));
  }

  alert('Profile updated and targets recalculated successfully!');
  renderSettings();
  renderDashboard();
}
