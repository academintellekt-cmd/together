// HTML страница с эквалайзером и предустановленными командами для ESP32
// Аналогична dmx-config.html, но адаптирована для работы на ESP32

const char* htmlEqualizerPage = R"EQUALIZER(
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ESP32 DMX Эквалайзер</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;background:#1a1a1a;color:#fff;padding:10px}
        .header{text-align:center;margin-bottom:20px}
        .status{background:#2a2a2a;padding:10px;border-radius:5px;margin-bottom:15px;font-size:12px}
        .tabs{display:flex;gap:5px;margin-bottom:15px;flex-wrap:wrap}
        .tab-btn{padding:8px 15px;border:2px solid #00ff00;border-radius:5px;background:#2a2a2a;color:#00ff00;cursor:pointer;font-size:12px;font-weight:bold}
        .tab-btn.active{background:#00ff00;color:#000}
        .tab-content{display:none}
        .tab-content.active{display:block}
        .card{background:#2a2a2a;padding:15px;border-radius:5px;margin-bottom:15px;border:2px solid #444}
        .card h2{color:#00ff00;margin-bottom:10px;font-size:16px}
        .channel-config{display:flex;gap:8px;justify-content:center;align-items:flex-end;flex-wrap:wrap;padding:15px;background:#1a1a1a;border-radius:5px;margin-bottom:15px}
        .channel-item{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:50px}
        .channel-label{font-size:11px;color:#888;text-align:center;font-weight:bold;margin-bottom:5px}
        .channel-slider-wrapper{position:relative;width:40px;height:200px;display:flex;align-items:flex-end}
        .channel-slider{writing-mode:bt-lr;-webkit-appearance:slider-vertical;width:40px;height:200px;background:#1a1a1a;outline:none;cursor:pointer}
        .channel-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:30px;height:30px;background:#00ff00;border-radius:50%;cursor:pointer;border:2px solid #000}
        .channel-slider::-moz-range-thumb{width:30px;height:30px;background:#00ff00;border-radius:50%;cursor:pointer;border:2px solid #000}
        .channel-value{font-size:10px;color:#00ff00;font-weight:bold;font-family:monospace;margin-top:5px;min-height:15px}
        .address-input{display:flex;gap:5px;align-items:center;margin-bottom:15px;flex-wrap:wrap}
        .address-input input{width:80px;padding:5px;background:#1a1a1a;color:#fff;border:1px solid #444;border-radius:3px;text-align:center;font-family:monospace}
        .address-input label{font-size:12px;color:#888}
        .commands-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:15px}
        .command-item{background:#1a1a1a;padding:12px;border:2px solid #444;border-radius:5px;cursor:pointer;transition:all 0.2s}
        .command-item:hover{border-color:#00ff00}
        .command-name{font-weight:bold;margin-bottom:8px;font-size:13px;color:#00ff00}
        .command-info{font-size:11px;color:#888;margin-bottom:8px;line-height:1.4}
        .command-color-preview{width:100%;height:30px;border-radius:3px;margin-bottom:8px;border:1px solid #444}
        .command-actions{display:flex;gap:5px;margin-top:8px}
        .command-actions button{padding:5px 10px;font-size:11px;border:none;border-radius:3px;cursor:pointer;font-weight:bold}
        .btn-apply{background:#00ff00;color:#000}
        .btn-apply:hover{background:#00cc00}
        .btn-test{background:#0066ff;color:#fff}
        .btn-test:hover{background:#0055cc}
        .server-config{background:#1a1a1a;padding:10px;border-radius:5px;margin-bottom:15px;border:1px solid #444}
        .server-config input{width:150px;padding:5px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:3px;text-align:center;font-family:monospace;font-size:12px}
        button{background:#00ff00;color:#000;border:none;padding:8px 15px;border-radius:5px;cursor:pointer;font-weight:bold;margin:3px;font-size:12px}
        button:hover{background:#00cc00}
        .btn-danger{background:#ff4444;color:#fff}
        .btn-danger:hover{background:#cc0000}
        .log{background:#1a1a1a;border:2px solid #444;border-radius:5px;padding:10px;max-height:150px;overflow-y:auto;font-family:monospace;font-size:11px}
        .log-entry{margin-bottom:3px;padding:3px;border-left:2px solid #444;padding-left:8px}
        .log-entry.success{border-left-color:#00ff00}
        .log-entry.error{border-left-color:#ff4444}
        .empty-state{text-align:center;color:#888;padding:20px;font-size:12px}
    </style>
</head>
<body>
    <div class="header">
        <h1>🎛️ ESP32 DMX Эквалайзер</h1>
        <p>Управление каналами LM70S и предустановленные команды</p>
    </div>
    
    <div class="status">
        <strong>Статус:</strong> <span id="status">Подключение...</span> | 
        <strong>IP:</strong> <span id="ipAddress">-</span> | 
        <strong>Обновлено:</strong> <span id="lastUpdate">-</span>
    </div>

    <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('equalizer')">🎛️ Эквалайзер</button>
        <button class="tab-btn" onclick="switchTab('commands')">💾 Команды</button>
    </div>

    <div id="tab-equalizer" class="tab-content active">
        <div class="card">
            <h2>🎛️ Конфигуратор каналов LM70S</h2>
            <div class="address-input">
                <label>Номер прожектора (1-14):</label>
                <input type="number" id="lm70s-number" min="1" max="14" value="1" onchange="loadLM70SChannels()">
                <label>Начальный адрес DMX:</label>
                <input type="number" id="start-address" min="1" max="512" value="1" readonly>
                <button onclick="loadLM70SChannels()">Загрузить</button>
            </div>
            <div class="channel-config" id="channel-config"></div>
            <button onclick="applyChannels()">Применить</button>
            <button onclick="resetChannels()" class="btn-danger">Сбросить</button>
        </div>
    </div>

    <div id="tab-commands" class="tab-content">
        <div class="card">
            <h2>💾 Предустановленные команды</h2>
            <div class="server-config">
                <label>IP сервера (localhost:3000):</label>
                <input type="text" id="server-ip" placeholder="192.168.0.100:3000" value="">
                <button onclick="saveServerIP()">Сохранить</button>
                <button onclick="loadCommands()">Загрузить команды</button>
            </div>
            <div class="commands-list" id="commands-list">
                <div class="empty-state">Нажмите "Загрузить команды" для получения списка команд с сервера</div>
            </div>
        </div>
    </div>

    <div class="card">
        <h2>📋 Лог</h2>
        <div class="log" id="log"></div>
        <button onclick="clearLog()" style="margin-top:10px">Очистить</button>
    </div>

    <script>
        const LM70S_CHANNELS=['X','Y','Режим','R','G','B','W','Скорость','Сброс'];
        let currentChannels={},startAddress=1,allCommands=[],serverIP='';
        
        function switchTab(tab){
            document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('tab-'+tab).classList.add('active');
        }
        
        function getServerURL(){
            const ip=localStorage.getItem('dmx-server-ip')||document.getElementById('server-ip').value||'';
            return ip?'http://'+ip:'';
        }
        
        function saveServerIP(){
            const ip=document.getElementById('server-ip').value.trim();
            if(ip){
                localStorage.setItem('dmx-server-ip',ip);
                serverIP=ip;
                addLog('IP сервера сохранен: '+ip,'success');
            }
        }
        
        async function loadLM70SChannels(){
            const lm70sNum=parseInt(document.getElementById('lm70s-number').value)||1;
            startAddress=1+(lm70sNum-1)*9;
            document.getElementById('start-address').value=startAddress;
            try{
                const res=await fetch('/api/dmx/channels?startAddress='+startAddress+'&count=9');
                const d=await res.json();
                if(d.success){
                    currentChannels=d.channels||{};
                    renderChannelConfig();
                    addLog('Загружены каналы LM70S #'+lm70sNum+' с адреса '+startAddress,'success');
                }else addLog('Ошибка: '+d.error,'error');
            }catch(e){
                addLog('Ошибка: '+e.message,'error');
                currentChannels={};
                for(let i=1;i<=9;i++)currentChannels[i]=0;
                renderChannelConfig();
            }
        }
        
        function renderChannelConfig(){
            const c=document.getElementById('channel-config');
            c.innerHTML='';
            for(let i=1;i<=9;i++){
                const v=currentChannels[i]||0;
                const invertedValue=255-v;
                const item=document.createElement('div');
                item.className='channel-item';
                item.innerHTML='<div class="channel-label">'+LM70S_CHANNELS[i-1]+'</div>'+
                    '<div class="channel-slider-wrapper">'+
                    '<input type="range" class="channel-slider" min="0" max="255" value="'+invertedValue+'" '+
                    'oninput="updateChannelValue('+i+',this.value)" '+
                    'data-channel="'+i+'">'+
                    '</div>'+
                    '<div class="channel-value">'+v+'</div>';
                c.appendChild(item);
            }
        }
        
        function updateChannelValue(ch,v){
            v=Math.max(0,Math.min(255,255-parseInt(v)||0));
            currentChannels[ch]=v;
            const item=document.querySelector('.channel-item:nth-child('+ch+')');
            if(item){
                item.querySelector('.channel-value').textContent=v;
                item.querySelector('.channel-slider').value=255-v;
            }
            applyChannelsRealtime();
        }
        
        let applyTimeout=null;
        async function applyChannelsRealtime(){
            if(applyTimeout)clearTimeout(applyTimeout);
            applyTimeout=setTimeout(async()=>{
                try{
                    const res=await fetch('/api/dmx/channels',{
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({channels:currentChannels,startAddress:startAddress})
                    });
                    const d=await res.json();
                    if(!d.success)addLog('Ошибка: '+d.error,'error');
                }catch(e){}
            },50);
        }
        
        async function applyChannels(){
            try{
                const res=await fetch('/api/dmx/channels',{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({channels:currentChannels,startAddress:startAddress})
                });
                const d=await res.json();
                if(d.success)addLog('Применены каналы с адреса '+startAddress,'success');
                else addLog('Ошибка: '+d.error,'error');
            }catch(e){
                addLog('Ошибка: '+e.message,'error');
            }
        }
        
        function resetChannels(){
            if(confirm('Сбросить все каналы в 0?')){
                for(let i=1;i<=9;i++)currentChannels[i]=0;
                renderChannelConfig();
                applyChannels();
            }
        }
        
        async function loadCommands(){
            const serverURL=getServerURL();
            if(!serverURL){
                addLog('Укажите IP адрес сервера','error');
                return;
            }
            try{
                addLog('Загрузка команд с сервера...','success');
                const res=await fetch(serverURL+'/api/dmx/commands?sortBy=updatedAt&order=desc');
                if(!res.ok){
                    addLog('Ошибка загрузки: '+res.status+' '+res.statusText,'error');
                    return;
                }
                const d=await res.json();
                if(d.success){
                    allCommands=d.commands||[];
                    renderCommands();
                    addLog('Загружено команд: '+allCommands.length,'success');
                }else{
                    addLog('Ошибка: '+d.error,'error');
                }
            }catch(e){
                addLog('Ошибка подключения к серверу: '+e.message,'error');
                document.getElementById('commands-list').innerHTML='<div class="empty-state">Ошибка подключения к серверу. Проверьте IP адрес.</div>';
            }
        }
        
        function renderCommands(){
            const container=document.getElementById('commands-list');
            if(allCommands.length===0){
                container.innerHTML='<div class="empty-state">Команды не найдены</div>';
                return;
            }
            container.innerHTML=allCommands.map(cmd=>{
                const r=cmd.channels['4']||0;
                const g=cmd.channels['5']||0;
                const b=cmd.channels['6']||0;
                const mode=cmd.channels['3']||0;
                let modeText='ВЫКЛ';
                if(mode>=9&&mode<=135)modeText='Затемнение';
                else if(mode>=136&&mode<=240)modeText='Стробоскоп';
                else if(mode>=241)modeText='ВКЛ';
                const colorStyle='rgb('+r+','+g+','+b+')';
                return '<div class="command-item">'+
                    '<div class="command-name">'+escapeHtml(cmd.name||'Без названия')+'</div>'+
                    '<div class="command-color-preview" style="background:'+colorStyle+'"></div>'+
                    '<div class="command-info">'+
                    'Фонарь #'+(cmd.lm70sNumber||1)+'<br>'+
                    modeText+' | X:'+(cmd.channels['1']||0)+' Y:'+(cmd.channels['2']||0)+'<br>'+
                    'Скорость: '+(cmd.channels['8']||0)+
                    '</div>'+
                    '<div class="command-actions">'+
                    '<button class="btn-apply" onclick="applyCommand(\''+cmd.id+'\')">▶️ Применить</button>'+
                    '<button class="btn-test" onclick="testCommand(\''+cmd.id+'\')">🧪 Тест</button>'+
                    '</div>'+
                    '</div>';
            }).join('');
        }
        
        async function applyCommand(commandId){
            const serverURL=getServerURL();
            if(!serverURL){
                addLog('Укажите IP адрес сервера','error');
                return;
            }
            try{
                const res=await fetch(serverURL+'/api/dmx/commands/'+commandId+'/apply',{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({})
                });
                const d=await res.json();
                if(d.success){
                    const cmd=allCommands.find(c=>c.id===commandId);
                    addLog('Команда "'+(cmd?.name||'')+'" применена','success');
                    loadLM70SChannels();
                }else{
                    addLog('Ошибка: '+d.error,'error');
                }
            }catch(e){
                addLog('Ошибка: '+e.message,'error');
            }
        }
        
        async function testCommand(commandId){
            const serverURL=getServerURL();
            if(!serverURL){
                addLog('Укажите IP адрес сервера','error');
                return;
            }
            try{
                const res=await fetch(serverURL+'/api/dmx/commands/'+commandId+'/apply',{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({testMode:true})
                });
                const d=await res.json();
                if(d.success){
                    const cmd=allCommands.find(c=>c.id===commandId);
                    addLog('Тест команды "'+(cmd?.name||'')+'" (2 сек)','success');
                    setTimeout(()=>{
                        loadLM70SChannels();
                        addLog('Тест завершен','success');
                    },2000);
                }else{
                    addLog('Ошибка: '+d.error,'error');
                }
            }catch(e){
                addLog('Ошибка: '+e.message,'error');
            }
        }
        
        function escapeHtml(text){
            const div=document.createElement('div');
            div.textContent=text;
            return div.innerHTML;
        }
        
        function addLog(m,t=''){
            const l=document.getElementById('log');
            const e=document.createElement('div');
            e.className='log-entry '+(t||'');
            e.textContent='['+new Date().toLocaleTimeString()+'] '+m;
            l.appendChild(e);
            l.scrollTop=l.scrollHeight;
        }
        
        function clearLog(){
            document.getElementById('log').innerHTML='';
        }
        
        fetch('/api/status').then(r=>r.json()).then(d=>{
            document.getElementById('ipAddress').textContent=d.ip||'-';
            document.getElementById('status').textContent='Активен';
        });
        
        const savedIP=localStorage.getItem('dmx-server-ip');
        if(savedIP){
            document.getElementById('server-ip').value=savedIP;
            serverIP=savedIP;
        }
        
        loadLM70SChannels();
        setInterval(()=>{
            document.getElementById('lastUpdate').textContent=new Date().toLocaleTimeString();
        },1000);
    </script>
</body>
</html>
)EQUALIZER";

