/* STPM GTFS Map App v3.1.0 — mapa primero, datos remotos desde GitHub */
var GITHUB_OWNER='V1c5nt5', GITHUB_REPO='stpm_gtfs', GITHUB_BRANCH='main';
var GITHUB_DATA_PATH='data';
var GITHUB_DATA_API='https://api.github.com/repos/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/contents/'+GITHUB_DATA_PATH+'?ref='+GITHUB_BRANCH;
var GITHUB_RAW_BASE='https://raw.githubusercontent.com/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/'+GITHUB_BRANCH+'/'+GITHUB_DATA_PATH+'/';
var GTFS_FILES=[], DECO_FILES=[], MANUAL_GTFS_FILE=null, MANUAL_DECO_FILE=null;
var DATA=null, map=null, baseLayer=null, trafficLayer=null;
var allStopsLayer=null, routeStopsLayer=null, routeShapeLayers=[];
var currentRouteId='', currentService='', currentDir='0', selectedStopId='';
var stopRenderer=null;
var SVC={L:'Lunes a viernes',LJ:'Lun a jue',V:'Viernes',S:'Sábado',D:'Domingo',F:'Festivo'};
var REMOTE_FALLBACKS={
  gtfs:['GTFS_20260530.zip','GTFS_20260425_v3.zip','GTFS_20260314.zip','GTFS PO06dic+2vuelta.zip'],
  deco:['DECO_VIGENTES_20260529.zip','DECO_VIGENTES_20260420 (1).zip']
};
function rawDataUrl(name){return GITHUB_RAW_BASE+encodeURIComponent(name).replace(/%2F/g,'/')}
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function unique(a){return Array.from(new Set((a||[]).filter(function(x){return x!==undefined&&x!==null&&x!==''}))) }
function timeSecs(t){var p=String(t||'0:0:0').split(':');return (+p[0]||0)*3600+(+p[1]||0)*60+(+p[2]||0)}
function timeShort(t){var p=String(t||'').split(':');return (p[0]||'00').padStart(2,'0')+':'+(p[1]||'00').padStart(2,'0')}
function cleanName(n){return String(n||'').replace(/^[A-Z0-9]+-/,'').trim()}
function routeName(r){return r?(r.route_short_name||r.route_id||'Ruta'):''}
function routeLong(r){return r?(r.route_long_name||r.route_desc||''):''}
function routeColor(r){var c=String((r&&r.route_color)||'2563eb').replace('#','');return '#'+(c||'2563eb')}
function textColor(r){var c=String((r&&r.route_text_color)||'ffffff').replace('#','');return '#'+(c||'ffffff')}
function serviceLabel(s){return SVC[s]||s||'Servicio'}
function progress(p,t){$('progress-fill').style.width=Math.max(0,Math.min(100,p||0))+'%';$('progress-label').textContent=t||''}
function setOptions(sel, rows, getValue, getText, placeholder){sel.innerHTML=''; if(placeholder){var o=document.createElement('option');o.value='';o.textContent=placeholder;sel.appendChild(o)} rows.forEach(function(row){var o=document.createElement('option');o.value=getValue(row);o.textContent=getText(row);sel.appendChild(o)})}
async function initGithub(){
  var fallbackGtfs=REMOTE_FALLBACKS.gtfs.map(function(n){return {name:n,url:rawDataUrl(n)}});
  var fallbackDeco=REMOTE_FALLBACKS.deco.map(function(n){return {name:n,url:rawDataUrl(n)}});
  try{
    var r=await fetch(GITHUB_DATA_API,{cache:'no-store'}); if(!r.ok) throw new Error('GitHub API '+r.status);
    var files=await r.json();
    var entries=files.filter(function(f){return f.type==='file'&&/\.(zip|csv)$/i.test(f.name)}).map(function(f){return {name:f.name,url:f.download_url||rawDataUrl(f.name)}}).sort(function(a,b){return a.name.localeCompare(b.name,undefined,{numeric:true})});
    GTFS_FILES=entries.filter(function(f){return /gtfs/i.test(f.name)}); DECO_FILES=entries.filter(function(f){return /deco/i.test(f.name)});
    if(!GTFS_FILES.length) GTFS_FILES=fallbackGtfs; if(!DECO_FILES.length) DECO_FILES=fallbackDeco;
  }catch(e){ GTFS_FILES=fallbackGtfs; DECO_FILES=fallbackDeco; }
  setOptions($('github-main-select'),GTFS_FILES,function(f){return f.url},function(f){return f.name});
  setOptions($('github-deco-select'),DECO_FILES,function(f){return f.url},function(f){return f.name},'Sin DECO');
  $('github-main-select').selectedIndex=Math.max(0,GTFS_FILES.length-1); $('github-deco-select').selectedIndex=Math.max(0,DECO_FILES.length-1);
}
async function fetchFile(url,name){var r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('No se pudo descargar '+name+' ('+r.status+')'); var b=await r.blob(); try{return new File([b],name,{type:'application/zip'})}catch(e){b.name=name;return b}}
function loadGtfs(file){
  return new Promise(function(resolve,reject){
    var w=new Worker('assets/js/gtfs-worker.js?v=3.1.0');
    w.onmessage=function(e){var m=e.data||{}; if(m.type==='progress') progress(m.pct,m.text); if(m.type==='done'){w.terminate();resolve(m.data)} if(m.type==='error'){w.terminate();reject(new Error(m.message||'Error GTFS'))}};
    w.onerror=function(e){w.terminate();reject(new Error(e.message||'Error en worker'))};
    w.postMessage({file:file});
  })
}
async function parseDeco(file){
  if(!file) return [];
  try{
    var txt='';
    if(/\.zip$/i.test(file.name||'')){var z=await JSZip.loadAsync(file); var first=z.file(/\.csv$/i)[0]; if(!first) return []; txt=await first.async('string')}
    else txt=await file.text();
    return Papa.parse(txt.trim(),{header:true,skipEmptyLines:true,dynamicTyping:false}).data||[];
  }catch(e){console.warn(e);return []}
}
function decoOperator(row){var keys=['UN','Unidad','unidad','operador','Operador','operator','agency_id']; for(var i=0;i<keys.length;i++){if(row&&row[keys[i]])return String(row[keys[i]]).trim()} return 'Sin operador'}
function inferOperator(route){
  if(!route) return 'Sin operador';
  if(route._operator) return route._operator;
  var key=norm(route.route_short_name||route.route_id);
  var rows=(DATA.decoRows||[]);
  for(var i=0;i<rows.length;i++){
    var r=rows[i], vals=Object.values(r).map(norm);
    if(vals.indexOf(key)!==-1 || vals.some(function(v){return v===key||v.indexOf(' '+key+' ')>=0})) return route._operator=decoOperator(r);
  }
  return route._operator=(route.agency_id||'Sin operador');
}
async function bootWithFiles(gtfsFile,decoFile){
  try{
    progress(5,'Preparando carga...');
    var parsed=await loadGtfs(gtfsFile); parsed.decoRows=await parseDeco(decoFile); DATA=parsed;
    DATA.routesList=Object.values(DATA.routes).sort(function(a,b){return routeName(a).localeCompare(routeName(b),undefined,{numeric:true})});
    DATA.operators=unique(DATA.routesList.map(inferOperator)).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true})});
    progress(100,'Datos cargados.');
    startApp();
  }catch(e){alert(e.message||String(e)); progress(0,'Error de carga.')}
}
async function loadGithub(){
  var s=$('github-main-select'), d=$('github-deco-select'); if(!s.value){alert('Selecciona un GTFS.');return}
  try{progress(4,'Descargando desde GitHub/data...'); var gtfs=await fetchFile(s.value,s.options[s.selectedIndex].textContent||'gtfs.zip'); var deco=d.value?await fetchFile(d.value,d.options[d.selectedIndex].textContent||'deco.zip'):null; await bootWithFiles(gtfs,deco)}catch(e){alert(e.message||String(e));progress(0,'Error de descarga.')}
}
function updateManualLabel(){var a=MANUAL_GTFS_FILE?MANUAL_GTFS_FILE.name:'sin GTFS', b=MANUAL_DECO_FILE?MANUAL_DECO_FILE.name:'sin DECO'; $('manual-label').textContent='Manual: '+a+' / '+b}
function loadManual(){if(!MANUAL_GTFS_FILE){alert('Selecciona un GTFS manual.');return} bootWithFiles(MANUAL_GTFS_FILE,MANUAL_DECO_FILE)}
function startApp(){
  $('loader').classList.add('hidden'); $('app').classList.remove('hidden'); initMap(); fillControls(); renderStats(); bindAppEvents(); setTimeout(function(){map.invalidateSize(); fitAllStops()},80)
}
function initMap(){
  if(map) return;
  stopRenderer=L.canvas({padding:.4});
  map=L.map('map',{preferCanvas:true,zoomControl:true}).setView([-33.45,-70.66],11);
  baseLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  allStopsLayer=L.layerGroup().addTo(map); routeStopsLayer=L.layerGroup().addTo(map);
  map.on('moveend zoomend',function(){ if($('toggle-stops').checked) renderVisibleStops() });
}
function fitAllStops(){
  var pts=Object.values(DATA.stops).filter(function(s){return isFinite(s.stop_lat)&&isFinite(s.stop_lon)}).slice(0,20000).map(function(s){return [s.stop_lat,s.stop_lon]});
  if(pts.length) map.fitBounds(L.latLngBounds(pts),{padding:[30,30],maxZoom:12}); renderVisibleStops();
}
function renderVisibleStops(){
  if(!DATA||!map||!allStopsLayer) return; allStopsLayer.clearLayers(); if(!$('toggle-stops').checked) return;
  var b=map.getBounds(), z=map.getZoom(), max=z<12?450:z<14?1200:3500, count=0;
  Object.values(DATA.stops).some(function(s){
    if(!isFinite(s.stop_lat)||!isFinite(s.stop_lon)) return false;
    var ll=L.latLng(+s.stop_lat,+s.stop_lon); if(!b.contains(ll)) return false;
    count++; if(count>max) return true;
    L.circleMarker(ll,{renderer:stopRenderer,radius:z>=15?4:3,weight:1,color:'#1d4ed8',fillColor:'#2563eb',fillOpacity:.55}).on('click',function(){selectStop(s.stop_id,true)}).addTo(allStopsLayer);
    return false;
  });
}
function fillControls(){
  setOptions($('operator-select'),['Todos'].concat(DATA.operators),function(x){return x},function(x){return x});
  fillRoutes();
  setOptions($('service-select'),DATA.serviceIds,function(x){return x},function(x){return serviceLabel(x)+' ('+x+')'});
  currentService=$('service-select').value||DATA.serviceIds[0]||'';
}
function fillRoutes(){
  var op=$('operator-select').value||'Todos';
  var routes=DATA.routesList.filter(function(r){return op==='Todos'||inferOperator(r)===op});
  setOptions($('route-select'),routes,function(r){return r.route_id},function(r){return routeName(r)+' — '+(routeLong(r)||inferOperator(r))},'Selecciona recorrido');
  currentRouteId=$('route-select').value||''; if(currentRouteId) selectRoute(currentRouteId); else clearRoute();
}
function routeTrips(routeId){return DATA.tripsByRoute[String(routeId)]||[]}
function routeServices(routeId){return unique(routeTrips(routeId).map(function(t){return t.service_id})).sort()}
function routeDirs(routeId){return unique(routeTrips(routeId).map(function(t){return String(t.direction_id||'0')})).sort()}
function representativeTrip(routeId,dir,svc){
  var trips=routeTrips(routeId).filter(function(t){return (dir==='both'||String(t.direction_id||'0')===String(dir))&&(!svc||String(t.service_id)===String(svc))});
  if(!trips.length) trips=routeTrips(routeId).filter(function(t){return dir==='both'||String(t.direction_id||'0')===String(dir)});
  trips.sort(function(a,b){return (DATA.stopTimes[b.trip_id]||[]).length-(DATA.stopTimes[a.trip_id]||[]).length}); return trips[0]||null;
}
function selectRoute(routeId){
  currentRouteId=routeId; var r=DATA.routes[routeId];
  var services=routeServices(routeId); if(services.length){setOptions($('service-select'),services,function(x){return x},function(x){return serviceLabel(x)+' ('+x+')'}); if(services.indexOf(currentService)<0) currentService=services[0]; $('service-select').value=currentService}
  var dirs=routeDirs(routeId); ['0','1'].forEach(function(d){$('dir-'+d).style.display=dirs.indexOf(d)>=0?'block':'none'}); $('dir-both').style.display=dirs.length>1?'block':'none'; if(dirs.indexOf(currentDir)<0) currentDir=dirs[0]||'0'; setDirButtons();
  drawRoute();
  $('hud-title').textContent='Recorrido '+routeName(r); $('hud-subtitle').textContent=(routeLong(r)||inferOperator(r))+' · '+serviceLabel(currentService);
}
function setDirButtons(){['0','1','both'].forEach(function(d){$('dir-'+d).classList.toggle('active',String(currentDir)===String(d))})}
function clearRoute(){ routeShapeLayers.forEach(function(l){map.removeLayer(l)}); routeShapeLayers=[]; routeStopsLayer.clearLayers(); $('route-summary').innerHTML='<span class="muted">Selecciona un recorrido para ver trazado, paradas e información.</span>'; $('route-stops').innerHTML=''; }
function drawRoute(){
  clearRoute(); var route=DATA.routes[currentRouteId]; if(!route) return;
  var dirs=currentDir==='both'?routeDirs(currentRouteId):[currentDir]; var bounds=[]; var stopIds=[];
  dirs.forEach(function(dir,idx){
    var trip=representativeTrip(currentRouteId,dir,currentService); if(!trip) return;
    var shape=trip.shape_id?DATA.shapes[trip.shape_id]:null;
    var color=dir==='1'?'#dc2626':routeColor(route);
    if(shape&&shape.length){var latlngs=shape.map(function(p){return [p.lat,p.lng]}); var line=L.polyline(latlngs,{color:color,weight:5,opacity:.88}).addTo(map); routeShapeLayers.push(line); bounds=bounds.concat(latlngs)}
    var st=(DATA.stopTimes[trip.trip_id]||[]).map(function(x){return DATA.stops[x.stop_id]}).filter(Boolean); stopIds=stopIds.concat(st.map(function(s){return s.stop_id}));
    if($('toggle-route-stops').checked) st.forEach(function(s,i){if(!isFinite(s.stop_lat)||!isFinite(s.stop_lon))return; var m=L.circleMarker([s.stop_lat,s.stop_lon],{radius:i===0||i===st.length-1?7:5,color:i===0?'#16a34a':i===st.length-1?'#dc2626':'#0f172a',fillColor:color,fillOpacity:.95,weight:2}).bindPopup(stopPopupHtml(s)).on('click',function(){selectedStopId=s.stop_id;showStopDetail(s.stop_id)}).addTo(routeStopsLayer); bounds.push([s.stop_lat,s.stop_lon])});
  });
  if(bounds.length) map.fitBounds(L.latLngBounds(bounds),{padding:[48,48],maxZoom:15});
  renderRouteSummary(route,unique(stopIds));
}
function renderRouteSummary(route,stopIds){
  var trips=routeTrips(currentRouteId).filter(function(t){return !currentService||t.service_id===currentService});
  $('route-summary').innerHTML='<div class="summary-title"><span class="route-badge" style="background:'+routeColor(route)+';color:'+textColor(route)+'">'+esc(routeName(route))+'</span></div><div><b>'+esc(routeLong(route)||'Sin nombre largo')+'</b></div><div class="muted">Operador: '+esc(inferOperator(route))+'</div><div class="muted">Viajes: '+trips.length+' · Paraderos: '+stopIds.length+' · Día: '+esc(serviceLabel(currentService))+'</div>';
  var rows=stopIds.slice(0,140).map(function(id,i){var s=DATA.stops[id]||{}; return '<div class="stop-row" data-stop="'+esc(id)+'"><div class="stop-index">'+(i+1)+'</div><div><div class="stop-name">'+esc(cleanName(s.stop_name||id))+'</div><div class="stop-id">'+esc(id)+'</div></div></div>'}).join('');
  $('route-stops').innerHTML=rows||'<span class="muted">Sin paraderos para el recorrido.</span>';
  Array.prototype.forEach.call($('route-stops').querySelectorAll('.stop-row'),function(el){el.addEventListener('click',function(){selectStop(el.dataset.stop,true)})});
}
function stopPopupHtml(s){return '<div class="popup-title">'+esc(cleanName(s.stop_name||s.stop_id))+'</div><div class="muted">'+esc(s.stop_id)+'</div><div class="popup-actions"><button onclick="window.__selectStopFromPopup(\''+esc(String(s.stop_id)).replace(/&#39;/g,"\\'")+'\')">Ver detalle</button></div>'}
window.__selectStopFromPopup=function(id){selectStop(id,false)};
function selectStop(stopId,pan){selectedStopId=stopId; var s=DATA.stops[stopId]; if(!s) return; switchTab('paradero'); showStopDetail(stopId); if(pan&&isFinite(s.stop_lat)&&isFinite(s.stop_lon)) map.setView([s.stop_lat,s.stop_lon], Math.max(map.getZoom(),16));}
function routesAtStop(stopId){
  var mapR={}; (DATA.stopTrips[stopId]||[]).forEach(function(e){var t=DATA.trips[e.trip_id]; if(!t)return; var r=DATA.routes[t.route_id]; if(!r)return; if(!mapR[t.route_id]) mapR[t.route_id]={route:r,dirs:{},heads:{},count:0}; mapR[t.route_id].dirs[t.direction_id||'0']=1; if(t.trip_headsign)mapR[t.route_id].heads[t.trip_headsign]=1; mapR[t.route_id].count++});
  return Object.values(mapR).sort(function(a,b){return routeName(a.route).localeCompare(routeName(b.route),undefined,{numeric:true})});
}
function arrivalsAtStop(stopId){
  var rows=[]; (DATA.stopTrips[stopId]||[]).forEach(function(e){var t=DATA.trips[e.trip_id]; if(!t||currentService&&t.service_id!==currentService)return; var r=DATA.routes[t.route_id]; var st=e.stopTime||{}; rows.push({sec:timeSecs(st.arrival_time||st.departure_time),time:timeShort(st.arrival_time||st.departure_time),route:r,trip:t,head:t.trip_headsign||''})});
  rows.sort(function(a,b){return a.sec-b.sec}); return rows.slice(0,180);
}
function showStopDetail(stopId){
  var s=DATA.stops[stopId]; if(!s) return;
  var rs=routesAtStop(stopId); var arr=arrivalsAtStop(stopId);
  var routeHtml=rs.map(function(x){var r=x.route; return '<div class="route-row"><span class="route-badge" style="background:'+routeColor(r)+';color:'+textColor(r)+'">'+esc(routeName(r))+'</span><div><b>'+esc(routeLong(r)||Object.keys(x.heads).join(' / ')||'Recorrido')+'</b><div class="stop-id">'+esc(inferOperator(r))+' · sentidos '+esc(Object.keys(x.dirs).join('/'))+' · '+x.count+' pasadas</div></div></div>'}).join('')||'<span class="muted">Sin recorridos asociados.</span>';
  var arrivals=arr.slice(0,36).map(function(a){return '<div class="arrival-row"><b>'+esc(a.time)+'</b><span class="route-badge" style="background:'+routeColor(a.route)+';color:'+textColor(a.route)+'">'+esc(routeName(a.route))+'</span><span>'+esc(a.head||routeLong(a.route)||'')+'</span></div>'}).join('')||'<span class="muted">Sin llegadas para el tipo de día seleccionado.</span>';
  $('stop-detail').classList.remove('muted'); $('stop-detail').innerHTML='<h3>'+esc(cleanName(s.stop_name||stopId))+'</h3><div class="muted">'+esc(stopId)+' · '+(isFinite(s.stop_lat)?(+s.stop_lat).toFixed(5)+', '+(+s.stop_lon).toFixed(5):'sin coordenadas')+'</div><h4>Recorridos que pasan</h4>'+routeHtml+'<h4>Llegadas programadas · '+esc(serviceLabel(currentService))+'</h4>'+arrivals;
}
function setupSearch(){
  var input=$('stop-search'), box=$('suggestions');
  input.addEventListener('input',function(){var q=norm(input.value); box.innerHTML=''; if(q.length<2){box.classList.add('hidden');return} var hits=Object.values(DATA.stopIndex).filter(function(x){return norm(x.name+' '+x.s.stop_id+' '+(x.s.stop_desc||'')).indexOf(q)>=0}).slice(0,18); hits.forEach(function(x){var div=document.createElement('div');div.className='suggestion';div.innerHTML='<b>'+esc(x.name)+'</b><span class="stop-id">'+esc(x.s.stop_id)+'</span>';div.addEventListener('click',function(){input.value=x.name;box.classList.add('hidden');selectStop(x.s.stop_id,true)});box.appendChild(div)}); box.classList.toggle('hidden',!hits.length)});
}
function switchTab(name){
  Array.prototype.forEach.call(document.querySelectorAll('.tab'),function(t){t.classList.toggle('active',t.dataset.tab===name)});
  ['explorar','paradero','capas'].forEach(function(n){$('tab-'+n).classList.toggle('hidden',n!==name)});
}
function renderStats(){
  $('stats').innerHTML='<div class="stat"><span>Recorridos</span><b>'+Object.keys(DATA.routes).length+'</b></div><div class="stat"><span>Paraderos</span><b>'+Object.keys(DATA.stops).length+'</b></div><div class="stat"><span>Viajes</span><b>'+Object.keys(DATA.trips).length+'</b></div><div class="stat"><span>Shapes</span><b>'+Object.keys(DATA.shapes).length+'</b></div>';
}
function bindAppEvents(){
  if(bindAppEvents.done) return; bindAppEvents.done=true;
  $('operator-select').addEventListener('change',fillRoutes); $('route-select').addEventListener('change',function(){selectRoute(this.value)}); $('service-select').addEventListener('change',function(){currentService=this.value; if(currentRouteId)selectRoute(currentRouteId); if(selectedStopId)showStopDetail(selectedStopId)});
  $('dir-0').addEventListener('click',function(){currentDir='0';setDirButtons();drawRoute()}); $('dir-1').addEventListener('click',function(){currentDir='1';setDirButtons();drawRoute()}); $('dir-both').addEventListener('click',function(){currentDir='both';setDirButtons();drawRoute()});
  Array.prototype.forEach.call(document.querySelectorAll('.tab'),function(t){t.addEventListener('click',function(){switchTab(t.dataset.tab)})});
  $('toggle-stops').addEventListener('change',function(){renderVisibleStops()}); $('toggle-route-stops').addEventListener('change',function(){drawRoute()}); $('toggle-traffic').addEventListener('change',toggleTraffic);
  $('save-traffic-key').addEventListener('click',function(){localStorage.setItem('tomtomTrafficKey',$('traffic-key').value.trim()); toggleTraffic();}); $('traffic-key').value=localStorage.getItem('tomtomTrafficKey')||'';
  $('btn-reload').addEventListener('click',function(){location.reload()}); $('mobile-panel').addEventListener('click',function(){$('.sidebar')});
  var mp=$('mobile-panel'), sb=document.querySelector('.sidebar'); mp.addEventListener('click',function(){sb.classList.toggle('open')});
  setupSearch();
}
function toggleTraffic(){
  if(!$('toggle-traffic').checked){ if(trafficLayer){map.removeLayer(trafficLayer); trafficLayer=null} return; }
  var key=($('traffic-key').value||localStorage.getItem('tomtomTrafficKey')||'').trim();
  if(!key){$('toggle-traffic').checked=false; alert('Para tráfico vehicular en vivo necesitas una API key de TomTom u otro proveedor compatible. OSM/Leaflet no entregan tráfico en vivo por sí solos.'); return;}
  if(trafficLayer) map.removeLayer(trafficLayer);
  trafficLayer=L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(key),{maxZoom:20,opacity:.72,attribution:'Traffic &copy; TomTom'}).addTo(map);
}
document.addEventListener('DOMContentLoaded',function(){
  $('btn-load-github').addEventListener('click',loadGithub); $('btn-load-manual').addEventListener('click',loadManual);
  $('file-input').addEventListener('change',function(e){MANUAL_GTFS_FILE=e.target.files[0]||null;updateManualLabel()}); $('deco-file-input').addEventListener('change',function(e){MANUAL_DECO_FILE=e.target.files[0]||null;updateManualLabel()});
  initGithub();
});
